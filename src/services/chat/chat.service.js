import { db } from '../../config/database.js'
import { conversations, chatMessages, users, courses, images } from '../../models/index.js'
import { eq, and, desc, count, or, asc, inArray } from 'drizzle-orm'
import logger from '../../utils/logger.js'
import { getCachedUserConversations, cacheUserConversations } from '../redis/cache.service.js'

/**
 * Create or get existing conversation between teacher and student for a course
 */
export const createOrGetConversation = async (courseId, teacherId, studentId) => {
  try {
    // Check if conversation already exists
    const existing = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.courseId, courseId),
          eq(conversations.teacherId, teacherId),
          eq(conversations.studentId, studentId)
        )
      )
      .limit(1)

    if (existing.length > 0) {
      return existing[0]
    }

    // Create new conversation
    const [newConversation] = await db
      .insert(conversations)
      .values({
        courseId,
        teacherId,
        studentId,
      })
      .returning()

    logger.info(`Created new conversation: ${newConversation.id} for course ${courseId}`)
    return newConversation
  } catch (error) {
    logger.error('Error creating/getting conversation:', error)
    throw error
  }
}

/**
 * Get all conversations for a user (as teacher or student)
 */
export const getConversations = async (userId, role) => {
  try {
    // Try to get from cache first
    const cached = await getCachedUserConversations(userId);
    if (cached) {
      return cached;
    }

    let conversationList = []

    if (role === 'teacher') {
      // Get conversations where user is the teacher
      conversationList = await db
        .select({
          conversation: conversations,
          studentId: users.id,
          studentName: users.name,
          studentEmail: users.email,
          studentAvatar: users.avatar,
          courseId: courses.id,
          courseTitle: courses.title,
          thumbnailUrl: images.url,
        })
        .from(conversations)
        .leftJoin(users, eq(conversations.studentId, users.id))
        .leftJoin(courses, eq(conversations.courseId, courses.id))
        .leftJoin(images, eq(courses.thumbnailId, images.id))
        .where(eq(conversations.teacherId, userId))
        .orderBy(desc(conversations.lastMessageAt))
    } else {
      // Get conversations where user is the student
      conversationList = await db
        .select({
          conversation: conversations,
          teacherId: users.id,
          teacherName: users.name,
          teacherEmail: users.email,
          teacherAvatar: users.avatar,
          courseId: courses.id,
          courseTitle: courses.title,
          thumbnailUrl: images.url,
        })
        .from(conversations)
        .leftJoin(users, eq(conversations.teacherId, users.id))
        .leftJoin(courses, eq(conversations.courseId, courses.id))
        .leftJoin(images, eq(courses.thumbnailId, images.id))
        .where(eq(conversations.studentId, userId))
        .orderBy(desc(conversations.lastMessageAt))
    }

    // Get unread counts for each conversation and format the response
    const conversationsWithUnread = await Promise.all(
      conversationList.map(async (item) => {
        const unreadCount = await db
          .select({ count: count() })
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.conversationId, item.conversation.id),
              eq(chatMessages.isRead, false),
              // Count only messages NOT sent by the current user
              role === 'teacher'
                ? eq(chatMessages.senderRole, 'student')
                : eq(chatMessages.senderRole, 'teacher')
            )
          )

        // Format response based on role
        if (role === 'teacher') {
          return {
            conversation: item.conversation,
            student: item.studentId ? {
              id: item.studentId,
              name: item.studentName,
              email: item.studentEmail,
              avatar: item.studentAvatar,
            } : null,
            course: item.courseId ? {
              id: item.courseId,
              title: item.courseTitle,
              thumbnailUrl: item.thumbnailUrl,
            } : null,
            unreadCount: unreadCount[0]?.count || 0,
          }
        } else {
          return {
            conversation: item.conversation,
            teacher: item.teacherId ? {
              id: item.teacherId,
              name: item.teacherName,
              email: item.teacherEmail,
              avatar: item.teacherAvatar,
            } : null,
            course: item.courseId ? {
              id: item.courseId,
              title: item.courseTitle,
              thumbnailUrl: item.thumbnailUrl,
            } : null,
            unreadCount: unreadCount[0]?.count || 0,
          }
        }
      })
    )

    // Cache the conversations before returning
    await cacheUserConversations(userId, conversationsWithUnread);
    
    return conversationsWithUnread
  } catch (error) {
    logger.error('Error getting conversations:', error)
    throw error
  }
}

/**
 * Get paginated messages for a conversation
 */
export const getMessages = async (conversationId, page = 1, limit = 50) => {
  try {
    const offset = (page - 1) * limit

    const messages = await db
      .select({
        id: chatMessages.id,
        conversationId: chatMessages.conversationId,
        senderId: chatMessages.senderId,
        senderRole: chatMessages.senderRole,
        content: chatMessages.content,
        isRead: chatMessages.isRead,
        readAt: chatMessages.readAt,
        createdAt: chatMessages.createdAt,
        sender: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        },
      })
      .from(chatMessages)
      .leftJoin(users, eq(chatMessages.senderId, users.id))
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count
    const totalCountResult = await db
      .select({ count: count() })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))

    const totalCount = totalCountResult[0]?.count || 0
    const totalPages = Math.ceil(totalCount / limit)

    return {
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    }
  } catch (error) {
    logger.error('Error getting messages:', error)
    throw error
  }
}

/**
 * Save a message to the database
 */
export const saveMessage = async (conversationId, senderId, senderRole, content) => {
  try {
    const [newMessage] = await db
      .insert(chatMessages)
      .values({
        conversationId,
        senderId,
        senderRole,
        content,
        isRead: false,
      })
      .returning()

    // Update conversation's lastMessageAt
    await db
      .update(conversations)
      .set({
        lastMessageAt: newMessage.createdAt,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId))

    // Get sender info
    const [sender] = await db
      .select({
        id: users.id,
        name: users.name,
        avatar: users.avatar,
      })
      .from(users)
      .where(eq(users.id, senderId))
      .limit(1)

    return {
      ...newMessage,
      sender: sender || null,
    }
  } catch (error) {
    logger.error('Error saving message:', error)
    throw error
  }
}

/**
 * Mark messages as read in a conversation (for the other participant)
 */
export const markMessagesAsRead = async (conversationId, userId, userRole) => {
  try {
    // Mark messages as read where sender is NOT the current user
    const senderRoleToMark = userRole === 'teacher' ? 'student' : 'teacher'

    const result = await db
      .update(chatMessages)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(chatMessages.conversationId, conversationId),
          eq(chatMessages.senderRole, senderRoleToMark),
          eq(chatMessages.isRead, false)
        )
      )
      .returning()

    logger.info(`Marked ${result.length} messages as read in conversation ${conversationId}`)
    return result
  } catch (error) {
    logger.error('Error marking messages as read:', error)
    throw error
  }
}

/**
 * Get unread message count for a user
 */
export const getUnreadCount = async (userId, role) => {
  try {
    let conversationIds = []

    if (role === 'teacher') {
      // Get conversation IDs where user is teacher
      const teacherConversations = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.teacherId, userId))
      conversationIds = teacherConversations.map((c) => c.id)
    } else {
      // Get conversation IDs where user is student
      const studentConversations = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.studentId, userId))
      conversationIds = studentConversations.map((c) => c.id)
    }

    if (conversationIds.length === 0) {
      return 0
    }

    // Count unread messages where sender is NOT the current user
    const senderRoleToCount = role === 'teacher' ? 'student' : 'teacher'

    const unreadCountResult = await db
      .select({ count: count() })
      .from(chatMessages)
      .where(
        and(
          inArray(chatMessages.conversationId, conversationIds),
          eq(chatMessages.senderRole, senderRoleToCount),
          eq(chatMessages.isRead, false)
        )
      )

    return unreadCountResult[0]?.count || 0
  } catch (error) {
    logger.error('Error getting unread count:', error)
    throw error
  }
}

