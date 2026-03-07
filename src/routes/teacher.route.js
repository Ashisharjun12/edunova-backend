import { Router } from "express"
import { authenticate } from "../middleware/autenticate.js"
import { customrole } from "../middleware/customRole.js"
import {
    getAllColleges,
    getAllBranches,
    getAllSemesters,
    getAllSubjects,
    getSubjectsBySemester,
    getSemestersByBranch
} from "../controllers/teacher/teacherBranch.controller.js"
import {
    initiateYouTubeConnection,
    handleYouTubeCallback,
    getYouTubeStatus,
    refreshYouTubeToken,
    disconnectYouTube,
    getYouTubeVideos,
    getYouTubeVideoDetails
} from "../controllers/teacher/youtube.controller.js"
import { createCourse, addSection, addLesson, uploadMaterial, attachMaterialToLesson, getTeacherCourses, updateCourse, updateCourseStatus, deleteCourse, getCourseById, updateSection, deleteSection, updateLesson, deleteLesson, deleteMaterial, getEnrolledStudents, unenrollStudent, getTeacherStats } from "../controllers/user/teacher.controller.js"
import { getTeacherEvents, getTeacherCourseEvents, createTeacherEvent, createTeacherCourseEvent, updateTeacherCourseEvent, deleteTeacherCourseEvent, assignEventToCourse } from "../controllers/teacher/eventCalendar.controller.js"
import { createMeeting, getCourseMeetings, deleteMeeting, joinMeetingAsTeacher } from "../controllers/teacher/meeting.controller.js"
import { uploadAssignmentPDF, createAssignment, getAssignmentsByCourse, getAssignmentById, generateQuizWithAI, updateAssignment, deleteAssignment, getSubmissions, gradeSubmission, reassignAssignment } from "../controllers/teacher/assignment.controller.js"
import { createAnnouncement, getCourseAnnouncements, updateAnnouncement, deleteAnnouncement } from "../controllers/teacher/announcement.controller.js"
import { generateThumbnail } from "../controllers/teacher/thumbnail.controller.js"
import { upload } from "../utils/multer.js"




const router = Router()


// Authenticate all teacher routes first
router.use(authenticate)

// Dashboard routes
router.get("/stats", customrole(["teacher", "admin"]), getTeacherStats)

// Branch management routes for teachers (read-only access)
router.get("/colleges", customrole(["teacher", "admin"]), getAllColleges)
router.get("/branches", customrole(["teacher", "admin"]), getAllBranches)
router.get("/semesters", customrole(["teacher", "admin"]), getAllSemesters)
router.get("/subjects", customrole(["teacher", "admin"]), getAllSubjects)
router.get("/semesters/:semesterId/subjects", customrole(["teacher", "admin"]), getSubjectsBySemester)
router.get("/branches/:branchId/semesters", customrole(["teacher", "admin"]), getSemestersByBranch)

// YouTube integration routes
router.get("/youtube/connect", customrole(["teacher", "admin"]), initiateYouTubeConnection)
router.get("/youtube/callback", handleYouTubeCallback)
router.get("/youtube/status", customrole(["teacher", "admin"]), getYouTubeStatus)
router.post("/youtube/refresh-token", customrole(["teacher", "admin"]), refreshYouTubeToken)
router.delete("/youtube/disconnect", customrole(["teacher", "admin"]), disconnectYouTube)
router.get("/youtube/videos", customrole(["teacher", "admin"]), getYouTubeVideos)
router.get("/youtube/videos/:videoId", customrole(["teacher", "admin"]), getYouTubeVideoDetails)

// Course builder routes
router.post("/courses", customrole(["teacher", "admin"]), createCourse)
router.get("/courses", customrole(["teacher", "admin"]), getTeacherCourses)
router.patch("/courses/:courseId", customrole(["teacher", "admin"]), updateCourse)
router.patch("/courses/:courseId/status", customrole(["teacher", "admin"]), updateCourseStatus)
router.delete("/courses/:courseId", customrole(["teacher", "admin"]), deleteCourse)
// Public access for viewing a course by id (teacher/admin/user/guest)
router.get("/courses/:courseId", getCourseById)
router.post("/courses/:courseId/sections", customrole(["teacher", "admin"]), addSection)
router.put("/courses/:courseId/sections/:sectionId", customrole(["teacher", "admin"]), updateSection)
router.delete("/courses/:courseId/sections/:sectionId", customrole(["teacher", "admin"]), deleteSection)
router.post("/courses/:courseId/sections/:sectionId/lessons", customrole(["teacher", "admin"]), addLesson)
router.put("/lessons/:lessonId", customrole(["teacher", "admin"]), updateLesson)
router.delete("/lessons/:lessonId", customrole(["teacher", "admin"]), deleteLesson)
router.post("/materials/upload", customrole(["teacher", "admin"]), upload.single('file'), uploadMaterial)
router.post("/lessons/:lessonId/materials", customrole(["teacher", "admin"]), attachMaterialToLesson)
router.delete("/materials/:materialId", customrole(["teacher", "admin"]), deleteMaterial)







// Student management routes
router.get('/students', getEnrolledStudents)
router.delete('/students/:enrollmentId', unenrollStudent)

// Course events management routes (teacher only)
router.get('/events', customrole(["teacher", "admin"]), getTeacherEvents) // Get all teacher events (including standalone)
router.post('/events', customrole(["teacher", "admin"]), createTeacherEvent) // Create standalone event
router.put('/events/:eventId/assign-course', customrole(["teacher", "admin"]), assignEventToCourse) // Assign standalone event to course
router.put('/events/:eventId', customrole(["teacher", "admin"]), updateTeacherCourseEvent) // Update standalone event (courseId is null)
router.delete('/events/:eventId', customrole(["teacher", "admin"]), deleteTeacherCourseEvent) // Delete standalone event
router.get('/courses/:courseId/events', customrole(["teacher", "admin"]), getTeacherCourseEvents) // Get events for a specific course
router.post('/courses/:courseId/events', customrole(["teacher", "admin"]), createTeacherCourseEvent) // Create event for a course
router.put('/courses/:courseId/events/:eventId', customrole(["teacher", "admin"]), updateTeacherCourseEvent) // Update event
router.delete('/courses/:courseId/events/:eventId', customrole(["teacher", "admin"]), deleteTeacherCourseEvent) // Delete event

// Meeting management routes (teacher only)
router.post('/courses/:courseId/meetings', customrole(["teacher", "admin"]), createMeeting) // Create meeting
router.get('/courses/:courseId/meetings', customrole(["teacher", "admin"]), getCourseMeetings) // Get all meetings for a course
router.get('/courses/:courseId/meetings/:meetingId/join', customrole(["teacher", "admin"]), joinMeetingAsTeacher) // Join meeting as teacher
router.delete('/courses/:courseId/meetings/:meetingId', customrole(["teacher", "admin"]), deleteMeeting) // Delete meeting

// Assignment management routes (teacher only)
router.post('/assignments/upload-pdf', customrole(["teacher", "admin"]), upload.single('file'), uploadAssignmentPDF) // Upload PDF for assignment
router.post('/courses/:courseId/assignments', customrole(["teacher", "admin"]), createAssignment) // Create assignment
router.get('/courses/:courseId/assignments', customrole(["teacher", "admin"]), getAssignmentsByCourse) // Get assignments for a course (can filter by lessonId query param)
router.get('/courses/:courseId/assignments/:assignmentId', customrole(["teacher", "admin"]), getAssignmentById) // Get single assignment with questions
router.post('/courses/:courseId/assignments/generate-quiz', customrole(["teacher", "admin"]), generateQuizWithAI) // Generate quiz with AI
router.put('/courses/:courseId/assignments/:assignmentId', customrole(["teacher", "admin"]), updateAssignment) // Update assignment
router.delete('/courses/:courseId/assignments/:assignmentId', customrole(["teacher", "admin"]), deleteAssignment) // Delete assignment
router.get('/assignments/:assignmentId/submissions', customrole(["teacher", "admin"]), getSubmissions) // Get submissions for an assignment
router.post('/assignments/:assignmentId/submissions/:submissionId/grade', customrole(["teacher", "admin"]), gradeSubmission) // Grade a submission
router.post('/courses/:courseId/assignments/:assignmentId/reassign', customrole(["teacher", "admin"]), reassignAssignment) // Reassign assignment to student

// Announcement management routes (teacher only)
router.post('/announcements', customrole(["teacher", "admin"]), createAnnouncement) // Create announcement
router.get('/announcements/:courseId', customrole(["teacher", "admin"]), getCourseAnnouncements) // Get course announcements
router.put('/announcements/:announcementId', customrole(["teacher", "admin"]), updateAnnouncement) // Update announcement
router.delete('/announcements/:announcementId', customrole(["teacher", "admin"]), deleteAnnouncement) // Delete announcement

// Thumbnail generation routes
router.post('/generate-thumbnail', customrole(["teacher", "admin"]), generateThumbnail)

export default router