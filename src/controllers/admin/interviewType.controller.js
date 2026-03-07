import { db } from "../../config/database.js";
import { interviewTypes } from "../../models/interviewType.model.js";
import { eq, and } from "drizzle-orm";
import logger from "../../utils/logger.js";
import { getOpenAIClient, getModel } from "../../config/aiConfig.js";

const VALID_MAIN_TYPES = ['ai_text_voice', 'ai_coding', 'human_to_human'];
// Categories are now custom - no validation needed

/**
 * Generate interview type name with AI
 */
export const generateInterviewTypeName = async (req, res) => {
  try {
    const { category, mainType, description, userPrompt } = req.body;

    if (!category || !mainType) {
      return res.status(400).json({
        success: false,
        message: "Category and mainType are required",
      });
    }

    const mainTypeLabels = {
      ai_text_voice: 'AI Text/Voice Interview',
      ai_coding: 'AI Coding Interview',
      human_to_human: 'Human-to-Human Interview',
    };

    // Build the prompt based on whether user provided a custom prompt
    let prompt;
    if (userPrompt && userPrompt.trim()) {
      // User provided specific prompt (e.g., "system design", "frontend developer")
      prompt = `Generate a professional interview type name and description based on the user's request.

User Request: "${userPrompt}"
Category: ${category}
Interview Type: ${mainTypeLabels[mainType] || mainType}
${description ? `Existing Description: ${description}` : ''}

Return ONLY a JSON object with this format:
{
  "name": "Interview Type Name",
  "description": "Brief description (1-2 sentences explaining what this interview type covers)"
}

The name should be:
- Professional and clear
- 2-5 words maximum
- Relevant to the user's request: "${userPrompt}"
- Examples based on user request:
  * If user says "system design" → "System Design Interview"
  * If user says "frontend developer" → "Frontend Developer Interview"
  * If user says "data science" → "Data Science Interview"
  * If user says "behavioral" → "Behavioral Assessment Interview"

The description should explain what topics/questions this interview type covers related to "${userPrompt}".

Return ONLY valid JSON, no markdown, no explanations.`;
    } else {
      // Default generation without user prompt
      prompt = `Generate a professional and concise interview type name for:
- Category: ${category}
- Interview Type: ${mainTypeLabels[mainType] || mainType}
${description ? `- Description: ${description}` : ''}

Return ONLY a JSON object with this format:
{
  "name": "Interview Type Name",
  "description": "Brief description (1-2 sentences)"
}

The name should be:
- Professional and clear
- 2-5 words maximum
- Relevant to the category and interview type
- Examples: "HR Interview", "Technical Screening", "Behavioral Assessment", "Frontend Developer Interview"

Return ONLY valid JSON, no markdown, no explanations.`;
    }

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
      max_tokens: 200,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const generated = JSON.parse(cleanedResponse);

    return res.status(200).json({
      success: true,
      data: {
        name: generated.name || `${category} Interview`,
        description: generated.description || `Interview questions for ${category} roles`
      }
    });
  } catch (error) {
    logger.error("Error generating interview type name:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate interview type name",
      error: error.message,
    });
  }
};

/**
 * Create new interview type (admin only)
 */
export const createInterviewType = async (req, res) => {
  try {
    const { name, description, category, mainType } = req.body;
    const userId = req.user?.id;

    // Validate required fields
    if (!name || !category || !mainType) {
      return res.status(400).json({
        success: false,
        message: "Name, category, and mainType are required",
      });
    }

    // Category is now custom - no validation needed, just ensure it's a string
    if (typeof category !== 'string' || category.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Category must be a non-empty string",
      });
    }

    // Validate mainType
    if (!VALID_MAIN_TYPES.includes(mainType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid mainType. Must be one of: ${VALID_MAIN_TYPES.join(", ")}`,
      });
    }

    // Check if name already exists
    const existing = await db
      .select()
      .from(interviewTypes)
      .where(eq(interviewTypes.name, name))
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Interview type with this name already exists",
      });
    }

    // Create interview type
    const [newType] = await db
      .insert(interviewTypes)
      .values({
        name,
        description: description || null,
        category,
        mainType,
        isActive: true,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    logger.info(`Interview type created by user ${userId}: ${name}`);

    return res.status(201).json({
      success: true,
      message: "Interview type created successfully",
      data: newType,
    });
  } catch (error) {
    logger.error("Error creating interview type:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create interview type",
      error: error.message,
    });
  }
};

/**
 * Get all interview types (admin only)
 */
export const getAllInterviewTypes = async (req, res) => {
  try {
    const allTypes = await db
      .select()
      .from(interviewTypes)
      .orderBy(interviewTypes.name);

    return res.status(200).json({
      success: true,
      data: allTypes,
    });
  } catch (error) {
    logger.error("Error getting interview types:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get interview types",
      error: error.message,
    });
  }
};

/**
 * Get interview type by ID (admin only)
 */
export const getInterviewTypeById = async (req, res) => {
  try {
    const { id } = req.params;

    const [interviewType] = await db
      .select()
      .from(interviewTypes)
      .where(eq(interviewTypes.id, id))
      .limit(1);

    if (!interviewType) {
      return res.status(404).json({
        success: false,
        message: "Interview type not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: interviewType,
    });
  } catch (error) {
    logger.error("Error getting interview type:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get interview type",
      error: error.message,
    });
  }
};

/**
 * Get active interview types (public)
 */
export const getActiveInterviewTypes = async (req, res) => {
  try {
    const { mainType } = req.query; // Optional filter by mainType
    
    logger.info(`Fetching interview types - mainType: ${mainType}`);
    
    let whereConditions = [eq(interviewTypes.isActive, true)];
    
    // Filter by mainType if provided
    if (mainType && VALID_MAIN_TYPES.includes(mainType)) {
      whereConditions.push(eq(interviewTypes.mainType, mainType));
      logger.info(`Filtering by mainType: ${mainType}`);
    } else if (mainType) {
      logger.warn(`Invalid mainType provided: ${mainType}. Valid types: ${VALID_MAIN_TYPES.join(', ')}`);
    }
    
    const activeTypes = await db
      .select()
      .from(interviewTypes)
      .where(whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0])
      .orderBy(interviewTypes.name);

    logger.info(`Found ${activeTypes.length} active interview types`);
    logger.debug('Interview types:', JSON.stringify(activeTypes, null, 2));

    return res.status(200).json({
      success: true,
      data: activeTypes,
    });
  } catch (error) {
    logger.error("Error getting active interview types:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get interview types",
      error: error.message,
    });
  }
};

/**
 * Update interview type (admin only)
 */
export const updateInterviewType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, mainType, isActive } = req.body;

    // Check if interview type exists
    const [existing] = await db
      .select()
      .from(interviewTypes)
      .where(eq(interviewTypes.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Interview type not found",
      });
    }

    // Validate category if provided (custom categories allowed)
    if (category && (typeof category !== 'string' || category.trim().length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Category must be a non-empty string",
      });
    }

    // Validate mainType if provided
    if (mainType && !VALID_MAIN_TYPES.includes(mainType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid mainType. Must be one of: ${VALID_MAIN_TYPES.join(", ")}`,
      });
    }

    // Check if name already exists (excluding current record)
    if (name && name !== existing.name) {
      const [nameExists] = await db
        .select()
        .from(interviewTypes)
        .where(eq(interviewTypes.name, name))
        .limit(1);

      if (nameExists.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Interview type with this name already exists",
        });
      }
    }

    // Update interview type
    const [updated] = await db
      .update(interviewTypes)
      .set({
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(category && { category }),
        ...(mainType && { mainType }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(interviewTypes.id, id))
      .returning();

    logger.info(`Interview type updated: ${id}`);

    return res.status(200).json({
      success: true,
      message: "Interview type updated successfully",
      data: updated,
    });
  } catch (error) {
    logger.error("Error updating interview type:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update interview type",
      error: error.message,
    });
  }
};

/**
 * Delete interview type (admin only - hard delete)
 */
export const deleteInterviewType = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if interview type exists
    const [existing] = await db
      .select()
      .from(interviewTypes)
      .where(eq(interviewTypes.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Interview type not found",
      });
    }

    // Hard delete (actually delete the record)
    await db
      .delete(interviewTypes)
      .where(eq(interviewTypes.id, id));

    logger.info(`Interview type deleted: ${id}`);

    return res.status(200).json({
      success: true,
      message: "Interview type deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting interview type:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete interview type",
      error: error.message,
    });
  }
};
