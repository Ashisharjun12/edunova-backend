import { db } from '../../config/database.js'
import { reviews, reviewLikes, reviewReplies, replyLikes, users, courses, enrollments } from '../../models/index.js'
import { eq, and, desc, count, sql } from 'drizzle-orm'

// Create a new review
export const createReview = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { courseId, rating, comment } = req.body

    // Validate input
    if (!courseId) {
      return res.status(400).json({ success: false, message: 'Course ID is required' })
    }
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' })
    }

    // Check if user is enrolled in the course
    const enrollment = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
      .limit(1)

    if (!enrollment.length) {
      return res.status(403).json({ 
        success: false, 
        message: 'You must be enrolled in this course to write a review' 
      })
    }

    // Check if user already reviewed this course
    const existingReview = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.userId, userId), eq(reviews.courseId, courseId)))
      .limit(1)

    if (existingReview.length) {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already reviewed this course' 
      })
    }

    // Create the review
    const newReview = await db
      .insert(reviews)
      .values({
        userId,
        courseId,
        rating: parseInt(rating),
        comment: comment || null,
        isVerified: true // Since they're enrolled
      })
      .returning()

    // Update course rating statistics
    await updateCourseRatingStats(courseId)

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: newReview[0]
    })

  } catch (error) {
    console.error('Error creating review:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to create review',
      error: error.message
    })
  }
}

// Get reviews for a course with pagination
export const getCourseReviews = async (req, res) => {
  try {
    const { courseId } = req.params
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const offset = (page - 1) * limit

    if (!courseId) {
      return res.status(400).json({ success: false, message: 'Course ID is required' })
    }

    // Get total count
    const totalCountResult = await db
      .select({ count: count() })
      .from(reviews)
      .where(eq(reviews.courseId, courseId))

    const totalCount = totalCountResult[0]?.count || 0
    const totalPages = Math.ceil(totalCount / limit)

    // Get reviews with user details, likes count, and replies count
    const courseReviews = await db
      .select({
        id: reviews.id,
        userId: reviews.userId,
        rating: reviews.rating,
        comment: reviews.comment,
        isVerified: reviews.isVerified,
        likesCount: reviews.likesCount,
        createdAt: reviews.createdAt,
        updatedAt: reviews.updatedAt,
        userName: users.name,
        userAvatar: users.avatar
      })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.id))
      .where(eq(reviews.courseId, courseId))
      .orderBy(desc(reviews.createdAt))
      .limit(limit)
      .offset(offset)

    // Get likes and replies for each review
    const userId = req.user?.id || null
    const reviewsWithDetails = await Promise.all(
      courseReviews.map(async (review) => {
        // Get user's like status if authenticated
        let userLiked = false
        if (userId) {
          const userLike = await db
            .select()
            .from(reviewLikes)
            .where(and(eq(reviewLikes.reviewId, review.id), eq(reviewLikes.userId, userId)))
            .limit(1)
          userLiked = userLike.length > 0
        }

        // Get replies count
        const repliesCountResult = await db
          .select({ count: count() })
          .from(reviewReplies)
          .where(eq(reviewReplies.reviewId, review.id))

        const repliesCount = repliesCountResult[0]?.count || 0

        // Get top-level replies (limit to 3 for preview)
        const topReplies = await db
          .select({
            id: reviewReplies.id,
            userId: reviewReplies.userId,
            comment: reviewReplies.comment,
            likesCount: reviewReplies.likesCount,
            createdAt: reviewReplies.createdAt,
            userName: users.name,
            userAvatar: users.avatar
          })
          .from(reviewReplies)
          .leftJoin(users, eq(reviewReplies.userId, users.id))
          .where(and(
            eq(reviewReplies.reviewId, review.id),
            eq(reviewReplies.parentReplyId, null) // Only top-level replies
          ))
          .orderBy(desc(reviewReplies.createdAt))
          .limit(3)

        // Get user's like status for each reply
        const repliesWithLikes = await Promise.all(
          topReplies.map(async (reply) => {
            let userLikedReply = false
            if (userId) {
              const userReplyLike = await db
                .select()
                .from(replyLikes)
                .where(and(eq(replyLikes.replyId, reply.id), eq(replyLikes.userId, userId)))
                .limit(1)
              userLikedReply = userReplyLike.length > 0
            }
            return { ...reply, userLiked: userLikedReply }
          })
        )

        return {
          ...review,
          userLiked,
          repliesCount,
          replies: repliesWithLikes
        }
      })
    )

    res.status(200).json({
      success: true,
      message: 'Reviews retrieved successfully',
      data: {
        reviews: reviewsWithDetails,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    })

  } catch (error) {
    console.error('Error getting course reviews:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get reviews',
      error: error.message
    })
  }
}

// Update a review
export const updateReview = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { reviewId } = req.params
    const { rating, comment } = req.body

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' })
    }

    // Check if review exists and belongs to user
    const existingReview = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)))
      .limit(1)

    if (!existingReview.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'Review not found or you do not have permission to update it' 
      })
    }

    // Update the review
    const updatedReview = await db
      .update(reviews)
      .set({
        rating: parseInt(rating),
        comment: comment || null,
        updatedAt: new Date()
      })
      .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)))
      .returning()

    // Update course rating statistics
    await updateCourseRatingStats(existingReview[0].courseId)

    res.status(200).json({
      success: true,
      message: 'Review updated successfully',
      data: updatedReview[0]
    })

  } catch (error) {
    console.error('Error updating review:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update review',
      error: error.message
    })
  }
}

// Delete a review
export const deleteReview = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { reviewId } = req.params

    // Check if review exists and belongs to user
    const existingReview = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)))
      .limit(1)

    if (!existingReview.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'Review not found or you do not have permission to delete it' 
      })
    }

    const courseId = existingReview[0].courseId

    // Delete the review
    await db
      .delete(reviews)
      .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)))

    // Update course rating statistics
    await updateCourseRatingStats(courseId)

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting review:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete review',
      error: error.message
    })
  }
}

// Get user's review for a specific course
export const getUserCourseReview = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { courseId } = req.params

    const userReview = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        isVerified: reviews.isVerified,
        createdAt: reviews.createdAt,
        updatedAt: reviews.updatedAt
      })
      .from(reviews)
      .where(and(eq(reviews.userId, userId), eq(reviews.courseId, courseId)))
      .limit(1)

    res.status(200).json({
      success: true,
      message: 'User review retrieved successfully',
      data: userReview[0] || null
    })

  } catch (error) {
    console.error('Error getting user course review:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get user review',
      error: error.message
    })
  }
}

// Helper function to update course rating statistics
const updateCourseRatingStats = async (courseId) => {
  try {
    // Calculate average rating and count
    const ratingStats = await db
      .select({
        averageRating: sql`ROUND(AVG(${reviews.rating})::numeric, 1)`,
        ratingCount: count(reviews.id)
      })
      .from(reviews)
      .where(eq(reviews.courseId, courseId))

    const stats = ratingStats[0]
    const averageRating = parseFloat(stats.averageRating) || 0
    const ratingCount = stats.ratingCount || 0

    // Update course with new rating stats
    await db
      .update(courses)
      .set({
        rating: Math.round(averageRating * 10), // Store as integer (e.g., 4.5 -> 45)
        ratingCount: ratingCount
      })
      .where(eq(courses.id, courseId))

    console.log(`Updated course ${courseId} rating: ${averageRating}, count: ${ratingCount}`)
  } catch (error) {
    console.error('Error updating course rating stats:', error)
  }
}

// Like/Unlike a review
export const toggleReviewLike = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { reviewId } = req.params

    // Check if review exists
    const review = await db
      .select()
      .from(reviews)
      .where(eq(reviews.id, reviewId))
      .limit(1)

    if (!review.length) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }

    // Check if user already liked this review
    const existingLike = await db
      .select()
      .from(reviewLikes)
      .where(and(eq(reviewLikes.reviewId, reviewId), eq(reviewLikes.userId, userId)))
      .limit(1)

    if (existingLike.length > 0) {
      // Unlike: Remove the like
      await db
        .delete(reviewLikes)
        .where(and(eq(reviewLikes.reviewId, reviewId), eq(reviewLikes.userId, userId)))

      // Decrement likes count
      await db
        .update(reviews)
        .set({ likesCount: sql`${reviews.likesCount} - 1` })
        .where(eq(reviews.id, reviewId))

      res.status(200).json({
        success: true,
        message: 'Review unliked',
        data: { liked: false }
      })
    } else {
      // Like: Add the like
      await db
        .insert(reviewLikes)
        .values({
          reviewId,
          userId
        })

      // Increment likes count
      await db
        .update(reviews)
        .set({ likesCount: sql`${reviews.likesCount} + 1` })
        .where(eq(reviews.id, reviewId))

      res.status(200).json({
        success: true,
        message: 'Review liked',
        data: { liked: true }
      })
    }
  } catch (error) {
    console.error('Error toggling review like:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to toggle like',
      error: error.message
    })
  }
}

// Add a reply to a review
export const addReviewReply = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { reviewId } = req.params
    const { comment, parentReplyId } = req.body

    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Comment is required' })
    }

    // Check if review exists
    const review = await db
      .select()
      .from(reviews)
      .where(eq(reviews.id, reviewId))
      .limit(1)

    if (!review.length) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }

    // If parentReplyId is provided, verify it exists
    if (parentReplyId) {
      const parentReply = await db
        .select()
        .from(reviewReplies)
        .where(eq(reviewReplies.id, parentReplyId))
        .limit(1)

      if (!parentReply.length) {
        return res.status(404).json({ success: false, message: 'Parent reply not found' })
      }
    }

    // Create the reply
    const newReply = await db
      .insert(reviewReplies)
      .values({
        reviewId,
        userId,
        comment: comment.trim(),
        parentReplyId: parentReplyId || null
      })
      .returning()

    // Get reply with user details
    const replyWithUser = await db
      .select({
        id: reviewReplies.id,
        reviewId: reviewReplies.reviewId,
        userId: reviewReplies.userId,
        parentReplyId: reviewReplies.parentReplyId,
        comment: reviewReplies.comment,
        likesCount: reviewReplies.likesCount,
        createdAt: reviewReplies.createdAt,
        userName: users.name,
        userAvatar: users.avatar
      })
      .from(reviewReplies)
      .leftJoin(users, eq(reviewReplies.userId, users.id))
      .where(eq(reviewReplies.id, newReply[0].id))
      .limit(1)

    res.status(201).json({
      success: true,
      message: 'Reply added successfully',
      data: { ...replyWithUser[0], userLiked: false }
    })
  } catch (error) {
    console.error('Error adding reply:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to add reply',
      error: error.message
    })
  }
}

// Get replies for a review
export const getReviewReplies = async (req, res) => {
  try {
    const { reviewId } = req.params
    const { parentReplyId } = req.query // Optional: get replies to a specific reply

    // Get replies
    const replies = await db
      .select({
        id: reviewReplies.id,
        userId: reviewReplies.userId,
        parentReplyId: reviewReplies.parentReplyId,
        comment: reviewReplies.comment,
        likesCount: reviewReplies.likesCount,
        createdAt: reviewReplies.createdAt,
        userName: users.name,
        userAvatar: users.avatar
      })
      .from(reviewReplies)
      .leftJoin(users, eq(reviewReplies.userId, users.id))
      .where(
        parentReplyId
          ? eq(reviewReplies.parentReplyId, parentReplyId)
          : and(eq(reviewReplies.reviewId, reviewId), eq(reviewReplies.parentReplyId, null))
      )
      .orderBy(desc(reviewReplies.createdAt))

    // Get user's like status for each reply if authenticated
    const userId = req.user?.id || null
    const repliesWithLikes = await Promise.all(
      replies.map(async (reply) => {
        let userLiked = false
        if (userId) {
          const userLike = await db
            .select()
            .from(replyLikes)
            .where(and(eq(replyLikes.replyId, reply.id), eq(replyLikes.userId, userId)))
            .limit(1)
          userLiked = userLike.length > 0
        }
        return { ...reply, userLiked }
      })
    )

    res.status(200).json({
      success: true,
      message: 'Replies retrieved successfully',
      data: { replies: repliesWithLikes }
    })
  } catch (error) {
    console.error('Error getting replies:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get replies',
      error: error.message
    })
  }
}

// Like/Unlike a reply
export const toggleReplyLike = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { replyId } = req.params

    // Check if reply exists
    const reply = await db
      .select()
      .from(reviewReplies)
      .where(eq(reviewReplies.id, replyId))
      .limit(1)

    if (!reply.length) {
      return res.status(404).json({ success: false, message: 'Reply not found' })
    }

    // Check if user already liked this reply
    const existingLike = await db
      .select()
      .from(replyLikes)
      .where(and(eq(replyLikes.replyId, replyId), eq(replyLikes.userId, userId)))
      .limit(1)

    if (existingLike.length > 0) {
      // Unlike: Remove the like
      await db
        .delete(replyLikes)
        .where(and(eq(replyLikes.replyId, replyId), eq(replyLikes.userId, userId)))

      // Decrement likes count
      await db
        .update(reviewReplies)
        .set({ likesCount: sql`${reviewReplies.likesCount} - 1` })
        .where(eq(reviewReplies.id, replyId))

      res.status(200).json({
        success: true,
        message: 'Reply unliked',
        data: { liked: false }
      })
    } else {
      // Like: Add the like
      await db
        .insert(replyLikes)
        .values({
          replyId,
          userId
        })

      // Increment likes count
      await db
        .update(reviewReplies)
        .set({ likesCount: sql`${reviewReplies.likesCount} + 1` })
        .where(eq(reviewReplies.id, replyId))

      res.status(200).json({
        success: true,
        message: 'Reply liked',
        data: { liked: true }
      })
    }
  } catch (error) {
    console.error('Error toggling reply like:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to toggle like',
      error: error.message
    })
  }
}

// Delete a reply
export const deleteReply = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { replyId } = req.params

    // Check if reply exists and belongs to user
    const existingReply = await db
      .select()
      .from(reviewReplies)
      .where(and(eq(reviewReplies.id, replyId), eq(reviewReplies.userId, userId)))
      .limit(1)

    if (!existingReply.length) {
      return res.status(404).json({
        success: false,
        message: 'Reply not found or you do not have permission to delete it'
      })
    }

    // Delete the reply (cascade will handle likes)
    await db
      .delete(reviewReplies)
      .where(and(eq(reviewReplies.id, replyId), eq(reviewReplies.userId, userId)))

    res.status(200).json({
      success: true,
      message: 'Reply deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting reply:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete reply',
      error: error.message
    })
  }
}
