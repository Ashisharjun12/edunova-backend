import { addClient, removeClient } from '../../services/announcement/announcementSSE.service.js'
import { db } from '../../config/database.js'
import { courses, enrollments, users } from '../../models/index.js'
import { eq, and } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import { _config } from '../../config/config.js'

/**
 * SSE endpoint for course announcements
 * GET /api/v1/courses/:courseId/announcements/stream
 */
export const streamAnnouncements = async (req, res) => {
  try {
    // Get token from query parameter (EventSource doesn't support custom headers)
    const token = req.query.token
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token required' })
    }

    // Verify token
    let userId = null
    try {
      const decoded = jwt.verify(token, _config.JWT_SECRET)
      if (decoded.type !== 'access') {
        return res.status(401).json({ success: false, message: 'Invalid token type' })
      }
      
      // Find user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, decoded.id))
        .limit(1)
      
      if (!user) {
        return res.status(401).json({ success: false, message: 'User not found' })
      }
      
      userId = user.id
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Invalid token' })
    }

    const { courseId } = req.params

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    if (!courseId) {
      return res.status(400).json({ success: false, message: 'Course ID is required' })
    }

    // Verify course exists and is published
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1)

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' })
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
        message: 'You must be enrolled in this course to receive announcements' 
      })
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to announcements stream' })}\n\n`)

    // Add client to the connection pool
    addClient(courseId, res)

    // Keep connection alive with periodic ping
    const pingInterval = setInterval(() => {
      try {
        res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`)
      } catch (error) {
        clearInterval(pingInterval)
        removeClient(courseId, res)
      }
    }, 30000) // Ping every 30 seconds

    // Clean up on close
    req.on('close', () => {
      clearInterval(pingInterval)
      removeClient(courseId, res)
    })
  } catch (error) {
    console.error('Error setting up SSE connection:', error)
    res.status(500).json({ success: false, message: 'Failed to establish connection' })
  }
}

