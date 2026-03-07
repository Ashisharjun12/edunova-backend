import { cleanupExpiredUsers } from "./onlineUsers.service.js";
import logger from "../../utils/logger.js";

/**
 * Periodic cleanup service for Redis
 * Should be called periodically (e.g., every 5 minutes) to clean up expired entries
 */
let cleanupInterval = null;

export const startCleanupService = (intervalMs = 5 * 60 * 1000) => {
  if (cleanupInterval) {
    logger.warn("Cleanup service already running");
    return;
  }

  cleanupInterval = setInterval(async () => {
    try {
      const cleaned = await cleanupExpiredUsers();
      if (cleaned > 0) {
        logger.info(`Cleanup service: Removed ${cleaned} expired online users`);
      }
    } catch (error) {
      logger.error("Cleanup service error:", error);
    }
  }, intervalMs);

  logger.info(`Cleanup service started (interval: ${intervalMs}ms)`);
};

export const stopCleanupService = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info("Cleanup service stopped");
  }
};

