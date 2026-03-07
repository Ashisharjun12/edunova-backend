import { RedisCacheConnection } from "../config/redis.js";
import logger from "../utils/logger.js";

/**
 * Rate limiter using Redis sliding window
 */
export const createRateLimiter = (windowMs, maxRequests) => {
  return async (key) => {
    try {
      const now = Date.now();
      const windowStart = now - windowMs;
      const redisKey = `rate_limit:${key}`;
      
      // Remove old entries
      await RedisCacheConnection.zremrangebyscore(redisKey, 0, windowStart);
      
      // Count current requests
      const currentCount = await RedisCacheConnection.zcard(redisKey);
      
      if (currentCount >= maxRequests) {
        // Get oldest request time to calculate retry after
        const oldest = await RedisCacheConnection.zrange(redisKey, 0, 0, 'WITHSCORES');
        const retryAfter = oldest.length > 0 
          ? Math.ceil((parseInt(oldest[1]) + windowMs - now) / 1000)
          : Math.ceil(windowMs / 1000);
        
        return {
          allowed: false,
          retryAfter,
          remaining: 0,
        };
      }
      
      // Add current request
      await RedisCacheConnection.zadd(redisKey, now, `${now}-${Math.random()}`);
      await RedisCacheConnection.expire(redisKey, Math.ceil(windowMs / 1000));
      
      return {
        allowed: true,
        retryAfter: 0,
        remaining: maxRequests - currentCount - 1,
      };
    } catch (error) {
      logger.error("Rate limiter error:", error);
      // On error, allow the request (fail open)
      return {
        allowed: true,
        retryAfter: 0,
        remaining: maxRequests,
      };
    }
  };
};

/**
 * Socket.IO rate limiter for message sending
 */
export const messageRateLimiter = createRateLimiter(60000, 30); // 30 messages per minute
export const typingRateLimiter = createRateLimiter(10000, 20); // 20 typing events per 10 seconds

/**
 * Check rate limit for socket events
 */
export const checkSocketRateLimit = async (socket, eventType, userId) => {
  let limiter;
  let limitType;
  
  switch (eventType) {
    case 'send_message':
      limiter = messageRateLimiter;
      limitType = 'message';
      break;
    case 'typing_start':
    case 'typing_stop':
      limiter = typingRateLimiter;
      limitType = 'typing';
      break;
    default:
      return { allowed: true };
  }
  
  const key = `${limitType}:${userId}`;
  const result = await limiter(key);
  
  if (!result.allowed) {
    socket.emit("rate_limit_exceeded", {
      type: limitType,
      retryAfter: result.retryAfter,
      message: `Too many ${limitType} requests. Please wait ${result.retryAfter} seconds.`,
    });
  }
  
  return result;
};

