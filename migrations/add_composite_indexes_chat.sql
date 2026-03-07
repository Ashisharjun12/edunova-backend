-- Migration: Add composite indexes for better query performance in chat system
-- These indexes optimize common query patterns for scalability

-- Composite index for getting messages by conversation with read status filtering
-- Used in: markMessagesAsRead, getMessages with filters
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_read_role 
ON chat_messages(conversation_id, is_read, sender_role);

-- Composite index for getting messages by conversation ordered by creation time
-- Used in: getMessages (most common query)
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created 
ON chat_messages(conversation_id, created_at DESC);

-- Composite index for conversations by teacher/student with last message time
-- Used in: getConversations (ordered by lastMessageAt)
CREATE INDEX IF NOT EXISTS idx_conversations_teacher_lastmsg 
ON conversations(teacher_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_student_lastmsg 
ON conversations(student_id, last_message_at DESC NULLS LAST);

-- Index for unread count queries (conversation + read status + sender role)
-- Used in: getUnreadCount
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread_count 
ON chat_messages(conversation_id, is_read, sender_role) 
WHERE is_read = false;

