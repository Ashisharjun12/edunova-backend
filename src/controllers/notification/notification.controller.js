import {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  markAllAsReadForCourse,
  getUnreadCount
} from '../../services/notification/notification.service.js'

/**
 * Get user notifications
 */
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const unreadOnly = req.query.unreadOnly === 'true'
    const includeExpired = req.query.includeExpired === 'true'

    const result = await getUserNotifications(userId, page, limit, unreadOnly, includeExpired)

    res.status(200).json({
      success: true,
      message: 'Notifications retrieved successfully',
      data: result
    })
  } catch (error) {
    console.error('Error getting notifications:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get notifications',
      error: error.message
    })
  }
}

/**
 * Get unread notification count
 */
export const getUnreadNotificationCount = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const count = await getUnreadCount(userId)

    res.status(200).json({
      success: true,
      message: 'Unread count retrieved successfully',
      data: { count }
    })
  } catch (error) {
    console.error('Error getting unread count:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message
    })
  }
}

/**
 * Mark notification as read
 */
export const markNotificationAsRead = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { notificationId } = req.params

    const notification = await markAsRead(userId, notificationId)

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    })
  } catch (error) {
    console.error('Error marking notification as read:', error)
    if (error.message === 'Notification not found or access denied') {
      return res.status(404).json({
        success: false,
        message: error.message
      })
    }
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message
    })
  }
}

/**
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { courseId } = req.query // Optional: if courseId is provided, mark only course-specific notifications

    let updatedNotifications
    if (courseId) {
      // Mark all notifications for a specific course as read
      updatedNotifications = await markAllAsReadForCourse(userId, courseId)
    } else {
      // Mark all notifications for the user as read
      updatedNotifications = await markAllAsRead(userId)
    }

    res.status(200).json({
      success: true,
      message: courseId ? 'All course notifications marked as read' : 'All notifications marked as read',
      data: { count: updatedNotifications.length }
    })
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: error.message
    })
  }
}

