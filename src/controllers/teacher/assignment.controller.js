import { db } from "../../config/database.js";
import { assignments, assignmentSubmissions, quizSubmissions, pdfSubmissions, ASSIGNMENT_TYPE, SUBMISSION_STATUS } from "../../models/assignment.model.js";
import { quizQuestions, quizOptions, courses, lessons } from "../../models/index.js";
import { users } from "../../models/user.model.js";
import { eq, and, or, desc, count, isNull, isNotNull } from "drizzle-orm";
import logger from "../../utils/logger.js";
import { uploadPDFToImageKit, deleteImageFromImageKit } from "../../services/imagekit.js";
import { generateQuizFromTranscript } from "../../ai/quizGeneration.js";
import { upload } from "../../utils/multer.js";
import { notifyCourseStudents } from "../../services/notification/notification.service.js";
import { 
  invalidateCourseAssignmentsCache
} from "../../services/redis/cache.service.js";

/**
 * Upload PDF file for assignment
 * POST /teacher/assignments/upload-pdf
 */
export const uploadAssignmentPDF = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "PDF file is required" });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ success: false, message: "Only PDF files are allowed" });
    }

    const result = await uploadPDFToImageKit(req.file.buffer, req.file.originalname);
    
    return res.status(200).json({
      success: true,
      url: result.url,
      fileId: result.fileId,
    });
  } catch (error) {
    logger.error("Error uploading PDF:", error);
    return res.status(500).json({ success: false, message: "Failed to upload PDF", error: error.message });
  }
};

/**
 * Create assignment
 * POST /teacher/courses/:courseId/assignments
 */
export const createAssignment = async (req, res) => {
  try {
    const { courseId } = req.params;
    const teacherId = req.user?.id || req.body.teacherId;
    const assignmentInput = req.body || {};

    if (!teacherId) {
      return res.status(400).json({ success: false, message: "teacherId is required" });
    }
    if (!courseId || courseId === "null") {
      return res.status(400).json({ success: false, message: "courseId is required" });
    }
    if (!assignmentInput.title) {
      return res.status(400).json({ success: false, message: "assignment.title is required" });
    }
    if (!assignmentInput.type) {
      return res.status(400).json({ success: false, message: "assignment.type is required" });
    }

    // Create assignment
    const [newAssignment] = await db.insert(assignments).values({
      courseId: courseId,
      lessonId: assignmentInput.lessonId || null,
      title: assignmentInput.title,
      description: assignmentInput.description || null,
      type: assignmentInput.type,
      points: assignmentInput.points || 100,
      maxAttempts: assignmentInput.maxAttempts || 1,
      dueDate: assignmentInput.dueDate ? new Date(assignmentInput.dueDate) : null,
      createdBy: teacherId,
    }).returning();

    // Handle quiz assignment
    if (assignmentInput.type === 'quiz' && assignmentInput.questions && Array.isArray(assignmentInput.questions)) {
      for (const questionData of assignmentInput.questions) {
        const [question] = await db.insert(quizQuestions).values({
          assignmentId: newAssignment.id,
          question: questionData.question,
          explanation: questionData.explanation || null,
          points: questionData.points || 10,
        }).returning();

        if (questionData.options && Array.isArray(questionData.options)) {
          for (const optionData of questionData.options) {
            await db.insert(quizOptions).values({
              questionId: question.id,
              text: optionData.text,
              isCorrect: optionData.isCorrect || false,
            });
          }
        }
      }
    }

    // Handle PDF assignment
    if (assignmentInput.type === 'pdf_upload' && assignmentInput.pdfFileUrl) {
      // Create a temporary submission to store the PDF file URL
      const [tempSubmission] = await db.insert(assignmentSubmissions).values({
        assignmentId: newAssignment.id,
        userId: teacherId, // Use teacher ID as placeholder
        attemptNumber: 0, // Special attempt number for assignment PDF
        status: 'submitted',
      }).returning();

      await db.insert(pdfSubmissions).values({
        submissionId: tempSubmission.id,
        fileUrl: assignmentInput.pdfFileUrl,
        providerFileId: assignmentInput.pdfFileId || null,
      });
    }

    // Notify enrolled students about new assignment
    // NOTE: This creates a NOTIFICATION (not an announcement)
    // Notifications appear in the notification bell, NOT on the announcements page
    // Only manual announcements created via POST /teacher/announcements appear on announcements page
    try {
      const assignmentTypeLabel = assignmentInput.type === 'quiz' ? 'Quiz' : 'PDF Assignment';
      
      // Fetch lesson name if lessonId is provided
      let lessonName = null;
      if (assignmentInput.lessonId) {
        const [lesson] = await db.select()
          .from(lessons)
          .where(eq(lessons.id, assignmentInput.lessonId))
          .limit(1);
        lessonName = lesson?.title || null;
      }

      // Build notification content with lesson name
      let notificationContent = '';
      if (lessonName) {
        notificationContent = `A new ${assignmentTypeLabel.toLowerCase()} "${assignmentInput.title}" has been assigned to the lesson "${lessonName}".`;
      } else {
        notificationContent = `A new ${assignmentTypeLabel.toLowerCase()} "${assignmentInput.title}" has been assigned.`;
      }
      
      if (assignmentInput.description) {
        notificationContent += ` ${assignmentInput.description}`;
      }

      await notifyCourseStudents(
        courseId,
        'assignment_added', // Notification type - appears in notification bell only
        `New ${assignmentTypeLabel}: ${assignmentInput.title}`,
        notificationContent,
        { assignmentId: newAssignment.id, lessonId: assignmentInput.lessonId || null }
      );
    } catch (notificationError) {
      console.error('Error sending assignment notifications:', notificationError);
      // Don't fail the request if notifications fail
    }

    // Invalidate assignments cache
    await invalidateCourseAssignmentsCache(courseId);
    logger.info(`Invalidated assignments cache for course ${courseId} after creating assignment`);

    return res.status(201).json({
      success: true,
      message: "Assignment created successfully",
      data: { assignment: newAssignment },
    });
  } catch (error) {
    logger.error("Error creating assignment:", error);
    return res.status(500).json({ success: false, message: "Failed to create assignment", error: error.message });
  }
};

/**
 * Get assignments for a course
 * GET /teacher/courses/:courseId/assignments
 */
export const getAssignmentsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { lessonId } = req.query;
    const teacherId = req.user?.id;

    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    let whereConditions = [eq(assignments.courseId, courseId)];
    if (lessonId) {
      whereConditions.push(eq(assignments.lessonId, lessonId));
    }

    const assignmentsList = await db.select({
      assignment: assignments,
      creator: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
      .from(assignments)
      .leftJoin(users, eq(assignments.createdBy, users.id))
      .where(and(...whereConditions))
      .orderBy(desc(assignments.createdAt));

    // Add question count for quizzes
    const assignmentsWithDetails = await Promise.all(assignmentsList.map(async (item) => {
      const assignment = item.assignment;
      let details = {
        ...assignment,
        creator: item.creator,
      };

      if (assignment.type === 'quiz') {
        const [questionCount] = await db.select({ count: count() })
          .from(quizQuestions)
          .where(eq(quizQuestions.assignmentId, assignment.id));
        details.questionCount = questionCount?.count || 0;
      }

      return details;
    }));

    return res.status(200).json({
      success: true,
      data: { assignments: assignmentsWithDetails },
    });
  } catch (error) {
    logger.error("Error fetching assignments:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch assignments", error: error.message });
  }
};

/**
 * Get assignment by ID
 * GET /teacher/courses/:courseId/assignments/:assignmentId
 */
export const getAssignmentById = async (req, res) => {
  try {
    const { courseId, assignmentId } = req.params;
    const teacherId = req.user?.id;

    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const [assignment] = await db.select()
      .from(assignments)
      .where(and(
        eq(assignments.id, assignmentId),
        eq(assignments.courseId, courseId)
      ))
      .limit(1);

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    // Get questions for quiz assignments
    if (assignment.type === 'quiz') {
      const questions = await db.select()
        .from(quizQuestions)
        .where(eq(quizQuestions.assignmentId, assignment.id));

      const questionsWithOptions = await Promise.all(questions.map(async (question) => {
        const options = await db.select()
          .from(quizOptions)
          .where(eq(quizOptions.questionId, question.id));

        return {
          ...question,
          options,
        };
      }));

      assignment.questions = questionsWithOptions;
    } else if (assignment.type === 'pdf_upload') {
      // Get PDF file URL
      const [tempSubmission] = await db.select()
        .from(assignmentSubmissions)
        .where(and(
          eq(assignmentSubmissions.assignmentId, assignment.id),
          eq(assignmentSubmissions.attemptNumber, 0)
        ))
        .limit(1);

      if (tempSubmission) {
        const [pdfFile] = await db.select()
          .from(pdfSubmissions)
          .where(eq(pdfSubmissions.submissionId, tempSubmission.id))
          .limit(1);

        if (pdfFile) {
          assignment.pdfFileUrl = pdfFile.fileUrl;
          assignment.pdfFileId = pdfFile.providerFileId;
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: { assignment },
    });
  } catch (error) {
    logger.error("Error fetching assignment:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch assignment", error: error.message });
  }
};

/**
 * Generate quiz with AI
 * POST /teacher/courses/:courseId/assignments/generate-quiz
 */
export const generateQuizWithAI = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { lessonId, topic, numQuestions, difficulty } = req.body;
    const teacherId = req.user?.id;

    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Get course title for context
    let courseTitle = null;
    try {
      const [course] = await db.select()
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1);
      courseTitle = course?.title || null;
    } catch (courseError) {
      logger.warn("Could not fetch course title:", courseError);
    }

    // Get lesson details if lessonId provided
    let lessonData = null;
    if (lessonId) {
      const [lesson] = await db.select()
        .from(lessons)
        .where(eq(lessons.id, lessonId))
        .limit(1);
      lessonData = lesson;
    }

    logger.info(`Generating quiz: lessonId=${lessonId}, topic=${topic}, numQuestions=${numQuestions || 5}, difficulty=${difficulty || 'medium'}`);

    // Generate quiz using AI - pass parameters in correct order
    const generatedQuiz = await generateQuizFromTranscript(
      lessonData, // lesson object (can be null)
      numQuestions || 5, // numQuestions
      difficulty || "medium", // difficulty
      topic || null, // topic (used if lesson is null)
      courseTitle // courseTitle for context
    );

    logger.info(`Quiz generated successfully: ${generatedQuiz.quiz?.length || 0} questions`);

    return res.status(200).json({
      success: true,
      data: { quiz: generatedQuiz.quiz || [] },
    });
  } catch (error) {
    logger.error("Error generating quiz:", error);
    logger.error("Error stack:", error.stack);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to generate quiz", 
      error: error.message 
    });
  }
};

/**
 * Update assignment
 * PUT /teacher/courses/:courseId/assignments/:assignmentId
 */
export const updateAssignment = async (req, res) => {
  try {
    const { courseId, assignmentId } = req.params;
    const teacherId = req.user?.id;
    const assignmentInput = req.body || {};

    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Verify assignment exists
    const [existingAssignment] = await db.select()
      .from(assignments)
      .where(and(
        eq(assignments.id, assignmentId),
        eq(assignments.courseId, courseId)
      ))
      .limit(1);

    if (!existingAssignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    // Verify user is the creator or admin
    if (existingAssignment.createdBy !== teacherId && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: "You don't have permission to update this assignment" });
    }

    // Update assignment
    const [updated] = await db.update(assignments)
      .set({
        title: assignmentInput.title !== undefined ? assignmentInput.title : existingAssignment.title,
        description: assignmentInput.description !== undefined ? assignmentInput.description : existingAssignment.description,
        points: assignmentInput.points !== undefined ? assignmentInput.points : existingAssignment.points,
        maxAttempts: assignmentInput.maxAttempts !== undefined ? assignmentInput.maxAttempts : existingAssignment.maxAttempts,
        dueDate: assignmentInput.dueDate !== undefined ? (assignmentInput.dueDate ? new Date(assignmentInput.dueDate) : null) : existingAssignment.dueDate,
        lessonId: assignmentInput.lessonId !== undefined ? (assignmentInput.lessonId || null) : existingAssignment.lessonId,
        updatedAt: new Date(),
      })
      .where(eq(assignments.id, assignmentId))
      .returning();

    // Handle PDF file update
    if (assignmentInput.type === 'pdf_upload' && assignmentInput.pdfFileUrl !== undefined) {
      // Get existing PDF submission
      const [tempSubmission] = await db.select()
        .from(assignmentSubmissions)
        .where(and(
          eq(assignmentSubmissions.assignmentId, assignmentId),
          eq(assignmentSubmissions.attemptNumber, 0)
        ))
        .limit(1);

      if (assignmentInput.pdfFileUrl === null) {
        // Remove PDF
        if (tempSubmission) {
          const [pdfFile] = await db.select()
            .from(pdfSubmissions)
            .where(eq(pdfSubmissions.submissionId, tempSubmission.id))
            .limit(1);

          if (pdfFile && pdfFile.providerFileId) {
            await deleteImageFromImageKit(pdfFile.providerFileId);
          }

          await db.delete(pdfSubmissions).where(eq(pdfSubmissions.submissionId, tempSubmission.id));
          await db.delete(assignmentSubmissions).where(eq(assignmentSubmissions.id, tempSubmission.id));
        }
      } else if (assignmentInput.pdfFileUrl) {
        // Update or create PDF
        if (tempSubmission) {
          const [pdfFile] = await db.select()
            .from(pdfSubmissions)
            .where(eq(pdfSubmissions.submissionId, tempSubmission.id))
            .limit(1);

          if (pdfFile && pdfFile.providerFileId && pdfFile.providerFileId !== assignmentInput.pdfFileId) {
            await deleteImageFromImageKit(pdfFile.providerFileId);
          }

          await db.update(pdfSubmissions)
            .set({
              fileUrl: assignmentInput.pdfFileUrl,
              providerFileId: assignmentInput.pdfFileId || null,
            })
            .where(eq(pdfSubmissions.submissionId, tempSubmission.id));
        } else {
          const [newTempSubmission] = await db.insert(assignmentSubmissions).values({
            assignmentId: assignmentId,
            userId: teacherId,
            attemptNumber: 0,
            status: 'submitted',
          }).returning();

          await db.insert(pdfSubmissions).values({
            submissionId: newTempSubmission.id,
            fileUrl: assignmentInput.pdfFileUrl,
            providerFileId: assignmentInput.pdfFileId || null,
          });
        }
      }
    }

    // Notify enrolled students about assignment update
    // NOTE: This creates a NOTIFICATION (not an announcement)
    // Notifications appear in the notification bell, NOT on the announcements page
    try {
      const assignmentTypeLabel = updated.type === 'quiz' ? 'Quiz' : 'PDF Assignment';
      const finalTitle = updated.title;
      const finalLessonId = updated.lessonId || existingAssignment.lessonId;
      
      // Fetch lesson name if lessonId exists
      let lessonName = null;
      if (finalLessonId) {
        const [lesson] = await db.select()
          .from(lessons)
          .where(eq(lessons.id, finalLessonId))
          .limit(1);
        lessonName = lesson?.title || null;
      }

      // Build notification content with lesson name
      let notificationContent = '';
      if (lessonName) {
        notificationContent = `The ${assignmentTypeLabel.toLowerCase()} "${finalTitle}" has been updated for the lesson "${lessonName}".`;
      } else {
        notificationContent = `The ${assignmentTypeLabel.toLowerCase()} "${finalTitle}" has been updated.`;
      }
      
      if (updated.description) {
        notificationContent += ` ${updated.description}`;
      }

      await notifyCourseStudents(
        courseId,
        'assignment_added', // Notification type - appears in notification bell only
        `Updated ${assignmentTypeLabel}: ${finalTitle}`,
        notificationContent,
        { assignmentId: updated.id, lessonId: finalLessonId }
      );
    } catch (notificationError) {
      console.error('Error sending assignment update notifications:', notificationError);
      // Don't fail the request if notifications fail
    }

    // Invalidate assignments cache
    await invalidateCourseAssignmentsCache(courseId);
    logger.info(`Invalidated assignments cache for course ${courseId} after updating assignment`);

    return res.status(200).json({
      success: true,
      message: "Assignment updated successfully",
      data: { assignment: updated },
    });
  } catch (error) {
    logger.error("Error updating assignment:", error);
    return res.status(500).json({ success: false, message: "Failed to update assignment", error: error.message });
  }
};

/**
 * Delete assignment
 * DELETE /teacher/courses/:courseId/assignments/:assignmentId
 */
export const deleteAssignment = async (req, res) => {
  try {
    const { courseId, assignmentId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Verify assignment exists and belongs to course
    const [assignment] = await db.select().from(assignments).where(and(eq(assignments.id, assignmentId), eq(assignments.courseId, courseId))).limit(1);
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    // Verify user is the creator or admin
    if (assignment.createdBy !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: "You don't have permission to delete this assignment" });
    }

    // Delete assignment (cascade will delete questions, options, submissions)
    await db.delete(assignments).where(eq(assignments.id, assignmentId));

    // Invalidate assignments cache
    await invalidateCourseAssignmentsCache(courseId);
    logger.info(`Invalidated assignments cache for course ${courseId} after deleting assignment`);

    return res.status(200).json({
      success: true,
      message: "Assignment deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting assignment:", error);
    return res.status(500).json({ success: false, message: "Failed to delete assignment", error: error.message });
  }
};

/**
 * Get all submissions for an assignment
 * GET /teacher/assignments/:assignmentId/submissions
 */
export const getSubmissions = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Verify assignment exists and user is the creator
    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    if (assignment.createdBy !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: "You don't have permission to view submissions for this assignment" });
    }

    // Get all submissions
    const submissionsList = await db.select({
      submission: assignmentSubmissions,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
      .from(assignmentSubmissions)
      .leftJoin(users, eq(assignmentSubmissions.userId, users.id))
      .where(eq(assignmentSubmissions.assignmentId, assignmentId))
      .orderBy(desc(assignmentSubmissions.submittedAt));

    // For quiz submissions, include answers
    // For PDF submissions, include file URL
    const submissionsWithDetails = await Promise.all(submissionsList.map(async (item) => {
      const submission = item.submission;
      let details = {
        ...submission,
        user: item.user,
      };

      if (assignment.type === 'quiz') {
        const quizAnswers = await db.select({
          questionId: quizSubmissions.questionId,
          selectedOptionId: quizSubmissions.selectedOptionId,
          isCorrect: quizSubmissions.isCorrect,
        })
          .from(quizSubmissions)
          .where(eq(quizSubmissions.submissionId, submission.id));
        
        details.answers = quizAnswers;
      } else if (assignment.type === 'pdf_upload') {
        const [pdfFile] = await db.select()
          .from(pdfSubmissions)
          .where(eq(pdfSubmissions.submissionId, submission.id))
          .limit(1);
        
        if (pdfFile) {
          details.pdfFileUrl = pdfFile.fileUrl;
          details.pdfFileId = pdfFile.providerFileId;
        }
      }

      return details;
    }));

    return res.status(200).json({
      success: true,
      data: { submissions: submissionsWithDetails },
    });
  } catch (error) {
    logger.error("Error fetching submissions:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch submissions", error: error.message });
  }
};

/**
 * Grade a submission
 * POST /teacher/assignments/:assignmentId/submissions/:submissionId/grade
 */
export const gradeSubmission = async (req, res) => {
  try {
    const { assignmentId, submissionId } = req.params;
    const userId = req.user?.id;
    const { score, feedback } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Verify assignment exists and user is the creator
    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    if (assignment.createdBy !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: "You don't have permission to grade this assignment" });
    }

    // Verify submission exists
    const [submission] = await db.select().from(assignmentSubmissions).where(and(eq(assignmentSubmissions.id, submissionId), eq(assignmentSubmissions.assignmentId, assignmentId))).limit(1);
    if (!submission) {
      return res.status(404).json({ success: false, message: "Submission not found" });
    }

    // Update submission with grade
    const [graded] = await db.update(assignmentSubmissions)
      .set({
        score: score !== undefined ? score : submission.score,
        feedback: feedback !== undefined ? feedback : submission.feedback,
        status: 'graded',
        gradedAt: new Date(),
      })
      .where(eq(assignmentSubmissions.id, submissionId))
      .returning();

    return res.status(200).json({
      success: true,
      message: "Submission graded successfully",
      data: { submission: graded },
    });
  } catch (error) {
    logger.error("Error grading submission:", error);
    return res.status(500).json({ success: false, message: "Failed to grade submission", error: error.message });
  }
};

/**
 * Reassign assignment to student (delete their submission to allow resubmission)
 * POST /teacher/courses/:courseId/assignments/:assignmentId/reassign
 */
export const reassignAssignment = async (req, res) => {
  try {
    const { courseId, assignmentId } = req.params;
    const { userId } = req.body;
    const teacherId = req.user?.id;

    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    // Verify assignment exists and belongs to course
    const [assignment] = await db.select()
      .from(assignments)
      .where(and(
        eq(assignments.id, assignmentId),
        eq(assignments.courseId, courseId)
      ))
      .limit(1);

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    // Verify user is the creator or admin
    if (assignment.createdBy !== teacherId && req.user?.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: "You don't have permission to reassign this assignment" 
      });
    }

    // Get all submissions for this assignment by this user
    const userSubmissions = await db.select()
      .from(assignmentSubmissions)
      .where(and(
        eq(assignmentSubmissions.assignmentId, assignmentId),
        eq(assignmentSubmissions.userId, userId)
      ));

    if (userSubmissions.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "No submissions found for this student" 
      });
    }

    // Delete all submissions (cascade will delete quiz answers and PDF files)
    for (const submission of userSubmissions) {
      // Delete quiz submissions if assignment is quiz
      if (assignment.type === 'quiz') {
        await db.delete(quizSubmissions)
          .where(eq(quizSubmissions.submissionId, submission.id));
      }
      
      // Delete PDF submissions if assignment is PDF
      if (assignment.type === 'pdf_upload') {
        await db.delete(pdfSubmissions)
          .where(eq(pdfSubmissions.submissionId, submission.id));
      }
      
      // Delete the submission itself
      await db.delete(assignmentSubmissions)
        .where(eq(assignmentSubmissions.id, submission.id));
    }

    return res.status(200).json({
      success: true,
      message: "Assignment reassigned successfully. Student can now resubmit.",
    });
  } catch (error) {
    logger.error("Error reassigning assignment:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to reassign assignment", 
      error: error.message 
    });
  }
};
