import express from 'express'
import { authenticate } from '../middleware/autenticate.js'
import { 
  createReview, 
  getCourseReviews, 
  updateReview, 
  deleteReview, 
  getUserCourseReview,
  toggleReviewLike,
  addReviewReply,
  getReviewReplies,
  toggleReplyLike,
  deleteReply
} from '../controllers/review/review.controller.js'

const router = express.Router()

// Public routes
router.get('/course/:courseId', getCourseReviews) // Get reviews for a course (public)

// Protected routes (require authentication)
router.post('/', authenticate, createReview) // Create a new review
router.get('/user/:courseId', authenticate, getUserCourseReview) // Get user's review for a course
router.put('/:reviewId', authenticate, updateReview) // Update a review
router.delete('/:reviewId', authenticate, deleteReview) // Delete a review

// Review likes
router.post('/:reviewId/like', authenticate, toggleReviewLike) // Like/Unlike a review

// Review replies
router.post('/:reviewId/replies', authenticate, addReviewReply) // Add a reply to a review
router.get('/:reviewId/replies', getReviewReplies) // Get replies for a review (public)
router.post('/replies/:replyId/like', authenticate, toggleReplyLike) // Like/Unlike a reply
router.delete('/replies/:replyId', authenticate, deleteReply) // Delete a reply

export default router
