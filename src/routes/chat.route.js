import { Router } from "express";
import { authenticate } from "../middleware/autenticate.js";
import {
  getConversationsController,
  getMessagesController,
  getUnreadCountController,
  markAsReadController,
} from "../controllers/chat/chat.controller.js";

const router = Router();

// All chat routes require authentication
router.use(authenticate);

// Get user's conversations
router.get("/conversations", getConversationsController);

// Get messages for a conversation
router.get("/conversations/:conversationId/messages", getMessagesController);

// Get unread message count
router.get("/unread-count", getUnreadCountController);

// Mark messages as read in a conversation
router.put("/conversations/:conversationId/read", markAsReadController);

export default router;

