import { RedisPubSubConnection } from "../../config/redis.js";
import { broadcastNotification } from "./notificationSSE.service.js";
import logger from "../../utils/logger.js";

const NOTIFICATION_CHANNEL_PREFIX = "notification:user:";
let subscriber = null;
let isSubscribed = false;

/**
 * Wait for Redis Pub/Sub connection to be ready
 */
const waitForPubSubReady = async (maxWaitTime = 10000) => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      if (RedisPubSubConnection.status === 'ready') {
        // Double check with ping
        await RedisPubSubConnection.ping();
        return true;
      }
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      // Connection not ready yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return false;
};

/**
 * Initialize pub/sub subscriber for notifications
 * This allows all backend instances to receive notifications published by any instance
 * and broadcast them to their local SSE clients
 * 
 * Waits for Redis to be ready before subscribing
 */
export const startNotificationSubscriber = async () => {
  if (isSubscribed) {
    logger.warn("Notification subscriber already started");
    return;
  }

  try {
    // Wait for Redis Pub/Sub connection to be ready
    logger.info("⏳ Waiting for Redis Pub/Sub connection to be ready...");
    const redisReady = await waitForPubSubReady(10000);
    
    if (!redisReady) {
      logger.warn("⚠️ Redis Pub/Sub not ready, but starting subscriber anyway (will retry on connection)");
    } else {
      logger.info("✅ Redis Pub/Sub connection is ready");
    }

    // Create a dedicated subscriber connection with offline queue enabled
    subscriber = RedisPubSubConnection.duplicate({
      enableOfflineQueue: true, // Allow subscriptions even if Redis temporarily disconnects
    });

    // Wait for subscriber to be ready before subscribing
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Subscriber connection timeout"));
      }, 5000);

      subscriber.once("ready", () => {
        clearTimeout(timeout);
        resolve();
      });

      subscriber.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // If already ready, resolve immediately
      if (subscriber.status === 'ready') {
        clearTimeout(timeout);
        resolve();
      }
    });

    // Subscribe to all notification channels using pattern matching
    await subscriber.psubscribe(`${NOTIFICATION_CHANNEL_PREFIX}*`);
    logger.info(`✅ Subscribed to notification channels: ${NOTIFICATION_CHANNEL_PREFIX}*`);

    subscriber.on("pmessage", async (pattern, channel, message) => {
      try {
        const data = JSON.parse(message);
        const { userId, notification } = data;

        logger.debug(`Received notification from pub/sub channel ${channel} for user ${userId}`);

        // Broadcast notification to local SSE clients
        broadcastNotification(userId, notification);
      } catch (error) {
        logger.error(`Error processing pub/sub notification from channel ${channel}:`, error);
      }
    });

    subscriber.on("error", (error) => {
      logger.error("Notification subscriber error:", error);
      // Don't throw - subscriber will handle reconnection
    });

    subscriber.on("ready", () => {
      logger.info("✅ Notification pub/sub subscriber ready");
    });

    subscriber.on("reconnecting", () => {
      logger.info("🔄 Notification pub/sub subscriber reconnecting...");
    });

    subscriber.on("close", () => {
      logger.warn("⚠️ Notification pub/sub subscriber closed");
      isSubscribed = false; // Reset flag so it can be restarted
    });

    isSubscribed = true;
    logger.info("✅ Notification pub/sub subscriber started successfully");
  } catch (error) {
    logger.error("❌ Error starting notification subscriber:", error);
    // Don't throw - allow server to continue
    // Subscriber will retry when Redis connects
    isSubscribed = false;
  }
};

/**
 * Stop notification subscriber
 */
export const stopNotificationSubscriber = async () => {
  if (!isSubscribed || !subscriber) {
    return;
  }

  try {
    await subscriber.punsubscribe(`${NOTIFICATION_CHANNEL_PREFIX}*`);
    await subscriber.quit();
    isSubscribed = false;
    logger.info("✅ Notification pub/sub subscriber stopped");
  } catch (error) {
    logger.error("❌ Error stopping notification subscriber:", error);
  }
};

/**
 * Check if subscriber is active
 */
export const isNotificationSubscriberActive = () => {
  return isSubscribed && subscriber && subscriber.status === "ready";
};

