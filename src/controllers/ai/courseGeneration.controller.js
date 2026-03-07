import { generateCourseStructure, generateCourseDetails, generateSections } from "../../ai/courseGeneration.js";
import logger from "../../utils/logger.js";

/**
 * Generate complete course structure using AI
 * POST /api/v1/ai/generate-course
 * Body: {
 *   topic: string,
 *   difficulty?: string,
 *   duration?: string,
 *   targetAudience?: string,
 *   additionalInfo?: string
 * }
 */
export const generateCourse = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { topic, difficulty, duration, targetAudience, additionalInfo } = req.body;

    if (!topic || topic.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Course topic is required"
      });
    }

    logger.info(`User ${userId} requesting AI course generation for topic: ${topic}`);

    const coursePrompt = {
      topic: topic.trim(),
      difficulty: difficulty || "beginner",
      duration: duration || "10 hours",
      targetAudience: targetAudience || "students",
      additionalInfo: additionalInfo || ""
    };

    const courseStructure = await generateCourseStructure(coursePrompt);

    return res.status(200).json({
      success: true,
      message: "Course structure generated successfully",
      data: courseStructure
    });
  } catch (error) {
    logger.error("Error generating course structure", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate course structure"
    });
  }
};

/**
 * Generate course details only (quick generation)
 * POST /api/v1/ai/generate-course-details
 * Body: {
 *   topic: string,
 *   difficulty?: string
 * }
 */
export const generateCourseDetailsOnly = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { topic, difficulty } = req.body;

    if (!topic || topic.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Course topic is required"
      });
    }

    logger.info(`User ${userId} requesting AI course details for topic: ${topic}`);

    const courseDetails = await generateCourseDetails(topic.trim(), difficulty || "beginner");

    return res.status(200).json({
      success: true,
      message: "Course details generated successfully",
      data: courseDetails
    });
  } catch (error) {
    logger.error("Error generating course details", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate course details"
    });
  }
};

/**
 * Generate sections for an existing course
 * POST /api/v1/ai/generate-sections
 * Body: {
 *   courseTitle: string,
 *   courseDescription: string,
 *   numberOfSections?: number
 * }
 */
export const generateSectionsOnly = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { courseTitle, courseDescription, numberOfSections } = req.body;

    if (!courseTitle || courseTitle.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Course title is required"
      });
    }

    if (!courseDescription || courseDescription.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Course description is required"
      });
    }

    logger.info(`User ${userId} requesting AI sections generation for course: ${courseTitle}`);

    const sections = await generateSections(
      courseTitle.trim(),
      courseDescription.trim(),
      numberOfSections || 4
    );

    return res.status(200).json({
      success: true,
      message: "Sections generated successfully",
      data: { sections }
    });
  } catch (error) {
    logger.error("Error generating sections", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate sections"
    });
  }
};

