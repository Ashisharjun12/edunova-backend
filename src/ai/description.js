import { YoutubeTranscript } from "youtube-transcript";
import logger from "../utils/logger.js";
import { getClientForFeature, getModelForFeature } from "../config/aiConfig.js";

// Feature constants (local to this file)
const FEATURES = {
  COURSE_GENERATION: 'course_generation',
  LESSON_GENERATION: 'lesson_generation',
  ASSIGNMENT_GENERATION: 'assignment_generation'
};

/**
 * Fetch YouTube video transcript using youtube-transcript package
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<string>} - Transcript text
 */
export const getYouTubeTranscript = async (videoId) => {
    try {
        // Construct YouTube URL from video ID
        const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Fetch transcript using youtube-transcript package
        const transcriptData = await YoutubeTranscript.fetchTranscript(youtubeUrl);
        
        if (!transcriptData || transcriptData.length === 0) {
            throw new Error("No transcript available for this video");
        }

        // Combine all transcript segments into a single text
        const transcript = transcriptData
            .map(item => item.text)
            .join(' ');

        if (transcript.trim().length === 0) {
            throw new Error("Empty transcript");
        }

        logger.info(`Successfully fetched transcript for video ${videoId}, length: ${transcript.length} characters`);
        return transcript;
    } catch (error) {
        logger.error("Error fetching YouTube transcript", error);
        throw new Error(`Failed to fetch transcript: ${error.message}`);
    }
};

/**
 * Chat with AI using video transcript as context
 * @param {string} userQuestion - User's question
 * @param {string} transcript - Video transcript for context
 * @param {string} lessonTitle - Optional lesson title for better context
 * @returns {Promise<string>} - AI response
 */
export const chatWithAI = async (userQuestion, transcript, lessonTitle = '') => {
    try {
        if (!transcript || transcript.trim().length === 0) {
            throw new Error("No transcript available for this video");
        }

        // Create context-aware prompt
        const systemPrompt = `You are an AI teaching assistant helping students understand course content. 
You have access to the transcript of a video lesson${lessonTitle ? ` titled "${lessonTitle}"` : ''}. 
Answer the student's questions based on the video transcript content. 
Be concise, clear, and helpful. If the question cannot be answered from the transcript, politely say so.

Video Transcript:
${transcript.substring(0, 8000)}${transcript.length > 8000 ? '...' : ''}`;

        const messages = [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: userQuestion
            }
        ];

        const openai = getClientForFeature(FEATURES.LESSON_GENERATION);
        const completion = await openai.chat.completions.create({
            model: getModelForFeature(FEATURES.LESSON_GENERATION),
            messages: messages,
            temperature: 0.7,
            max_tokens: 1000,
        });

        const aiResponse = completion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
        return aiResponse;
    } catch (error) {
        logger.error("Error in AI chat", error);
        throw error;
    }
};

export const generateCourseDescription = async (prompt) => {
    try {
        const openai = getClientForFeature(FEATURES.LESSON_GENERATION);
        const completion = await openai.chat.completions.create({
            model: getModelForFeature(FEATURES.LESSON_GENERATION),
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 500,
        });

        return completion.choices[0]?.message?.content || "";
    } catch (error) {
        logger.error("Error generating course description", error);
        throw error;
    }
}


