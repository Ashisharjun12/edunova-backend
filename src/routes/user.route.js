import { Router } from 'express';
import { 
  logoutUser, 
  uploadAvatar, 
  checkUser, 
  getLoggedInUser, 
  getUserDetailsApi, 
  getUserStatistics,
  getUserCourses,
  updateProfile,
  googleLogin,
  googleCallback,
  refreshToken
} from '../controllers/user/user.controller.js';
import { getAllColleges } from '../controllers/teacher/teacherBranch.controller.js';
import { authenticate } from '../middleware/autenticate.js';

import { _config } from '../config/config.js';
import { enrollInCourse, setLessonCompletion, getEnrollment, unenrollFromCourse, getStudentEnrollments, getCourseMembers } from '../controllers/user/enrollment.controller.js';
import { getCourseStats } from '../controllers/user/singleCourse.controller.js';
import { getCourseEvents, createCourseEvent, updateCourseEvent, deleteCourseEvent } from '../controllers/user/eventCalendar.controller.js';
import { joinMeeting, getCourseMeetingsForStudent } from '../controllers/teacher/meeting.controller.js';
import { getCourseAssignments, getAssignmentById, submitQuizAssignment, submitPDFAssignment, getMySubmissions } from '../controllers/user/assignment.controller.js';
import { getStudentCourseAnnouncements } from '../controllers/user/announcement.controller.js';
import { streamAnnouncements } from '../controllers/user/announcementSSE.controller.js';
import { upload } from '../utils/multer.js';

const router = Router();

// OAuth Routes - Google Login Only
router.get('/google', googleLogin);
router.get('/google/callback', googleCallback);

// Token Management
router.post('/refresh', refreshToken);

// Logout Route
router.post('/logout', authenticate, logoutUser);

// User Info Routes
router.get('/check', authenticate, checkUser);
router.get('/me', authenticate, getLoggedInUser);
router.get('/details/:userId', getUserDetailsApi);
router.put('/profile', authenticate, updateProfile);
router.get('/statistics', authenticate, getUserStatistics);
router.get('/courses', authenticate, getUserCourses);

// Public colleges route for profile selection
router.get('/colleges', getAllColleges);

// Course enrollments
router.post('/enrollments/:courseId', authenticate, enrollInCourse);
router.delete('/enrollments/:courseId', authenticate, unenrollFromCourse);
router.get('/enrollments/:courseId', authenticate, getEnrollment);
router.get('/enrollments/student/:userId', authenticate, getStudentEnrollments);
router.post('/enrollments/:courseId/lessons/:lessonId/complete', authenticate, setLessonCompletion);

// Single course stats - requires enrollment
router.get('/courses/:courseId/stats', authenticate, getCourseStats);

// Course events - students can view, admin/teacher can manage
router.get('/courses/:courseId/events', authenticate, getCourseEvents);
router.post('/courses/:courseId/events', authenticate, createCourseEvent);
router.put('/courses/:courseId/events/:eventId', authenticate, updateCourseEvent);
router.delete('/courses/:courseId/events/:eventId', authenticate, deleteCourseEvent);

// Course meetings (student access)
router.get('/courses/:courseId/meetings', authenticate, getCourseMeetingsForStudent); // Get meetings for enrolled course
router.get('/courses/:courseId/meetings/:meetingId/join', authenticate, joinMeeting); // Join a meeting

// Course members
router.get('/courses/:courseId/members', authenticate, getCourseMembers); // Get enrolled members for a course

// Course assignments (student access - requires enrollment)
router.get('/courses/:courseId/assignments', authenticate, getCourseAssignments); // Get assignments for a course
router.get('/courses/:courseId/assignments/:assignmentId', authenticate, getAssignmentById); // Get assignment details with questions
router.post('/courses/:courseId/assignments/:assignmentId/submit-quiz', authenticate, submitQuizAssignment); // Submit quiz assignment
router.post('/courses/:courseId/assignments/:assignmentId/submit-pdf', upload.single('file'), authenticate, submitPDFAssignment); // Submit PDF assignment (with file upload)
router.get('/courses/:courseId/assignments/:assignmentId/submissions', authenticate, getMySubmissions); // Get user's submissions

// Course announcements (student access - requires enrollment and published course)
router.get('/courses/:courseId/announcements', authenticate, getStudentCourseAnnouncements); // Get course announcements
router.get('/courses/:courseId/announcements/stream', streamAnnouncements); // SSE stream for real-time announcements (auth handled in controller via query param)

export default router;