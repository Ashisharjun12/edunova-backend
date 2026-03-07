import cron from 'node-cron'
import { db } from '../../config/database.js'
import { notifications } from '../../models/index.js'
import { and, sql, eq } from 'drizzle-orm'

/**
 * Cron job to mark expired notifications
 * Runs every hour
 */
export const startNotificationExpirationCron = () => {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await db
        .update(notifications)
        .set({ expired: true })
        .where(
          and(
            sql`${notifications.expiresAt} < NOW()`,
            eq(notifications.expired, false)
          )
        )
        .returning()
      
      if (result.length > 0) {
        console.log(`Notification expiration cron job completed: ${result.length} notifications marked as expired`)
      }
    } catch (error) {
      console.error('Error in notification expiration cron:', error)
    }
  })
  
  console.log('Notification expiration cron job started (runs every hour)')
}

