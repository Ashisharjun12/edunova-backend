import { db } from '../../config/database.js'
import { notifications, enrollments } from '../../models/index.js'
import { eq, and, desc, count, sql } from 'drizzle-orm'
import logger from '../../utils/logger.js'
import {
  invalidateUserNotificationsCache,
  invalidateUserUnreadCountCache,
} from '../redis/cache.service.js'
import { broadcastNotification } from './notificationSSE.service.js'
import { publish } from '../../queue/pubsub.js'

/**
 * Create a notification for a specific user
 */
export const createNotification = async (userId, courseId, type, title, content, metadata = null, expirationHours = 24) => {
  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + expirationHours * 60 * 60 * 1000)
    
    const newNotification = await db
      .insert(notifications)
      .values({
        userId,
        courseId: courseId || null,
        type,
        title,
        content: content || null,
        metadata: metadata || null,
        isRead: false,
        expiresAt,
        expired: false,
        customExpirationHours: expirationHours !== 24 ? expirationHours : null
      })
      .returning()

    // Invalidate cache
    await Promise.all([
      invalidateUserNotificationsCache(userId),
      invalidateUserUnreadCountCache(userId),
    ])

    // Publish to Redis pub/sub for scalable SSE (works across multiple instances)
    try {
      const channel = `notification:user:${userId}`;
      await publish(channel, {
        userId,
        notification: newNotification[0],
        timestamp: new Date().toISOString(),
      });
      logger.debug(`Published notification to Redis pub/sub channel ${channel} for user ${userId}`);
    } catch (pubSubError) {
      logger.error(`Error publishing notification to Redis pub/sub for user ${userId}:`, pubSubError);
      // Still try to broadcast locally even if pub/sub fails
      try {
        broadcastNotification(userId, newNotification[0]);
      } catch (sseError) {
        logger.error('Error broadcasting notification via SSE:', sseError);
      }
    }

    return newNotification[0]
  } catch (error) {
    console.error('Error creating notification:', error)
    throw error
  }
}

/**
 * Notify all enrolled students in a course
 */
export const notifyCourseStudents = async (courseId, type, title, content, metadata = null, expirationHours = 24) => {
  try {
    // Get all enrolled students for the course
    const enrolledStudents = await db
      .select({
        userId: enrollments.userId
      })
      .from(enrollments)
      .where(eq(enrollments.courseId, courseId))

    if (enrolledStudents.length === 0) {
      return []
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + expirationHours * 60 * 60 * 1000)

    // Create notifications for all enrolled students
    const notificationValues = enrolledStudents.map(enrollment => ({
      userId: enrollment.userId,
      courseId,
      type,
      title,
      content: content || null,
      metadata: metadata || null,
      isRead: false,
      expiresAt,
      expired: false,
      customExpirationHours: expirationHours !== 24 ? expirationHours : null
    }))

    const createdNotifications = await db
      .insert(notifications)
      .values(notificationValues)
      .returning()

    // Invalidate cache for all affected users
    const userIds = [...new Set(createdNotifications.map((n) => n.userId))]
    await Promise.all(
      userIds.map(async (userId) => {
        await Promise.all([
          invalidateUserNotificationsCache(userId),
          invalidateUserUnreadCountCache(userId),
        ])
      })
    )

    // Publish to Redis pub/sub for scalable SSE (works across multiple instances)
    await Promise.allSettled(
      createdNotifications.map(async (notification) => {
        try {
          const channel = `notification:user:${notification.userId}`;
          await publish(channel, {
            userId: notification.userId,
            notification,
            timestamp: new Date().toISOString(),
          });
          logger.debug(`Published notification to Redis pub/sub channel ${channel} for user ${notification.userId}`);
        } catch (pubSubError) {
          logger.error(`Error publishing notification to Redis pub/sub for user ${notification.userId}:`, pubSubError);
          // Still try to broadcast locally even if pub/sub fails
          try {
            broadcastNotification(notification.userId, notification);
          } catch (sseError) {
            logger.error(`Error broadcasting notification via SSE for user ${notification.userId}:`, sseError);
          }
        }
      })
    );

    return createdNotifications
  } catch (error) {
    console.error('Error notifying course students:', error)
    throw error
  }
}

/**
 * Get user notifications with pagination (no caching - rely on SSE for real-time updates)
 */
export const getUserNotifications = async (userId, page = 1, limit = 20, unreadOnly = false, includeExpired = false) => {
  try {
    const offset = (page - 1) * limit

    // Build query conditions
    const conditions = [eq(notifications.userId, userId)]
    if (unreadOnly) {
      conditions.push(eq(notifications.isRead, false))
    }
    if (!includeExpired) {
      conditions.push(eq(notifications.expired, false))
    }

    // Get notifications
    const userNotifications = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count
    const totalCountResult = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(...conditions))

    const totalCount = totalCountResult[0]?.count || 0
    const totalPages = Math.ceil(totalCount / limit)

    const result = {
      notifications: userNotifications,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }

    // No caching - rely on SSE for real-time updates (like announcements)
    return result
  } catch (error) {
    logger.error('Error getting user notifications:', error)
    throw error
  }
}

/**
 * Mark a notification as read
 */
export const markAsRead = async (userId, notificationId) => {
  try {
    const updatedNotification = await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date()
      })
      .where(and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      ))
      .returning()

    if (updatedNotification.length === 0) {
      throw new Error('Notification not found or access denied')
    }

    // Invalidate cache
    await invalidateUserNotificationsCache(userId)
    await invalidateUserUnreadCountCache(userId)

    return updatedNotification[0]
  } catch (error) {
    console.error('Error marking notification as read:', error)
    throw error
  }
}

/**
 * Mark all notifications as read for a user
 */
export const markAllAsRead = async (userId) => {
  try {
    const updatedNotifications = await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date()
      })
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ))
      .returning()

    // Invalidate cache
    await invalidateUserNotificationsCache(userId)
    await invalidateUserUnreadCountCache(userId)

    return updatedNotifications
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    throw error
  }
}

/**
 * Mark all notifications as read for a user in a specific course
 */
export const markAllAsReadForCourse = async (userId, courseId) => {
  try {
    const updatedNotifications = await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date()
      })
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.courseId, courseId),
        eq(notifications.isRead, false)
      ))
      .returning()

    // Invalidate cache
    await invalidateUserNotificationsCache(userId)
    await invalidateUserUnreadCountCache(userId)

    return updatedNotifications
  } catch (error) {
    logger.error('Error marking all course notifications as read:', error)
    throw error
  }
}

/**
 * Get unread notification count for a user (excludes expired) - no caching, rely on SSE
 */
export const getUnreadCount = async (userId) => {
  try {
    const countResult = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
        eq(notifications.expired, false)
      ))

    const unreadCount = countResult[0]?.count || 0

    // No caching - rely on SSE for real-time updates (like announcements)
    return unreadCount
  } catch (error) {
    logger.error('Error getting unread count:', error)
    throw error
  }
}

/**
 * Update notification expiration (Admin only)
 */
export const updateNotificationExpiration = async (notificationId, expirationHours) => {
  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + expirationHours * 60 * 60 * 1000)
    
    const updatedNotification = await db
      .update(notifications)
      .set({
        expiresAt,
        expired: false, // Reset expired status when updating expiration
        customExpirationHours: expirationHours !== 24 ? expirationHours : null
      })
      .where(eq(notifications.id, notificationId))
      .returning()

    if (updatedNotification.length === 0) {
      throw new Error('Notification not found')
    }

    // Invalidate cache for the user
    await invalidateUserNotificationsCache(updatedNotification[0].userId)
    await invalidateUserUnreadCountCache(updatedNotification[0].userId)

    return updatedNotification[0]
  } catch (error) {
    console.error('Error updating notification expiration:', error)
    throw error
  }
}


