import { db } from '../../config/database.js'
import { announcements, courses, enrollments, COURSE_STATUS } from '../../models/index.js'
import { eq, and, desc } from 'drizzle-orm'
import { notifyCourseStudents } from '../../services/notification/notification.service.js'
import { broadcastAnnouncement } from '../../services/announcement/announcementSSE.service.js'
import { 
  invalidateCourseAnnouncementsCache
} from '../../services/redis/cache.service.js'
import { publish } from '../../queue/pubsub.js'
import logger from '../../utils/logger.js'

/**
 * Create a new announcement
 */
export const createAnnouncement = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { courseId, title, content } = req.body

    if (!courseId || !title) {
      return res.status(400).json({
        success: false,
        message: 'Course ID and title are required'
      })
    }

    // Verify course exists, user is the teacher, and course is published
    const [course] = await db
      .select()
      .from(courses)
      .where(and(
        eq(courses.id, courseId),
        eq(courses.teacherId, userId)
      ))
      .limit(1)

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or you do not have permission'
      })
    }

    // Only allow announcements for published courses
    if (course.status !== 'published') {
      return res.status(400).json({
        success: false,
        message: 'Announcements can only be created for published courses'
      })
    }

    // Create manual announcement (this is the ONLY way announcements are created)
    // This creates a record in the announcements table which appears on the announcements page
    const newAnnouncement = await db
      .insert(announcements)
      .values({
        courseId,
        title,
        content: content || null,
        createdBy: userId
      })
      .returning()

    // Also send notification to enrolled students so they see it in notification bell
    // NOTE: This creates a NOTIFICATION with type 'announcement'
    // The announcement itself appears on announcements page, notification appears in bell
    try {
      await notifyCourseStudents(
        courseId,
        'announcement', // Notification type - appears in notification bell
        title,
        content || `New announcement: ${title}`,
        { announcementId: newAnnouncement[0].id }
      )
    } catch (notificationError) {
      console.error('Error sending notifications:', notificationError)
      // Don't fail the request if notifications fail
    }

    // Publish to Redis pub/sub for scalable SSE (works across multiple instances)
    try {
      const channel = `announcement:course:${courseId}`;
      await publish(channel, {
        courseId,
        announcement: newAnnouncement[0],
        type: 'announcement',
        timestamp: new Date().toISOString(),
      });
      logger.debug(`Published announcement to Redis pub/sub channel ${channel} for course ${courseId}`);
    } catch (pubSubError) {
      logger.error(`Error publishing announcement to Redis pub/sub for course ${courseId}:`, pubSubError);
      // Still try to broadcast locally even if pub/sub fails
      try {
        broadcastAnnouncement(courseId, newAnnouncement[0]);
      } catch (sseError) {
        logger.error('Error broadcasting announcement via SSE:', sseError);
      }
    }

    // Invalidate announcements cache
    await invalidateCourseAnnouncementsCache(courseId)
    logger.info(`Invalidated announcements cache for course ${courseId} after creating announcement`);

    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: newAnnouncement[0]
    })
  } catch (error) {
    console.error('Error creating announcement:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to create announcement',
      error: error.message
    })
  }
}

/**
 * Get announcements for a course (Teacher - no enrollment check)
 */
export const getCourseAnnouncements = async (req, res) => {
  try {
    const { courseId } = req.params
    const userId = req.user?.id

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: 'Course ID is required'
      })
    }

    // Verify course exists and user is the teacher
    const [course] = await db
      .select()
      .from(courses)
      .where(and(
        eq(courses.id, courseId),
        eq(courses.teacherId, userId)
      ))
      .limit(1)

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or you do not have permission'
      })
    }

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

/**
 * Update an announcement
 */
export const updateAnnouncement = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { announcementId } = req.params
    const { title, content } = req.body

    // Check if announcement exists and user is the creator
    const existingAnnouncement = await db
      .select()
      .from(announcements)
      .where(and(
        eq(announcements.id, announcementId),
        eq(announcements.createdBy, userId)
      ))
      .limit(1)

    if (existingAnnouncement.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found or you do not have permission'
      })
    }

    // Get courseId before updating
    const courseId = existingAnnouncement[0].courseId;

    // Update announcement
    const updatedAnnouncement = await db
      .update(announcements)
      .set({
        title: title || existingAnnouncement[0].title,
        content: content !== undefined ? content : existingAnnouncement[0].content,
        updatedAt: new Date()
      })
      .where(eq(announcements.id, announcementId))
      .returning()

    // Invalidate announcements cache
    await invalidateCourseAnnouncementsCache(courseId)
    logger.info(`Invalidated announcements cache for course ${courseId} after updating announcement`);

    res.status(200).json({
      success: true,
      message: 'Announcement updated successfully',
      data: updatedAnnouncement[0]
    })
  } catch (error) {
    console.error('Error updating announcement:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update announcement',
      error: error.message
    })
  }
}

/**
 * Delete an announcement
 */
export const deleteAnnouncement = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { announcementId } = req.params

    // Check if announcement exists and user is the creator
    const existingAnnouncement = await db
      .select()
      .from(announcements)
      .where(and(
        eq(announcements.id, announcementId),
        eq(announcements.createdBy, userId)
      ))
      .limit(1)

    if (existingAnnouncement.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found or you do not have permission'
      })
    }

    // Get courseId before deleting
    const courseId = existingAnnouncement[0].courseId;

    // Delete announcement
    await db
      .delete(announcements)
      .where(eq(announcements.id, announcementId))

    // Invalidate announcements cache
    await invalidateCourseAnnouncementsCache(courseId)
    logger.info(`Invalidated announcements cache for course ${courseId} after deleting announcement`);

    res.status(200).json({
      success: true,
      message: 'Announcement deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting announcement:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete announcement',
      error: error.message
    })
  }
}

