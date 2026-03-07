import { db } from "../../config/database.js";
import { resumes } from "../../models/resume.model.js";
import { eq, desc } from "drizzle-orm";
import { uploadPDFToImageKit } from "../../services/imagekit.js";
import { RedisCacheConnection } from "../../config/redis.js";
import logger from "../../utils/logger.js";
import { getExtractionDiagnostics } from "../../utils/pdfExtraction.js";
import axios from "axios";

/**
 * Upload resume PDF
 * POST /interview/resume/upload
 */
export const uploadResume = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "PDF file is required",
      });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({
        success: false,
        message: "Only PDF files are allowed",
      });
    }

    // Upload PDF to ImageKit
    const uploadResult = await uploadPDFToImageKit(req.file, "/uploads/resumes");

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        message: uploadResult.message || "Failed to upload resume",
      });
    }

    // Create resume record
    const [newResume] = await db
      .insert(resumes)
      .values({
        userId,
        fileName: req.file.originalname,
        fileUrl: uploadResult.url,
        fileId: uploadResult.fileId,
        processingStatus: 'pending', // Will be processed when interview starts
        metadata: {
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          uploadedAt: new Date().toISOString(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Store file buffer temporarily in Redis for later processing (24 hour TTL)
    // This allows processing when interview starts without re-downloading from ImageKit
    try {
      const bufferKey = `resume-buffer:${newResume.id}`;
      const bufferBase64 = req.file.buffer.toString('base64');
      await RedisCacheConnection.setex(bufferKey, 86400, bufferBase64); // 24 hours TTL
      logger.info(`Stored resume buffer in Redis for ${newResume.id}`);
    } catch (redisError) {
      logger.warn(`Failed to store resume buffer in Redis (will fetch from ImageKit when processing):`, redisError);
      // Continue - we can fetch from ImageKit when processing if Redis fails
    }

    logger.info(`Resume ${newResume.id} uploaded successfully (processing deferred until interview start)`);

    return res.status(201).json({
      success: true,
      message: "Resume uploaded successfully",
      data: {
        resumeId: newResume.id,
        status: 'pending',
      },
    });
  } catch (error) {
    logger.error("Error uploading resume:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload resume",
      error: error.message,
    });
  }
};

/**
 * Get resume processing status
 * GET /interview/resume/:resumeId/status
 */
export const getResumeStatus = async (req, res) => {
  try {
    const { resumeId } = req.params;
    const userId = req.user?.id;

    // Get resume from database
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

    // Check if user owns this resume
    if (resume.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this resume",
      });
    }

    // Calculate progress based on processing status
    const progress = resume.processingStatus === 'completed' ? 100 : 
                     resume.processingStatus === 'text_extracted' ? 50 : 0;

    return res.status(200).json({
      success: true,
      data: {
        resumeId: resume.id,
        status: resume.processingStatus,
        progress,
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt,
      },
    });
  } catch (error) {
    logger.error("Error getting resume status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get resume status",
      error: error.message,
    });
  }
};

/**
 * Get resume by ID
 * GET /interview/resume/:resumeId
 */
export const getResumeById = async (req, res) => {
  try {
    const { resumeId } = req.params;
    const userId = req.user?.id;

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

    // Check if user owns this resume
    if (resume.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this resume",
      });
    }

    // Don't send full extracted text if it's too large (can be fetched separately if needed)
    const resumeData = {
      id: resume.id,
      fileName: resume.fileName,
      fileUrl: resume.fileUrl,
      processingStatus: resume.processingStatus,
      chunksCount: resume.chunks?.length || 0,
      metadata: resume.metadata,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
      // Only include extracted text if it's not too large (< 50KB)
      extractedText: resume.extractedText && resume.extractedText.length < 50000 
        ? resume.extractedText 
        : null,
    };

    return res.status(200).json({
      success: true,
      data: resumeData,
    });
  } catch (error) {
    logger.error("Error getting resume:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get resume",
      error: error.message,
    });
  }
};

/**
 * Get all resumes for authenticated user
 * GET /interview/resume
 */
export const getUserResumes = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Get all resumes for the user, ordered by most recent first
    const userResumes = await db
      .select({
        id: resumes.id,
        fileName: resumes.fileName,
        fileUrl: resumes.fileUrl,
        processingStatus: resumes.processingStatus,
        summary: resumes.summary,
        chunksCount: resumes.chunks,
        createdAt: resumes.createdAt,
        updatedAt: resumes.updatedAt,
      })
      .from(resumes)
      .where(eq(resumes.userId, userId))
      .orderBy(desc(resumes.createdAt));

    // Format response
    const formattedResumes = userResumes.map((resume) => ({
      id: resume.id,
      fileName: resume.fileName,
      fileUrl: resume.fileUrl,
      processingStatus: resume.processingStatus,
      summary: resume.summary,
      chunksCount: Array.isArray(resume.chunksCount) ? resume.chunksCount.length : 0,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      data: formattedResumes,
      count: formattedResumes.length,
    });
  } catch (error) {
    logger.error("Error getting user resumes:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get user resumes",
      error: error.message,
    });
  }
};

/**
 * Retry extraction for a failed resume
 * POST /interview/resume/:resumeId/retry-extraction
 */
export const retryExtraction = async (req, res) => {
  try {
    const { resumeId } = req.params;
    const userId = req.user?.id;

    // Get resume from database
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

    // Check if user owns this resume
    if (resume.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this resume",
      });
    }

    // Try to get file buffer from Redis
    let fileBuffer = null;
    try {
      const bufferKey = `resume-buffer:${resumeId}`;
      const bufferBase64 = await RedisCacheConnection.get(bufferKey);
      if (bufferBase64) {
        fileBuffer = Buffer.from(bufferBase64, 'base64');
        logger.info(`Retrieved resume buffer from Redis for ${resumeId}`);
      }
    } catch (redisError) {
      logger.warn(`Failed to get buffer from Redis:`, redisError);
    }

    // If not in Redis, try to download from ImageKit
    if (!fileBuffer && resume.fileUrl) {
      try {
        const response = await axios.get(resume.fileUrl, {
          responseType: 'arraybuffer',
        });
        fileBuffer = Buffer.from(response.data);
        logger.info(`Downloaded resume from ImageKit for ${resumeId}`);
      } catch (downloadError) {
        logger.error(`Failed to download resume from ImageKit:`, downloadError);
        return res.status(500).json({
          success: false,
          message: "Failed to retrieve resume file. Please re-upload the resume.",
          error: downloadError.message,
        });
      }
    }

    if (!fileBuffer) {
      return res.status(400).json({
        success: false,
        message: "Resume file not available. Please re-upload the resume.",
      });
    }

    // Extract text directly (queue removed)
    const { extractTextFromPDF } = await import('../../utils/pdfExtraction.js');
    const extractionResult = await extractTextFromPDF(fileBuffer, {
      fileName: resume.fileName,
      minTextLength: 50,
    });

    if (extractionResult.success) {
      await db
        .update(resumes)
        .set({
          extractedText: extractionResult.text,
          processingStatus: 'text_extracted',
          updatedAt: new Date(),
        })
        .where(eq(resumes.id, resumeId));
    }

    // Update status
    await db
      .update(resumes)
      .set({
        processingStatus: 'extracting',
        updatedAt: new Date(),
      })
      .where(eq(resumes.id, resumeId));

    return res.status(200).json({
      success: true,
      message: "Extraction job queued successfully",
      data: {
        resumeId,
        status: 'extracting',
      },
    });
  } catch (error) {
    logger.error("Error retrying extraction:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retry extraction",
      error: error.message,
    });
  }
};

/**
 * Get extraction diagnostics for a resume
 * GET /interview/resume/:resumeId/diagnostics
 */
export const getExtractionDiagnosticsEndpoint = async (req, res) => {
  try {
    const { resumeId } = req.params;
    const userId = req.user?.id;

    // Get resume from database
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

    // Check if user owns this resume
    if (resume.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this resume",
      });
    }

    // Get file buffer for diagnostics
    let fileBuffer = null;
    try {
      const bufferKey = `resume-buffer:${resumeId}`;
      const bufferBase64 = await RedisCacheConnection.get(bufferKey);
      if (bufferBase64) {
        fileBuffer = Buffer.from(bufferBase64, 'base64');
      }
    } catch (redisError) {
      // Try downloading from ImageKit if not in Redis
      if (resume.fileUrl) {
        try {
          const response = await axios.get(resume.fileUrl, {
            responseType: 'arraybuffer',
          });
          fileBuffer = Buffer.from(response.data);
        } catch (downloadError) {
          logger.warn(`Failed to download file for diagnostics:`, downloadError);
        }
      }
    }

    const diagnostics = {
      resumeId,
      fileName: resume.fileName,
      processingStatus: resume.processingStatus,
      extractedTextLength: resume.extractedText?.length || 0,
      hasExtractedText: !!resume.extractedText,
      chunksCount: Array.isArray(resume.chunks) ? resume.chunks.length : 0,
      metadata: resume.metadata,
      fileDiagnostics: fileBuffer ? getExtractionDiagnostics(fileBuffer, resume.fileName) : null,
      extractionError: resume.metadata?.extractionError || null,
      processingError: resume.metadata?.processingError || null,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
    };

    return res.status(200).json({
      success: true,
      data: diagnostics,
    });
  } catch (error) {
    logger.error("Error getting extraction diagnostics:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get extraction diagnostics",
      error: error.message,
    });
  }
};



