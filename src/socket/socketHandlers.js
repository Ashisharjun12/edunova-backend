import { getIO } from "./socketServer.js";
import {
  createOrGetConversation,
  getMessages,
  saveMessage,
  markMessagesAsRead,
} from "../services/chat/chat.service.js";
import { db } from "../config/database.js";
import { courses, enrollments, conversations } from "../models/index.js";
import { eq, and, or } from "drizzle-orm";
import logger from "../utils/logger.js";
import {
  addOnlineUser,
  removeOnlineUser,
  isUserOnline,
} from "../services/redis/onlineUsers.service.js";
import {
  getCachedUserConversations,
  cacheUserConversations,
  invalidateUserConversationsCache,
  invalidateConversationsCacheForUsers,
} from "../services/redis/cache.service.js";
import { checkSocketRateLimit } from "../middleware/rateLimiter.js";

/**
 * Initialize Socket.IO event handlers
 */
export const initializeSocketHandlers = () => {
  const io = getIO();

  io.on("connection", async (socket) => {
    const userId = socket.userId;
    const userRole = socket.userRole;
    const userName = socket.userName;

    logger.info(`User connected: ${userId} (${userRole})`);

    // Track online status in Redis (scalable across instances)
    const wasOffline = !(await isUserOnline(userId));
    await addOnlineUser(userId, socket.id);

    // Join user-specific room for direct notifications
    socket.join(`user:${userId}`);

    // Emit online status to relevant users (only if user was offline before)
    if (wasOffline) {
      await emitOnlineStatus(userId, true);
    }

    // Handle joining a conversation
    socket.on("join_conversation", async (data) => {
      try {
        const { conversationId, courseId } = data;

        if (!conversationId && !courseId) {
          socket.emit("error", { message: "conversationId or courseId required" });
          return;
        }

        let finalConversationId = conversationId;

        // If courseId provided, create or get conversation
        if (courseId && !conversationId) {
          // Verify user is enrolled (for students) or is teacher
          if (userRole === "student") {
            const [enrollment] = await db
              .select()
              .from(enrollments)
              .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
              .limit(1);

            if (!enrollment) {
              socket.emit("error", { message: "Not enrolled in this course" });
              return;
            }

            // Get course to find teacher
            const [course] = await db
              .select()
              .from(courses)
              .where(eq(courses.id, courseId))
              .limit(1);

            if (!course) {
              socket.emit("error", { message: "Course not found" });
              return;
            }

            const conversation = await createOrGetConversation(
              courseId,
              course.teacherId,
              userId
            );
            finalConversationId = conversation.id;
          } else if (userRole === "teacher") {
            // For teacher, need studentId
            socket.emit("error", { message: "studentId required for teacher" });
            return;
          }
        }

        if (!finalConversationId) {
          socket.emit("error", { message: "Invalid conversation" });
          return;
        }

        // Join conversation room
        socket.join(`conversation:${finalConversationId}`);

        // Get conversation to find other participant
        const [conversation] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, finalConversationId))
          .limit(1);

        if (conversation) {
          // Emit current user's status to conversation room
          const isCurrentUserOnline = await isUserOnline(userId);
          io.to(`conversation:${finalConversationId}`).emit("user_status", {
            userId,
            isOnline: isCurrentUserOnline,
          });

          // Emit other participant's status to current user
          const otherUserId = userRole === "teacher" ? conversation.studentId : conversation.teacherId;
          if (otherUserId) {
            const isOtherUserOnline = await isUserOnline(otherUserId);
            socket.emit("user_status", {
              userId: otherUserId,
              isOnline: isOtherUserOnline,
            });
          }
        }

        // Send conversation history (last 50 messages) BEFORE marking as read
        // This ensures the sender sees the correct read status
        const { messages } = await getMessages(finalConversationId, 1, 50);
        socket.emit("conversation_history", {
          conversationId: finalConversationId,
          messages,
        });

        // Mark messages as read AFTER sending history
        // This way the next time messages are loaded, they'll have correct read status
        await markMessagesAsRead(finalConversationId, userId, userRole);
        
        // Emit read receipt to notify sender
        const updatedMessages = await getMessages(finalConversationId, 1, 50);
        const readMessageIds = updatedMessages.messages
          .filter(msg => msg.isRead && msg.senderRole !== userRole)
          .map(msg => msg.id);
        
        if (readMessageIds.length > 0) {
          const [conversation] = await db
            .select()
            .from(conversations)
            .where(eq(conversations.id, finalConversationId))
            .limit(1);
          
          if (conversation) {
            const otherUserId = userRole === "teacher" ? conversation.studentId : conversation.teacherId;
            io.to(`user:${otherUserId}`).emit("messages_read", {
              conversationId: finalConversationId,
              readBy: userId,
              messageIds: readMessageIds,
            });
          }
        }

        logger.info(`User ${userId} joined conversation ${finalConversationId}`);
      } catch (error) {
        logger.error("Error joining conversation:", error);
        socket.emit("error", { message: "Failed to join conversation" });
      }
    });

    // Handle sending a message
    socket.on("send_message", async (data) => {
      try {
        // Rate limiting
        const rateLimitResult = await checkSocketRateLimit(socket, "send_message", userId);
        if (!rateLimitResult.allowed) {
          return; // Rate limit exceeded, error already emitted
        }

        const { conversationId, content, courseId, studentId } = data;

        if (!content || !content.trim()) {
          socket.emit("error", { message: "Message content required" });
          return;
        }

        // Validate message length
        if (content.length > 5000) {
          socket.emit("error", { message: "Message too long (max 5000 characters)" });
          return;
        }

        let finalConversationId = conversationId;

        // Create conversation if needed
        if (courseId && !conversationId) {
          if (userRole === "student") {
            const [course] = await db
              .select()
              .from(courses)
              .where(eq(courses.id, courseId))
              .limit(1);

            if (!course) {
              socket.emit("error", { message: "Course not found" });
              return;
            }

            const conversation = await createOrGetConversation(
              courseId,
              course.teacherId,
              userId
            );
            finalConversationId = conversation.id;
          } else if (userRole === "teacher" && studentId) {
            const conversation = await createOrGetConversation(
              courseId,
              userId,
              studentId
            );
            finalConversationId = conversation.id;
          } else {
            socket.emit("error", { message: "Invalid conversation parameters" });
            return;
          }
        }

        if (!finalConversationId) {
          socket.emit("error", { message: "Conversation not found" });
          return;
        }

        // Save message to database
        const message = await saveMessage(
          finalConversationId,
          userId,
          userRole,
          content.trim()
        );

        // Broadcast message to conversation room
        io.to(`conversation:${finalConversationId}`).emit("new_message", {
          conversationId: finalConversationId,
          message,
        });

        // Notify the other participant if they're not in the conversation room
        // (they'll receive it via their user room)
        const [conversation] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, finalConversationId))
          .limit(1);

        if (conversation) {
          const otherUserId =
            userRole === "teacher" ? conversation.studentId : conversation.teacherId;
          io.to(`user:${otherUserId}`).emit("new_message_notification", {
            conversationId: finalConversationId,
            message,
          });
          
          // Invalidate conversations cache for both users
          await invalidateConversationsCacheForUsers([userId, otherUserId]);
        }

        logger.info(`Message sent in conversation ${finalConversationId} by ${userId}`);
      } catch (error) {
        logger.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Handle typing indicators
    socket.on("typing_start", async (data) => {
      // Rate limiting for typing events
      const rateLimitResult = await checkSocketRateLimit(socket, "typing_start", userId);
      if (!rateLimitResult.allowed) {
        return; // Rate limit exceeded
      }

      const { conversationId } = data;
      if (conversationId) {
        socket.to(`conversation:${conversationId}`).emit("user_typing", {
          userId,
          userName,
          conversationId,
        });
      }
    });

    socket.on("typing_stop", (data) => {
      const { conversationId } = data;
      if (conversationId) {
        socket.to(`conversation:${conversationId}`).emit("user_stopped_typing", {
          userId,
          conversationId,
        });
      }
    });

    // Handle marking messages as read
    socket.on("mark_read", async (data) => {
      try {
        const { conversationId } = data;
        if (!conversationId) {
          socket.emit("error", { message: "conversationId required" });
          return;
        }

        const updatedMessages = await markMessagesAsRead(conversationId, userId, userRole);

        // Notify other participant with updated message IDs
        const [conversation] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, conversationId))
          .limit(1);

        if (conversation) {
          const otherUserId =
            userRole === "teacher" ? conversation.studentId : conversation.teacherId;
          
          // Emit read receipt with message IDs that were marked as read
          io.to(`user:${otherUserId}`).emit("messages_read", {
            conversationId,
            readBy: userId,
            messageIds: updatedMessages.map(msg => msg.id),
          });

          // Also emit to conversation room for real-time updates
          io.to(`conversation:${conversationId}`).emit("messages_read", {
            conversationId,
            readBy: userId,
            messageIds: updatedMessages.map(msg => msg.id),
          });
        }

        logger.info(`Messages marked as read in conversation ${conversationId} by ${userId}`);
      } catch (error) {
        logger.error("Error marking messages as read:", error);
        socket.emit("error", { message: "Failed to mark messages as read" });
      }
    });

    // Handle disconnect
    socket.on("disconnect", async () => {
      logger.info(`User disconnected: ${userId}`);

      // Remove socket from online users in Redis
      const isNowOffline = await removeOnlineUser(userId, socket.id);
      
      // If user is now completely offline, emit status update
      if (isNowOffline) {
        await emitOnlineStatus(userId, false);
      }
    });
  });
};

/**
 * Emit online status to relevant users
 */
const emitOnlineStatus = async (userId, isOnline) => {
  const io = getIO();
  
  try {
    // Try to get cached conversations first
    let userConversations = await getCachedUserConversations(userId);
    
    if (!userConversations) {
      // Get all conversations where this user is a participant
      userConversations = await db
        .select({
          id: conversations.id,
          teacherId: conversations.teacherId,
          studentId: conversations.studentId,
        })
        .from(conversations)
        .where(
          or(
            eq(conversations.teacherId, userId),
            eq(conversations.studentId, userId)
          )
        );
      
      // Cache the conversations
      await cacheUserConversations(userId, userConversations);
    }

    // Collect all user IDs who should be notified and conversation IDs
    const userIdsToNotify = new Set();
    const conversationIds = new Set();
    
    userConversations.forEach(conv => {
      conversationIds.add(conv.id);
      if (conv.teacherId && conv.teacherId !== userId) {
        userIdsToNotify.add(conv.teacherId);
      }
      if (conv.studentId && conv.studentId !== userId) {
        userIdsToNotify.add(conv.studentId);
      }
    });

    // Emit status to all relevant users via their user rooms
    userIdsToNotify.forEach(targetUserId => {
      io.to(`user:${targetUserId}`).emit("user_status", {
        userId,
        isOnline,
      });
    });

    // Also emit to conversation rooms for real-time updates
    conversationIds.forEach(conversationId => {
      io.to(`conversation:${conversationId}`).emit("user_status", {
        userId,
        isOnline,
      });
    });

    logger.info(`Emitted online status for user ${userId} (${isOnline ? 'online' : 'offline'}) to ${userIdsToNotify.size} users and ${conversationIds.size} conversations`);
  } catch (error) {
    logger.error("Error emitting online status:", error);
    // Fallback: emit to user's own room
    io.to(`user:${userId}`).emit("user_status", {
      userId,
      isOnline,
    });
  }
};

