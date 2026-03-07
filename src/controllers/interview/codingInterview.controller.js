import { db } from "../../config/database.js";
import { interviews } from "../../models/interview.model.js";
import { interviewAnswers } from "../../models/interviewAnswer.model.js";
import { eq } from "drizzle-orm";
import { generateCodingQuestions, executeCode, generateFeedbackReport } from "../../services/ai/interviewService.js";
import logger from "../../utils/logger.js";

/**
 * Create coding interview
 * POST /interview/create (with interviewType='ai_coding')
 */
export const createCodingInterview = async (req, res) => {
  try {
    // This is handled by the main createInterview controller
    // This function can be used for additional coding-specific setup if needed
    return res.status(400).json({
      success: false,
      message: "Use /interview/create with interviewType='ai_coding'",
    });
  } catch (error) {
    logger.error("Error creating coding interview:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create coding interview",
      error: error.message,
    });
  }
};

/**
 * Submit code answer
 * POST /interview/coding/:interviewId/code
 */
export const submitCodeAnswer = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.id;
    const { questionIndex, code, language } = req.body;

    if (questionIndex === undefined || !code || !language) {
      return res.status(400).json({
        success: false,
        message: "Question index, code, and language are required",
      });
    }

    // Get interview
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

    if (interview.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this interview",
      });
    }

    if (interview.interviewType !== 'ai_coding') {
      return res.status(400).json({
        success: false,
        message: "This is not a coding interview",
      });
    }

    if (interview.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: "Interview is already completed",
      });
    }

    // Get question
    const question = interview.generatedQuestions[questionIndex];
    if (!question) {
      return res.status(400).json({
        success: false,
        message: "Invalid question index",
      });
    }

    // Execute code
    const testCases = question.testCases || [];
    const executionResult = await executeCode(code, language, testCases);

    // Store answer
    const [newAnswer] = await db
      .insert(interviewAnswers)
      .values({
        interviewId,
        questionId: question.id,
        questionIndex,
        codeAnswer: code,
        codeExecutionResult: executionResult,
        createdAt: new Date(),
      })
      .returning();

    // Update interview status to in_progress
    if (interview.status === 'pending') {
      await db
        .update(interviews)
        .set({
          status: 'in_progress',
          updatedAt: new Date(),
        })
        .where(eq(interviews.id, interviewId));
    }

    logger.info(`Code answer submitted for interview ${interviewId}, question ${questionIndex}`);

    return res.status(200).json({
      success: true,
      message: "Code answer submitted successfully",
      data: {
        answerId: newAnswer.id,
        questionIndex,
        executionResult,
      },
    });
  } catch (error) {
    logger.error("Error submitting code answer:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit code answer",
      error: error.message,
    });
  }
};

/**
 * Handle Vapi webhook
 * POST /interview/coding/:interviewId/vapi/webhook
 */
export const handleVapiWebhook = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const event = req.body;

    logger.info(`Vapi webhook received for interview ${interviewId}:`, event.type);

    // Handle different Vapi event types
    switch (event.type) {
      case 'call-start':
        // Update interview status
        await db
          .update(interviews)
          .set({
            vapiCallId: event.call?.id,
            status: 'in_progress',
            updatedAt: new Date(),
          })
          .where(eq(interviews.id, interviewId));
        break;

      case 'call-end':
        // Interview ended
        await db
          .update(interviews)
          .set({
            updatedAt: new Date(),
          })
          .where(eq(interviews.id, interviewId));
        break;

      case 'function-call':
        // Handle function calls from Vapi
        // This could be used to update interview state based on voice interactions
        break;

      default:
        logger.debug(`Unhandled Vapi event type: ${event.type}`);
    }

    return res.status(200).json({
      success: true,
      message: "Webhook processed",
    });
  } catch (error) {
    logger.error("Error handling Vapi webhook:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process webhook",
      error: error.message,
    });
  }
};

/**
 * Complete coding interview
 * POST /interview/coding/:interviewId/complete
 */
export const completeCodingInterview = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.id;

    // Get interview with answers
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

    if (interview.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this interview",
      });
    }

    if (interview.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: "Interview is already completed",
      });
    }

    // Get all answers
    const answers = await db
      .select()
      .from(interviewAnswers)
      .where(eq(interviewAnswers.interviewId, interviewId))
      .orderBy(interviewAnswers.questionIndex);

    // Generate feedback report
    let feedbackReport = null;
    try {
      feedbackReport = await generateFeedbackReport(
        {
          jobRole: interview.jobRole,
          questions: interview.generatedQuestions,
          answers: answers.map(a => ({
            questionIndex: a.questionIndex,
            codeAnswer: a.codeAnswer,
            codeExecutionResult: a.codeExecutionResult,
          })),
          codeSubmissions: answers.map(a => ({
            code: a.codeAnswer,
            result: a.codeExecutionResult,
          })),
        },
        'ai_coding'
      );
    } catch (error) {
      logger.error("Error generating feedback report:", error);
      // Continue without feedback report
    }

    // Update interview status
    const [updatedInterview] = await db
      .update(interviews)
      .set({
        status: 'completed',
        feedbackReport,
        updatedAt: new Date(),
      })
      .where(eq(interviews.id, interviewId))
      .returning();

    logger.info(`Coding interview ${interviewId} completed`);

    return res.status(200).json({
      success: true,
      message: "Coding interview completed successfully",
      data: {
        interviewId: updatedInterview.id,
        feedbackReport,
      },
    });
  } catch (error) {
    logger.error("Error completing coding interview:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to complete coding interview",
      error: error.message,
    });
  }
};


