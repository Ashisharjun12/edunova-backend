import { RedisPubSubConnection } from "../config/redis.js";
import logger from "../utils/logger.js";

/**
 * Redis Pub/Sub Service - Helper Functions
 * 
 * This file provides helper functions for Redis pub/sub operations.
 * Use this for real-time messaging between services or instances.
 * 
 * Usage:
 *   import { publish, psubscribe } from './queue/pubsub.js'
 *   
 *   // Publish a message
 *   await publish('user:123:notifications', { type: 'new_message', data: {...} })
 *   
 *   // Subscribe to pattern
 *   await psubscribe('user:*:notifications', (message, channel) => {
 *     console.log(`Received on ${channel}:`, message)
 *   })
 */

/**
 * Publish a message to a Redis channel
 * 
 * @param {string} channel - Channel name to publish to
 * @param {Object|string} message - Message to publish (will be JSON stringified if object)
 * @returns {Promise<number>} Number of subscribers that received the message
 * 
 * @example
 *   await publish('user:123:notifications', { type: 'new_message', data: {...} })
 *   await publish('course:456:updates', 'Course updated')
 */
export const publish = async (channel, message) => {
  try {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    const subscribers = await RedisPubSubConnection.publish(channel, messageStr);
    logger.debug(`Published message to channel '${channel}' (${subscribers} subscribers)`);
    return subscribers;
  } catch (error) {
    logger.error(`Error publishing to channel '${channel}':`, error);
    throw error;
  }
};

/**
 * Subscribe to multiple Redis channels using pattern matching
 * 
 * @param {string} pattern - Pattern to match channels (e.g., 'user:*:notifications')
 * @param {Function} callback - Callback function to handle messages
 * @param {IORedis} connection - Optional: use specific connection (defaults to RedisPubSubConnection)
 * @returns {Promise<IORedis>} The subscriber connection
 * 
 * @example
 *   await psubscribe('user:*:notifications', (message, channel) => {
 *     console.log(`Received on ${channel}:`, message)
 *   })
 */
export const psubscribe = async (pattern, callback, connection = null) => {
  const subscriber = connection || RedisPubSubConnection;
  
  try {
    await subscriber.psubscribe(pattern);
    logger.info(`Subscribed to pattern '${pattern}'`);

    subscriber.on('pmessage', (receivedPattern, receivedChannel, message) => {
      if (receivedPattern === pattern) {
        try {
          // Try to parse as JSON, fallback to string
          let parsedMessage;
          try {
            parsedMessage = JSON.parse(message);
          } catch {
            parsedMessage = message;
          }
          callback(parsedMessage, receivedChannel, receivedPattern);
        } catch (error) {
          logger.error(`Error processing message from pattern '${pattern}':`, error);
          callback(message, receivedChannel, receivedPattern);
        }
      }
    });

    return subscriber;
  } catch (error) {
    logger.error(`Error subscribing to pattern '${pattern}':`, error);
    throw error;
  }
};

/**
 * Create a dedicated subscriber connection for pub/sub
 * Use this when you need a separate connection for subscribing (recommended pattern)
 * This is useful when you need to subscribe to channels without blocking the main pub/sub connection
 * 
 * @returns {IORedis} New Redis connection instance for subscribing
 * 
 * @example
 *   const subscriber = createSubscriberConnection()
 *   await subscriber.psubscribe('pattern')
 *   subscriber.on('pmessage', (pattern, channel, message) => {
 *     console.log(message)
 *   })
 */
export const createSubscriberConnection = () => {
  return RedisPubSubConnection.duplicate({
    enableOfflineQueue: true,
  });
};

