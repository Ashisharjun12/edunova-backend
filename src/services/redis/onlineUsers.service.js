import { RedisCacheConnection } from "../../config/redis.js";
import logger from "../../utils/logger.js";

const ONLINE_USER_KEY_PREFIX = "online_user:";
const ONLINE_USERS_SET = "online_users";
const SOCKET_USER_KEY_PREFIX = "socket_user:";
const ONLINE_TTL = 3600; // 1 hour

/**
 * Add user socket to online users
 */
export const addOnlineUser = async (userId, socketId) => {
  try {
    const userKey = `${ONLINE_USER_KEY_PREFIX}${userId}`;
    const socketKey = `${SOCKET_USER_KEY_PREFIX}${socketId}`;
    
    // Add socket ID to user's socket set
    await RedisCacheConnection.sadd(userKey, socketId);
    
    // Set expiration for user's socket set
    await RedisCacheConnection.expire(userKey, ONLINE_TTL);
    
    // Add user to online users set
    await RedisCacheConnection.sadd(ONLINE_USERS_SET, userId);
    
    // Map socket ID to user ID for quick lookup
    await RedisCacheConnection.setex(socketKey, ONLINE_TTL, userId);
    
    logger.debug(`Added online user: ${userId} with socket ${socketId}`);
    return true;
  } catch (error) {
    logger.error("Error adding online user:", error);
    return false;
  }
};

/**
 * Remove user socket from online users
 */
export const removeOnlineUser = async (userId, socketId) => {
  try {
    const userKey = `${ONLINE_USER_KEY_PREFIX}${userId}`;
    const socketKey = `${SOCKET_USER_KEY_PREFIX}${socketId}`;
    
    // Remove socket ID from user's socket set
    const remaining = await RedisCacheConnection.srem(userKey, socketId);
    
    // Remove socket to user mapping
    await RedisCacheConnection.del(socketKey);
    
    // If no more sockets for this user, remove from online users set
    const socketCount = await RedisCacheConnection.scard(userKey);
    if (socketCount === 0) {
      await RedisCacheConnection.del(userKey);
      await RedisCacheConnection.srem(ONLINE_USERS_SET, userId);
      logger.debug(`User ${userId} is now offline (no sockets remaining)`);
      return true; // User is now offline
    }
    
    logger.debug(`Removed socket ${socketId} from user ${userId}, ${socketCount} sockets remaining`);
    return false; // User still has other sockets
  } catch (error) {
    logger.error("Error removing online user:", error);
    return false;
  }
};

/**
 * Check if user is online
 */
export const isUserOnline = async (userId) => {
  try {
    const userKey = `${ONLINE_USER_KEY_PREFIX}${userId}`;
    const socketCount = await RedisCacheConnection.scard(userKey);
    return socketCount > 0;
  } catch (error) {
    logger.error("Error checking if user is online:", error);
    return false;
  }
};

/**
 * Get user ID from socket ID
 */
export const getUserIdFromSocket = async (socketId) => {
  try {
    const socketKey = `${SOCKET_USER_KEY_PREFIX}${socketId}`;
    const userId = await RedisCacheConnection.get(socketKey);
    return userId;
  } catch (error) {
    logger.error("Error getting user ID from socket:", error);
    return null;
  }
};

/**
 * Get all socket IDs for a user
 */
export const getUserSockets = async (userId) => {
  try {
    const userKey = `${ONLINE_USER_KEY_PREFIX}${userId}`;
    const sockets = await RedisCacheConnection.smembers(userKey);
    return sockets || [];
  } catch (error) {
    logger.error("Error getting user sockets:", error);
    return [];
  }
};

/**
 * Get count of online users
 */
export const getOnlineUsersCount = async () => {
  try {
    return await RedisCacheConnection.scard(ONLINE_USERS_SET);
  } catch (error) {
    logger.error("Error getting online users count:", error);
    return 0;
  }
};

/**
 * Clean up expired online users (can be called periodically)
 */
export const cleanupExpiredUsers = async () => {
  try {
    const onlineUserIds = await RedisCacheConnection.smembers(ONLINE_USERS_SET);
    let cleaned = 0;
    
    for (const userId of onlineUserIds) {
      const userKey = `${ONLINE_USER_KEY_PREFIX}${userId}`;
      const exists = await RedisCacheConnection.exists(userKey);
      if (!exists) {
        await RedisCacheConnection.srem(ONLINE_USERS_SET, userId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired online users`);
    }
    
    return cleaned;
  } catch (error) {
    logger.error("Error cleaning up expired users:", error);
    return 0;
  }
};

