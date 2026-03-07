import { db } from "../../config/database.js";
import { interviews } from "../../models/interview.model.js";
import { eq } from "drizzle-orm";
import logger from "../../utils/logger.js";
import { randomUUID } from "crypto";

/**
 * Create human-to-human interview
 * POST /interview/human/create
 */
export const createHumanInterview = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { interviewerId, resumeId, interviewSubtypeId, jobRole, jobDescription } = req.body;

    if (!interviewerId || !jobRole) {
      return res.status(400).json({
        success: false,
        message: "Interviewer ID and job role are required",
      });
    }

    // Generate WebRTC room ID
    const webrtcRoomId = `room-${randomUUID()}`;

    // Create interview record
    const [newInterview] = await db
      .insert(interviews)
      .values({
        userId,
        interviewerId,
        resumeId: resumeId || null,
        interviewType: 'human_to_human',
        interviewSubtypeId: interviewSubtypeId || null,
        jobRole,
        jobDescription: jobDescription || null,
        webrtcRoomId,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // TODO: Send notification to interviewer
    // await sendNotificationToInterviewer(interviewerId, newInterview.id);

    logger.info(`Human interview ${newInterview.id} created for user ${userId} with interviewer ${interviewerId}`);

    return res.status(201).json({
      success: true,
      message: "Human interview created successfully",
      data: {
        interviewId: newInterview.id,
        roomId: webrtcRoomId,
        status: newInterview.status,
      },
    });
  } catch (error) {
    logger.error("Error creating human interview:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create human interview",
      error: error.message,
    });
  }
};

/**
 * Get WebRTC token/session
 * GET /interview/human/:interviewId/webrtc/token
 */
export const getWebRTCToken = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.id;

    const [interview] = await db
      .select()
      .from(interviews)
      .where(eq(interviews.id, interviewId))
      .limit(1);

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: "Interview not found",
      });
    }

    // Check if user is participant (either candidate or interviewer)
    if (interview.userId !== userId && interview.interviewerId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this interview",
      });
    }

    if (interview.interviewType !== 'human_to_human') {
      return res.status(400).json({
        success: false,
        message: "This is not a human interview",
      });
    }

    // Generate WebRTC connection details
    // In production, you'd integrate with a WebRTC service like:
    // - Twilio Video
    // - Agora
    // - Custom WebRTC signaling server
    
    const connectionDetails = {
      roomId: interview.webrtcRoomId,
      userId,
      role: interview.userId === userId ? 'candidate' : 'interviewer',
      // Add STUN/TURN server URLs
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // Add TURN servers for production
      ],
      // Add signaling server URL
      signalingUrl: process.env.WEBRTC_SIGNALING_URL || 'ws://localhost:3001',
    };

    return res.status(200).json({
      success: true,
      data: connectionDetails,
    });
  } catch (error) {
    logger.error("Error getting WebRTC token:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get WebRTC token",
      error: error.message,
    });
  }
};

/**
 * Submit manual feedback (from interviewer)
 * POST /interview/human/:interviewId/feedback
 */
export const submitManualFeedback = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.id;
    const { feedback } = req.body;

    if (!feedback) {
      return res.status(400).json({
        success: false,
        message: "Feedback is required",
      });
    }

    const [interview] = await db
      .select()
      .from(interviews)
      .where(eq(interviews.id, interviewId))
      .limit(1);

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: "Interview not found",
      });
    }

    // Only interviewer can submit feedback
    if (interview.interviewerId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only interviewer can submit feedback",
      });
    }

    if (interview.interviewType !== 'human_to_human') {
      return res.status(400).json({
        success: false,
        message: "This is not a human interview",
      });
    }

    // Structure feedback report
    const feedbackReport = {
      type: 'manual',
      submittedBy: userId,
      submittedAt: new Date().toISOString(),
      feedback,
    };

    // Update interview status and feedback
    const [updatedInterview] = await db
      .update(interviews)
      .set({
        status: 'completed',
        feedbackReport,
        updatedAt: new Date(),
      })
      .where(eq(interviews.id, interviewId))
      .returning();

    logger.info(`Manual feedback submitted for interview ${interviewId}`);

    return res.status(200).json({
      success: true,
      message: "Feedback submitted successfully",
      data: {
        interviewId: updatedInterview.id,
        feedbackReport,
      },
    });
  } catch (error) {
    logger.error("Error submitting manual feedback:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit feedback",
      error: error.message,
    });
  }
};

