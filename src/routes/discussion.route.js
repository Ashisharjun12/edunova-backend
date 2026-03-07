import express from 'express';
import { authenticate } from '../middleware/autenticate.js';
import {
  getAllDiscussions,
  getDiscussionsByLessonId,
  getAllDiscussionsOnLesson,
  getDiscussionsOnLessonByUserId,
  createDiscussion,
  toggleDiscussionLike,
  editDiscussion,
  deleteDiscussion,
  getUserMentions,
  markMentionAsRead,
  getDiscussionsByCourseId,
  getAllDiscussionsOnCourse,
  createCourseDiscussion
} from '../controllers/user/discussion.controller.js';

const router = express.Router();

// Get all discussions across all lessons
router.get('/all', getAllDiscussions);

// Get discussions by lesson ID (main discussions only)
router.get('/lesson/:lessonId', getDiscussionsByLessonId);

// Get all discussions on a lesson (including replies)
router.get('/lesson/:lessonId/all', getAllDiscussionsOnLesson);

// Get discussions on lesson by user ID
router.get('/lesson/:lessonId/user/:userId', getDiscussionsOnLessonByUserId);

// Create a new discussion/comment
router.post('/lesson/:lessonId', authenticate, createDiscussion);

// Course-level discussion routes
// Get all discussions for a course (main discussions only)
router.get('/course/:courseId', getDiscussionsByCourseId);

// Get all discussions on a course (including replies)
router.get('/course/:courseId/all', getAllDiscussionsOnCourse);

// Create a course-level discussion (can be course-level or lesson-level within course)
router.post('/course/:courseId', authenticate, createCourseDiscussion);

// Like/Unlike a discussion
router.post('/:discussionId/like', authenticate, toggleDiscussionLike);

// Edit a discussion
router.put('/:discussionId', authenticate, editDiscussion);

// Delete a discussion
router.delete('/:discussionId', authenticate, deleteDiscussion);

// Get user mentions
router.get('/mentions', authenticate, getUserMentions);

// Mark mention as read
router.put('/mentions/:mentionId/read', authenticate, markMentionAsRead);

export default router;
