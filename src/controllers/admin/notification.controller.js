import { createNotification, notifyCourseStudents, getUserNotifications, updateNotificationExpiration } from '../../services/notification/notification.service.js'
import { invalidateUserNotificationsCache, invalidateUserUnreadCountCache } from '../../services/redis/cache.service.js'
import { db } from '../../config/database.js'
import { users, courses, enrollments, notifications } from '../../models/index.js'
import { eq, and, desc, count, or, like } from 'drizzle-orm'
import logger from '../../utils/logger.js'

/**
 * Create notification with custom expiration (Admin only)
 * POST /api/admin/notifications
 */
export const createAdminNotification = async (req, res) => {
  try {
    const { userId, courseId, type, title, content, expirationHours = 24, metadata } = req.body

    // Validate required fields
    if (!type || !title) {
      return res.status(400).json({
        success: false,
        message: 'Type and title are required'
      })
    }

    // Validate expiration hours
    const expirationHoursNum = parseInt(expirationHours)
    if (isNaN(expirationHoursNum) || expirationHoursNum < 1 || expirationHoursNum > 720) {
      return res.status(400).json({
        success: false,
        message: 'Expiration hours must be between 1 and 720 (30 days)'
      })
    }

    let createdNotifications = []

    if (userId) {
      // Send to specific user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        })
      }

      const notification = await createNotification(
        userId,
        courseId || null,
        type,
        title,
        content,
        metadata || null,
        expirationHoursNum
      )
      createdNotifications.push(notification)
    } else if (courseId) {
      // Send to all enrolled students in course
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

      createdNotifications = await notifyCourseStudents(
        courseId,
        type,
        title,
        content,
        metadata || null,
        expirationHoursNum
      )
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either userId or courseId must be provided'
      })
    }

    res.status(201).json({
      success: true,
      message: `Notification created successfully for ${createdNotifications.length} recipient(s)`,
      data: {
        notifications: createdNotifications,
        count: createdNotifications.length
      }
    })
  } catch (error) {
    console.error('Error creating admin notification:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to create notification',
      error: error.message
    })
  }
}

/**
 * Get all notifications (Admin only)
 * GET /api/admin/notifications
 */
export const getAdminNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const includeExpired = req.query.includeExpired === 'true'
    const userId = req.query.userId
    const courseId = req.query.courseId

    // If userId provided, get notifications for that user
    if (userId) {
      const result = await getUserNotifications(userId, page, limit, false, includeExpired)
      return res.status(200).json({
        success: true,
        message: 'Notifications retrieved successfully',
        data: result
      })
    }

    // Otherwise, get all notifications with filters
    const offset = (page - 1) * limit
    const conditions = []
    const type = req.query.type
    const search = req.query.search
    
    if (courseId) {
      conditions.push(eq(notifications.courseId, courseId))
    }
    if (type) {
      conditions.push(eq(notifications.type, type))
    }
    if (search) {
      conditions.push(
        or(
          like(notifications.title, `%${search}%`),
          like(notifications.content, `%${search}%`)
        )
      )
    }
    if (!includeExpired) {
      conditions.push(eq(notifications.expired, false))
    }

    const allNotifications = await db
      .select({
        id: notifications.id,
        userId: notifications.userId,
        courseId: notifications.courseId,
        type: notifications.type,
        title: notifications.title,
        content: notifications.content,
        metadata: notifications.metadata,
        isRead: notifications.isRead,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
        expiresAt: notifications.expiresAt,
        expired: notifications.expired,
        customExpirationHours: notifications.customExpirationHours,
        userName: users.name,
        courseTitle: courses.title
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.userId, users.id))
      .leftJoin(courses, eq(notifications.courseId, courses.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset)

    const totalCountResult = await db
      .select({ count: count() })
      .from(notifications)
      .where(conditions.length > 0 ? and(...conditions) : undefined)

    const totalCount = totalCountResult[0]?.count || 0
    const totalPages = Math.ceil(totalCount / limit)

    res.status(200).json({
      success: true,
      message: 'Notifications retrieved successfully',
      data: {
        notifications: allNotifications,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    })
  } catch (error) {
    console.error('Error getting admin notifications:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get notifications',
      error: error.message
    })
  }
}

/**
 * Update notification expiration (Admin only)
 * PUT /api/admin/notifications/:id/expiration
 */
export const updateNotificationExpirationAdmin = async (req, res) => {
  try {
    const { id } = req.params
    const { expirationHours } = req.body

    if (!expirationHours) {
      return res.status(400).json({
        success: false,
        message: 'Expiration hours is required'
      })
    }

    const expirationHoursNum = parseInt(expirationHours)
    if (isNaN(expirationHoursNum) || expirationHoursNum < 1 || expirationHoursNum > 720) {
      return res.status(400).json({
        success: false,
        message: 'Expiration hours must be between 1 and 720 (30 days)'
      })
    }

    const updatedNotification = await updateNotificationExpiration(id, expirationHoursNum)

    res.status(200).json({
      success: true,
      message: 'Notification expiration updated successfully',
      data: updatedNotification
    })
  } catch (error) {
    console.error('Error updating notification expiration:', error)
    if (error.message === 'Notification not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      })
    }
    res.status(500).json({
      success: false,
      message: 'Failed to update notification expiration',
      error: error.message
    })
  }
}

/**
 * Delete notification (Admin only)
 * DELETE /api/admin/notifications/:id
 */
export const deleteNotificationAdmin = async (req, res) => {
  try {
    const { id } = req.params

    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .limit(1)

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      })
    }

    const userId = notification.userId

    await db
      .delete(notifications)
      .where(eq(notifications.id, id))

    // Invalidate cache for the user whose notification was deleted
    await Promise.all([
      invalidateUserNotificationsCache(userId),
      invalidateUserUnreadCountCache(userId)
    ])

    logger.info(`Admin deleted notification: ${id} and invalidated cache for user: ${userId}`)

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    })
  } catch (error) {
    logger.error('Error deleting notification:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message
    })
  }
}

