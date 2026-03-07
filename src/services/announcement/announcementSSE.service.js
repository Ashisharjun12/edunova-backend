// Simple in-memory store for SSE connections
const clients = new Map() // courseId -> Set of response objects

/**
 * Add a client connection for a course
 */
export const addClient = (courseId, res) => {
  if (!clients.has(courseId)) {
    clients.set(courseId, new Set())
  }
  clients.get(courseId).add(res)
  
  // Remove client when connection closes
  res.on('close', () => {
    removeClient(courseId, res)
  })
}

/**
 * Remove a client connection
 */
export const removeClient = (courseId, res) => {
  if (clients.has(courseId)) {
    clients.get(courseId).delete(res)
    if (clients.get(courseId).size === 0) {
      clients.delete(courseId)
    }
  }
}

/**
 * Broadcast a new announcement to all connected clients for a course
 */
export const broadcastAnnouncement = (courseId, announcement) => {
  if (clients.has(courseId)) {
    const message = `data: ${JSON.stringify({ type: 'new_announcement', data: announcement })}\n\n`
    clients.get(courseId).forEach(res => {
      try {
        res.write(message)
      } catch (error) {
        console.error('Error sending SSE message:', error)
        removeClient(courseId, res)
      }
    })
  }
}

/**
 * Broadcast meeting started notification to all connected clients for a course
 */
export const broadcastMeetingStarted = (courseId, meetingData) => {
  if (clients.has(courseId)) {
    const message = `data: ${JSON.stringify({ type: 'meeting_started', data: meetingData })}\n\n`
    clients.get(courseId).forEach(res => {
      try {
        res.write(message)
      } catch (error) {
        console.error('Error sending meeting SSE message:', error)
        removeClient(courseId, res)
      }
    })
  }
}

