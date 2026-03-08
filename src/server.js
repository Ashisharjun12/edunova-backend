import express from "express";
import { _config } from "./config/config.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import logger from "./utils/logger.js";
import morgan from "morgan";
import accessLogStream from "./utils/morgan.js";
import authRoute from "./routes/user.route.js"
import adminRoute from "./routes/admin.route.js"
import teacherRoute from "./routes/teacher.route.js"
import courseRoute from "./routes/course.route.js"
import passport from "./config/passport.js";
import session from "express-session";
import aiRoute from "./routes/ai.route.js";
import imagekitRoute from "./routes/imagekit.route.js";
import discussionRoute from "./routes/discussion.route.js";
import reviewRoute from "./routes/review.route.js";
import notificationRoute from "./routes/notification.route.js";
import chatRoute from "./routes/chat.route.js";
import interviewRoute from "./routes/interview.route.js";
import { startNotificationExpirationCron } from "./services/notification/notificationExpiration.service.js";
import { startNotificationSubscriber } from "./services/notification/notificationPubSub.service.js";
import { startAnnouncementSubscriber } from "./services/announcement/announcementPubSub.service.js";
import { initializeSocketServer } from "./socket/socketServer.js";
import { initializeSocketHandlers } from "./socket/socketHandlers.js";
import { startCleanupService } from "./services/redis/cleanup.service.js";
import { createServer } from "http";
import { verifyAllRedisConnections } from "./config/redis.js";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import path from "path";

// Load Swagger document
const swaggerDocument = YAML.load(path.resolve("./src/apidocs/swagger.yml"));

const app = express();
app.set('trust proxy', 1);
const PORT = _config.PORT;





// CORS configuration
app.use(cors({
  origin: [
   "http://localhost:5173", "https://edunova-frontend-eight.vercel.app","https://www.edunova.dev","https://edunova.dev"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Increase body parser limit for audio files (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(helmet());
app.use(morgan('combined', { stream: accessLogStream }));

// Session configuration for passport
app.use(session({
  secret: _config.JWT_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
//initialization
// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Health check
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Swagger route
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

//routes
app.use("/api/v1/auth", authRoute)
app.use("/api/v1/admin", adminRoute)
app.use("/api/v1/teacher", teacherRoute)
app.use("/api/v1/courses", courseRoute)
app.use("/api/v1/ai", aiRoute)
app.use("/api/v1/imagekit", imagekitRoute)
app.use("/api/v1/discussions", discussionRoute)
app.use("/api/v1/reviews", reviewRoute)
app.use("/api/v1/notifications", notificationRoute)
app.use("/api/v1/chat", chatRoute)
app.use("/api/v1/interview", interviewRoute)

// Error handler middleware placeholder
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).send('Something broke!');
});

// Create HTTP server from Express app
const httpServer = createServer(app);

// Initialize Socket.IO server (Redis connection happens in socketServer.js)
initializeSocketServer(httpServer);

// Initialize Socket.IO event handlers
initializeSocketHandlers();

// Start server
httpServer.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Database URI: ${_config.DATABASE_URI}`);

  // Verify all Redis connections
  try {
    const redisStatus = await verifyAllRedisConnections();
    if (!redisStatus.cache || !redisStatus.pubsub || !redisStatus.socket) {
      logger.warn('⚠️ Some Redis connections failed, but server will continue');
    } else {
      logger.info("✅ All Redis connections verified successfully");
    }
  } catch (error) {
    logger.warn('⚠️ Redis connection verification failed, but server will continue:', error.message);
  }

  // Start notification pub/sub subscriber (for scalable SSE across instances)
  try {
    await startNotificationSubscriber();
    logger.info("✅ Notification pub/sub subscriber started");
  } catch (error) {
    logger.error("❌ Failed to start notification subscriber:", error);
    // Continue server startup even if subscriber fails - it will retry
  }

  // Start announcement pub/sub subscriber (for scalable SSE across instances)
  try {
    await startAnnouncementSubscriber();
    logger.info("✅ Announcement pub/sub subscriber started");
  } catch (error) {
    logger.error("❌ Failed to start announcement subscriber:", error);
    // Continue server startup even if subscriber fails - it will retry
  }

  // Start notification expiration cron job
  startNotificationExpirationCron();

  // Start Redis cleanup service for online users
  startCleanupService();

  logger.info("✅ All background services started");
});



// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled Rejection at:`, promise);
  if (reason instanceof Error) {
    logger.error(`Reason: ${reason.message}`);
    logger.error(`Stack: ${reason.stack}`);
  } else {
    logger.error(`Reason:`, reason);
  }
  // Don't exit - log and continue
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error(`Uncaught Exception:`, error);
  logger.error(`Stack:`, error.stack);
  // For critical errors, you might want to exit gracefully
  // But for now, log and continue
});

export default app; 