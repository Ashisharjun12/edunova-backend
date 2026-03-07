import logger from "../utils/logger.js";
import { getClientForFeature, getModelForFeature } from "../config/aiConfig.js";

// Feature constants (local to this file)
const FEATURES = {
  COURSE_GENERATION: 'course_generation',
  LESSON_GENERATION: 'lesson_generation',
  ASSIGNMENT_GENERATION: 'assignment_generation'
};

/**
 * Generate complete course structure using AI
 * @param {Object} coursePrompt - Course generation prompt
 * @param {string} coursePrompt.topic - Course topic/subject
 * @param {string} coursePrompt.difficulty - Course difficulty (beginner/intermediate/advanced)
 * @param {string} coursePrompt.duration - Estimated course duration (e.g., "10 hours", "5 weeks")
 * @param {string} coursePrompt.targetAudience - Target audience description
 * @param {string} coursePrompt.additionalInfo - Additional information about the course
 * @returns {Promise<Object>} - Generated course structure
 */
export const generateCourseStructure = async (coursePrompt) => {
  try {
    const {
      topic,
      difficulty = "beginner",
      duration = "10 hours",
      targetAudience = "students",
      additionalInfo = ""
    } = coursePrompt;

    if (!topic || topic.trim().length === 0) {
      throw new Error("Course topic is required");
    }

    const systemPrompt = `You are an expert course creator and educator. Your task is to generate a comprehensive course structure based on the user's requirements.

Generate a complete course structure including:
1. Course title (engaging and descriptive)
2. Short description (1-2 sentences, max 500 characters)
3. Full description (detailed, 3-5 paragraphs)
4. Requirements (array of prerequisites)
5. Learning outcomes (array of what students will learn)
6. Tags (array of relevant tags)
7. Course sections with lessons (structured curriculum)

IMPORTANT: Your response MUST be valid JSON only, no markdown, no explanations, no code blocks. Just pure JSON.

Return the response in this EXACT format:
{
  "course": {
    "title": "string",
    "shortDescription": "string (max 500 chars)",
    "description": "string (detailed, 3-5 paragraphs)",
    "difficulty": "beginner|intermediate|advanced",
    "tags": ["tag1", "tag2", "tag3"],
    "requirements": ["requirement1", "requirement2"],
    "learningOutcomes": ["outcome1", "outcome2", "outcome3"]
  },
  "sections": [
    {
      "title": "Section title",
      "description": "Section description",
      "lessons": [
        {
          "title": "Lesson title",
          "description": "Lesson description (2-3 sentences)",
          "duration": 1800,
          "youtubeVideoId": "",
          "youtubeUrl": "",
          "youtubeEmbedUrl": "",
          "youtubeTitle": "",
          "youtubeDescription": "",
          "youtubeThumbnail": "",
          "youtubeDuration": null,
          "materials": []
        }
      ]
    }
  ]
}

Guidelines:
- Create 3-6 sections depending on course complexity
- Each section should have 3-8 lessons
- Lesson durations should be realistic (in seconds, e.g., 1800 = 30 minutes)
- Make the course progressive (start easy, build complexity)
- Ensure learning outcomes align with the course content
- Requirements should be realistic prerequisites
- Tags should be relevant and searchable`;

    const userPrompt = `Create a comprehensive course on: ${topic}

Difficulty Level: ${difficulty}
Estimated Duration: ${duration}
Target Audience: ${targetAudience}
${additionalInfo ? `Additional Information: ${additionalInfo}` : ''}

Please generate a complete course structure with sections and lessons. Make it practical, well-structured, and educational.`;

    logger.info(`Generating course structure for topic: ${topic}, difficulty: ${difficulty}`);

    const openai = getClientForFeature(FEATURES.COURSE_GENERATION);
    const completion = await openai.chat.completions.create({
      model: getModelForFeature(FEATURES.COURSE_GENERATION),
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
      temperature: 0.8,
      max_tokens: 4000,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    
    // Parse JSON response
    let courseData;
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      courseData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      logger.error("Error parsing AI response", parseError);
      logger.error("Raw response:", responseText);
      throw new Error("Failed to parse AI response. Please try again.");
    }

    // Validate and structure the response
    if (!courseData.course || !courseData.sections) {
      throw new Error("Invalid course structure generated. Missing course or sections.");
    }

    // Ensure all required fields are present
    const structuredCourse = {
      course: {
        title: courseData.course.title || topic,
        shortDescription: courseData.course.shortDescription || `Learn ${topic} from scratch`,
        description: courseData.course.description || `A comprehensive course on ${topic}`,
        difficulty: courseData.course.difficulty || difficulty,
        tags: Array.isArray(courseData.course.tags) ? courseData.course.tags : [topic],
        requirements: Array.isArray(courseData.course.requirements) ? courseData.course.requirements : [],
        learningOutcomes: Array.isArray(courseData.course.learningOutcomes) ? courseData.course.learningOutcomes : []
      },
      sections: Array.isArray(courseData.sections) ? courseData.sections.map((section, sectionIndex) => ({
        id: `section-${sectionIndex + 1}`,
        title: section.title || `Section ${sectionIndex + 1}`,
        description: section.description || "",
        position: sectionIndex + 1,
        lessons: Array.isArray(section.lessons) ? section.lessons.map((lesson, lessonIndex) => ({
          id: `lesson-${sectionIndex + 1}-${lessonIndex + 1}`,
          title: lesson.title || `Lesson ${lessonIndex + 1}`,
          description: lesson.description || "",
          duration: lesson.duration || 1800, // Default 30 minutes
          position: lessonIndex + 1,
          youtubeVideoId: lesson.youtubeVideoId || "",
          youtubeUrl: lesson.youtubeUrl || "",
          youtubeEmbedUrl: lesson.youtubeEmbedUrl || "",
          youtubeTitle: lesson.youtubeTitle || lesson.title || "",
          youtubeDescription: lesson.youtubeDescription || lesson.description || "",
          youtubeThumbnail: lesson.youtubeThumbnail || "",
          youtubeDuration: lesson.youtubeDuration || null,
          materials: Array.isArray(lesson.materials) ? lesson.materials : []
        })) : []
      })) : []
    };

    logger.info(`Successfully generated course structure: ${structuredCourse.course.title}, ${structuredCourse.sections.length} sections`);
    
    return structuredCourse;
  } catch (error) {
    logger.error("Error generating course structure", error);
    throw error;
  }
};

/**
 * Generate course description only (for quick generation)
 * @param {string} topic - Course topic
 * @param {string} difficulty - Course difficulty
 * @returns {Promise<Object>} - Generated course details
 */
export const generateCourseDetails = async (topic, difficulty = "beginner") => {
  try {
    if (!topic || topic.trim().length === 0) {
      throw new Error("Course topic is required");
    }

    const prompt = `Generate course details for a course on "${topic}" with difficulty level "${difficulty}".

Return ONLY valid JSON in this format:
{
  "title": "Course Title",
  "shortDescription": "Brief description (max 500 chars)",
  "description": "Detailed description (3-5 paragraphs)",
  "tags": ["tag1", "tag2", "tag3"],
  "requirements": ["requirement1", "requirement2"],
  "learningOutcomes": ["outcome1", "outcome2", "outcome3"]
}

Make it engaging, professional, and educational.`;

    const openai = getClientForFeature(FEATURES.COURSE_GENERATION);
    const completion = await openai.chat.completions.create({
      model: getModelForFeature(FEATURES.COURSE_GENERATION),
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const courseDetails = JSON.parse(cleanedResponse);

    return {
      title: courseDetails.title || topic,
      shortDescription: courseDetails.shortDescription || `Learn ${topic}`,
      description: courseDetails.description || `A comprehensive course on ${topic}`,
      tags: Array.isArray(courseDetails.tags) ? courseDetails.tags : [topic],
      requirements: Array.isArray(courseDetails.requirements) ? courseDetails.requirements : [],
      learningOutcomes: Array.isArray(courseDetails.learningOutcomes) ? courseDetails.learningOutcomes : []
    };
  } catch (error) {
    logger.error("Error generating course details", error);
    throw error;
  }
};

/**
 * Generate section structure for an existing course
 * @param {string} courseTitle - Course title
 * @param {string} courseDescription - Course description
 * @param {number} numberOfSections - Number of sections to generate
 * @returns {Promise<Array>} - Generated sections with lessons
 */
export const generateSections = async (courseTitle, courseDescription, numberOfSections = 4) => {
  try {
    const prompt = `Generate ${numberOfSections} course sections for a course titled "${courseTitle}".

Course Description: ${courseDescription}

Return ONLY valid JSON in this format:
{
  "sections": [
    {
      "title": "Section Title",
      "description": "Section description",
      "lessons": [
        {
          "title": "Lesson Title",
          "description": "Lesson description",
          "duration": 1800
        }
      ]
    }
  ]
}

Create a logical progression from basics to advanced topics. Each section should have 3-6 lessons.`;

    const openai = getClientForFeature(FEATURES.COURSE_GENERATION);
    const completion = await openai.chat.completions.create({
      model: getModelForFeature(FEATURES.COURSE_GENERATION),
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 3000,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const data = JSON.parse(cleanedResponse);

    if (!Array.isArray(data.sections)) {
      throw new Error("Invalid sections structure");
    }

    return data.sections.map((section, sectionIndex) => ({
      id: `section-${sectionIndex + 1}`,
      title: section.title || `Section ${sectionIndex + 1}`,
      description: section.description || "",
      position: sectionIndex + 1,
      lessons: Array.isArray(section.lessons) ? section.lessons.map((lesson, lessonIndex) => ({
        id: `lesson-${sectionIndex + 1}-${lessonIndex + 1}`,
        title: lesson.title || `Lesson ${lessonIndex + 1}`,
        description: lesson.description || "",
        duration: lesson.duration || 1800,
        position: lessonIndex + 1,
        youtubeVideoId: "",
        youtubeUrl: "",
        youtubeEmbedUrl: "",
        youtubeTitle: "",
        youtubeDescription: "",
        youtubeThumbnail: "",
        youtubeDuration: null,
        materials: []
      })) : []
    }));
  } catch (error) {
    logger.error("Error generating sections", error);
    throw error;
  }
};

