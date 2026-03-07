import { db } from "../../config/database.js";
import { interviews } from "../../models/interview.model.js";
import { interviewAnswers } from "../../models/interviewAnswer.model.js";
import { resumes } from "../../models/resume.model.js";
import { interviewTypes } from "../../models/interviewType.model.js";
import { jobs } from "../../models/job.model.js";
import { eq, and, desc, or, like } from "drizzle-orm";
import { transcribeVoice, analyzeVoice, analyzeAudioWithAI, generateFeedbackReport } from "../../services/ai/interviewService.js";
import { ImageKit } from "../../services/imagekit.js";
import { RedisCacheConnection } from "../../config/redis.js";
import { generateInterviewQuestions } from "../../services/ai/interviewService.js";
import logger from "../../utils/logger.js";

/**
 * Create interview
 * POST /interview/create
 */
export const createInterview = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { interviewType, resumeId, interviewSubtypeId, jobId, difficultyLevel, phoneNumber, language } = req.body;

    // Check if this is a telephonic interview
    let isTelephonic = false;
    if (interviewSubtypeId) {
      const [subtype] = await db
        .select()
        .from(interviewTypes)
        .where(eq(interviewTypes.id, interviewSubtypeId))
        .limit(1);
      
      if (subtype?.category === 'telephonic') {
        isTelephonic = true;
        if (!phoneNumber || !phoneNumber.trim()) {
          return res.status(400).json({
            success: false,
            message: "Phone number is required for telephonic interviews",
          });
        }
        if (!language || !['hindi', 'english'].includes(language)) {
          return res.status(400).json({
            success: false,
            message: "Language must be 'hindi' or 'english' for telephonic interviews",
          });
        }
      }
    }

    if (!interviewType || !jobId) {
      return res.status(400).json({
        success: false,
        message: "Interview type and job ID are required",
      });
    }

    if (!['ai_text_voice', 'ai_coding', 'human_to_human'].includes(interviewType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid interview type",
      });
    }

    if (difficultyLevel && !['easy', 'medium', 'hard'].includes(difficultyLevel)) {
      return res.status(400).json({
        success: false,
        message: "Difficulty level must be 'easy', 'medium', or 'hard'",
      });
    }

    // Fetch job details
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    if (!job.isActive) {
      return res.status(400).json({
        success: false,
        message: "Selected job is not active",
      });
    }

    // Validate resume if provided and check if text extraction is needed
    let resumeData = null;
    let needsTextExtraction = false;
    
    if (resumeId) {
      const [resume] = await db
        .select()
        .from(resumes)
        .where(eq(resumes.id, resumeId))
        .limit(1);

      if (!resume) {
        return res.status(404).json({
          success: false,
          message: "Resume not found",
        });
      }

      if (resume.userId !== userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized access to this resume",
        });
      }

      resumeData = resume;

      // Check if text extraction is needed
      if (!resume.extractedText || resume.extractedText.trim().length === 0) {
        needsTextExtraction = true;
        
        // Check if file buffer exists in Redis
        const bufferKey = `resume-buffer:${resumeId}`;
        const bufferExists = await RedisCacheConnection.exists(bufferKey);
        
        if (!bufferExists) {
          // Buffer expired - try to fetch from ImageKit URL
          logger.info(`Resume buffer not in Redis for ${resumeId}, attempting to fetch from ImageKit`);
          const [resumeForFetch] = await db
            .select({ fileUrl: resumes.fileUrl, fileName: resumes.fileName })
            .from(resumes)
            .where(eq(resumes.id, resumeId))
            .limit(1);

          if (resumeForFetch && resumeForFetch.fileUrl) {
            try {
              // Fetch file from ImageKit URL
              const fetch = (await import('node-fetch')).default;
              const response = await fetch(resumeForFetch.fileUrl);
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const fileBuffer = Buffer.from(arrayBuffer);
                // Store in Redis for processing
                await RedisCacheConnection.setex(bufferKey, 3600, fileBuffer.toString('base64'));
                logger.info(`Successfully fetched and cached resume file from ImageKit for ${resumeId}`);
              } else {
                return res.status(400).json({
                  success: false,
                  message: "Resume file not available. Please re-upload the resume.",
                });
              }
            } catch (fetchError) {
              logger.error(`Error fetching file from ImageKit:`, fetchError);
              return res.status(400).json({
                success: false,
                message: "Resume file not available. Please re-upload the resume.",
              });
            }
          } else {
            return res.status(400).json({
              success: false,
              message: "Resume file buffer not available. Please re-upload the resume.",
            });
          }
        }
      }

      // Note: Vector processing removed - using direct text extraction only
    }

    // Create interview record with 'generating' status
    const [newInterview] = await db
      .insert(interviews)
      .values({
        userId,
        resumeId: resumeId || null,
        interviewType,
        interviewSubtypeId: interviewSubtypeId || null,
        jobId: jobId,
        jobRole: job.name, // Keep for backward compatibility
        jobDescription: job.description || null,
        difficultyLevel: difficultyLevel || 'medium',
        phoneNumber: isTelephonic ? phoneNumber.trim() : null,
        language: isTelephonic ? language : null,
        questionGenerationStatus: interviewType !== 'human_to_human' ? 'generating' : 'pending',
        generatedQuestions: [],
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Fast path: Extract text → Generate questions
    if (interviewType !== 'human_to_human') {
      try {
        let extractedText = null;
        let interviewSubtypeName = null;
        let interviewSubtypeCategory = null;

        // Step 1: Extract text synchronously if needed (SIMPLIFIED - no queues)
        if (needsTextExtraction && resumeId) {
          logger.info(`[Simplified Path] Extracting text synchronously from resume ${resumeId}`);
          
          try {
          // Get file buffer from Redis
          const bufferKey = `resume-buffer:${resumeId}`;
          let bufferBase64 = await RedisCacheConnection.get(bufferKey);
          let fileBuffer;
          
          if (!bufferBase64) {
              logger.warn(`[Simplified Path] Resume buffer not in Redis for ${resumeId}, checking if text already extracted`);
              // Check if text was already extracted
              const [existingResume] = await db
                .select({ extractedText: resumes.extractedText })
                .from(resumes)
                .where(eq(resumes.id, resumeId))
                .limit(1);
              
              if (existingResume?.extractedText) {
                extractedText = existingResume.extractedText;
                logger.info(`[Simplified Path] Using existing extracted text (${extractedText.length} chars)`);
          } else {
                logger.warn(`[Simplified Path] No buffer and no extracted text found for resume ${resumeId}`);
                // Continue without resume text
              }
            } else {
              fileBuffer = Buffer.from(bufferBase64, 'base64');
              
              // Extract text synchronously using direct function call
              const { extractTextFromPDF } = await import('../../utils/pdfExtraction.js');
              const extractionResult = await extractTextFromPDF(fileBuffer, {
                fileName: resumeData.fileName,
                minTextLength: 50,
              });

              if (extractionResult.success) {
                extractedText = extractionResult.text;
                
                // Save extracted text to database
                await db
                  .update(resumes)
                  .set({
                    extractedText,
                    processingStatus: 'text_extracted',
                    updatedAt: new Date(),
                  })
                  .where(eq(resumes.id, resumeId));
                
                logger.info(`[Simplified Path] Successfully extracted and saved text (${extractedText.length} chars)`);
          } else {
                logger.error(`[Simplified Path] PDF extraction failed: ${extractionResult.error}`);
                // Continue without resume text
              }
            }
          } catch (extractionError) {
            logger.error(`[Simplified Path] Error during synchronous extraction:`, extractionError);
            // Continue without resume text - don't fail the whole interview creation
          }
        } else if (resumeId && resumeData && resumeData.extractedText) {
          // Text already extracted
          extractedText = resumeData.extractedText;
          logger.info(`[Simplified Path] Using existing extracted text (${extractedText.length} chars)`);
        }

        // Step 2: Fetch interview subtype details if provided
        let interviewSubtypeDescription = null;
        if (interviewSubtypeId) {
          const [subtype] = await db
            .select({ 
              name: interviewTypes.name, 
              category: interviewTypes.category,
              description: interviewTypes.description 
            })
            .from(interviewTypes)
            .where(eq(interviewTypes.id, interviewSubtypeId))
            .limit(1);
          
          if (subtype) {
            interviewSubtypeName = subtype.name;
            interviewSubtypeCategory = subtype.category;
            interviewSubtypeDescription = subtype.description;
          }
        }

        // Step 3: Generate questions immediately using extracted text (SIMPLIFIED)
        logger.info(`[Simplified Path] Generating questions for interview ${newInterview.id}`);
        logger.info(`[Simplified Path] Interview type: ${interviewType}, Is telephonic: ${isTelephonic}`);
        logger.info(`[Simplified Path] Resume text available: ${extractedText ? extractedText.length + ' chars' : 'none'}`);
        if (isTelephonic && extractedText) {
          logger.info(`[Telephonic Interview] Resume-based questions will be generated for telephonic interview`);
        } else if (isTelephonic && !extractedText) {
          logger.info(`[Telephonic Interview] No resume provided - generating general questions for telephonic interview`);
        }
        
        const generatedQuestions = await generateInterviewQuestions(
          extractedText || null, // Use extracted text if available - works for telephonic interviews too
          job.name,
          job.description || null,
          interviewSubtypeName,
          interviewType,
          interviewSubtypeCategory,
          difficultyLevel || 'medium',
          interviewSubtypeDescription // Pass category description
        );

        // Step 4: Update interview with generated questions
        await db
          .update(interviews)
          .set({
            generatedQuestions,
            questionGenerationStatus: 'completed',
            status: 'pending', // Ready to start
            updatedAt: new Date(),
          })
          .where(eq(interviews.id, newInterview.id));

        logger.info(`[Simplified Path] Generated ${generatedQuestions.length} questions for interview ${newInterview.id}`);

      } catch (error) {
        logger.error(`[Simplified Path] Error in question generation:`, error);
        // Update status to failed
        await db
          .update(interviews)
          .set({
            questionGenerationStatus: 'failed',
            updatedAt: new Date(),
          })
          .where(eq(interviews.id, newInterview.id));
        
        return res.status(500).json({
          success: false,
          message: "Failed to generate questions",
          error: error.message,
        });
      }
    }

    // Fetch the latest interview data (including generated questions if available)
    const [finalInterview] = await db
      .select({
        id: interviews.id,
        status: interviews.status,
        questionGenerationStatus: interviews.questionGenerationStatus,
        generatedQuestions: interviews.generatedQuestions,
      })
      .from(interviews)
      .where(eq(interviews.id, newInterview.id))
      .limit(1);

    logger.info(`Interview ${newInterview.id} created for user ${userId}`);

    // Auto-trigger Vapi call for telephonic interviews after questions are generated
    if (isTelephonic && finalInterview.questionGenerationStatus === 'completed' && finalInterview.generatedQuestions?.length > 0) {
      try {
        const { initiateTelephonicCall } = await import('../../services/vapi/telephonicService.js');
        logger.info(`[Telephonic Interview] Initiating call with ${finalInterview.generatedQuestions.length} questions (resume-based: ${finalInterview.resumeId ? 'Yes' : 'No'})`);
        const callResult = await initiateTelephonicCall(
          finalInterview.id,
          phoneNumber.trim(),
          language,
          finalInterview.generatedQuestions, // These questions are already personalized based on resume if resumeId was provided
          {
            jobRole: job.name,
            difficultyLevel: difficultyLevel || 'medium',
          }
        );

        // Update interview with call ID - ensure it's stored properly
        const callId = callResult.callId || callResult.id || callResult.call?.id;
        logger.info(`[Telephonic Interview] Call result: ${JSON.stringify({ callId: callResult.callId, id: callResult.id, hasCall: !!callResult.call })}`);
        
        if (!callId || callId === 'undefined' || callId === 'null') {
          logger.error(`No valid call ID returned from Vapi for interview ${finalInterview.id}. Call result: ${JSON.stringify(callResult)}`);
          throw new Error('Failed to get call ID from Vapi');
        } else {
          await db
            .update(interviews)
            .set({
              vapiCallId: callId,
              status: 'calling',
              updatedAt: new Date(),
            })
            .where(eq(interviews.id, finalInterview.id));
          logger.info(`✅ Stored Vapi call ID ${callId} for interview ${finalInterview.id}`);
          
          // Verify it was stored
          const [verify] = await db
            .select({ vapiCallId: interviews.vapiCallId })
            .from(interviews)
            .where(eq(interviews.id, finalInterview.id))
            .limit(1);
          logger.info(`✅ Verified stored callId: ${verify?.vapiCallId}`);
        }

        logger.info(`Auto-initiated Vapi call for telephonic interview ${finalInterview.id}. Call ID: ${callResult.callId}`);
      } catch (error) {
        // Log error but don't fail the interview creation
        logger.error(`Failed to auto-initiate call for telephonic interview ${finalInterview.id}:`, error);
      }
    }

    return res.status(201).json({
      success: true,
      message: interviewType !== 'human_to_human' && finalInterview.questionGenerationStatus === 'completed' 
        ? "Interview created successfully with questions ready!"
        : "Interview created successfully. Questions are being generated...",
      data: {
        interviewId: finalInterview.id,
        status: finalInterview.status,
        questionGenerationStatus: finalInterview.questionGenerationStatus,
        questionsCount: finalInterview.generatedQuestions?.length || 0,
        questions: finalInterview.questionGenerationStatus === 'completed' ? finalInterview.generatedQuestions : undefined,
      },
    });
  } catch (error) {
    logger.error("Error creating interview:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create interview",
      error: error.message,
    });
  }
};

/**
 * Submit answer
 * POST /interview/:interviewId/answer
 */
export const submitAnswer = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.id;
    const { questionIndex, textAnswer, voiceFile } = req.body;

    if (questionIndex === undefined || questionIndex === null) {
      return res.status(400).json({
        success: false,
        message: "Question index is required",
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

    // Process voice file if provided
    let voiceAnswerUrl = null;
    let transcription = null;
    let voiceAnalysis = null;

    if (voiceFile) {
      try {
        // Convert base64 to buffer
        const voiceBuffer = Buffer.from(voiceFile, 'base64');
        
        // Upload voice file to ImageKit
        const timestamp = Date.now();
        const filename = `voice_${interviewId}_q${questionIndex}_${timestamp}.webm`;
        
        const uploadResult = await ImageKit.upload({
          file: voiceBuffer,
          fileName: filename,
          folder: '/interviews/voice-answers',
          isBase64: false,
        });
        
        voiceAnswerUrl = uploadResult.url;
        logger.info(`Voice file uploaded to ImageKit: ${voiceAnswerUrl}`);
        
        // Transcribe voice
        try {
          transcription = await transcribeVoice(voiceBuffer);
          logger.info(`Voice transcribed for question ${questionIndex} of interview ${interviewId}`);
        } catch (transcribeError) {
          logger.error("Error transcribing voice:", transcribeError);
          // Continue without transcription
        }
        
        // Analyze voice with AI (voxtral) and basic analysis
        try {
          // Try AI analysis first, fallback to basic if fails
          try {
            voiceAnalysis = await analyzeAudioWithAI(voiceBuffer);
            logger.info(`Voice analyzed with AI for question ${questionIndex} of interview ${interviewId}`);
          } catch (aiError) {
            logger.warn("AI audio analysis failed, using basic analysis:", aiError);
          voiceAnalysis = await analyzeVoice(voiceBuffer);
            logger.info(`Voice analyzed with basic method for question ${questionIndex} of interview ${interviewId}`);
          }
        } catch (analyzeError) {
          logger.error("Error analyzing voice:", analyzeError);
          // Continue without voice analysis
        }
      } catch (error) {
        logger.error("Error processing voice file:", error);
        // Continue without voice processing
      }
    }

    // Store answer
    const [newAnswer] = await db
      .insert(interviewAnswers)
      .values({
        interviewId,
        questionId: question.id,
        questionIndex,
        textAnswer: textAnswer || null,
        voiceAnswerUrl,
        transcription,
        voiceAnalysis,
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

    logger.info(`Answer submitted for interview ${interviewId}, question ${questionIndex}`);

    return res.status(200).json({
      success: true,
      message: "Answer submitted successfully",
      data: {
        answerId: newAnswer.id,
        questionIndex,
      },
    });
  } catch (error) {
    logger.error("Error submitting answer:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit answer",
      error: error.message,
    });
  }
};

/**
 * Submit multiple answers in batch
 * POST /interview/:interviewId/answers/batch
 */
export const submitAnswersBatch = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.id;
    const { answers: answersArray } = req.body;

    if (!Array.isArray(answersArray) || answersArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Answers array is required and must not be empty",
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

    if (interview.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: "Interview is already completed",
      });
    }

    // Process all answers
    const processedAnswers = [];
    
    for (const answerData of answersArray) {
      const { questionIndex, textAnswer, voiceFile } = answerData;

      if (questionIndex === undefined || questionIndex === null) {
        continue; // Skip invalid answers
      }

      // Get question
      const question = interview.generatedQuestions[questionIndex];
      if (!question) {
        logger.warn(`Invalid question index ${questionIndex} for interview ${interviewId}`);
        continue;
      }

      // Process voice file if provided
      let voiceAnswerUrl = null;
      let transcription = null;
      let voiceAnalysis = null;

      if (voiceFile) {
        try {
          // Convert base64 to buffer
          const voiceBuffer = Buffer.from(voiceFile, 'base64');
          
          // Upload voice file to ImageKit
          const timestamp = Date.now();
          const filename = `voice_${interviewId}_q${questionIndex}_${timestamp}.webm`;
          
          const uploadResult = await ImageKit.upload({
            file: voiceBuffer,
            fileName: filename,
            folder: '/interviews/voice-answers',
            isBase64: false,
          });
          
          voiceAnswerUrl = uploadResult.url;
          logger.info(`Voice file uploaded to ImageKit: ${voiceAnswerUrl}`);
          
          // Transcribe voice
          try {
            transcription = await transcribeVoice(voiceBuffer);
            logger.info(`Voice transcribed for question ${questionIndex} of interview ${interviewId}`);
          } catch (transcribeError) {
            logger.error("Error transcribing voice:", transcribeError);
            // Continue without transcription
          }
          
          // Analyze voice with AI (voxtral) and basic analysis
          try {
            // Try AI analysis first, fallback to basic if fails
            try {
              voiceAnalysis = await analyzeAudioWithAI(voiceBuffer);
              logger.info(`Voice analyzed with AI for question ${questionIndex} of interview ${interviewId}`);
            } catch (aiError) {
              logger.warn("AI audio analysis failed, using basic analysis:", aiError);
              voiceAnalysis = await analyzeVoice(voiceBuffer);
              logger.info(`Voice analyzed with basic method for question ${questionIndex} of interview ${interviewId}`);
            }
          } catch (analyzeError) {
            logger.error("Error analyzing voice:", analyzeError);
            // Continue without voice analysis
          }
        } catch (error) {
          logger.error("Error processing voice file:", error);
          // Continue without voice processing
        }
      }

      processedAnswers.push({
        interviewId,
        questionId: question.id,
        questionIndex,
        textAnswer: textAnswer || null,
        voiceAnswerUrl,
        transcription,
        voiceAnalysis,
        createdAt: new Date(),
      });
    }

    // Insert all answers in a transaction
    if (processedAnswers.length > 0) {
      await db.insert(interviewAnswers).values(processedAnswers);
      
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

      logger.info(`Batch submitted ${processedAnswers.length} answers for interview ${interviewId}`);

      return res.status(200).json({
        success: true,
        message: `Successfully submitted ${processedAnswers.length} answers`,
        data: {
          answersCount: processedAnswers.length,
          interviewId,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "No valid answers to submit",
      });
    }
  } catch (error) {
    logger.error("Error submitting answers batch:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit answers",
      error: error.message,
    });
  }
};

/**
 * Complete interview and generate feedback
 * POST /interview/:interviewId/complete
 */
export const completeInterview = async (req, res) => {
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
        // Include resume text for better context in feedback generation
        if (resume.extractedText && resume.extractedText.trim().length > 0) {
          resumeText = resume.extractedText.trim().substring(0, 2000); // Limit to 2000 chars for context
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
          interviewCategory: interviewSubtypeCategory,
          interviewSubtype: interviewSubtypeName,
          interviewSubtypeDescription: interviewSubtypeDescription,
          resumeBased: resumeInfo?.resumeBased || false,
          resumeFileName: resumeInfo?.fileName || null,
          resumeText: resumeText, // Include resume text for context
          difficultyLevel: interview.difficultyLevel,
        },
        interview.interviewType
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

    logger.info(`Interview ${interviewId} completed`);

    return res.status(200).json({
      success: true,
      message: "Interview completed successfully",
      data: {
        interviewId: updatedInterview.id,
        feedbackReport,
      },
    });
  } catch (error) {
    logger.error("Error completing interview:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to complete interview",
      error: error.message,
    });
  }
};

/**
 * Get interview by ID
 * GET /interview/:interviewId
 */
export const getInterviewById = async (req, res) => {
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

    if (interview.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this interview",
      });
    }

    // Get answers
    const answers = await db
      .select()
      .from(interviewAnswers)
      .where(eq(interviewAnswers.interviewId, interviewId))
      .orderBy(interviewAnswers.questionIndex);

    return res.status(200).json({
      success: true,
      data: {
        ...interview,
        answers,
      },
    });
  } catch (error) {
    logger.error("Error getting interview:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get interview",
      error: error.message,
    });
  }
};

/**
 * Get question generation status
 * GET /interview/:interviewId/question-status
 */
export const getQuestionGenerationStatus = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.id;

    const [interview] = await db
      .select({
        id: interviews.id,
        userId: interviews.userId,
        questionGenerationStatus: interviews.questionGenerationStatus,
        status: interviews.status,
        generatedQuestions: interviews.generatedQuestions,
      })
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

    return res.status(200).json({
      success: true,
      data: {
        interviewId: interview.id,
        questionGenerationStatus: interview.questionGenerationStatus,
        status: interview.status,
        questionsCount: Array.isArray(interview.generatedQuestions) ? interview.generatedQuestions.length : 0,
        isReady: interview.questionGenerationStatus === 'completed',
      },
    });
  } catch (error) {
    logger.error("Error getting question generation status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get question generation status",
      error: error.message,
    });
  }
};

/**
 * Get active jobs for user selection
 * GET /interview/jobs/active
 */
export const getActiveJobs = async (req, res) => {
  try {
    const activeJobs = await db
      .select({
        id: jobs.id,
        name: jobs.name,
        description: jobs.description,
        department: jobs.department,
      })
      .from(jobs)
      .where(eq(jobs.isActive, true))
      .orderBy(jobs.name);

    return res.status(200).json({
      success: true,
      data: activeJobs,
      count: activeJobs.length,
    });
  } catch (error) {
    logger.error("Error getting active jobs:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get active jobs",
      error: error.message,
    });
  }
};

/**
 * Get all interviews with reports for the user
 * GET /interview/reports
 */
export const getUserInterviewsWithReports = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { interviewType, category, subcategory } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Build where conditions
    const conditions = [eq(interviews.userId, userId)];
    
    // Filter by interview type
    if (interviewType) {
      conditions.push(eq(interviews.interviewType, interviewType));
    }
    
    // Filter by status - only show completed interviews with reports
    conditions.push(eq(interviews.status, 'completed'));

    // Get interviews with subtype info
    let allInterviews = await db
      .select({
        id: interviews.id,
        interviewType: interviews.interviewType,
        interviewSubtypeId: interviews.interviewSubtypeId,
        jobRole: interviews.jobRole,
        difficultyLevel: interviews.difficultyLevel,
        status: interviews.status,
        feedbackReport: interviews.feedbackReport,
        createdAt: interviews.createdAt,
        updatedAt: interviews.updatedAt,
      })
      .from(interviews)
      .where(and(...conditions))
      .orderBy(desc(interviews.createdAt));

    // Get all interview types for filtering
    const allTypes = await db
      .select()
      .from(interviewTypes);

    // Enrich interviews with subtype info
    const enrichedInterviews = allInterviews
      .map(interview => {
        const subtype = interview.interviewSubtypeId 
          ? allTypes.find(t => t.id === interview.interviewSubtypeId)
          : null;
        
        return {
          ...interview,
          subtypeName: subtype?.name || null,
          subtypeCategory: subtype?.category || null,
          hasReport: !!interview.feedbackReport,
        };
      })
      .filter(interview => {
        // Filter by category if provided
        if (category && interview.subtypeCategory !== category) {
          return false;
        }
        // Filter by subcategory (subtype name) if provided
        if (subcategory && interview.subtypeName !== subcategory) {
          return false;
        }
        return true;
      });

    return res.status(200).json({
      success: true,
      data: enrichedInterviews,
      count: enrichedInterviews.length,
    });
  } catch (error) {
    logger.error("Error getting user interviews with reports:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get interviews",
      error: error.message,
    });
  }
};

/**
 * Get feedback report
 * GET /interview/:interviewId/feedback
 */
export const getFeedbackReport = async (req, res) => {
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

    if (interview.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this interview",
      });
    }

    // Check if report exists
    if (!interview.feedbackReport) {
      // Check if interview is completed and has answers
      const { interviewAnswers } = await import('../../models/interviewAnswer.model.js');
      let answers = await db
        .select()
        .from(interviewAnswers)
        .where(eq(interviewAnswers.interviewId, interviewId))
        .limit(10);
      
      logger.info(`Feedback report not available for interview ${interviewId}. Status: ${interview.status}, Answers count: ${answers.length}, Has questions: ${!!interview.generatedQuestions?.length}`);
      
      // If interview is completed but no answers yet, wait a bit for transcript processing
      if (interview.status === 'completed' && answers.length === 0 && interview.generatedQuestions?.length > 0) {
        logger.info(`⏳ Waiting for answers to be processed for interview ${interviewId}...`);
        // Wait up to 5 seconds for answers to be stored (transcript processing happens in background)
        for (let i = 0; i < 5; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          answers = await db
            .select()
            .from(interviewAnswers)
            .where(eq(interviewAnswers.interviewId, interviewId))
            .limit(10);
          if (answers.length > 0) {
            logger.info(`✅ Answers found after waiting ${i + 1} seconds`);
            break;
          }
        }
      }
      
      // If interview is completed but no report, try to generate it
      if (interview.status === 'completed' && answers.length > 0) {
        logger.info(`Attempting to generate report for completed interview ${interviewId} with ${answers.length} answers`);
        try {
          const { generateFeedbackReport } = await import('../../services/ai/interviewService.js');
          const { interviewTypes } = await import('../../models/interviewType.model.js');
          const { resumes } = await import('../../models/resume.model.js');
          
          // Get subtype info
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

          // Get resume info
          let resumeText = null;
          if (interview.resumeId) {
            const [resume] = await db
              .select({ extractedText: resumes.extractedText })
              .from(resumes)
              .where(eq(resumes.id, interview.resumeId))
              .limit(1);
            
            if (resume?.extractedText) {
              resumeText = resume.extractedText.trim().substring(0, 2000);
            }
          }

          // Generate report
          const feedbackReport = await generateFeedbackReport(
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
              resumeBased: !!interview.resumeId,
              resumeFileName: null,
              resumeText: resumeText,
              difficultyLevel: interview.difficultyLevel,
            },
            'ai_text_voice'
          );

          // Save report
          await db
            .update(interviews)
            .set({
              feedbackReport,
              updatedAt: new Date(),
            })
            .where(eq(interviews.id, interviewId));

          logger.info(`✅ Report generated successfully for interview ${interviewId} with ${answers.length} answers`);
          
          // Refresh interview to get the updated report
          const [updatedInterview] = await db
            .select()
            .from(interviews)
            .where(eq(interviews.id, interviewId))
            .limit(1);
          
          return res.status(200).json({
            success: true,
            data: updatedInterview.feedbackReport || feedbackReport,
          });
        } catch (generateError) {
          logger.error(`Error generating report on-demand for interview ${interviewId}:`, generateError);
          return res.status(404).json({
            success: false,
            message: "Feedback report not available yet",
            debug: {
              status: interview.status,
              hasAnswers: answers.length > 0,
              hasQuestions: !!interview.generatedQuestions?.length,
              error: generateError.message,
            },
          });
        }
      }
      
      return res.status(404).json({
        success: false,
        message: "Feedback report not available yet",
        debug: {
          status: interview.status,
          hasAnswers: answers.length > 0,
          hasQuestions: !!interview.generatedQuestions?.length,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: interview.feedbackReport,
    });
  } catch (error) {
    logger.error("Error getting feedback report:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get feedback report",
      error: error.message,
    });
  }
};


