import { addClient, removeClient } from '../../services/notification/notificationSSE.service.js'
import { db } from '../../config/database.js'
import { users } from '../../models/index.js'
import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import { _config } from '../../config/config.js'

/**
 * SSE endpoint for user notifications
 * GET /api/v1/notifications/stream
 */
export const streamNotifications = async (req, res) => {
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

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to notifications stream' })}\n\n`)

    // Add client to the connection pool
    addClient(userId, res)

    // Keep connection alive with periodic ping
    const pingInterval = setInterval(() => {
      try {
        res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`)
      } catch (error) {
        clearInterval(pingInterval)
        removeClient(userId, res)
      }
    }, 30000) // Ping every 30 seconds

    // Clean up on close
    req.on('close', () => {
      clearInterval(pingInterval)
      removeClient(userId, res)
    })
  } catch (error) {
    console.error('Error setting up notification SSE connection:', error)
    res.status(500).json({ success: false, message: 'Failed to establish connection' })
  }
}

