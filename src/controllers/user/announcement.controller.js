import { db } from '../../config/database.js'
import { announcements, courses, enrollments, COURSE_STATUS } from '../../models/index.js'
import { eq, and, desc } from 'drizzle-orm'
import { getCachedCourseAnnouncements, cacheCourseAnnouncements } from '../../services/redis/cache.service.js'
import logger from '../../utils/logger.js'

/**
 * Get announcements for a course (Student - with enrollment and published course check)
 */
export const getStudentCourseAnnouncements = async (req, res) => {
  try {
    const { courseId } = req.params
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: 'Course ID is required'
      })
    }

    // Verify course exists and is published
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1)

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      })
    }

    // Only show announcements for published courses
    if (course.status !== 'published') {
      return res.status(200).json({
        success: true,
        message: 'Announcements retrieved successfully',
        data: [] // Return empty array for unpublished courses
      })
    }

    // Verify user is enrolled in the course
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(and(
        eq(enrollments.courseId, courseId),
        eq(enrollments.userId, userId)
      ))
      .limit(1)

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'You must be enrolled in this course to view announcements'
      })
    }

    // Check cache first
    const cachedAnnouncements = await getCachedCourseAnnouncements(courseId);
    if (cachedAnnouncements) {
      logger.info(`Cache hit for course announcements: ${courseId}`);
      return res.status(200).json({
        success: true,
        message: 'Announcements retrieved successfully (cached)',
        data: cachedAnnouncements
      });
    }

    logger.debug(`Cache miss for course announcements: ${courseId}, fetching from database`);

    // Get ONLY manual announcements for the course (not notifications)
    // Announcements table only contains manual announcements created by teachers
    const courseAnnouncements = await db
      .select({
        id: announcements.id,
        courseId: announcements.courseId,
        title: announcements.title,
        content: announcements.content,
        createdBy: announcements.createdBy,
        createdAt: announcements.createdAt,
        updatedAt: announcements.updatedAt
      })
      .from(announcements)
      .where(eq(announcements.courseId, courseId))
      .orderBy(desc(announcements.createdAt))

    logger.info(`Retrieved ${courseAnnouncements.length} manual announcements for course ${courseId}`);

    // Cache the announcements before returning
    await cacheCourseAnnouncements(courseId, courseAnnouncements);
    logger.info(`Cached course announcements for ${courseId}`);

    res.status(200).json({
      success: true,
      message: 'Announcements retrieved successfully',
      data: courseAnnouncements
    })
  } catch (error) {
    console.error('Error getting course announcements:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get announcements',
      error: error.message
    })
  }
}

