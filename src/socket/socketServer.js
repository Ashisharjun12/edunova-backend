import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { RedisSocketConnection } from "../config/redis.js";
import { _config } from "../config/config.js";
import jwt from "jsonwebtoken";
import { db } from "../config/database.js";
import { users } from "../models/index.js";
import { eq } from "drizzle-orm";
import logger from "../utils/logger.js";

let io = null;

/**
 * Initialize Socket.IO server with Redis adapter
 */
export const initializeSocketServer = (httpServer) => {
  if (io) {
    logger.warn("Socket.IO server already initialized");
    return io;
  }

  // Create Socket.IO server with scalability optimizations
  io = new Server(httpServer, {
    cors: {
      origin: _config.FRONTEND_URL || "http://localhost:5173",
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
    // Scalability settings
    maxHttpBufferSize: 1e6, // 1MB max message size
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds
    upgradeTimeout: 10000, // 10 seconds
    allowEIO3: true, // Backward compatibility
    // Connection limits
    connectTimeout: 45000,
    // Per-message deflate compression
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3,
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024,
      },
      threshold: 1024, // Only compress messages larger than 1KB
    },
  });

  // Set up Redis adapter for horizontal scaling
  // Note: Redis Socket connection is initialized in redis.js and will log connection status
  const setupRedisAdapter = () => {
    try {
      const pubClient = RedisSocketConnection;
      const subClient = pubClient.duplicate();
      
      io.adapter(createAdapter(pubClient, subClient));
      logger.info("✅ Socket.IO Redis adapter initialized successfully");
    } catch (error) {
      logger.error("❌ Failed to initialize Redis adapter:", error);
      logger.warn("⚠️ Socket.IO will continue without Redis adapter (single instance mode)");
    }
  };

  // Try to set up adapter immediately if Redis is already ready
  if (RedisSocketConnection.status === 'ready' || RedisSocketConnection.status === 'connect') {
    setupRedisAdapter();
  } else {
    // Wait for Redis to be ready, then set up adapter
    RedisSocketConnection.once('ready', () => {
      setupRedisAdapter();
    });
    
    // Also handle if Redis is already connecting
    RedisSocketConnection.once('connect', () => {
      // Wait a bit for ready state
      setTimeout(() => {
        if (RedisSocketConnection.status === 'ready') {
          setupRedisAdapter();
        }
      }, 100);
    });
    
    // Log that we're waiting for Redis
    logger.warn("⚠️ Redis Socket not ready yet, Socket.IO will use in-memory adapter until Redis is ready");
    logger.info("🔄 Socket.IO will use in-memory adapter (single instance mode) until Redis Socket connects");
  }

  // JWT authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      
      if (!token) {
        return next(new Error("Authentication token required"));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, _config.JWT_SECRET);
      
      if (decoded.type !== 'access') {
        return next(new Error("Invalid token type"));
      }

      // Find user in database
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, decoded.id))
        .limit(1);

      if (!user) {
        return next(new Error("User not found"));
      }

      // Attach user info to socket
      socket.userId = user.id;
      socket.userRole = user.role;
      socket.userName = user.name;
      
      next();
    } catch (error) {
      logger.error("Socket.IO authentication error:", error);
      if (error.name === 'TokenExpiredError') {
        return next(new Error("Token expired"));
      }
      if (error.name === 'JsonWebTokenError') {
        return next(new Error("Invalid token"));
      }
      return next(new Error("Authentication failed"));
    }
  });

  logger.info("Socket.IO server initialized");
  return io;
};

/**
 * Get the Socket.IO instance
 */

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO server not initialized. Call initializeSocketServer first.");
  }
  return io;
};

