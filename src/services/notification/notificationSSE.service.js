// Simple in-memory store for SSE connections
// userId -> Set of response objects
const clients = new Map()

/**
 * Add a client connection for a user
 */
export const addClient = (userId, res) => {
  if (!clients.has(userId)) {
    clients.set(userId, new Set())
  }
  clients.get(userId).add(res)
  
  // Remove client when connection closes
  res.on('close', () => {
    removeClient(userId, res)
  })
}

/**
 * Remove a client connection
 */
export const removeClient = (userId, res) => {
  if (clients.has(userId)) {
    clients.get(userId).delete(res)
    if (clients.get(userId).size === 0) {
      clients.delete(userId)
    }
  }
}

/**
 * Broadcast a new notification to all connected clients for a user
 */
export const broadcastNotification = (userId, notification) => {
  if (clients.has(userId)) {
    const message = `data: ${JSON.stringify({ type: 'new_notification', data: notification })}\n\n`
    clients.get(userId).forEach(res => {
      try {
        res.write(message)
      } catch (error) {
        console.error('Error sending notification SSE message:', error)
        removeClient(userId, res)
      }
    })
  }
}

