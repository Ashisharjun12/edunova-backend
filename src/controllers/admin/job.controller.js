import { db } from "../../config/database.js";
import { jobs } from "../../models/job.model.js";
import { eq } from "drizzle-orm";
import logger from "../../utils/logger.js";
import { getOpenAIClient, getModel } from "../../config/aiConfig.js";

/**
 * Generate job name and description using AI (admin only)
 * POST /api/v1/admin/jobs/generate
 */
export const generateJobName = async (req, res) => {
  try {
    const { userPrompt, department, description } = req.body;

    if (!userPrompt || userPrompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "User prompt is required for AI generation",
      });
    }

    let prompt = `Generate a professional job role name and description based on the user's request.

User Request: "${userPrompt.trim()}"
${department ? `Department: ${department}` : ''}
${description ? `Existing Description: ${description}` : ''}

Return ONLY a JSON object with this format:
{
  "name": "Job Role Name",
  "description": "Brief description (2-3 sentences explaining the role, responsibilities, and requirements)",
  "department": "Department name (if not provided, suggest an appropriate department)"
}

The name should be:
- Professional and clear
- Standard job title format (e.g., "Software Engineer", "Product Manager", "Data Scientist")
- Relevant to the user's request: "${userPrompt.trim()}"
- Examples based on user request:
  * If user says "software engineer" → "Software Engineer"
  * If user says "frontend developer" → "Frontend Developer"
  * If user says "product manager" → "Product Manager"
  * If user says "data scientist" → "Data Scientist"
  * If user says "UX designer" → "UX Designer"

The description should:
- Explain the role's responsibilities
- Mention key skills or requirements
- Be professional and concise (2-3 sentences)

The department should be a common department name like: Engineering, Product, Design, Marketing, Sales, Operations, etc.

Return ONLY valid JSON, no markdown, no explanations.`;

    const openai = getOpenAIClient('generation');
    const completion = await openai.chat.completions.create({
      model: getModel('generation'),
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 300,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const generated = JSON.parse(cleanedResponse);

    return res.status(200).json({
      success: true,
      data: {
        name: generated.name || userPrompt.trim(),
        description: generated.description || `Job role for ${userPrompt.trim()}`,
        department: generated.department || department || null,
      }
    });
  } catch (error) {
    logger.error("Error generating job name:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate job name",
      error: error.message,
    });
  }
};

/**
 * Create new job (admin only)
 * POST /api/v1/admin/jobs
 */
export const createJob = async (req, res) => {
  try {
    const { name, description, department, isActive } = req.body;
    const userId = req.user?.id;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Job name is required",
      });
    }

    // Check if job with same name already exists
    const existing = await db
      .select()
      .from(jobs)
      .where(eq(jobs.name, name.trim()))
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Job with this name already exists",
      });
    }

    // Create job
    const [newJob] = await db
      .insert(jobs)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        department: department?.trim() || null,
        isActive: isActive !== undefined ? isActive : true,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    logger.info(`Job created by user ${userId}: ${name}`);

    return res.status(201).json({
      success: true,
      message: "Job created successfully",
      data: newJob,
    });
  } catch (error) {
    logger.error("Error creating job:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create job",
      error: error.message,
    });
  }
};

/**
 * Get all jobs (admin only)
 * GET /api/v1/admin/jobs
 */
export const getAllJobs = async (req, res) => {
  try {
    const allJobs = await db
      .select()
      .from(jobs)
      .orderBy(jobs.name);

    return res.status(200).json({
      success: true,
      data: allJobs,
    });
  } catch (error) {
    logger.error("Error getting jobs:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get jobs",
      error: error.message,
    });
  }
};

/**
 * Get job by ID (admin only)
 * GET /api/v1/admin/jobs/:id
 */
export const getJobById = async (req, res) => {
  try {
    const { id } = req.params;

    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: job,
    });
  } catch (error) {
    logger.error("Error getting job:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get job",
      error: error.message,
    });
  }
};

/**
 * Update job (admin only)
 * PUT /api/v1/admin/jobs/:id
 */
export const updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, department, isActive } = req.body;

    // Check if job exists
    const [existingJob] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);

    if (!existingJob) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    // If name is being updated, check for duplicates
    if (name && name.trim() !== existingJob.name) {
      const duplicate = await db
        .select()
        .from(jobs)
        .where(eq(jobs.name, name.trim()))
        .limit(1);

      if (duplicate.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Job with this name already exists",
        });
      }
    }

    // Update job
    const updateData = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      updateData.name = name.trim();
    }
    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }
    if (department !== undefined) {
      updateData.department = department?.trim() || null;
    }
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    const [updatedJob] = await db
      .update(jobs)
      .set(updateData)
      .where(eq(jobs.id, id))
      .returning();

    logger.info(`Job updated: ${id}`);

    return res.status(200).json({
      success: true,
      message: "Job updated successfully",
      data: updatedJob,
    });
  } catch (error) {
    logger.error("Error updating job:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update job",
      error: error.message,
    });
  }
};

/**
 * Delete job (admin only, hard delete)
 * DELETE /api/v1/admin/jobs/:id
 */
export const deleteJob = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if job exists
    const [existingJob] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);

    if (!existingJob) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    // Delete job
    await db.delete(jobs).where(eq(jobs.id, id));

    logger.info(`Job deleted: ${id}`);

    return res.status(200).json({
      success: true,
      message: "Job deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting job:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete job",
      error: error.message,
    });
  }
};

/**
 * Get active jobs (public endpoint for user selection)
 * GET /api/v1/admin/jobs/active
 */
export const getActiveJobs = async (req, res) => {
  try {
    const activeJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.isActive, true))
      .orderBy(jobs.name);

    return res.status(200).json({
      success: true,
      data: activeJobs,
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

