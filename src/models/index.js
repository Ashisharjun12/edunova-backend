// User models and enums
import { users, USER_ROLE } from "./user.model.js";

// Branch models
import { branches, semesters, subjects } from "./branch.model.js";

// Course models and enums
import { 
  courses, 
  sections, 
  lessons, 
  courseMaterials,
  quizQuestions, 
  quizOptions,
  COURSE_STATUS,
  LESSON_TYPE 
} from "./course.model.js";

// Enrollment models
import { enrollments, enrollmentLessons } from "./enrollement.model.js";

import { lessonChats, lessonChatMessages } from "./lessonChat.model.js";

// Discussion models
import { discussions, discussionLikes, discussionMentions } from "./discussion.model.js";

// Document models
import { images } from "./document.model.js";

// Review models
import { reviews, reviewLikes, reviewReplies, replyLikes, REVIEW_RATING } from "./review.model.js";

// Event calendar models
import { courseEvents, EVENT_COLOR } from "./eventcalender.model.js";

// Meeting models
import { meetings, meetingParticipants, MEETING_TYPE, MEETING_STATUS } from "./meeting.model.js";

// Assignment models
import { assignments, assignmentSubmissions, quizSubmissions, pdfSubmissions, ASSIGNMENT_TYPE, SUBMISSION_STATUS } from "./assignment.model.js";

// Notification models
import { notifications, NOTIFICATION_TYPE } from "./notification.model.js";

// Announcement models
import { announcements } from "./announcement.model.js";

// Chat models
import { conversations, chatMessages, SENDER_ROLE } from "./chat.model.js";

// Admin Settings models
import { adminSettings } from "./adminSettings.model.js";

// Interview models
import { resumes } from "./resume.model.js";
import { interviewTypes } from "./interviewType.model.js";
import { interviews } from "./interview.model.js";
import { interviewAnswers } from "./interviewAnswer.model.js";

// Job models
import { jobs } from "./job.model.js";

// AI Config models

// Export all models
export {
  // User related
  users,
  USER_ROLE,
  
  // Branch related
  branches,
  semesters,
  subjects,
  
  // Course related
  courses,
  sections,
  lessons,
  courseMaterials,
  quizQuestions,
  quizOptions,
  COURSE_STATUS,
  LESSON_TYPE,
  
  // Enrollment related
  enrollments,
  enrollmentLessons,
  
  // Lesson chat related
  lessonChats,
  lessonChatMessages,
  
  // Discussion related
  discussions,
  discussionLikes,
  discussionMentions,
  
  // Document related
  images,
  
  // Review related
  reviews,
  reviewLikes,
  reviewReplies,
  replyLikes,
  REVIEW_RATING,
  
  // Event calendar related
  courseEvents,
  EVENT_COLOR,
  
  // Meeting related
  meetings,
  meetingParticipants,
  MEETING_TYPE,
  MEETING_STATUS,
  
  // Assignment related
  assignments,
  assignmentSubmissions,
  quizSubmissions,
  pdfSubmissions,
  ASSIGNMENT_TYPE,
  SUBMISSION_STATUS,
  
  // Notification related
  notifications,
  NOTIFICATION_TYPE,
  
  // Announcement related
  announcements,
  
  // Chat related
  conversations,
  chatMessages,
  SENDER_ROLE,
  
  // Admin Settings related
  adminSettings,
  
  // Interview related
  resumes,
  interviewTypes,
  interviews,
  interviewAnswers,
  
  // Job related
  jobs,
  
};

// Export all as default for convenience
export default {
  // User related
  users,
  USER_ROLE,
  
  // Branch related
  branches,
  semesters,
  subjects,
  
  // Course related
  courses,
  sections,
  lessons,
  courseMaterials,
  quizQuestions,
  quizOptions,
  COURSE_STATUS,
  LESSON_TYPE,
  
  // Enrollment related
  enrollments,
  enrollmentLessons,
  
  // Lesson chat related
  lessonChats,
  lessonChatMessages,
  
  // Discussion related
  discussions,
  discussionLikes,
  discussionMentions,
  
  // Document related
  images,
  
  // Review related
  reviews,
  reviewLikes,
  reviewReplies,
  replyLikes,
  REVIEW_RATING,
  
  // Event calendar related
  courseEvents,
  EVENT_COLOR,
  
  // Meeting related
  meetings,
  meetingParticipants,
  MEETING_TYPE,
  MEETING_STATUS,
  
  // Assignment related
  assignments,
  assignmentSubmissions,
  quizSubmissions,
  pdfSubmissions,
  ASSIGNMENT_TYPE,
  SUBMISSION_STATUS,
  
  // Notification related
  notifications,
  NOTIFICATION_TYPE,
  
  // Announcement related
  announcements,
  
  // Chat related
  conversations,
  chatMessages,
  SENDER_ROLE,
  
  // Admin Settings related
  adminSettings,
  
  // Interview related
  resumes,
  interviewTypes,
  interviews,
  interviewAnswers,
  
  // Job related
  jobs,
  
};
