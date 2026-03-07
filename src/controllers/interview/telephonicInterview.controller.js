import { db } from "../../config/database.js";
import { interviews } from "../../models/interview.model.js";
import { interviewAnswers } from "../../models/interviewAnswer.model.js";
import { interviewTypes } from "../../models/interviewType.model.js";
import { resumes } from "../../models/resume.model.js";
import { eq } from "drizzle-orm";
import logger from "../../utils/logger.js";
import { initiateTelephonicCall, getCallStatus as getVapiCallStatus } from "../../services/vapi/telephonicService.js";
import { generateFeedbackReport } from "../../services/ai/interviewService.js";

/**
 * Initiate telephonic call
 * POST /interview/telephonic/:interviewId/initiate-call
 */
export const initiateCall = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.id;

    // Fetch interview data
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

    // Verify user owns this interview
    if (interview.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this interview",
      });
    }

    // Check if phone number and language are set
    if (!interview.phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number not found for this interview",
      });
    }

    if (!interview.language) {
      return res.status(400).json({
        success: false,
        message: "Language preference not found for this interview",
      });
    }

    // Check if call already initiated
    if (interview.vapiCallId) {
      return res.status(400).json({
        success: false,
        message: "Call already initiated for this interview",
        data: {
          callId: interview.vapiCallId,
        },
      });
    }

    // Check if questions are generated
    if (!interview.generatedQuestions || interview.generatedQuestions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Interview questions not yet generated. Please wait.",
      });
    }

    try {
      // Initiate Vapi call
      const callResult = await initiateTelephonicCall(
        interviewId,
        interview.phoneNumber,
        interview.language,
        interview.generatedQuestions,
        {
          jobRole: interview.jobRole,
          difficultyLevel: interview.difficultyLevel,
        }
      );

      // Update interview with call ID
      await db
        .update(interviews)
        .set({
          vapiCallId: callResult.callId,
          status: 'calling',
          updatedAt: new Date(),
        })
        .where(eq(interviews.id, interviewId));

      logger.info(`Call initiated for interview ${interviewId}. Call ID: ${callResult.callId}`);

      return res.status(200).json({
        success: true,
        message: "Call initiated successfully",
        data: {
          callId: callResult.callId,
          status: 'calling',
        },
      });
    } catch (error) {
      logger.error(`Error initiating call for interview ${interviewId}:`, error);
      
      // Update interview status to failed
      await db
        .update(interviews)
        .set({
          status: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(interviews.id, interviewId));

      return res.status(500).json({
        success: false,
        message: "Failed to initiate call",
        error: error.message,
      });
    }
  } catch (error) {
    logger.error("Error in initiateCall:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Get call status
 * GET /interview/telephonic/:interviewId/status
 */
export const getCallStatusEndpoint = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.id;

    // Fetch interview data
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

    // Verify user owns this interview
    if (interview.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this interview",
      });
    }

    // If call ID exists, get status from Vapi
    let callStatus = null;
    const callId = interview.vapiCallId;
    
    // Debug logging
    logger.info(`getCallStatusEndpoint - interview.vapiCallId: ${callId}, type: ${typeof callId}, interview.status: ${interview.status}`);
    
    // Validate callId before using it
    if (callId && 
        callId !== 'undefined' && 
        callId !== 'null' && 
        callId !== null && 
        typeof callId === 'string' && 
        callId.trim() !== '' &&
        callId.trim().length > 10) { // Basic UUID length check
      try {
        callStatus = await getVapiCallStatus(callId);
        logger.info(`Vapi call status retrieved: ${callStatus.status} for callId: ${callId}`);
        
        // IMPORTANT: If Vapi says call ended but our DB says in_progress, update it!
        // This handles cases where webhook wasn't received
        if ((callStatus.status === 'ended' || callStatus.status === 'completed') && 
            (interview.status === 'in_progress' || interview.status === 'calling')) {
          logger.warn(`⚠️ Call has ended in Vapi (${callStatus.status}) but interview status is ${interview.status}. Updating to completed.`);
          
          await db
            .update(interviews)
            .set({
              status: 'completed',
              updatedAt: new Date(),
            })
            .where(eq(interviews.id, interviewId));
          
          // Trigger report generation in background
          (async () => {
            try {
              // Wait for transcript
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              const messages = callStatus.messages || callStatus.transcript || [];
              if (messages.length > 0) {
                await extractAndStoreAnswers(interviewId, interview, messages);
              }
              
              const [updatedInterview] = await db
                .select()
                .from(interviews)
                .where(eq(interviews.id, interviewId))
                .limit(1);
              
              await generateReportCard(interviewId, updatedInterview || interview);
              logger.info(`✅ Report card generated for interview ${interviewId} (via status check)`);
            } catch (error) {
              logger.error(`Error generating report via status check for interview ${interviewId}:`, error);
            }
          })();
          
          // Update the status we return
          interview.status = 'completed';
        }
      } catch (error) {
        // Only log if it's not a validation error
        if (!error.message.includes('Invalid call ID') && !error.message.includes('Call ID is required')) {
          logger.warn(`Could not fetch call status from Vapi: ${error.message}`);
        } else {
          logger.debug(`Skipping Vapi call status fetch - invalid callId: ${callId}`);
        }
      }
    } else {
      logger.debug(`No valid callId found for interview ${interviewId}. CallId value: ${callId}, type: ${typeof callId}`);
    }

    return res.status(200).json({
      success: true,
      data: {
        interviewId: interview.id,
        status: interview.status,
        phoneNumber: interview.phoneNumber,
        language: interview.language,
        vapiCallId: interview.vapiCallId,
        callStatus: callStatus,
        createdAt: interview.createdAt,
        updatedAt: interview.updatedAt,
      },
    });
  } catch (error) {
    logger.error("Error in getCallStatusEndpoint:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Handle Vapi webhook
 * POST /interview/telephonic/:interviewId/vapi/webhook
 */
export const handleVapiWebhook = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const event = req.body;

    logger.info(`🔔 Vapi webhook received for telephonic interview ${interviewId}`);
    logger.info(`📦 Event type: ${event.type}, Event keys: ${Object.keys(event).join(', ')}`);
    logger.info(`📋 Full event: ${JSON.stringify(event, null, 2)}`);

    // Fetch interview
    const [interview] = await db
      .select()
      .from(interviews)
      .where(eq(interviews.id, interviewId))
      .limit(1);

    if (!interview) {
      logger.warn(`Interview ${interviewId} not found for webhook`);
      return res.status(404).json({
        success: false,
        message: "Interview not found",
      });
    }

    // Handle different Vapi event types
    switch (event.type) {
      case 'call-start':
        // Update interview status to in_progress and store call ID
        const callIdFromEvent = event.call?.id || event.callId;
        if (callIdFromEvent && callIdFromEvent !== 'undefined') {
          await db
            .update(interviews)
            .set({
              vapiCallId: callIdFromEvent,
              status: 'in_progress',
              updatedAt: new Date(),
            })
            .where(eq(interviews.id, interviewId));
          logger.info(`Call started for interview ${interviewId} with call ID: ${callIdFromEvent}`);
        } else {
          // If no call ID in event, keep existing one
          await db
            .update(interviews)
            .set({
              status: 'in_progress',
              updatedAt: new Date(),
            })
            .where(eq(interviews.id, interviewId));
          logger.warn(`Call started for interview ${interviewId} but no call ID in event. Existing call ID: ${interview.vapiCallId}`);
        }
        break;

      case 'call-end':
        logger.info(`🔄 Call-end event received for interview ${interviewId}`);
        logger.info(`📋 Call-end event details: ${JSON.stringify({ 
          callId: event.call?.id, 
          status: event.call?.status,
          endedAt: event.call?.endedAt 
        })}`);
        
        // IMPORTANT: Update status to completed FIRST so frontend can detect it immediately
        await db
          .update(interviews)
          .set({
            status: 'completed',
            updatedAt: new Date(),
          })
          .where(eq(interviews.id, interviewId));
        
        logger.info(`✅ Interview ${interviewId} status updated to 'completed' - frontend will now redirect`);
        
        // Then process transcript and generate report in background (don't block status update)
        (async () => {
          try {
            const callId = event.call?.id || interview.vapiCallId;
            
            // Validate callId before using it - handle null/undefined properly
            const isValidCallId = callId && 
                                  callId !== 'undefined' && 
                                  callId !== 'null' && 
                                  callId !== null && 
                                  typeof callId === 'string' && 
                                  callId.trim() !== '' &&
                                  callId.trim().length >= 10; // Basic UUID length check
            
            if (!isValidCallId) {
              logger.warn(`⚠️ No valid callId found for interview ${interviewId}. Event call ID: ${event.call?.id}, Stored call ID: ${interview.vapiCallId}, Type: ${typeof callId}`);
              // Still try to generate report even without transcript
              try {
                const [updatedInterview] = await db
                  .select()
                  .from(interviews)
                  .where(eq(interviews.id, interviewId))
                  .limit(1);
                await generateReportCard(interviewId, updatedInterview || interview);
                logger.info(`✅ Report card generated for interview ${interviewId} (without transcript)`);
              } catch (reportError) {
                logger.error(`Error generating report without transcript for interview ${interviewId}:`, reportError);
              }
              return;
            }
            
            logger.info(`📞 Processing transcript for interview ${interviewId}, callId: ${callId}`);
            
            // Wait a moment for transcript to be fully available
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            try {
              // Get call details including transcript
              logger.info(`📥 Fetching transcript for callId: ${callId}`);
              const callDetails = await getVapiCallStatus(callId);
              logger.info(`📊 Call details retrieved. Transcript type: ${typeof callDetails.transcript}, Messages: ${Array.isArray(callDetails.messages) ? callDetails.messages.length : 'not array'}`);
              logger.info(`📋 Call details keys: ${Object.keys(callDetails).join(', ')}`);
              
              // Vapi returns messages array with role and content/transcript
              const messages = callDetails.messages || callDetails.transcript || [];
              
              // Log first few messages to see structure
              if (messages.length > 0) {
                logger.info(`📝 Sample message structure (first 2): ${JSON.stringify(messages.slice(0, 2), null, 2)}`);
              } else {
                logger.warn(`⚠️ No messages found. CallDetails structure: ${JSON.stringify({ 
                  hasMessages: !!callDetails.messages, 
                  hasTranscript: !!callDetails.transcript,
                  keys: Object.keys(callDetails)
                })}`);
              }
              
              if (messages.length > 0) {
                // Extract answers from transcript
                logger.info(`📝 Extracting answers from ${messages.length} messages`);
                await extractAndStoreAnswers(interviewId, interview, messages);
                
                // Refresh interview data before generating report
                const [updatedInterview] = await db
                  .select()
                  .from(interviews)
                  .where(eq(interviews.id, interviewId))
                  .limit(1);
                
                // Generate feedback report
                logger.info(`📄 Generating report card for interview ${interviewId}`);
                await generateReportCard(interviewId, updatedInterview || interview);
                logger.info(`✅ Report card generated successfully for interview ${interviewId}`);
              } else {
                logger.warn(`⚠️ No messages found in transcript for interview ${interviewId}. Attempting to generate report anyway.`);
                // Still try to generate report even without messages
                try {
                  const [updatedInterview] = await db
                    .select()
                    .from(interviews)
                    .where(eq(interviews.id, interviewId))
                    .limit(1);
                  await generateReportCard(interviewId, updatedInterview || interview);
                  logger.info(`✅ Report card generated for interview ${interviewId} (with empty transcript)`);
                } catch (reportError) {
                  logger.error(`Error generating report with empty transcript for interview ${interviewId}:`, reportError);
                }
              }
            } catch (transcriptError) {
              logger.error(`❌ Error getting transcript for interview ${interviewId}:`, transcriptError);
              // Still try to generate report even if transcript fetch fails
              try {
                logger.info(`🔄 Attempting to generate report without transcript for interview ${interviewId}`);
                const [updatedInterview] = await db
                  .select()
                  .from(interviews)
                  .where(eq(interviews.id, interviewId))
                  .limit(1);
                await generateReportCard(interviewId, updatedInterview || interview);
                logger.info(`✅ Report card generated for interview ${interviewId} (after transcript error)`);
              } catch (reportError) {
                logger.error(`Error generating report after transcript error for interview ${interviewId}:`, reportError);
              }
            }
          } catch (error) {
            logger.error(`❌ Error processing transcript for interview ${interviewId}:`, error);
            // Final fallback - try to generate report anyway
            try {
              logger.info(`🔄 Final attempt to generate report for interview ${interviewId}`);
              const [updatedInterview] = await db
                .select()
                .from(interviews)
                .where(eq(interviews.id, interviewId))
                .limit(1);
              await generateReportCard(interviewId, updatedInterview || interview);
              logger.info(`✅ Report card generated for interview ${interviewId} (final fallback)`);
            } catch (reportError) {
              logger.error(`Error in final report generation attempt for interview ${interviewId}:`, reportError);
            }
          }
        })();
        
        break;

      case 'message':
        // Store transcript messages if needed
        // The transcript is available in event.message
        if (event.message?.type === 'transcript' && event.message?.transcript) {
          // You can store transcripts in a separate table or in the interview record
          logger.debug(`Transcript received for interview ${interviewId}: ${event.message.transcript.substring(0, 50)}...`);
        }
        break;
      
      case 'transcript':
        // Handle transcript updates
        if (event.transcript) {
          logger.debug(`Full transcript received for interview ${interviewId}`);
        }
        break;

      case 'function-call':
        // Handle function calls from Vapi if needed
        logger.debug(`Function call received for interview ${interviewId}`);
        break;

      default:
        logger.debug(`Unhandled Vapi event type: ${event.type} for interview ${interviewId}`);
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
 * Extract answers from transcript and store them
 */
const extractAndStoreAnswers = async (interviewId, interview, transcript) => {
  try {
    if (!interview.generatedQuestions || interview.generatedQuestions.length === 0) {
      logger.warn(`No questions found for interview ${interviewId}`);
      return;
    }

    // Parse transcript - Vapi returns messages array
    let messages = [];
    if (Array.isArray(transcript)) {
      messages = transcript;
    } else if (typeof transcript === 'string') {
      // Try to parse as JSON
      try {
        const parsed = JSON.parse(transcript);
        messages = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // If not JSON, treat as plain text
        messages = [{ role: 'user', content: transcript }];
      }
    } else if (transcript && typeof transcript === 'object') {
      // If it's an object, try to extract messages
      messages = transcript.messages || transcript.transcript || [transcript];
    }

    logger.info(`📝 Extracting answers from ${messages.length} messages for interview ${interviewId}`);
    
    // Log message structure for debugging
    if (messages.length > 0) {
      logger.info(`📋 First message structure: ${JSON.stringify(messages[0], null, 2)}`);
      logger.info(`📋 All message roles: ${messages.map(m => m.role || m.type || 'unknown').join(', ')}`);
    }

    // Extract user (candidate) messages as answers
    // Vapi messages have role: 'user' or 'assistant' and content/transcript field
    const userMessages = messages
      .filter(msg => {
        const role = msg.role || msg.type || '';
        const isUser = role === 'user' || role === 'customer' || role === 'user-message';
        if (isUser) {
          logger.debug(`✅ Found user message with role: ${role}, content length: ${(msg.content || msg.transcript || msg.text || msg.message || '').length}`);
        }
        return isUser;
      })
      .map(msg => {
        // Extract text from various possible fields
        const text = msg.content || msg.transcript || msg.text || msg.message || '';
        logger.debug(`📄 Extracted text: ${text.substring(0, 100)}...`);
        return text.trim();
      })
      .filter(text => text.length > 0);

    logger.info(`✅ Found ${userMessages.length} user messages with content (out of ${messages.length} total messages)`);

    // Match answers to questions (sequential approach)
    const questions = interview.generatedQuestions;
    const answersToStore = [];

    // Use sequential matching - each user message after an assistant question is an answer
    let answerIndex = 0;
    for (let i = 0; i < questions.length && answerIndex < userMessages.length; i++) {
      const question = questions[i];
      const answerText = userMessages[answerIndex];

      if (answerText && answerText.trim()) {
        answersToStore.push({
          interviewId,
          questionId: question.id || `q${i}`,
          questionIndex: i,
          textAnswer: answerText.trim(),
          transcription: answerText.trim(),
          createdAt: new Date(),
        });
        answerIndex++;
      }
    }

    // Store answers in database
    if (answersToStore.length > 0) {
      // Delete existing answers for this interview to avoid duplicates
      await db
        .delete(interviewAnswers)
        .where(eq(interviewAnswers.interviewId, interviewId));
      
      await db.insert(interviewAnswers).values(answersToStore);
      logger.info(`Stored ${answersToStore.length} answers for interview ${interviewId}`);
    } else {
      logger.warn(`No answers extracted from transcript for interview ${interviewId}. Messages structure: ${JSON.stringify(messages.slice(0, 3))}`);
    }
  } catch (error) {
    logger.error(`Error extracting answers for interview ${interviewId}:`, error);
    throw error;
  }
};

/**
 * Generate report card after interview ends
 */
const generateReportCard = async (interviewId, interview) => {
  try {
    // Get all stored answers
    const answers = await db
      .select()
      .from(interviewAnswers)
      .where(eq(interviewAnswers.interviewId, interviewId))
      .orderBy(interviewAnswers.questionIndex);

    if (answers.length === 0) {
      logger.warn(`No answers found for interview ${interviewId}, skipping report generation`);
      return;
    }

    // Fetch interview subtype/category info
    let interviewSubtypeName = null;
    let interviewSubtypeCategory = null;
    let interviewSubtypeDescription = null;
    
    if (interview.interviewSubtypeId) {
      const [subtype] = await db
        .select({ 
          name: interviewTypes.name, 
          category: interviewTypes.category,
          description: interviewTypes.description 
        })
        .from(interviewTypes)
        .where(eq(interviewTypes.id, interview.interviewSubtypeId))
        .limit(1);
      
      if (subtype) {
        interviewSubtypeName = subtype.name;
        interviewSubtypeCategory = subtype.category;
        interviewSubtypeDescription = subtype.description;
      }
    }

    // Fetch resume info if resume-based
    let resumeInfo = null;
    let resumeText = null;
    if (interview.resumeId) {
      const [resume] = await db
        .select({ 
          id: resumes.id,
          fileName: resumes.fileName,
          extractedText: resumes.extractedText 
        })
        .from(resumes)
        .where(eq(resumes.id, interview.resumeId))
        .limit(1);
      
      if (resume) {
        resumeInfo = {
          resumeBased: true,
          fileName: resume.fileName,
          hasResumeText: !!resume.extractedText && resume.extractedText.trim().length > 0,
        };
        if (resume.extractedText && resume.extractedText.trim().length > 0) {
          resumeText = resume.extractedText.trim().substring(0, 2000);
        }
      }
    }

    // Generate feedback report
    let feedbackReport = null;
    try {
      feedbackReport = await generateFeedbackReport(
        {
          jobRole: interview.jobRole,
          jobDescription: interview.jobDescription,
          questions: interview.generatedQuestions,
          answers: answers.map(a => ({
            questionIndex: a.questionIndex,
            textAnswer: a.textAnswer,
            transcription: a.transcription,
            voiceAnalysis: a.voiceAnalysis,
          })),
          interviewCategory: interviewSubtypeCategory || 'telephonic',
          interviewSubtype: interviewSubtypeName,
          interviewSubtypeDescription: interviewSubtypeDescription,
          resumeBased: resumeInfo?.resumeBased || false,
          resumeFileName: resumeInfo?.fileName || null,
          resumeText: resumeText,
          difficultyLevel: interview.difficultyLevel,
        },
        'ai_text_voice'
      );

      // Update interview with feedback report
      await db
        .update(interviews)
        .set({
          feedbackReport,
          updatedAt: new Date(),
        })
        .where(eq(interviews.id, interviewId));

      logger.info(`Report card generated for interview ${interviewId}`);
    } catch (error) {
      logger.error(`Error generating feedback report for interview ${interviewId}:`, error);
      // Continue without feedback report
    }
  } catch (error) {
    logger.error(`Error generating report card for interview ${interviewId}:`, error);
    throw error;
  }
};


