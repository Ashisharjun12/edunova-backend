import { db } from "../../config/database.js";
import { assignments, assignmentSubmissions, quizSubmissions, pdfSubmissions, ASSIGNMENT_TYPE, SUBMISSION_STATUS } from "../../models/assignment.model.js";
import { quizQuestions, quizOptions, courses, lessons } from "../../models/index.js";
import { users } from "../../models/user.model.js";
import { enrollments } from "../../models/enrollement.model.js";
import { eq, and, or, desc, count, isNull, isNotNull } from "drizzle-orm";
import logger from "../../utils/logger.js";
import { uploadPDFToImageKit } from "../../services/imagekit.js";
import { getCachedCourseAssignments, cacheCourseAssignments } from "../../services/redis/cache.service.js";

/**
 * Get all assignments for a course (student access - requires enrollment)
 * GET /auth/courses/:courseId/assignments
 */
export const getCourseAssignments = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Check cache first
    const cachedAssignments = await getCachedCourseAssignments(courseId);
    if (cachedAssignments) {
      logger.info(`Cache hit for course assignments: ${courseId}`);
      return res.status(200).json({
        success: true,
        data: { assignments: cachedAssignments },
      });
    }

    logger.debug(`Cache miss for course assignments: ${courseId}, fetching from database`);

    // Verify user is enrolled in the course
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(and(
        eq(enrollments.courseId, courseId),
        eq(enrollments.userId, userId)
      ))
      .limit(1);

    if (!enrollment) {
      return res.status(403).json({ 
        success: false, 
        message: "You must be enrolled in this course to view assignments" 
      });
    }

    // Get all assignments for the course (lesson-specific only, no course-wide)
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
      .where(and(
        eq(assignments.courseId, courseId),
        // Only show lesson-specific assignments (lessonId is not null)
        isNotNull(assignments.lessonId)
      ))
      .orderBy(desc(assignments.createdAt));

    // For quiz assignments, fetch questions count
    // For PDF assignments, fetch file URL
    const assignmentsWithDetails = await Promise.all(assignmentsList.map(async (item) => {
      const assignment = item.assignment;
      let details = {
        ...assignment,
        creator: item.creator,
      };

      // Get lesson details if available
      if (assignment.lessonId) {
        const [lesson] = await db.select()
          .from(lessons)
          .where(eq(lessons.id, assignment.lessonId))
          .limit(1);
        if (lesson) {
          details.lesson = {
            id: lesson.id,
            title: lesson.title,
          };
        }
      }

      if (assignment.type === 'quiz') {
        const [questionCount] = await db.select({ count: count() })
          .from(quizQuestions)
          .where(eq(quizQuestions.assignmentId, assignment.id));
        details.questionCount = questionCount?.count || 0;
      } else if (assignment.type === 'pdf_upload') {
        // Get PDF file URL from temporary submission
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
            details.pdfFileUrl = pdfFile.fileUrl;
            details.pdfFileId = pdfFile.providerFileId;
          }
        }
      }

      return details;
    }));

    // Cache the assignments before returning
    await cacheCourseAssignments(courseId, assignmentsWithDetails);
    logger.info(`Cached course assignments for ${courseId}`);

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
 * Get assignment by ID with questions (student access - requires enrollment)
 * GET /auth/courses/:courseId/assignments/:assignmentId
 */
export const getAssignmentById = async (req, res) => {
  try {
    const { courseId, assignmentId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Verify user is enrolled in the course
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(and(
        eq(enrollments.courseId, courseId),
        eq(enrollments.userId, userId)
      ))
      .limit(1);

    if (!enrollment) {
      return res.status(403).json({ 
        success: false, 
        message: "You must be enrolled in this course to view assignments" 
      });
    }

    // Get assignment
    const [assignmentData] = await db.select({
      assignment: assignments,
      creator: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
      .from(assignments)
      .leftJoin(users, eq(assignments.createdBy, users.id))
      .where(and(
        eq(assignments.id, assignmentId),
        eq(assignments.courseId, courseId)
      ))
      .limit(1);

    if (!assignmentData) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    const assignment = assignmentData.assignment;

    // Get lesson details if available
    if (assignment.lessonId) {
      const [lesson] = await db.select()
        .from(lessons)
        .where(eq(lessons.id, assignment.lessonId))
        .limit(1);
      if (lesson) {
        assignment.lesson = {
          id: lesson.id,
          title: lesson.title,
        };
      }
    }

    // If quiz type, fetch questions with options (without correct answer indicators for students)
    if (assignment.type === 'quiz') {
      // Get all questions for this assignment
      const questionsList = await db.select()
        .from(quizQuestions)
        .where(eq(quizQuestions.assignmentId, assignment.id));

      // Get options for each question
      const questionsWithOptions = await Promise.all(questionsList.map(async (question) => {
        const optionsList = await db.select()
          .from(quizOptions)
          .where(eq(quizOptions.questionId, question.id))
          .orderBy(quizOptions.id);

        return {
          id: question.id,
          questionText: question.question,
          question: question.question,
          explanation: question.explanation,
          points: question.points,
          options: optionsList.map(opt => ({
            text: opt.text,
            id: opt.id,
            // Don't include isCorrect for students
          })),
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
 * Submit quiz assignment
 * POST /auth/courses/:courseId/assignments/:assignmentId/submit
 */
export const submitQuizAssignment = async (req, res) => {
  try {
    const { courseId, assignmentId } = req.params;
    const userId = req.user?.id;
    const { answers } = req.body; // answers is an object: { questionId: optionIndex }

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ success: false, message: "Answers are required" });
    }

    // Verify user is enrolled in the course
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(and(
        eq(enrollments.courseId, courseId),
        eq(enrollments.userId, userId)
      ))
      .limit(1);

    if (!enrollment) {
      return res.status(403).json({ 
        success: false, 
        message: "You must be enrolled in this course to submit assignments" 
      });
    }

    // Get assignment
    const [assignment] = await db.select()
      .from(assignments)
      .where(and(
        eq(assignments.id, assignmentId),
        eq(assignments.courseId, courseId),
        eq(assignments.type, 'quiz')
      ))
      .limit(1);

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    // Check max attempts
    const existingSubmissions = await db.select()
      .from(assignmentSubmissions)
      .where(and(
        eq(assignmentSubmissions.assignmentId, assignmentId),
        eq(assignmentSubmissions.userId, userId)
      ));

    const attemptNumber = existingSubmissions.length + 1;
    if (assignment.maxAttempts && attemptNumber > assignment.maxAttempts) {
      return res.status(400).json({ 
        success: false, 
        message: `Maximum attempts (${assignment.maxAttempts}) exceeded` 
      });
    }

    // Get all questions for this assignment
    const questions = await db.select()
      .from(quizQuestions)
      .where(eq(quizQuestions.assignmentId, assignmentId));

    if (questions.length === 0) {
      return res.status(400).json({ success: false, message: "Assignment has no questions" });
    }

    // Validate all questions are answered
    const unansweredQuestions = questions.filter(q => !answers[q.id] && answers[q.id] !== 0);
    if (unansweredQuestions.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Please answer all questions. ${unansweredQuestions.length} question(s) unanswered.` 
      });
    }

    // Calculate score
    let correctAnswers = 0;
    let totalPoints = 0;
    const quizAnswers = [];

    for (const question of questions) {
      totalPoints += question.points || 10;
      const selectedOptionIndex = parseInt(answers[question.id]);
      
      // Get all options for this question
      const allOptions = await db.select()
        .from(quizOptions)
        .where(eq(quizOptions.questionId, question.id))
        .orderBy(quizOptions.id);

      if (selectedOptionIndex < 0 || selectedOptionIndex >= allOptions.length) {
        return res.status(400).json({ 
          success: false, 
          message: `Invalid answer for question ${question.id}` 
        });
      }

      const selectedOption = allOptions[selectedOptionIndex];
      const isCorrect = selectedOption.isCorrect === true;

      if (isCorrect) {
        correctAnswers++;
      }

      quizAnswers.push({
        questionId: question.id,
        selectedOptionId: selectedOption.id,
        selectedOptionIndex: selectedOptionIndex,
        isCorrect: isCorrect,
      });
    }

    const score = Math.round((correctAnswers / questions.length) * assignment.points);

    // Create submission
    const [submission] = await db.insert(assignmentSubmissions).values({
      assignmentId: assignmentId,
      userId: userId,
      attemptNumber: attemptNumber,
      status: 'submitted',
      score: score,
    }).returning();

    // Save quiz answers
    for (const answer of quizAnswers) {
      await db.insert(quizSubmissions).values({
        submissionId: submission.id,
        questionId: answer.questionId,
        selectedOptionId: answer.selectedOptionId,
        isCorrect: answer.isCorrect,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Quiz submitted successfully",
      data: {
        submission: {
          id: submission.id,
          score: score,
          maxScore: assignment.points,
          correctAnswers: correctAnswers,
          totalQuestions: questions.length,
        },
      },
    });
  } catch (error) {
    logger.error("Error submitting quiz:", error);
    return res.status(500).json({ success: false, message: "Failed to submit quiz", error: error.message });
  }
};

/**
 * Submit PDF assignment
 * POST /auth/courses/:courseId/assignments/:assignmentId/submit
 */
export const submitPDFAssignment = async (req, res) => {
  try {
    const { courseId, assignmentId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "PDF file is required" });
    }

    // Check if file is PDF
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ success: false, message: "Only PDF files are allowed" });
    }

    // Verify user is enrolled in the course
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(and(
        eq(enrollments.courseId, courseId),
        eq(enrollments.userId, userId)
      ))
      .limit(1);

    if (!enrollment) {
      return res.status(403).json({ 
        success: false, 
        message: "You must be enrolled in this course to submit assignments" 
      });
    }

    // Get assignment
    const [assignment] = await db.select()
      .from(assignments)
      .where(and(
        eq(assignments.id, assignmentId),
        eq(assignments.courseId, courseId),
        eq(assignments.type, 'pdf_upload')
      ))
      .limit(1);

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    // Check max attempts
    const existingSubmissions = await db.select()
      .from(assignmentSubmissions)
      .where(and(
        eq(assignmentSubmissions.assignmentId, assignmentId),
        eq(assignmentSubmissions.userId, userId)
      ));

    const attemptNumber = existingSubmissions.length + 1;
    if (assignment.maxAttempts && attemptNumber > assignment.maxAttempts) {
      return res.status(400).json({ 
        success: false, 
        message: `Maximum attempts (${assignment.maxAttempts}) exceeded` 
      });
    }

    // Upload PDF to ImageKit
    const uploadResult = await uploadPDFToImageKit(req.file, "/uploads/assignments/submissions");
    
    if (!uploadResult.success) {
      return res.status(500).json({ 
        success: false, 
        message: uploadResult.message || "Failed to upload PDF" 
      });
    }

    // Create submission
    const [submission] = await db.insert(assignmentSubmissions).values({
      assignmentId: assignmentId,
      userId: userId,
      attemptNumber: attemptNumber,
      status: 'submitted',
    }).returning();

    // Save PDF file info
    await db.insert(pdfSubmissions).values({
      submissionId: submission.id,
      fileUrl: uploadResult.url,
      providerFileId: uploadResult.fileId,
    });

    return res.status(200).json({
      success: true,
      message: "PDF assignment submitted successfully",
      data: {
        submission: {
          id: submission.id,
          submittedFileUrl: uploadResult.url,
        },
      },
    });
  } catch (error) {
    logger.error("Error submitting PDF assignment:", error);
    return res.status(500).json({ success: false, message: "Failed to submit PDF assignment", error: error.message });
  }
};

/**
 * Get user's submissions for an assignment
 * GET /auth/courses/:courseId/assignments/:assignmentId/submissions
 */
export const getMySubmissions = async (req, res) => {
  try {
    const { courseId, assignmentId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Verify user is enrolled in the course
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(and(
        eq(enrollments.courseId, courseId),
        eq(enrollments.userId, userId)
      ))
      .limit(1);

    if (!enrollment) {
      return res.status(403).json({ 
        success: false, 
        message: "You must be enrolled in this course to view submissions" 
      });
    }

    // Get user's submissions
    const userSubmissions = await db.select()
      .from(assignmentSubmissions)
      .where(and(
        eq(assignmentSubmissions.assignmentId, assignmentId),
        eq(assignmentSubmissions.userId, userId)
      ))
      .orderBy(desc(assignmentSubmissions.submittedAt));

    // Get assignment to check type
    const [assignment] = await db.select()
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1);

    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    // Add submission details based on type
    const submissionsWithDetails = await Promise.all(userSubmissions.map(async (submission) => {
      const details = { ...submission };

      if (assignment.type === 'pdf_upload') {
        const [pdfSubmission] = await db.select()
          .from(pdfSubmissions)
          .where(eq(pdfSubmissions.submissionId, submission.id))
          .limit(1);
        
        if (pdfSubmission) {
          details.submittedFileUrl = pdfSubmission.fileUrl;
        }
      }

      return details;
    }));

    return res.status(200).json({
      success: true,
      data: submissionsWithDetails,
    });
  } catch (error) {
    logger.error("Error fetching submissions:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch submissions", error: error.message });
  }
};

