import { RedisPubSubConnection } from "../../config/redis.js";
import { broadcastAnnouncement, broadcastMeetingStarted } from "./announcementSSE.service.js";
import logger from "../../utils/logger.js";

const ANNOUNCEMENT_CHANNEL_PREFIX = "announcement:course:";
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
 * Initialize pub/sub subscriber for announcements
 * This allows all backend instances to receive announcements published by any instance
 * and broadcast them to their local SSE clients
 * 
 * Waits for Redis to be ready before subscribing
 */
export const startAnnouncementSubscriber = async () => {
  if (isSubscribed) {
    logger.warn("Announcement subscriber already started");
    return;
  }

  try {
    // Wait for Redis Pub/Sub connection to be ready
    logger.info("⏳ Waiting for Redis Pub/Sub connection to be ready for announcements...");
    const redisReady = await waitForPubSubReady(10000);
    
    if (!redisReady) {
      logger.warn("⚠️ Redis Pub/Sub not ready, but starting announcement subscriber anyway (will retry on connection)");
    } else {
      logger.info("✅ Redis Pub/Sub connection is ready for announcements");
    }

    // Create a dedicated subscriber connection with offline queue enabled
    subscriber = RedisPubSubConnection.duplicate({
      enableOfflineQueue: true, // Allow subscriptions even if Redis temporarily disconnects
    });

    // Wait for subscriber to be ready before subscribing
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Announcement subscriber connection timeout"));
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

    // Subscribe to all announcement channels using pattern matching
    await subscriber.psubscribe(`${ANNOUNCEMENT_CHANNEL_PREFIX}*`);
    logger.info(`✅ Subscribed to announcement channels: ${ANNOUNCEMENT_CHANNEL_PREFIX}*`);

    subscriber.on("pmessage", async (pattern, channel, message) => {
      try {
        const data = JSON.parse(message);
        const { courseId, announcement, meetingData, type } = data;

        logger.debug(`Received ${type || 'announcement'} from pub/sub channel ${channel} for course ${courseId}`);

        // Broadcast to local SSE clients based on type
        if (type === 'meeting_started' && meetingData) {
          broadcastMeetingStarted(courseId, meetingData);
        } else if (announcement) {
          broadcastAnnouncement(courseId, announcement);
        }
      } catch (error) {
        logger.error(`Error processing pub/sub announcement from channel ${channel}:`, error);
      }
    });

    subscriber.on("error", (error) => {
      logger.error("Announcement subscriber error:", error);
      // Don't throw - subscriber will handle reconnection
    });

    subscriber.on("ready", () => {
      logger.info("✅ Announcement pub/sub subscriber ready");
    });

    subscriber.on("reconnecting", () => {
      logger.info("🔄 Announcement pub/sub subscriber reconnecting...");
    });

    subscriber.on("close", () => {
      logger.warn("⚠️ Announcement pub/sub subscriber closed");
      isSubscribed = false; // Reset flag so it can be restarted
    });

    isSubscribed = true;
    logger.info("✅ Announcement pub/sub subscriber started successfully");
  } catch (error) {
    logger.error("❌ Error starting announcement subscriber:", error);
    // Don't throw - allow server to continue
    // Subscriber will retry when Redis connects
    isSubscribed = false;
  }
};

/**
 * Stop announcement subscriber
 */
export const stopAnnouncementSubscriber = async () => {
  if (!isSubscribed || !subscriber) {
    return;
  }

  try {
    await subscriber.punsubscribe(`${ANNOUNCEMENT_CHANNEL_PREFIX}*`);
    await subscriber.quit();
    isSubscribed = false;
    logger.info("✅ Announcement pub/sub subscriber stopped");
  } catch (error) {
    logger.error("❌ Error stopping announcement subscriber:", error);
  }
};

/**
 * Check if subscriber is active
 */
export const isAnnouncementSubscriberActive = () => {
  return isSubscribed && subscriber && subscriber.status === "ready";
};

