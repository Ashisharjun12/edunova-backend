import { getYouTubeTranscript } from "./description.js";
import { getOpenAIClient, getAIModel } from "../utils/aiUtil.js";
import { getClientForFeature, getModelForFeature } from "../config/aiConfig.js";
import logger from "../utils/logger.js";

// Feature constants (local to this file)
const FEATURES = {
  COURSE_GENERATION: 'course_generation',
  LESSON_GENERATION: 'lesson_generation',
  ASSIGNMENT_GENERATION: 'assignment_generation'
};


/**
 * Generate MCQ quiz questions from YouTube video transcript or topic
 * @param {Object|null} lesson - Lesson object (can be null if topic is provided)
 * @param {number} numQuestions - Number of questions to generate
 * @param {string} difficulty - Difficulty level (easy, medium, hard)
 * @param {string|null} topic - Topic for quiz generation (used when lesson is null)
 * @param {string|null} courseTitle - Course title for context
 * @returns {Promise<Object>} - Object with quiz array and metadata
 */
export const generateQuizFromTranscript = async (lesson = null, numQuestions = 5, difficulty = 'medium', topic = null, courseTitle = null) => {
  try {
    let transcript = null;
    let useTranscript = false;
    let lessonTitle = '';
    let lessonDescription = '';

    // If lesson is provided, try to get transcript
    if (lesson) {
      lessonTitle = lesson.title || lesson.youtubeTitle || 'Lesson Video';
      lessonDescription = lesson.description || lesson.youtubeDescription || 'No description available';

      if (lesson.youtubeVideoId) {
        try {
          transcript = await getYouTubeTranscript(lesson.youtubeVideoId);
          if (transcript && transcript.trim().length > 0) {
            useTranscript = true;
          }
        } catch (transcriptError) {
          logger.warn(`Transcript not available for lesson, using metadata instead`);
          useTranscript = false;
        }
      }
    } else if (topic) {
      // Topic-based generation
      lessonTitle = topic;
      lessonDescription = `Quiz questions about ${topic}`;
      useTranscript = false;
    } else {
      throw new Error("Either lesson or topic must be provided");
    }

    logger.info(`Generating ${numQuestions} quiz questions with difficulty ${difficulty} using ${useTranscript ? 'transcript' : (topic ? 'topic' : 'metadata')}`);

    // Create AI prompt
    const systemPrompt = `You are an expert quiz creator. Generate multiple-choice questions (MCQ) based on the provided information.

IMPORTANT: Your response MUST be valid JSON only, no markdown, no explanations, no code blocks. Just pure JSON.

Return the response in this EXACT format:
{
  "questions": [
    {
      "question": "Question text here",
      "explanation": "Explanation of the correct answer (optional)",
      "options": [
        {
          "text": "Option 1 text",
          "isCorrect": true
        },
        {
          "text": "Option 2 text",
          "isCorrect": false
        },
        {
          "text": "Option 3 text",
          "isCorrect": false
        },
        {
          "text": "Option 4 text",
          "isCorrect": false
        }
      ]
    }
  ]
}

Guidelines:
- Generate exactly ${numQuestions} questions
- Each question must have exactly 4 options
- Only ONE option should be marked as correct (isCorrect: true)
- Questions should test understanding of key concepts
- Difficulty level: ${difficulty}
- Make questions clear and unambiguous
- Options should be plausible distractors
- Include explanations when helpful`;

    let userPrompt;
    if (useTranscript && transcript) {
      userPrompt = `Generate ${numQuestions} multiple-choice questions based on this video transcript:

Video Title: ${lessonTitle}
Video Description: ${lessonDescription}
${courseTitle ? `Course: ${courseTitle}` : ''}
Transcript:
${transcript.substring(0, 12000)}${transcript.length > 12000 ? '...' : ''}

Create questions that test understanding of the main concepts covered in this video.`;
    } else if (topic) {
      // Topic-based generation
      userPrompt = `Generate ${numQuestions} multiple-choice questions about the topic: "${topic}"

${courseTitle ? `Course Context: ${courseTitle}` : ''}

Create questions that test understanding of key concepts related to ${topic}. 
Questions should cover fundamental principles, common practices, important details, and practical applications related to this topic.
Difficulty level: ${difficulty}`;
    } else {
      // Use metadata when transcript is unavailable
      userPrompt = `Generate ${numQuestions} multiple-choice questions based on this information:

Title: ${lessonTitle}
Description: ${lessonDescription}
${courseTitle ? `Course: ${courseTitle}` : ''}

Create questions that test understanding of the main concepts that would typically be covered in content with this title and description. Base questions on common knowledge and concepts related to this topic.`;
    }

    const openai = getClientForFeature(FEATURES.LESSON_GENERATION);
    const completion = await openai.chat.completions.create({
      model: getModelForFeature(FEATURES.LESSON_GENERATION),
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    
    // Parse JSON response
    let quizData;
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      quizData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      logger.error("Error parsing AI quiz response", parseError);
      logger.error("Raw response:", responseText);
      throw new Error("Failed to parse AI response. Please try again.");
    }

    // Validate structure
    if (!quizData.questions || !Array.isArray(quizData.questions)) {
      throw new Error("Invalid quiz structure generated. Missing questions array.");
    }

    // Validate each question
    const validatedQuestions = quizData.questions.map((q, index) => {
      if (!q.question || !q.options || !Array.isArray(q.options) || q.options.length !== 4) {
        throw new Error(`Invalid question ${index + 1}: Must have question text and exactly 4 options`);
      }

      const correctCount = q.options.filter(opt => opt.isCorrect === true).length;
      if (correctCount !== 1) {
        throw new Error(`Invalid question ${index + 1}: Must have exactly one correct answer`);
      }

      return {
        question: q.question.trim(),
        explanation: q.explanation?.trim() || null,
        options: q.options.map(opt => ({
          text: opt.text.trim(),
          isCorrect: opt.isCorrect === true
        }))
      };
    });

    logger.info(`Successfully generated ${validatedQuestions.length} quiz questions`);
    
    return {
      quiz: validatedQuestions,
      metadata: {
        source: useTranscript ? 'transcript' : (topic ? 'topic' : 'metadata'),
        topic: topic || lessonTitle,
        numQuestions: validatedQuestions.length,
        difficulty
      }
    };
  } catch (error) {
    logger.error("Error generating quiz", error);
    throw error;
  }
};

