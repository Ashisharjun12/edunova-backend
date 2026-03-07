import { getYouTubeTranscript, chatWithAI } from "../../ai/description.js";
import { db } from "../../config/database.js";
import { lessons } from "../../models/course.model.js";
import { eq } from "drizzle-orm";
import logger from "../../utils/logger.js";

/**
 * Get YouTube transcript for a lesson
 * GET /api/v1/ai/transcript/:lessonId
 */
export const getLessonTranscript = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        // Get lesson details
        const [lesson] = await db
            .select()
            .from(lessons)
            .where(eq(lessons.id, lessonId));

        if (!lesson) {
            return res.status(404).json({ success: false, message: "Lesson not found" });
        }

        if (!lesson.youtubeVideoId) {
            return res.status(400).json({ 
                success: false, 
                message: "This lesson does not have a YouTube video" 
            });
        }

        // Fetch transcript
        const transcript = await getYouTubeTranscript(lesson.youtubeVideoId);

        return res.status(200).json({
            success: true,
            transcript: transcript,
            lessonTitle: lesson.title,
            videoId: lesson.youtubeVideoId
        });
    } catch (error) {
        logger.error("Error getting lesson transcript", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch transcript"
        });
    }
};

/**
 * Chat with AI assistant about a lesson
 * POST /api/v1/ai/chat/:lessonId
 * Body: { question: string }
 */
export const chatWithLessonAI = async (req, res) => {
    try {
        const { lessonId } = req.params;
        const { question } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!question || question.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Question is required" 
            });
        }

        // Get lesson details
        const [lesson] = await db
            .select()
            .from(lessons)
            .where(eq(lessons.id, lessonId));

        if (!lesson) {
            return res.status(404).json({ success: false, message: "Lesson not found" });
        }

        if (!lesson.youtubeVideoId) {
            return res.status(400).json({ 
                success: false, 
                message: "This lesson does not have a YouTube video" 
            });
        }

        // Fetch transcript
        let transcript;
        try {
            transcript = await getYouTubeTranscript(lesson.youtubeVideoId);
        } catch (transcriptError) {
            logger.error("Error fetching transcript for chat", transcriptError);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch video transcript. Please try again later."
            });
        }

        // Get AI response
        const aiResponse = await chatWithAI(question, transcript, lesson.title);

        return res.status(200).json({
            success: true,
            response: aiResponse,
            lessonTitle: lesson.title
        });
    } catch (error) {
        logger.error("Error in AI chat", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to get AI response"
        });
    }
};

