import { getOpenAIClient, getModel, getAudioClient, getAudioModel } from '../../config/aiConfig.js';
import logger from '../../utils/logger.js';

/**
 * Generate interview questions based on resume and job role
 * @param {string} resumeText - Extracted resume text (used when resumeId not provided)
 * @param {string} jobRole - Job role/position
 * @param {string} jobDescription - Optional job description
 * @param {string} interviewSubtype - Interview subtype name (HR, Technical, etc.)
 * @param {string} interviewType - Interview type ('ai_text_voice' or 'ai_coding')
 * @param {string} interviewSubtypeCategory - Optional interview subtype category (hr, technical, behavioral, etc.)
 * @param {string} difficultyLevel - Difficulty level ('easy', 'medium', 'hard')
 * @param {string} interviewSubtypeDescription - Optional interview subtype description
 * @returns {Promise<Array>} Array of question objects
 */
export const generateInterviewQuestions = async (
  resumeText,
  jobRole,
  jobDescription = null,
  interviewSubtype = null,
  interviewType = 'ai_text_voice',
  interviewSubtypeCategory = null,
  difficultyLevel = 'medium',
  interviewSubtypeDescription = null
) => {
  try {
    const client = getOpenAIClient('generation');
    const model = getModel('generation');

    // SIMPLIFIED: Just use resumeText directly (no vector search, no complex fallbacks)
    let resumeContext = '';
    const hasResume = resumeText && resumeText.trim().length > 0;
    
    if (hasResume) {
      // Use full resume text for context (limit to 3000 chars to avoid token limits)
      const resumeTextToUse = resumeText.trim().length > 3000 
        ? resumeText.trim().substring(0, 3000) + '...' 
        : resumeText.trim();
      resumeContext = `CANDIDATE'S RESUME CONTENT:\n${resumeTextToUse}\n\nIMPORTANT: All questions MUST be personalized based on this resume. Reference specific skills, experiences, projects, and technologies mentioned in the resume.`;
      console.log(`[QUESTION GENERATION] Using resume text (${resumeText.length} chars, using ${resumeTextToUse.length} chars)`);
    } else {
      resumeContext = '';
      console.log(`[QUESTION GENERATION] No resume text provided - generating general questions`);
    }

    let prompt = '';
    
    console.log(`[QUESTION GENERATION] Building prompt for:`);
    console.log(`[QUESTION GENERATION] - Job Role: ${jobRole}`);
    console.log(`[QUESTION GENERATION] - Difficulty: ${difficultyLevel}`);
    console.log(`[QUESTION GENERATION] - Interview Type: ${interviewType}`);
    console.log(`[QUESTION GENERATION] - Interview Subtype: ${interviewSubtype || 'none'}`);
    console.log(`[QUESTION GENERATION] - Interview Subtype Category: ${interviewSubtypeCategory || 'none'}`);
    console.log(`[QUESTION GENERATION] - Interview Subtype Description: ${interviewSubtypeDescription || 'none'}`);
    console.log(`[QUESTION GENERATION] - Resume Context: ${resumeContext ? resumeContext.length + ' chars' : 'none'}`);
    
    // Map difficulty level to question count and complexity
    const difficultyConfig = {
      easy: { count: '5-6', complexity: 'basic to intermediate', description: 'Focus on fundamental concepts and straightforward problems' },
      medium: { count: '6-8', complexity: 'intermediate', description: 'Include moderate complexity problems requiring good understanding' },
      hard: { count: '7-10', complexity: 'intermediate to advanced', description: 'Include challenging problems that test deep knowledge and problem-solving skills' }
    };

    const config = difficultyConfig[difficultyLevel] || difficultyConfig.medium;
    console.log(`[QUESTION GENERATION] Difficulty config: ${config.count} questions, ${config.complexity} complexity`);

    // Build category context section
    let categoryContext = '';
    if (interviewSubtypeCategory || interviewSubtypeDescription || interviewSubtype) {
      categoryContext = '\nInterview Category Context:\n';
      if (interviewSubtype) {
        categoryContext += `- Interview Type: ${interviewSubtype}\n`;
      }
      if (interviewSubtypeCategory) {
        categoryContext += `- Category: ${interviewSubtypeCategory}\n`;
      }
      if (interviewSubtypeDescription) {
        categoryContext += `- Description: ${interviewSubtypeDescription}\n`;
      }
      categoryContext += '\n';
    }

    if (interviewType === 'ai_coding') {
      prompt = `Generate ${config.count} coding interview questions for a ${jobRole} position. Difficulty Level: ${difficultyLevel.toUpperCase()}.

${hasResume ? resumeContext : 'Note: No resume provided - generate general coding questions for this role.\n'}

${jobDescription ? `Job Description:\n${jobDescription}\n` : ''}
${categoryContext}

${hasResume ? `CRITICAL INSTRUCTIONS FOR RESUME-BASED CODING QUESTIONS:
- Generate coding problems that relate to technologies, languages, or frameworks mentioned in the candidate's resume
- If the resume shows experience with specific programming languages (e.g., Python, JavaScript, Java), create problems in those languages
- Reference projects or work experience from the resume when creating problem scenarios
- Match the difficulty to their experience level shown in the resume
- Make problems relevant to their actual background and skills
- DO NOT generate generic coding problems - personalize them based on the resume\n` : ''}

Generate coding challenges/problems that:
1. ${hasResume ? 'Are PERSONALIZED based on the candidate\'s resume - use technologies and languages from their background' : 'Assess technical skills relevant to the role'}
2. Match the candidate's experience level${interviewSubtypeCategory ? ` and align with ${interviewSubtypeCategory} interview focus` : ''}
3. Include test cases for each problem
4. Difficulty: ${config.complexity} (${config.description})
5. Questions should be appropriate for ${difficultyLevel} level difficulty
6. ${interviewSubtypeDescription ? `Focus on: ${interviewSubtypeDescription}` : ''}

Return a JSON array with this structure:
[
  {
    "id": "q1",
    "question": "Question text",
    "type": "coding",
    "difficulty": "easy|medium|hard",
    "language": "javascript|python|java|etc",
    "testCases": [
      {"input": "...", "expectedOutput": "..."},
      ...
    ],
    "hints": ["hint1", "hint2"]
  },
  ...
]`;
    } else {
      prompt = `Generate ${config.count} interview questions for a ${jobRole} position. Difficulty Level: ${difficultyLevel.toUpperCase()}.

${hasResume ? resumeContext : 'Note: No resume provided - generate general interview questions for this role.\n'}

${jobDescription ? `Job Description:\n${jobDescription}\n` : ''}
${categoryContext}

${hasResume ? `CRITICAL INSTRUCTIONS FOR RESUME-BASED QUESTIONS:
- You MUST generate questions that are PERSONALIZED to this specific candidate's resume
- Reference specific technologies, tools, frameworks, or languages mentioned in their resume
- Ask about their actual projects, work experience, or education listed in the resume
- Connect questions to their specific background and experience
- Make questions relevant to their skill level based on what's in the resume
- If the resume shows experience with specific technologies, ask about those technologies
- If the resume mentions projects, ask about those projects or similar ones
- DO NOT generate generic questions - every question should relate to something in the resume\n` : ''}

Generate questions that:
1. ${hasResume ? 'Are PERSONALIZED based on the candidate\'s resume content - reference specific skills, projects, and experiences' : 'Assess technical skills and experience appropriate for ' + difficultyLevel + ' level'}
2. Evaluate behavioral competencies${interviewSubtypeCategory === 'behavioral' ? ' (with emphasis on behavioral aspects)' : ''}
3. Test problem-solving abilities
4. ${hasResume ? 'Directly relate to the candidate\'s background, experience, and skills shown in the resume' : 'Be relevant to the job role'}
5. Difficulty: ${config.complexity} (${config.description})
6. ${interviewSubtypeCategory ? `Focus on ${interviewSubtypeCategory} interview aspects` : ''}
7. ${interviewSubtypeDescription ? `Specifically address: ${interviewSubtypeDescription}` : ''}

Return a JSON array with this structure:
[
  {
    "id": "q1",
    "question": "Question text",
    "type": "technical|behavioral|general",
    "expectedTopics": ["topic1", "topic2"],
    "difficulty": "easy|medium|hard"
  },
  ...
]`;
    }

    console.log(`[QUESTION GENERATION] Prompt length: ${prompt.length} characters`);
    console.log(`[QUESTION GENERATION] Sending request to OpenAI (model: ${model})...`);
    
    const openaiStart = Date.now();
    const systemPrompt = hasResume 
      ? 'You are an expert interviewer. Generate structured, PERSONALIZED interview questions based on the candidate\'s resume. Every question must relate to their specific background, skills, projects, or experiences mentioned in the resume. Generate questions in valid JSON format only. Do not include any text outside the JSON array.'
      : 'You are an expert interviewer. Generate structured interview questions in valid JSON format only. Do not include any text outside the JSON array.';
    
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });
    const openaiDuration = Date.now() - openaiStart;
    console.log(`[QUESTION GENERATION] OpenAI API call completed in ${openaiDuration}ms`);
    console.log(`[QUESTION GENERATION] Response tokens: ${response.usage?.total_tokens || 'unknown'}`);

    const content = response.choices[0].message.content.trim();
    console.log(`[QUESTION GENERATION] Response content length: ${content.length} characters`);
    console.log(`[QUESTION GENERATION] Response preview (first 200 chars): ${content.substring(0, 200)}...`);
    
    // Extract JSON from response (handle markdown code blocks)
    let jsonContent = content;
    if (content.startsWith('```json')) {
      jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (content.startsWith('```')) {
      jsonContent = content.replace(/```\n?/g, '');
    }

    const parseStart = Date.now();
    const questions = JSON.parse(jsonContent);
    const parseDuration = Date.now() - parseStart;
    console.log(`[QUESTION GENERATION] JSON parsing completed in ${parseDuration}ms`);
    
    if (!Array.isArray(questions)) {
      throw new Error('Generated questions must be an array');
    }

    logger.info(`Generated ${questions.length} interview questions for ${jobRole}`);
    console.log(`[QUESTION GENERATION] ✅ Successfully generated ${questions.length} questions`);
    console.log(`[QUESTION GENERATION] Question IDs:`, questions.map(q => q.id).join(', '));
    return questions;
  } catch (error) {
    logger.error('Error generating interview questions:', error);
    throw error;
  }
};

/**
 * Generate coding questions specifically
 * @param {string} resumeText - Extracted resume text
 * @param {string} jobRole - Job role
 * @param {string} interviewSubtype - Interview subtype
 * @returns {Promise<Array>} Array of coding question objects
 */
export const generateCodingQuestions = async (resumeText, jobRole, interviewSubtype = null) => {
  return generateInterviewQuestions(resumeText, jobRole, null, interviewSubtype, 'ai_coding');
};

/**
 * Transcribe voice audio to text
 * @param {Buffer} audioBuffer - Audio file buffer
 * @returns {Promise<string>} Transcribed text
 */
export const transcribeVoice = async (audioBuffer) => {
  try {
    const client = getOpenAIClient('generation');
    const model = 'whisper-1'; // Whisper model for transcription

    // Convert buffer to File-like object for OpenAI API
    const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

    const transcription = await client.audio.transcriptions.create({
      file: audioFile,
      model: model,
      language: 'en', // Optional: specify language
    });

    return transcription.text;
  } catch (error) {
    logger.error('Error transcribing voice:', error);
    throw error;
  }
};

/**
 * Analyze audio with AI using voxtral model
 * @param {Buffer} audioBuffer - Audio file buffer
 * @returns {Promise<Object>} AI-powered audio analysis with metrics
 */
export const analyzeAudioWithAI = async (audioBuffer) => {
  try {
    const client = getAudioClient();
    const model = getAudioModel();
    
    // Convert buffer to base64
    const audioBase64 = audioBuffer.toString('base64');
    
    // Determine audio format (assuming webm, but could be wav/mp3)
    // For voxtral, we'll use wav format
    const format = 'wav'; // You may need to convert webm to wav first
    
    logger.info(`[Audio AI] Analyzing audio with model: ${model}`);
    
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this audio recording for an interview answer. Provide a detailed analysis including: 1) Content summary (what was said), 2) Confidence level (0-1 score for audio quality and clarity), 3) Fluency assessment (poor/fair/good/excellent), 4) Speaking pace (slow/moderate/fast), 5) Number of significant pauses, 6) Professionalism score (0-1), 7) Articulation quality (unclear/clear/very clear), 8) Specific recommendations for improvement. Return your analysis in JSON format with these exact keys: content, confidence, fluency, pace, pauses, professionalism, articulation, recommendations.'
            },
            {
              type: 'input_audio',
              input_audio: {
                data: audioBase64,
                format: format
              }
            }
          ]
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent analysis
    });
    
    const analysisText = response.choices[0].message.content;
    logger.info(`[Audio AI] Received analysis response (${analysisText.length} chars)`);
    
    // Try to parse JSON from response
    let analysis = {};
    try {
      // Extract JSON if wrapped in markdown
      let jsonText = analysisText;
      if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0].trim();
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0].trim();
      }
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      logger.warn('[Audio AI] Failed to parse JSON, using text analysis');
      // Fallback: extract key information from text
      analysis = {
        content: analysisText,
        confidence: 0.7, // Default
        fluency: 'good',
        pace: 'moderate',
        pauses: 0,
        professionalism: 0.7,
        articulation: 'clear',
        recommendations: ['Review audio analysis manually']
      };
    }
    
    return {
      ...analysis,
      aiAnalyzed: true,
      model: model,
    };
  } catch (error) {
    logger.error('[Audio AI] Error analyzing audio with AI:', error);
    // Fallback to basic analysis if AI fails
    return await analyzeVoice(audioBuffer);
  }
};

/**
 * Analyze voice characteristics (fallback/basic analysis)
 * @param {Buffer} audioBuffer - Audio file buffer
 * @returns {Promise<Object>} Voice analysis metrics
 */
export const analyzeVoice = async (audioBuffer) => {
  try {
    // Transcribe first to get text
    const transcription = await transcribeVoice(audioBuffer);
    
    // Basic analysis based on transcription
    const wordCount = transcription.split(/\s+/).length;
    const charCount = transcription.length;
    const avgWordLength = wordCount > 0 ? charCount / wordCount : 0;
    
    // Estimate speaking pace (words per minute - rough estimate)
    // Assuming average speaking rate of 150 WPM
    const estimatedDuration = audioBuffer.length / 16000; // Rough estimate
    const wpm = estimatedDuration > 0 ? wordCount / (estimatedDuration / 60) : 0;
    
    return {
      transcription,
      wordCount,
      charCount,
      avgWordLength,
      estimatedWPM: Math.round(wpm),
      clarity: wpm > 100 && wpm < 200 ? 'good' : wpm < 100 ? 'slow' : 'fast',
      confidence: 0.7, // Default confidence
      fluency: wpm > 100 && wpm < 200 ? 'good' : 'fair',
      pace: wpm < 100 ? 'slow' : wpm > 200 ? 'fast' : 'moderate',
      pauses: 0,
      professionalism: 0.7,
      articulation: 'clear',
      tone: 'neutral',
      aiAnalyzed: false,
    };
  } catch (error) {
    logger.error('Error analyzing voice:', error);
    throw error;
  }
};

/**
 * Execute code in sandboxed environment
 * @param {string} code - Code to execute
 * @param {string} language - Programming language
 * @param {Array} testCases - Test cases to run
 * @returns {Promise<Object>} Execution results
 */
export const executeCode = async (code, language, testCases = []) => {
  try {
    // For now, return mock execution results
    // In production, integrate with a code execution service like:
    // - Judge0 API
    // - Piston API
    // - Custom Docker-based sandbox
    
    logger.info(`Executing ${language} code (${testCases.length} test cases)`);
    
    // Mock execution results
    const results = testCases.map((testCase, index) => {
      // In production, actually execute code and run tests
      return {
        testCaseIndex: index,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: null, // Would be actual output
        passed: false, // Would be actual result
        executionTime: 0,
        error: null,
      };
    });

    return {
      success: true,
      results,
      totalTests: testCases.length,
      passedTests: 0,
      failedTests: testCases.length,
      executionTime: 0,
      output: '',
      error: null,
    };
  } catch (error) {
    logger.error('Error executing code:', error);
    return {
      success: false,
      error: error.message,
      results: [],
    };
  }
};

/**
 * Generate comprehensive feedback report
 * @param {Object} interviewData - Interview data including answers
 * @param {string} interviewType - Interview type
 * @returns {Promise<Object>} Feedback report object
 */
export const generateFeedbackReport = async (interviewData, interviewType = 'ai_text_voice') => {
  try {
    const client = getOpenAIClient('generation');
    const model = getModel('generation');

    // Build comprehensive context information
    let contextInfo = '';
    if (interviewData.interviewCategory) {
      contextInfo += `Interview Category: ${interviewData.interviewCategory}\n`;
    }
    if (interviewData.interviewSubtype) {
      contextInfo += `Interview Type: ${interviewData.interviewSubtype}\n`;
    }
    if (interviewData.interviewSubtypeDescription) {
      contextInfo += `Category Description: ${interviewData.interviewSubtypeDescription}\n`;
      contextInfo += `This interview focuses on: ${interviewData.interviewSubtypeDescription}\n`;
    }
    if (interviewData.resumeBased && interviewData.resumeText) {
      contextInfo += `Resume-Based Interview: Yes${interviewData.resumeFileName ? ` (Resume: ${interviewData.resumeFileName})` : ''}\n`;
      contextInfo += `Candidate's Resume Context:\n${interviewData.resumeText}\n`;
      contextInfo += `Note: Questions were personalized based on the candidate's resume. Evaluate answers in context of their background.\n`;
    } else if (interviewData.resumeBased) {
      contextInfo += `Resume-Based Interview: Yes${interviewData.resumeFileName ? ` (Resume: ${interviewData.resumeFileName})` : ''}\n`;
      contextInfo += `Note: Questions were personalized based on the candidate's resume.\n`;
    } else {
      contextInfo += `Resume-Based Interview: No (General interview questions)\n`;
    }
    if (interviewData.difficultyLevel) {
      contextInfo += `Difficulty Level: ${interviewData.difficultyLevel}\n`;
      contextInfo += `Expected Answer Depth: ${interviewData.difficultyLevel === 'easy' ? 'Basic understanding and simple examples' : interviewData.difficultyLevel === 'medium' ? 'Moderate depth with specific examples and some analysis' : 'Deep understanding with detailed examples, analysis, and critical thinking'}\n`;
    }
    if (interviewData.jobDescription) {
      contextInfo += `Job Description: ${interviewData.jobDescription}\n`;
    }

    let prompt = '';
    
    if (interviewType === 'ai_coding') {
      prompt = `Analyze this coding interview and generate comprehensive feedback:

Job Role: ${interviewData.jobRole}
${contextInfo}
Questions: ${JSON.stringify(interviewData.questions)}
Answers: ${JSON.stringify(interviewData.answers)}
Code Submissions: ${JSON.stringify(interviewData.codeSubmissions)}

Generate feedback with:
1. Overall score (0-100) - consider ${interviewData.interviewCategory ? `the ${interviewData.interviewCategory} interview context` : 'the interview context'}
2. Technical skills assessment${interviewData.resumeBased ? ' (compare with resume experience)' : ''}
3. Code quality evaluation
4. Problem-solving ability
5. Strengths and weaknesses${interviewData.interviewCategory ? ` (focus on ${interviewData.interviewCategory} aspects)` : ''}
6. Recommendations for improvement${interviewData.resumeBased ? ' (consider resume background)' : ''}
7. ${interviewData.interviewCategory ? `Category-specific insights for ${interviewData.interviewCategory} interviews` : 'General interview insights'}

Return JSON:
{
  "overallScore": 75,
  "scores": {
    "technical": 80,
    "codeQuality": 70,
    "problemSolving": 75,
    "communication": 0
  },
  "strengths": ["..."],
  "weaknesses": ["..."],
  "recommendations": ["..."],
  "categoryInsights": "${interviewData.interviewCategory ? `Specific insights for ${interviewData.interviewCategory} interview performance` : ''}",
  "resumeBasedFeedback": ${interviewData.resumeBased ? '"How answers align with resume experience"' : 'null'},
  "detailedFeedback": {
    "question1": { "score": 80, "feedback": "..." },
    ...
  }
}`;
    } else {
      // Determine score categories based on interview category
      let scoreCategories = {
        technical: "Technical knowledge and skills",
        communication: "Communication skills and clarity",
        confidence: "Confidence and presentation",
        problemSolving: "Problem-solving ability"
      };

      if (interviewData.interviewCategory === 'hr') {
        scoreCategories = {
          communication: "Communication and interpersonal skills",
          behavioral: "Behavioral responses and examples",
          culturalFit: "Cultural fit and values alignment",
          leadership: "Leadership and teamwork potential"
        };
      } else if (interviewData.interviewCategory === 'behavioral') {
        scoreCategories = {
          communication: "Communication and articulation",
          behavioral: "Behavioral examples and STAR method",
          problemSolving: "Problem-solving approach",
          adaptability: "Adaptability and learning"
        };
      } else if (interviewData.interviewCategory === 'technical') {
        scoreCategories = {
          technical: "Technical knowledge and expertise",
          problemSolving: "Problem-solving and analytical skills",
          communication: "Technical communication",
          depth: "Depth of understanding"
        };
      } else if (interviewData.interviewCategory === 'telephonic') {
        scoreCategories = {
          communication: "Verbal communication clarity",
          confidence: "Confidence over phone",
          articulation: "Articulation and expression",
          listening: "Listening and response quality"
        };
      }

      const scoreKeys = Object.keys(scoreCategories);
      const scoreLabels = Object.values(scoreCategories);

      // Build question-answer pairs for better analysis
      const questionAnswerPairs = interviewData.questions.map((q, idx) => {
        const answer = interviewData.answers.find(a => a.questionIndex === idx) || interviewData.answers[idx];
        return {
          questionId: q.id || `q${idx + 1}`,
          question: q.question,
          questionType: q.type || 'general',
          expectedTopics: q.expectedTopics || [],
          difficulty: q.difficulty || interviewData.difficultyLevel || 'medium',
          answer: answer?.textAnswer || answer?.transcription || 'No answer provided',
          hasVoice: !!answer?.voiceAnswerUrl,
          voiceAnalysis: answer?.voiceAnalysis || null,
        };
      });

      // Build category-specific evaluation criteria
      let evaluationCriteria = '';
      if (interviewData.interviewCategory === 'hr') {
        evaluationCriteria = `
Evaluation Criteria for HR Interview:
- Communication Skills: Clarity, professionalism, ability to articulate thoughts
- Behavioral Examples: Use of specific examples, STAR method (Situation, Task, Action, Result)
- Cultural Fit: Alignment with company values, team collaboration, work style
- Leadership Potential: Examples of leadership, initiative, problem-solving
- Interpersonal Skills: Empathy, conflict resolution, teamwork examples`;
      } else if (interviewData.interviewCategory === 'behavioral') {
        evaluationCriteria = `
Evaluation Criteria for Behavioral Interview:
- STAR Method Usage: Clear Situation, Task, Action, Result structure
- Specific Examples: Concrete, detailed examples rather than vague statements
- Outcomes and Impact: Quantifiable results and measurable impact
- Self-Awareness: Reflection on experiences, lessons learned
- Problem-Solving: How candidate approached and resolved challenges`;
      } else if (interviewData.interviewCategory === 'technical') {
        evaluationCriteria = `
Evaluation Criteria for Technical Interview:
- Technical Accuracy: Correctness of technical concepts and knowledge
- Problem-Solving Approach: Logical thinking, step-by-step reasoning
- Depth of Knowledge: Understanding beyond surface level, ability to explain concepts
- Practical Application: Real-world examples, hands-on experience
- Communication: Ability to explain technical concepts clearly`;
      } else if (interviewData.interviewCategory === 'telephonic') {
        evaluationCriteria = `
Evaluation Criteria for Telephonic Interview:
- Verbal Clarity: Clear pronunciation, appropriate pace, articulation
- Phone Communication: Ability to communicate effectively without visual cues
- Listening Skills: Understanding questions, appropriate responses
- Confidence: Comfortable speaking over phone, professional tone
- Engagement: Active participation, asking clarifying questions when needed`;
      } else {
        evaluationCriteria = `
Evaluation Criteria:
- Content Quality: Relevance, accuracy, completeness
- Depth: Level of detail and analysis provided
- Communication: Clarity, structure, articulation
- Examples: Use of specific, relevant examples
- Alignment: How well answer addresses the question`;
      }

      prompt = `You are an expert interview evaluator. Analyze this interview and generate comprehensive, accurate feedback based on the candidate's actual answers.

INTERVIEW CONTEXT:
Job Role: ${interviewData.jobRole}
${contextInfo}

QUESTION-ANSWER PAIRS:
${JSON.stringify(questionAnswerPairs, null, 2)}

${evaluationCriteria}

ANALYSIS INSTRUCTIONS:
1. For EACH question-answer pair, FIRST check:
   - If answer is empty, "No answer provided", "N/A", "I don't know", or similar non-answers → Score: 0%
   - If answer is less than 10 words or clearly useless/unrelated → Score: 0-10%
   - If answer is generic/vague without any substance (e.g., "I'm good at this", "I have experience") → Score: 10-20%
   - Only proceed to detailed evaluation if answer has meaningful content

2. For answers with meaningful content, evaluate:
   - Answer Quality: How well does the answer address the question?
   - Relevance: Is the answer relevant to the question asked?
   - Depth: Does the answer show appropriate depth for ${interviewData.difficultyLevel || 'medium'} level?
   - Specificity: Are there concrete examples or vague generalities?
   - Completeness: Does the answer address all parts of the question?
   ${interviewData.resumeBased ? '- Resume Alignment: How does the answer relate to or contradict the candidate\'s resume experience?' : ''}
   ${interviewData.interviewCategory === 'behavioral' ? '- STAR Method: Does the answer follow Situation-Task-Action-Result structure?' : ''}
   ${interviewData.interviewCategory === 'technical' ? '- Technical Accuracy: Are technical concepts explained correctly?' : ''}
   ${interviewData.interviewCategory === 'hr' ? '- Cultural Fit: Does the answer show alignment with professional values?' : ''}
   ${interviewData.interviewCategory === 'telephonic' ? '- Verbal Communication: How clear and professional is the verbal delivery?' : ''}

3. STRICT Scoring Guidelines (be harsh on poor answers):
   - 0%: No answer, empty answer, "I don't know", or completely useless/unrelated answer
   - 1-10%: Answer exists but is completely irrelevant or meaningless (e.g., single word, gibberish)
   - 11-20%: Answer is generic/vague with no substance (e.g., "I'm good", "I have experience" without details)
   - 21-30%: Answer attempts to address question but fails completely or is mostly irrelevant
   - 31-40%: Answer is partially relevant but lacks depth and specific examples
   - 41-50%: Answer addresses question but is superficial, lacks examples, or misses key points
   - 51-60%: Adequate answer but lacks depth or specific examples for the difficulty level
   - 61-70%: Good answer with some examples but could use more depth or analysis
   - 71-80%: Strong answer with good examples and solid understanding
   - 81-90%: Very strong answer with excellent examples, depth, and relevance
   - 91-100: Exceptional answer with outstanding examples, deep analysis, and perfect relevance

4. Overall Score Calculation:
   - Calculate average of all question scores (including 0% for no answers)
   - If multiple questions have 0% scores, overall score should reflect this harshly
   - Adjust based on consistency: If candidate answered some well but skipped others, penalize accordingly
   - Consider difficulty level expectations: Higher difficulty requires better answers for same score
   - Factor in category-specific requirements
   - If more than 50% of answers are 0% or below 30%, overall score should not exceed 40%

5. Strengths: 
   - Only identify strengths if candidate has meaningful answers (score > 40%)
   - If most answers are poor (below 40%), list "No significant strengths identified" or focus on minor positives
   - Be specific and reference actual answer content

6. Weaknesses: 
   - MUST identify if answers are missing, empty, or useless
   - Highlight lack of examples, depth, or relevance
   - Be specific about what's missing or wrong in answers
   - If answers are 0%, explicitly state "No answer provided" or "Answer was empty/useless"

7. Recommendations: 
   - If answers are 0% or very low, recommend: "Provide complete answers to all questions"
   - Provide actionable, specific recommendations tied to actual answer weaknesses
   - Focus on improving answer quality, depth, and relevance

RETURN FORMAT (Valid JSON only):
{
  "overallScore": <number 0-100>,
  "scores": {
    ${scoreKeys.map((key) => `"${key}": <number 0-100>`).join(',\n    ')}
  },
  "strengths": ["<specific strength from actual answers>", ...],
  "weaknesses": ["<specific weakness from actual answers>", ...],
  "recommendations": ["<specific actionable recommendation>", ...],
  "categoryInsights": "${interviewData.interviewCategory ? `<specific insights for ${interviewData.interviewCategory} interview performance>` : '<general interview insights>'}",
  "resumeBasedFeedback": ${interviewData.resumeBased ? '"<how answers align with resume experience>"' : 'null'},
  "detailedFeedback": {
    ${questionAnswerPairs.map((pair, idx) => `"${pair.questionId}": {
      "question": "${pair.question.replace(/"/g, '\\"')}",
      "answer": "${pair.answer.replace(/"/g, '\\"').substring(0, 500)}",
      "score": <number 0-100>,
      "feedback": "<detailed analysis of this specific answer>",
      "strengths": ["<what was good>"],
      "improvements": ["<what could be improved>"],
      ${pair.voiceAnalysis ? `"voiceAnalysis": ${JSON.stringify(pair.voiceAnalysis)},` : ''}
      "questionType": "${pair.questionType}",
      "difficulty": "${pair.difficulty}"
    }`).join(',\n    ')}
  }
}

CRITICAL GRADING RULES:
1. EMPTY/USELESS ANSWERS = 0%:
   - "No answer provided", empty string, "N/A", "I don't know" → 0%
   - Answers less than 10 words with no substance → 0-10%
   - Completely unrelated or gibberish answers → 0%

2. BE STRICT AND ACCURATE:
   - Don't give points for attempts without substance
   - Generic answers without examples deserve low scores (10-30%)
   - Only reward answers that actually address the question with meaningful content
   - Missing answers should significantly impact overall score

3. ANSWER QUALITY CHECKLIST (must have for score > 50%):
   - Answer addresses the question asked
   - Contains specific examples or details
   - Shows understanding of the topic
   - Appropriate depth for difficulty level
   - Relevant to the job role/category

4. FEEDBACK REQUIREMENTS:
   - Base ALL scores and feedback on actual answer content, not assumptions
   - Be specific and reference actual answer content in feedback
   - If answer is 0%, explicitly state why (empty, useless, irrelevant)
   - Scores should reflect answer quality relative to question difficulty
   - Provide actionable, specific recommendations
   - Ensure all JSON is valid and properly escaped

5. EXAMPLE SCORING:
   - Q: "Tell me about a challenging project" → A: "" → Score: 0%
   - Q: "Tell me about a challenging project" → A: "I don't know" → Score: 0%
   - Q: "Tell me about a challenging project" → A: "It was hard" → Score: 10-15%
   - Q: "Tell me about a challenging project" → A: "I worked on a project" → Score: 20-30%
   - Q: "Tell me about a challenging project" → A: "I worked on X project where I did Y and achieved Z" → Score: 60-80%`;
    }

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert interview evaluator with deep knowledge of interview assessment. Generate comprehensive, accurate feedback based on actual candidate answers. Always return valid JSON format only. Be specific and reference actual answer content in your feedback.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.5, // Lower temperature for more consistent, accurate evaluation
      max_tokens: 4000, // Increased for more detailed feedback
    });

    const content = response.choices[0].message.content.trim();
    
    // Extract JSON from response
    let jsonContent = content;
    if (content.startsWith('```json')) {
      jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (content.startsWith('```')) {
      jsonContent = content.replace(/```\n?/g, '');
    }

    const feedback = JSON.parse(jsonContent);
    
    logger.info(`Generated feedback report for interview`);
    return feedback;
  } catch (error) {
    logger.error('Error generating feedback report:', error);
    throw error;
  }
};


