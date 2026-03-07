import { db } from '../../config/database.js';
import { discussions, discussionLikes, discussionMentions, users, courses, lessons } from '../../models/index.js';
import { eq, and, desc, asc, sql, count, or } from 'drizzle-orm';

// Get all discussions across all lessons
export const getAllDiscussions = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const [totalCount] = await db
      .select({ count: count() })
      .from(discussions)
      .where(eq(discussions.parentId, null)); // Only main discussions

    // Get all main discussions with user info
    const allDiscussions = await db
      .select({
        id: discussions.id,
        content: discussions.content,
        likesCount: discussions.likesCount,
        repliesCount: discussions.repliesCount,
        isEdited: discussions.isEdited,
        createdAt: discussions.createdAt,
        updatedAt: discussions.updatedAt,
        lessonId: discussions.lessonId,
        user: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        }
      })
      .from(discussions)
      .leftJoin(users, eq(discussions.userId, users.id))
      .where(eq(discussions.parentId, null)) // Only main discussions
      .orderBy(desc(discussions.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: {
        discussions: allDiscussions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount.count,
          totalPages: Math.ceil(totalCount.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching all discussions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch all discussions'
    });
  }
};

// Get discussions by lesson ID (main discussions only)
export const getDiscussionsByLessonId = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const [totalCount] = await db
      .select({ count: count() })
      .from(discussions)
      .where(and(
        eq(discussions.lessonId, lessonId),
        eq(discussions.parentId, null)
      ));

    // Get main discussions for specific lesson
    const lessonDiscussions = await db
      .select({
        id: discussions.id,
        content: discussions.content,
        likesCount: discussions.likesCount,
        repliesCount: discussions.repliesCount,
        isEdited: discussions.isEdited,
        createdAt: discussions.createdAt,
        updatedAt: discussions.updatedAt,
        user: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        }
      })
      .from(discussions)
      .leftJoin(users, eq(discussions.userId, users.id))
      .where(and(
        eq(discussions.lessonId, lessonId),
        eq(discussions.parentId, null) // Only main discussions
      ))
      .orderBy(desc(discussions.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: {
        discussions: lessonDiscussions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount.count,
          totalPages: Math.ceil(totalCount.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching discussions by lesson ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch discussions for lesson'
    });
  }
};

// Get all discussions on a lesson (including replies)
export const getAllDiscussionsOnLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Validate lessonId is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!lessonId || !uuidRegex.test(lessonId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lesson ID format'
      });
    }

    // Get total count for pagination
    const [totalCount] = await db
      .select({ count: count() })
      .from(discussions)
      .where(eq(discussions.lessonId, lessonId));

    // Get all discussions for lesson (main + replies)
    const allDiscussions = await db
      .select({
        id: discussions.id,
        content: discussions.content,
        likesCount: discussions.likesCount,
        repliesCount: discussions.repliesCount,
        isEdited: discussions.isEdited,
        createdAt: discussions.createdAt,
        updatedAt: discussions.updatedAt,
        parentId: discussions.parentId,
        user: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        }
      })
      .from(discussions)
      .leftJoin(users, eq(discussions.userId, users.id))
      .where(eq(discussions.lessonId, lessonId))
      .orderBy(desc(discussions.createdAt))
      .limit(limit)
      .offset(offset);

    // Separate main discussions and replies
    const mainDiscussions = allDiscussions.filter(d => !d.parentId);
    const replies = allDiscussions.filter(d => d.parentId);

    // Group replies by parent discussion
    const discussionsWithReplies = mainDiscussions.map(discussion => {
      const discussionReplies = replies
        .filter(reply => reply.parentId === discussion.id)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      return {
        ...discussion,
        replies: discussionReplies
      };
    });

    res.json({
      success: true,
      data: {
        discussions: discussionsWithReplies,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount.count,
          totalPages: Math.ceil(totalCount.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching all discussions on lesson:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch all discussions on lesson'
    });
  }
};

// Get discussions on lesson by user ID
export const getDiscussionsOnLessonByUserId = async (req, res) => {
  try {
    const { lessonId, userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const [totalCount] = await db
      .select({ count: count() })
      .from(discussions)
      .where(and(
        eq(discussions.lessonId, lessonId),
        eq(discussions.userId, userId)
      ));

    // Get discussions by specific user on specific lesson
    const userDiscussions = await db
      .select({
        id: discussions.id,
        content: discussions.content,
        likesCount: discussions.likesCount,
        repliesCount: discussions.repliesCount,
        isEdited: discussions.isEdited,
        createdAt: discussions.createdAt,
        updatedAt: discussions.updatedAt,
        parentId: discussions.parentId,
        user: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        }
      })
      .from(discussions)
      .leftJoin(users, eq(discussions.userId, users.id))
      .where(and(
        eq(discussions.lessonId, lessonId),
        eq(discussions.userId, userId)
      ))
      .orderBy(desc(discussions.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: {
        discussions: userDiscussions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount.count,
          totalPages: Math.ceil(totalCount.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching discussions by user ID on lesson:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch discussions by user on lesson'
    });
  }
};

// Create a new discussion/comment
export const createDiscussion = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { content, parentId, mentions = [] } = req.body;
    const userId = req.user.id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Content is required'
      });
    }

    // Get lesson to get courseId
    const [lesson] = await db
      .select({ courseId: lessons.courseId })
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);

    if (!lesson) {
      return res.status(400).json({
        success: false,
        message: 'Lesson not found'
      });
    }

    // Create the discussion
    const [newDiscussion] = await db
      .insert(discussions)
      .values({
        courseId: lesson.courseId, // Set courseId from lesson
        lessonId,
        userId,
        parentId: parentId || null,
        content: content.trim(),
        likesCount: 0,
        repliesCount: 0,
        isEdited: false
      })
      .returning();

    // If this is a reply, increment the parent's replies count
    if (parentId) {
      await db
        .update(discussions)
        .set({
          repliesCount: sql`${discussions.repliesCount} + 1`
        })
        .where(eq(discussions.id, parentId));
    }

    // Create mentions if any
    if (mentions.length > 0) {
      const mentionRecords = mentions.map(mentionedUserId => ({
        discussionId: newDiscussion.id,
        mentionedUserId,
        mentionedByUserId: userId,
        isRead: false
      }));

      await db.insert(discussionMentions).values(mentionRecords);
    }

    // Fetch the created discussion with user info
    const [discussionWithUser] = await db
      .select({
        id: discussions.id,
        content: discussions.content,
        likesCount: discussions.likesCount,
        repliesCount: discussions.repliesCount,
        isEdited: discussions.isEdited,
        createdAt: discussions.createdAt,
        updatedAt: discussions.updatedAt,
        user: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        }
      })
      .from(discussions)
      .leftJoin(users, eq(discussions.userId, users.id))
      .where(eq(discussions.id, newDiscussion.id));

    res.status(201).json({
      success: true,
      data: discussionWithUser
    });
  } catch (error) {
    console.error('Error creating discussion:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create discussion'
    });
  }
};

// Like/Unlike a discussion
export const toggleDiscussionLike = async (req, res) => {
  try {
    const { discussionId } = req.params;
    const userId = req.user.id;

    // Check if user already liked this discussion
    const existingLike = await db
      .select()
      .from(discussionLikes)
      .where(and(
        eq(discussionLikes.discussionId, discussionId),
        eq(discussionLikes.userId, userId)
      ))
      .limit(1);

    if (existingLike.length > 0) {
      // Unlike - remove the like
      await db
        .delete(discussionLikes)
        .where(and(
          eq(discussionLikes.discussionId, discussionId),
          eq(discussionLikes.userId, userId)
        ));

      // Decrement likes count
      await db
        .update(discussions)
        .set({
          likesCount: sql`${discussions.likesCount} - 1`
        })
        .where(eq(discussions.id, discussionId));

      res.json({
        success: true,
        data: { liked: false }
      });
    } else {
      // Like - add the like
      await db
        .insert(discussionLikes)
        .values({
          discussionId,
          userId
        });

      // Increment likes count
      await db
        .update(discussions)
        .set({
          likesCount: sql`${discussions.likesCount} + 1`
        })
        .where(eq(discussions.id, discussionId));

      res.json({
        success: true,
        data: { liked: true }
      });
    }
  } catch (error) {
    console.error('Error toggling discussion like:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle like'
    });
  }
};

// Edit a discussion
export const editDiscussion = async (req, res) => {
  try {
    const { discussionId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Content is required'
      });
    }

    // Check if user owns this discussion
    const [discussion] = await db
      .select()
      .from(discussions)
      .where(and(
        eq(discussions.id, discussionId),
        eq(discussions.userId, userId)
      ))
      .limit(1);

    if (!discussion) {
      return res.status(404).json({
        success: false,
        message: 'Discussion not found or you do not have permission to edit it'
      });
    }

    // Update the discussion
    const [updatedDiscussion] = await db
      .update(discussions)
      .set({
        content: content.trim(),
        isEdited: true,
        updatedAt: new Date()
      })
      .where(eq(discussions.id, discussionId))
      .returning();

    res.json({
      success: true,
      data: updatedDiscussion
    });
  } catch (error) {
    console.error('Error editing discussion:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to edit discussion'
    });
  }
};

// Delete a discussion
export const deleteDiscussion = async (req, res) => {
  try {
    const { discussionId } = req.params;
    const userId = req.user.id;

    // Check if user owns this discussion
    const [discussion] = await db
      .select()
      .from(discussions)
      .where(and(
        eq(discussions.id, discussionId),
        eq(discussions.userId, userId)
      ))
      .limit(1);

    if (!discussion) {
      return res.status(404).json({
        success: false,
        message: 'Discussion not found or you do not have permission to delete it'
      });
    }

    // If this is a main discussion, also delete all replies
    if (!discussion.parentId) {
      await db.delete(discussions).where(eq(discussions.parentId, discussionId));
    } else {
      // If this is a reply, decrement parent's replies count
      await db
        .update(discussions)
        .set({
          repliesCount: sql`${discussions.repliesCount} - 1`
        })
        .where(eq(discussions.id, discussion.parentId));
    }

    // Delete the discussion
    await db.delete(discussions).where(eq(discussions.id, discussionId));

    res.json({
      success: true,
      message: 'Discussion deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting discussion:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete discussion'
    });
  }
};

// Get user mentions
export const getUserMentions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const offset = (page - 1) * limit;

    const mentions = await db
      .select({
        id: discussionMentions.id,
        isRead: discussionMentions.isRead,
        createdAt: discussionMentions.createdAt,
        discussion: {
          id: discussions.id,
          content: discussions.content,
          lessonId: discussions.lessonId,
        },
        mentionedBy: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        }
      })
      .from(discussionMentions)
      .leftJoin(discussions, eq(discussionMentions.discussionId, discussions.id))
      .leftJoin(users, eq(discussionMentions.mentionedByUserId, users.id))
      .where(eq(discussionMentions.mentionedUserId, userId))
      .orderBy(desc(discussionMentions.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: {
        mentions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: mentions.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user mentions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch mentions'
    });
  }
};

// Mark mention as read
export const markMentionAsRead = async (req, res) => {
  try {
    const { mentionId } = req.params;
    const userId = req.user.id;

    await db
      .update(discussionMentions)
      .set({ isRead: true })
      .where(and(
        eq(discussionMentions.id, mentionId),
        eq(discussionMentions.mentionedUserId, userId)
      ));

    res.json({
      success: true,
      message: 'Mention marked as read'
    });
  } catch (error) {
    console.error('Error marking mention as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark mention as read'
    });
  }
};

// Get all discussions for a course (course-level discussions + all lesson discussions)
export const getDiscussionsByCourseId = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { page = 1, limit = 50, filter = 'all' } = req.query; // filter: 'all', 'course', 'lesson'
    const offset = (page - 1) * limit;

    let whereCondition;

    if (filter === 'course') {
      // Only course-level discussions (courseId set, lessonId null)
      whereCondition = and(
        eq(discussions.courseId, courseId),
        sql`${discussions.lessonId} IS NULL`,
        sql`${discussions.parentId} IS NULL` // Only main discussions
      );
    } else if (filter === 'lesson') {
      // Only lesson-level discussions (lessonId set, courseId can be set or null)
      whereCondition = and(
        eq(discussions.courseId, courseId),
        sql`${discussions.lessonId} IS NOT NULL`,
        sql`${discussions.parentId} IS NULL` // Only main discussions
      );
    } else {
      // All discussions for the course (course-level + lesson-level)
      whereCondition = and(
        eq(discussions.courseId, courseId),
        sql`${discussions.parentId} IS NULL` // Only main discussions
      );
    }

    // Get total count for pagination
    const [totalCount] = await db
      .select({ count: count() })
      .from(discussions)
      .where(whereCondition);

    // Get discussions with user info and lesson info
    const courseDiscussions = await db
      .select({
        id: discussions.id,
        content: discussions.content,
        likesCount: discussions.likesCount,
        repliesCount: discussions.repliesCount,
        isEdited: discussions.isEdited,
        createdAt: discussions.createdAt,
        updatedAt: discussions.updatedAt,
        courseId: discussions.courseId,
        lessonId: discussions.lessonId,
        lessonTitle: lessons.title,
        user: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        }
      })
      .from(discussions)
      .leftJoin(users, eq(discussions.userId, users.id))
      .leftJoin(lessons, eq(discussions.lessonId, lessons.id))
      .where(whereCondition)
      .orderBy(desc(discussions.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: {
        discussions: courseDiscussions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount.count,
          totalPages: Math.ceil(totalCount.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching discussions by course ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch discussions for course'
    });
  }
};

// Get all discussions on a course (including replies) - similar to getAllDiscussionsOnLesson
export const getAllDiscussionsOnCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { page = 1, limit = 50, filter = 'all' } = req.query; // filter: 'all', 'course', 'lesson'
    const offset = (page - 1) * limit;

    let whereCondition;

    if (filter === 'course') {
      // Only course-level discussions
      whereCondition = and(
        eq(discussions.courseId, courseId),
        sql`${discussions.lessonId} IS NULL`
      );
    } else if (filter === 'lesson') {
      // Only lesson-level discussions
      whereCondition = and(
        eq(discussions.courseId, courseId),
        sql`${discussions.lessonId} IS NOT NULL`
      );
    } else {
      // All discussions
      whereCondition = eq(discussions.courseId, courseId);
    }

    // Get total count for pagination
    const [totalCount] = await db
      .select({ count: count() })
      .from(discussions)
      .where(whereCondition);

    // Get all discussions (main + replies)
    const allDiscussions = await db
      .select({
        id: discussions.id,
        content: discussions.content,
        likesCount: discussions.likesCount,
        repliesCount: discussions.repliesCount,
        isEdited: discussions.isEdited,
        createdAt: discussions.createdAt,
        updatedAt: discussions.updatedAt,
        parentId: discussions.parentId,
        courseId: discussions.courseId,
        lessonId: discussions.lessonId,
        lessonTitle: lessons.title,
        user: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        }
      })
      .from(discussions)
      .leftJoin(users, eq(discussions.userId, users.id))
      .leftJoin(lessons, eq(discussions.lessonId, lessons.id))
      .where(whereCondition)
      .orderBy(desc(discussions.createdAt))
      .limit(limit)
      .offset(offset);

    // Separate main discussions and replies
    const mainDiscussions = allDiscussions.filter(d => !d.parentId);
    const replies = allDiscussions.filter(d => d.parentId);

    // Group replies by parent discussion
    const discussionsWithReplies = mainDiscussions.map(discussion => {
      const discussionReplies = replies
        .filter(reply => reply.parentId === discussion.id)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      return {
        ...discussion,
        replies: discussionReplies
      };
    });

    res.json({
      success: true,
      data: {
        discussions: discussionsWithReplies,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount.count,
          totalPages: Math.ceil(totalCount.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching all discussions on course:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch all discussions on course'
    });
  }
};

// Create a course-level discussion
export const createCourseDiscussion = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { content, parentId, lessonId, mentions = [] } = req.body;
    const userId = req.user.id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Content is required'
      });
    }

    // Validate: either lessonId or course-level (lessonId null)
    // If lessonId is provided, it must belong to the course
    if (lessonId) {
      const [lesson] = await db
        .select()
        .from(lessons)
        .where(and(
          eq(lessons.id, lessonId),
          eq(lessons.courseId, courseId)
        ))
        .limit(1);

      if (!lesson) {
        return res.status(400).json({
          success: false,
          message: 'Lesson not found or does not belong to this course'
        });
      }
    }

    // Create the discussion
    const [newDiscussion] = await db
      .insert(discussions)
      .values({
        courseId,
        lessonId: lessonId || null,
        userId,
        parentId: parentId || null,
        content: content.trim(),
        likesCount: 0,
        repliesCount: 0,
        isEdited: false
      })
      .returning();

    // If this is a reply, increment the parent's replies count
    if (parentId) {
      await db
        .update(discussions)
        .set({
          repliesCount: sql`${discussions.repliesCount} + 1`
        })
        .where(eq(discussions.id, parentId));
    }

    // Create mentions if any
    if (mentions.length > 0) {
      const mentionRecords = mentions.map(mentionedUserId => ({
        discussionId: newDiscussion.id,
        mentionedUserId,
        mentionedByUserId: userId,
        isRead: false
      }));

      await db.insert(discussionMentions).values(mentionRecords);
    }

    // Fetch the created discussion with user info
    const [createdDiscussion] = await db
      .select({
        id: discussions.id,
        content: discussions.content,
        likesCount: discussions.likesCount,
        repliesCount: discussions.repliesCount,
        isEdited: discussions.isEdited,
        createdAt: discussions.createdAt,
        updatedAt: discussions.updatedAt,
        courseId: discussions.courseId,
        lessonId: discussions.lessonId,
        parentId: discussions.parentId,
        lessonTitle: lessons.title,
        user: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        }
      })
      .from(discussions)
      .leftJoin(users, eq(discussions.userId, users.id))
      .leftJoin(lessons, eq(discussions.lessonId, lessons.id))
      .where(eq(discussions.id, newDiscussion.id))
      .limit(1);

    res.status(201).json({
      success: true,
      data: createdDiscussion,
      message: 'Discussion created successfully'
    });
  } catch (error) {
    console.error('Error creating course discussion:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create discussion'
    });
  }
};
