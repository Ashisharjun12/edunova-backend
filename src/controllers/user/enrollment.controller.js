import { db } from "../../config/database.js";
import { transaction } from "../../transcation/transcation.js";
import { enrollments, enrollmentLessons } from "../../models/enrollement.model.js";
import { courses, lessons } from "../../models/course.model.js";
import { users } from "../../models/user.model.js";
import { images } from "../../models/document.model.js";
import { eq, and, count, desc } from "drizzle-orm";
import { getCachedCourseMembers, cacheCourseMembers, invalidateCourseMembersCache } from "../../services/redis/cache.service.js";
import logger from "../../utils/logger.js";

// POST /api/v1/enrollments/:courseId
export const enrollInCourse = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!courseId) return res.status(400).json({ success: false, message: "courseId is required" });

    const result = await transaction(async (tx) => {
      // ensure course exists
      const [course] = await tx.select().from(courses).where(eq(courses.id, courseId));
      if (!course) throw new Error("Course not found");

      // create or return existing enrollment
      const existing = await tx
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));
      
      let enrollment;
      let isNewEnrollment = false;
      
      if (existing.length > 0) {
        [enrollment] = existing;
        console.log(`📚 User ${userId} already enrolled in course ${courseId}`);
      } else {
        [enrollment] = await tx
          .insert(enrollments)
          .values({ userId, courseId })
          .returning();
        isNewEnrollment = true;
        console.log(`📚 New enrollment created for user ${userId} in course ${courseId}`);
      }

      // Update student count only for new enrollments
      if (isNewEnrollment) {
        const [updatedCourse] = await tx
          .update(courses)
          .set({ 
            studentCount: course.studentCount + 1,
            updatedAt: new Date()
          })
          .where(eq(courses.id, courseId))
          .returning();
        
        console.log(`📊 Course ${courseId} student count updated: ${course.studentCount} → ${updatedCourse.studentCount}`);
      }

      return { enrollment, isNewEnrollment };
    });

    // Invalidate members cache when enrollment changes
    if (result.isNewEnrollment) {
      await invalidateCourseMembersCache(courseId);
      logger.info(`Invalidated members cache for course ${courseId} after enrollment`);
    }

    return res.status(201).json({ 
      success: true, 
      message: result.isNewEnrollment ? "Successfully enrolled in course" : "Already enrolled in course",
      ...result 
    });
  } catch (error) {
    console.error("enrollInCourse error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to enroll" });
  }
};

// POST /api/v1/enrollments/:courseId/lessons/:lessonId/complete { completed: boolean }
export const setLessonCompletion = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { courseId, lessonId } = req.params;
    const { completed = true } = req.body || {};
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const result = await transaction(async (tx) => {
      // find enrollment
      const [enrollment] = await tx
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));
      if (!enrollment) throw new Error("Not enrolled in course");

      // upsert completion
      const existing = await tx
        .select()
        .from(enrollmentLessons)
        .where(and(eq(enrollmentLessons.enrollmentId, enrollment.id), eq(enrollmentLessons.lessonId, lessonId)));
      if (existing.length > 0) {
        await tx
          .update(enrollmentLessons)
          .set({ completed: !!completed, completedAt: completed ? new Date() : null })
          .where(and(eq(enrollmentLessons.enrollmentId, enrollment.id), eq(enrollmentLessons.lessonId, lessonId)));
      } else {
        await tx
          .insert(enrollmentLessons)
          .values({ enrollmentId: enrollment.id, lessonId, completed: !!completed, completedAt: completed ? new Date() : null });
      }

      // recompute progress
      const [{ value: totalLessons }] = await tx.select({ value: count() }).from(lessons).where(eq(lessons.courseId, courseId));
      const [{ value: doneLessons }] = await tx
        .select({ value: count() })
        .from(enrollmentLessons)
        .where(and(eq(enrollmentLessons.enrollmentId, enrollment.id), eq(enrollmentLessons.completed, true)));
      const progressPercent = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;
      const [updated] = await tx
        .update(enrollments)
        .set({ progressPercent, lastAccessedLessonId: lessonId, updatedAt: new Date() })
        .where(eq(enrollments.id, enrollment.id))
        .returning();

      return { enrollment: updated, doneLessons, totalLessons };
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("setLessonCompletion error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to set completion" });
  }
};

// DELETE /api/v1/enrollments/:courseId
export const unenrollFromCourse = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!courseId) return res.status(400).json({ success: false, message: "courseId is required" });

    const result = await transaction(async (tx) => {
      // Check if enrollment exists
      const [enrollment] = await tx
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));
      
      if (!enrollment) {
        throw new Error("Not enrolled in this course");
      }

      // Get course to update student count
      const [course] = await tx.select().from(courses).where(eq(courses.id, courseId));
      if (!course) throw new Error("Course not found");

      // Delete enrollment
      await tx
        .delete(enrollments)
        .where(eq(enrollments.id, enrollment.id));

      // Update student count (decrement)
      const [updatedCourse] = await tx
        .update(courses)
        .set({ 
          studentCount: Math.max(0, course.studentCount - 1), // Ensure count doesn't go below 0
          updatedAt: new Date()
        })
        .where(eq(courses.id, courseId))
        .returning();
      
      console.log(`📚 User ${userId} unenrolled from course ${courseId}`);
      console.log(`📊 Course ${courseId} student count updated: ${course.studentCount} → ${updatedCourse.studentCount}`);

      return { course: updatedCourse };
    });

    // Invalidate members cache when enrollment changes
    await invalidateCourseMembersCache(courseId);
    logger.info(`Invalidated members cache for course ${courseId} after unenrollment`);

    return res.status(200).json({ 
      success: true, 
      message: "Successfully unenrolled from course",
      ...result 
    });
  } catch (error) {
    console.error("unenrollFromCourse error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to unenroll" });
  }
};

// GET /api/v1/enrollments/:courseId
export const getEnrollment = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
    
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));
    
    if (!enrollment) {
      return res.status(200).json({ success: true, enrolled: false, message: "Not enrolled" });
    }
    
    // Fetch completed lessons for this enrollment
    const completedLessons = await db
      .select()
      .from(enrollmentLessons)
      .where(eq(enrollmentLessons.enrollmentId, enrollment.id));
    
    return res.status(200).json({ 
      success: true, 
      enrolled: true, 
      enrollment: {
        ...enrollment,
        enrollmentLessons: completedLessons
      }
    });
  } catch (error) {
    console.error("getEnrollment error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch enrollment" });
  }
};

// GET /api/v1/enrollments/student/:userId
export const getStudentEnrollments = async (req, res) => {
  try {
    const { userId } = req.params;
    const teacherId = req.user?.id;
    
    if (!teacherId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    console.log(`📚 Getting enrollments for student: ${userId} by teacher: ${teacherId}`);

    // Get all enrollments for this student - use simple select
    const studentEnrollments = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.userId, userId));

    console.log(`📚 Found ${studentEnrollments.length} enrollments for student`);

    if (studentEnrollments.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: "No enrollments found", 
        enrollments: [] 
      });
    }

    // Get course details for each enrollment
    const enrollmentsWithCourses = [];
    
    for (const enrollment of studentEnrollments) {
        try {
          // Get course details with thumbnail URL - use simple select to avoid Drizzle field ordering issues
          const courseList = await db
            .select({
              id: courses.id,
              title: courses.title,
              description: courses.description,
              thumbnailId: courses.thumbnailId,
              status: courses.status,
              difficulty: courses.difficulty,
              price: courses.price,
              duration: courses.duration,
              studentCount: courses.studentCount,
              rating: courses.rating,
              ratingCount: courses.ratingCount,
              tags: courses.tags,
              createdAt: courses.createdAt,
              updatedAt: courses.updatedAt,
              thumbnailUrl: images.url
            })
            .from(courses)
            .leftJoin(images, eq(courses.thumbnailId, images.id))
            .where(eq(courses.id, enrollment.courseId));
          
          const course = courseList[0];

        if (course) {
          enrollmentsWithCourses.push({
            enrollmentId: enrollment.id,
            userId: enrollment.userId,
            courseId: enrollment.courseId,
            progressPercent: enrollment.progressPercent || 0,
            enrolledAt: enrollment.createdAt,
            lastAccessedAt: enrollment.updatedAt,
            course: {
              id: course.id,
              title: course.title,
              description: course.description,
              thumbnailUrl: course.thumbnailUrl,
              status: course.status,
              difficulty: course.difficulty,
              price: course.price,
              duration: course.duration,
              studentCount: course.studentCount,
              rating: course.rating ? parseFloat((course.rating / 10).toFixed(1)) : 0,
              ratingCount: course.ratingCount,
              tags: course.tags,
              createdAt: course.createdAt,
              updatedAt: course.updatedAt
            }
          });
        }
      } catch (courseError) {
        console.error(`📚 Error fetching course ${enrollment.courseId}:`, courseError);
      }
    }

    console.log(`📚 Returning ${enrollmentsWithCourses.length} enrollments with course details`);

    return res.status(200).json({
      success: true,
      message: "Student enrollments retrieved successfully",
      enrollments: enrollmentsWithCourses
    });

  } catch (error) {
    console.error("getStudentEnrollments error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to retrieve student enrollments",
      error: error.message
    });
  }
};

// GET /api/v1/courses/:courseId/members - Get all enrolled members for a course
export const getCourseMembers = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    logger.info(`Getting members for course: ${courseId}`);

    // Check cache first
    const cachedMembers = await getCachedCourseMembers(courseId);
    if (cachedMembers) {
      logger.info(`Cache hit for course members: ${courseId}`);
      return res.status(200).json({
        success: true,
        message: "Course members retrieved successfully (cached)",
        data: cachedMembers
      });
    }

    logger.debug(`Cache miss for course members: ${courseId}, fetching from database`);

    // Get course to verify it exists
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      return res.status(404).json({ 
        success: false, 
        message: "Course not found" 
      });
    }

    // Check if user is enrolled (for students) or is teacher/admin
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, courseId)
      ))
      .limit(1);

    const userRole = req.user?.role;
    const isTeacher = userRole === 'teacher' || userRole === 'admin';
    const isEnrolled = !!enrollment;

    // Only enrolled students or teachers/admins can view members
    if (!isEnrolled && !isTeacher) {
      return res.status(403).json({ 
        success: false, 
        message: "You must be enrolled in this course to view members" 
      });
    }

    // Get all enrollments for this course with user details
    const courseEnrollments = await db
      .select({
        enrollmentId: enrollments.id,
        userId: enrollments.userId,
        progressPercent: enrollments.progressPercent,
        enrolledAt: enrollments.createdAt,
        lastAccessedAt: enrollments.updatedAt,
        userName: users.name,
        userEmail: users.email,
        userAvatar: users.avatar,
        userRole: users.role,
      })
      .from(enrollments)
      .leftJoin(users, eq(enrollments.userId, users.id))
      .where(eq(enrollments.courseId, courseId))
      .orderBy(desc(enrollments.createdAt));

    // Format the response
    const members = courseEnrollments.map(enrollment => ({
      enrollmentId: enrollment.enrollmentId,
      userId: enrollment.userId,
      name: enrollment.userName || 'Unknown User',
      email: enrollment.userEmail || '',
      avatar: enrollment.userAvatar || null,
      role: enrollment.userRole || 'student',
      progressPercent: enrollment.progressPercent || 0,
      enrolledAt: enrollment.enrolledAt,
      lastAccessedAt: enrollment.lastAccessedAt,
    }));

    const responseData = {
      members,
      total: members.length,
      course: {
        id: course.id,
        title: course.title,
      }
    };

    // Cache the members before returning
    await cacheCourseMembers(courseId, responseData);
    logger.info(`Cached course members for ${courseId}`);

    return res.status(200).json({
      success: true,
      message: "Course members retrieved successfully",
      data: responseData
    });
  } catch (error) {
    logger.error("getCourseMembers error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to retrieve course members",
      error: error.message
    });
  }
};


