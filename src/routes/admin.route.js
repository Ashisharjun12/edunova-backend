import { Router } from "express";
import {
  changeUserRole,
  deleteUserByIdByAdmin,
  getAllUsersAdmin,
  getUserByIdAdmin,
} from "../controllers/admin/adminUser.controller.js";
import { customrole } from "../middleware/customRole.js";
import {
  deleteCourseByIdAdmin,
  getAllCoursesAdmin,
  getCourseByIdAdmin,
  updateCourseByIdAdmin,
} from "../controllers/admin/adminCourse.controller.js";
import {
  adminGetCourseAnalytics,
  getAdminAnalytics,
  getUserAnalyticsAdmin,
} from "../controllers/admin/adminAnalytics.controller.js";
import { authenticate } from "../middleware/autenticate.js";
import {
  createBranchByAdmin,
  createCollegeByAdmin,
  createSemester,
  createSubjectByAdmin,
  deleteBranchByIdAdmin,
  deleteCollegeByIdAdmin,
  deleteSemesterById,
  deleteSubjectByIdAdmin,
  getAllBranchByAdmin,
  getAllCollgesByAdmin,
  getAllSemester,
  getAllSubjectByAdmin,
  getBranchByIdAdmin,
  getCollegeByIdAdmin,
  getSemesterById,
  getSubjectByIdAdmin,
  updateBranchByIdAdmin,
  updateCollegeByIdAdmin,
  updateSemesterById,
  updateSubjectByIdAdmin,
} from "../controllers/admin/adminBranch.controller.js";
import { upload } from "../utils/multer.js";
import { createAdminNotification, getAdminNotifications, updateNotificationExpirationAdmin, deleteNotificationAdmin } from "../controllers/admin/notification.controller.js";
import { getThemeSetting, updateThemeSetting } from "../controllers/admin/settings.controller.js";
import {
  createInterviewType,
  getAllInterviewTypes,
  getInterviewTypeById,
  updateInterviewType,
  deleteInterviewType,
  generateInterviewTypeName,
} from "../controllers/admin/interviewType.controller.js";
import {
  createJob,
  getAllJobs,
  getJobById,
  updateJob,
  deleteJob,
  getActiveJobs,
  generateJobName,
} from "../controllers/admin/job.controller.js";

const router = Router();

// Public route for theme (no auth needed)
router.get("/settings/theme", getThemeSetting);

// Authenticate all admin routes first
router.use(authenticate);
// ------user management--------
router.get("/users", customrole(["admin"]), getAllUsersAdmin);
router.get("/users/:id", customrole(["admin"]), getUserByIdAdmin);
router.put("/changeRole/:role", customrole(["admin"]), changeUserRole);
router.delete("/users/:id", customrole(["admin"]), deleteUserByIdByAdmin);

//-----course managemnet-----------
router.get("/courses", customrole(["admin"]), getAllCoursesAdmin);
router.get("/courses/:id", customrole(["admin"]), getCourseByIdAdmin);
router.put("/courses/:id", customrole(["admin"]), updateCourseByIdAdmin);
router.delete("/courses/:id", customrole(["admin"]), deleteCourseByIdAdmin);

//----------analytics management--------------
router.get("/analytics/overview", customrole(["admin"]), getAdminAnalytics);
router.get(
  "/analytics/courses",
  customrole(["admin"]),
  adminGetCourseAnalytics
);
router.get("/analytics/users", customrole(["admin"]), getUserAnalyticsAdmin);

//-------college/branch/semester management------------

//----college management----
router.post("/colleges", customrole(["admin"]), upload.single("logo"), createCollegeByAdmin);
router.get("/colleges", customrole(["admin"]), getAllCollgesByAdmin);
router.get("/colleges/:id", customrole(["admin"]), getCollegeByIdAdmin);
router.put("/colleges/:id", customrole(["admin"]), upload.single("logo"), updateCollegeByIdAdmin);
router.delete("/colleges/:id", customrole(["admin"]), deleteCollegeByIdAdmin);

//------branch managemnet-------

router.post("/branches", customrole(["admin"]), createBranchByAdmin);
router.get("/branches", customrole(["admin"]), getAllBranchByAdmin);
router.get("/branches/:id", customrole(["admin"]), getBranchByIdAdmin);
router.put("/branches/:id", customrole(["admin"]), updateBranchByIdAdmin);
router.delete("/branches/:id", customrole(["admin"]), deleteBranchByIdAdmin);

//----semester managemnt----
router.post("/semesters", customrole(["admin"]), createSemester);
router.get("/semesters", customrole(["admin"]), getAllSemester);
router.get("/semesters/:id", customrole(["admin"]), getSemesterById);
router.put("/semesters/:id", customrole(["admin"]), updateSemesterById);
router.delete("/semesters/:id", customrole(["admin"]), deleteSemesterById);

//-------subject managemnet--------
router.post('/subjects',customrole(['admin']),createSubjectByAdmin)
router.get('/subjects',customrole(['admin']),getAllSubjectByAdmin)
router.get('/subjects/:id',customrole(['admin']),getSubjectByIdAdmin)
router.put('/subjects/:id',customrole(['admin']),updateSubjectByIdAdmin)
router.delete('/subjects/:id',customrole(['admin']),deleteSubjectByIdAdmin)

//-------notification management--------
router.post('/notifications', customrole(['admin']), createAdminNotification)
router.get('/notifications', customrole(['admin']), getAdminNotifications)
router.put('/notifications/:id/expiration', customrole(['admin']), updateNotificationExpirationAdmin)
router.delete('/notifications/:id', customrole(['admin']), deleteNotificationAdmin)

//-------theme settings management--------
router.put('/settings/theme', customrole(['admin']), updateThemeSetting)

//-------interview type management--------
router.post('/interview-types', customrole(['admin']), createInterviewType)
router.post('/interview-types/generate-name', customrole(['admin']), generateInterviewTypeName)
router.get('/interview-types', customrole(['admin']), getAllInterviewTypes)
router.get('/interview-types/:id', customrole(['admin']), getInterviewTypeById)
router.put('/interview-types/:id', customrole(['admin']), updateInterviewType)
router.delete('/interview-types/:id', customrole(['admin']), deleteInterviewType)

//-------job management--------
router.post('/jobs', customrole(['admin']), createJob)
router.post('/jobs/generate', customrole(['admin']), generateJobName) // AI generation
router.get('/jobs', customrole(['admin']), getAllJobs)
router.get('/jobs/active', getActiveJobs) // Public endpoint for user selection
router.get('/jobs/:id', customrole(['admin']), getJobById)
router.put('/jobs/:id', customrole(['admin']), updateJob)
router.delete('/jobs/:id', customrole(['admin']), deleteJob)


export default router;
