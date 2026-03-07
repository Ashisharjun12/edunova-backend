import {
  getConversations,
  getMessages,
  getUnreadCount,
  markMessagesAsRead,
} from "../../services/chat/chat.service.js";
import { invalidateUserConversationsCache, invalidateConversationsCacheForUsers } from "../../services/redis/cache.service.js";
import { db } from "../../config/database.js";
import { conversations } from "../../models/index.js";
import { eq } from "drizzle-orm";
import logger from "../../utils/logger.js";

/**
 * Get all conversations for the authenticated user
 * GET /api/v1/chat/conversations
 */
export const getConversationsController = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (userRole !== "teacher" && userRole !== "student") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only teachers and students can access chats.",
      });
    }

    const conversations = await getConversations(userId, userRole);

    res.status(200).json({
      success: true,
      message: "Conversations retrieved successfully",
      data: conversations,
    });
  } catch (error) {
    logger.error("Error getting conversations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve conversations",
      error: error.message,
    });
  }
};

/**
 * Get messages for a conversation
 * GET /api/v1/chat/conversations/:conversationId/messages
 */
export const getMessagesController = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user?.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
      });
    }

    const result = await getMessages(conversationId, page, limit);

    res.status(200).json({
      success: true,
      message: "Messages retrieved successfully",
      data: result,
    });
  } catch (error) {
    logger.error("Error getting messages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve messages",
      error: error.message,
    });
  }
};

/**
 * Get unread message count for the authenticated user
 * GET /api/v1/chat/unread-count
 */
export const getUnreadCountController = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (userRole !== "teacher" && userRole !== "student") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only teachers and students can access chats.",
      });
    }

    const count = await getUnreadCount(userId, userRole);

    res.status(200).json({
      success: true,
      message: "Unread count retrieved successfully",
      data: { count },
    });
  } catch (error) {
    logger.error("Error getting unread count:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve unread count",
      error: error.message,
    });
  }
};

/**
 * Mark messages as read in a conversation
 * PUT /api/v1/chat/conversations/:conversationId/read
 */
export const markAsReadController = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
      });
    }

    await markMessagesAsRead(conversationId, userId, userRole);

    // Invalidate conversations cache for both participants
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    
    if (conversation) {
      const otherUserId = userRole === "teacher" ? conversation.studentId : conversation.teacherId;
      if (otherUserId) {
        await invalidateConversationsCacheForUsers([userId, otherUserId]);
      }
    }

    res.status(200).json({
      success: true,
      message: "Messages marked as read successfully",
    });
  } catch (error) {
    logger.error("Error marking messages as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark messages as read",
      error: error.message,
    });
  }
};

