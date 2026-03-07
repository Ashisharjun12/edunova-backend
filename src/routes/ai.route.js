import { Router } from "express";
import { getLessonTranscript, chatWithLessonAI } from "../controllers/ai/ai.controller.js";
import { generateCourse, generateCourseDetailsOnly, generateSectionsOnly } from "../controllers/ai/courseGeneration.controller.js";
import { authenticate } from "../middleware/autenticate.js";
import { customrole } from "../middleware/customRole.js";

const router = Router();

// Get transcript for a lesson
router.get("/transcript/:lessonId", authenticate, getLessonTranscript);

// Chat with AI about a lesson
router.post("/chat/:lessonId", authenticate, chatWithLessonAI);

// AI Course Generation (Teacher/Admin only)
router.post("/generate-course", authenticate, customrole(["teacher", "admin"]), generateCourse);
router.post("/generate-course-details", authenticate, customrole(["teacher", "admin"]), generateCourseDetailsOnly);
router.post("/generate-sections", authenticate, customrole(["teacher", "admin"]), generateSectionsOnly);

export default router;