import IORedis from "ioredis";
import { _config } from "./config.js";
import logger from "../utils/logger.js";

// Common Redis connection options
const createRedisOptions = (purpose, enableOfflineQueue = false) => ({
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: enableOfflineQueue, // Allow offline queue for operations during temporary disconnections
  connectTimeout: 10000,
  lazyConnect: false,
});

// Create Redis Cache Connection (optimized for read/write operations)
// enableOfflineQueue: true to allow operations to queue even if Redis temporarily disconnects
export const RedisCacheConnection = new IORedis(
  _config.REDIS_CACHE_URI,
  {
    ...createRedisOptions("cache", true), // Enable offline queue for cache operations
    // Cache-specific optimizations
    enableReadyCheck: true,
    keepAlive: 30000,
  }
);

// Create Redis Pub/Sub Connection (optimized for subscribe/publish)
// enableOfflineQueue: true to allow subscriptions even if Redis temporarily disconnects
export const RedisPubSubConnection = new IORedis(
  _config.REDIS_PUBSUB_URI,
  {
    ...createRedisOptions("pubsub", true), // Enable offline queue for pub/sub
    // Pub/Sub specific optimizations
    enableReadyCheck: true,
    keepAlive: 30000,
  }
);

// Create Redis Socket Connection (for Socket.IO adapter and chat)
export const RedisSocketConnection = new IORedis(
  _config.REDIS_SOCKET_URI,
  {
    ...createRedisOptions("socket"),
    // Socket-specific optimizations
    enableReadyCheck: true,
    keepAlive: 30000,
  }
);

// Default Redis connection for backward compatibility
export const RedisConnection = RedisCacheConnection;

// Setup event handlers for Cache Connection
RedisCacheConnection.on("connect", () => {
  logger.info("✅ Redis Cache connection connected successfully");
});

RedisCacheConnection.on("ready", () => {
  logger.info("✅ Redis Cache connection is ready");
});

RedisCacheConnection.on("error", (error) => {
  logger.error("❌ Redis Cache connection error:", error);
});

RedisCacheConnection.on("close", () => {
  logger.warn("⚠️ Redis Cache connection closed");
});

RedisCacheConnection.on("reconnecting", () => {
  logger.info("🔄 Redis Cache reconnecting...");
});

// Setup event handlers for Pub/Sub Connection
RedisPubSubConnection.on("connect", () => {
  logger.info("✅ Redis Pub/Sub connection connected successfully");
});

RedisPubSubConnection.on("ready", () => {
  logger.info("✅ Redis Pub/Sub connection is ready");
});

RedisPubSubConnection.on("error", (error) => {
  logger.error("❌ Redis Pub/Sub connection error:", error);
});

RedisPubSubConnection.on("close", () => {
  logger.warn("⚠️ Redis Pub/Sub connection closed");
});

RedisPubSubConnection.on("reconnecting", () => {
  logger.info("🔄 Redis Pub/Sub reconnecting...");
});

// Setup event handlers for Socket Connection
RedisSocketConnection.on("connect", () => {
  logger.info("✅ Redis Socket connection connected successfully");
});

RedisSocketConnection.on("ready", () => {
  logger.info("✅ Redis Socket connection is ready");
});

RedisSocketConnection.on("error", (error) => {
  logger.error("❌ Redis Socket connection error:", error);
});

RedisSocketConnection.on("close", () => {
  logger.warn("⚠️ Redis Socket connection closed");
});

RedisSocketConnection.on("reconnecting", () => {
  logger.info("🔄 Redis Socket reconnecting...");
});

// Verify all connections
export const verifyAllRedisConnections = async () => {
  const results = {
    cache: false,
    pubsub: false,
    socket: false,
  };

  try {
    await RedisCacheConnection.ping();
    results.cache = true;
    logger.info("✅ Redis Cache connection verified");
  } catch (error) {
    logger.error("❌ Redis Cache connection verification failed:", error);
  }

  try {
    await RedisPubSubConnection.ping();
    results.pubsub = true;
    logger.info("✅ Redis Pub/Sub connection verified");
  } catch (error) {
    logger.error("❌ Redis Pub/Sub connection verification failed:", error);
  }

  try {
    await RedisSocketConnection.ping();
    results.socket = true;
    logger.info("✅ Redis Socket connection verified");
  } catch (error) {
    logger.error("❌ Redis Socket connection verification failed:", error);
  }

  return results;
};