import { Router } from "express";
import { authenticate } from "../middleware/autenticate.js";
import { upload } from "../utils/multer.js";
import {
  uploadResume,
  getResumeStatus,
  getResumeById,
  getUserResumes,
  retryExtraction,
  getExtractionDiagnosticsEndpoint,
} from "../controllers/interview/resume.controller.js";
import {
  createInterview,
  submitAnswer,
  submitAnswersBatch,
  completeInterview,
  getInterviewById,
  getFeedbackReport,
  getQuestionGenerationStatus,
  getActiveJobs,
  getUserInterviewsWithReports,
} from "../controllers/interview/interview.controller.js";
import {
  createCodingInterview,
  submitCodeAnswer,
  handleVapiWebhook,
  completeCodingInterview,
} from "../controllers/interview/codingInterview.controller.js";
import {
  createHumanInterview,
  getWebRTCToken,
  submitManualFeedback,
} from "../controllers/interview/humanInterview.controller.js";
import {
  initiateCall,
  getCallStatusEndpoint,
  handleVapiWebhook as handleTelephonicVapiWebhook,
} from "../controllers/interview/telephonicInterview.controller.js";
import { getActiveInterviewTypes } from "../controllers/admin/interviewType.controller.js";

const router = Router();

// Public routes
router.get("/types", getActiveInterviewTypes); // Get active interview types

// Job routes (authenticated)
router.get("/jobs/active", authenticate, getActiveJobs); // Get active jobs for selection

// Resume routes (authenticated)
router.get("/resume", authenticate, getUserResumes); // Get all user resumes
router.post("/resume/upload", authenticate, upload.single('file'), uploadResume);
router.get("/resume/:resumeId/status", authenticate, getResumeStatus);
router.get("/resume/:resumeId", authenticate, getResumeById);
router.post("/resume/:resumeId/retry-extraction", authenticate, retryExtraction); // Retry extraction for failed resume
router.get("/resume/:resumeId/diagnostics", authenticate, getExtractionDiagnosticsEndpoint); // Get extraction diagnostics

// Interview routes (authenticated)
router.get("/reports", authenticate, getUserInterviewsWithReports); // Get all interviews with reports
router.post("/create", authenticate, createInterview);
router.post("/:interviewId/answer", authenticate, submitAnswer);
router.post("/:interviewId/answers/batch", authenticate, submitAnswersBatch);
router.post("/:interviewId/complete", authenticate, completeInterview);
router.get("/:interviewId/question-status", authenticate, getQuestionGenerationStatus); // Get question generation status
router.get("/:interviewId", authenticate, getInterviewById);
router.get("/:interviewId/feedback", authenticate, getFeedbackReport);

// Coding interview routes
router.post("/coding/:interviewId/code", authenticate, submitCodeAnswer);
router.post("/coding/:interviewId/vapi/webhook", handleVapiWebhook); // Public webhook
router.post("/coding/:interviewId/complete", authenticate, completeCodingInterview);

// Human interview routes
router.post("/human/create", authenticate, createHumanInterview);
router.get("/human/:interviewId/webrtc/token", authenticate, getWebRTCToken);
router.post("/human/:interviewId/feedback", authenticate, submitManualFeedback);

// Telephonic interview routes
router.post("/telephonic/:interviewId/initiate-call", authenticate, initiateCall);
router.get("/telephonic/:interviewId/status", authenticate, getCallStatusEndpoint);
router.post("/telephonic/:interviewId/vapi/webhook", handleTelephonicVapiWebhook); // Public webhook

export default router;


