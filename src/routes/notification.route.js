import express from 'express'
import { authenticate } from '../middleware/autenticate.js'
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from '../controllers/notification/notification.controller.js'
import { streamNotifications } from '../controllers/notification/notificationSSE.controller.js'

const router = express.Router()

// All routes require authentication
router.get('/', authenticate, getNotifications)
router.get('/unread-count', authenticate, getUnreadNotificationCount)
router.get('/stream', streamNotifications) // SSE endpoint (token in query param)
router.put('/:notificationId/read', authenticate, markNotificationAsRead)
router.put('/read-all', authenticate, markAllNotificationsAsRead)

export default router

