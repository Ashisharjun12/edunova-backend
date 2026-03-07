import { VapiClient } from '@vapi-ai/server-sdk';
import { _config } from '../../config/config.js';
import logger from '../../utils/logger.js';

let vapiClient = null;

// Initialize Vapi client
if (_config.VAPI_API_KEY) {
  try {
    vapiClient = new VapiClient({ token: _config.VAPI_API_KEY });
    logger.info('Vapi client initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Vapi client:', error);
  }
} else {
  logger.warn('VAPI_API_KEY not configured. Telephonic interviews will not work.');
  logger.warn('Please set VAPI_API_KEY in your .env file. For server-side operations, use your PRIVATE key from Vapi dashboard.');
}

/**
 * Initiate a telephonic call using Vapi
 * @param {string} interviewId - Interview ID
 * @param {string} phoneNumber - Phone number to call (E.164 format)
 * @param {string} language - Language preference ('hindi' or 'english')
 * @param {Array} questions - Generated interview questions
 * @param {Object} interviewData - Additional interview data (jobRole, difficultyLevel, etc.)
 * @returns {Promise<Object>} Call object with call ID
 */
export const initiateTelephonicCall = async (interviewId, phoneNumber, language, questions, interviewData = {}) => {
  if (!vapiClient) {
    const errorMsg = 'Vapi client not initialized. Please configure VAPI_API_KEY in .env file. For server-side operations, use your PRIVATE key from Vapi dashboard.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Verify API key is set
  if (!_config.VAPI_API_KEY) {
    const errorMsg = 'VAPI_API_KEY is not set in environment variables. Please add it to your .env file.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    // Format phone number to E.164 format (remove all non-digit chars except leading +)
    let formattedPhone = phoneNumber.trim();
    
    // Remove all characters except digits and +
    formattedPhone = formattedPhone.replace(/[^\d+]/g, '');
    
    // Ensure it starts with +
    if (!formattedPhone.startsWith('+')) {
      // If it doesn't start with +, add it
      formattedPhone = '+' + formattedPhone;
    }
    
    // Validate the formatted phone number
    if (!formattedPhone || formattedPhone.length < 8) {
      throw new Error(`Invalid phone number format: ${phoneNumber}. Expected E.164 format (e.g., +17345931356)`);
    }
    
    logger.info(`Phone number formatted: ${phoneNumber} -> ${formattedPhone}`);
    
    // Configure language-specific settings
    const languageConfig = {
      hindi: {
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'hi'
        },
        voice: {
          provider: '11labs',
          voiceId: 'HBwtuRG9VQfaoE2YVMYf' // Default voice - can be changed to Hindi-specific voice
        }
      },
      english: {
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en-US'
        },
        voice: {
          provider: '11labs',
          voiceId: '7o7NVjSnoBpJFCxEr4uF'
        }
      }
    };

    const langConfig = languageConfig[language] || languageConfig.english;

    // Format questions for system prompt
    const questionList = questions && questions.length > 0
      ? questions.map((q, idx) => `${idx + 1}. ${q.question}`).join('\n')
      : 'No specific questions provided. Conduct a general interview.';

    // Create system prompt
    const totalQuestions = questions?.length || 0;
    const endCallMessage = language === 'hindi' 
      ? 'Thank you! Aapka interview complete ho gaya hai. Aapka report card jaldi hi ready ho jayega. Please call end kar dijiye.'
      : 'Thank you! Your interview is complete. Your report card will be generated shortly. Please end the call now.';
    
    const systemPrompt = `You are an AI voice assistant conducting a telephonic interview for the position of ${interviewData.jobRole || 'a job'}.

Your job is to ask the candidate the provided interview questions and assess their responses professionally.

Guidelines:
- Begin with a friendly introduction in ${language === 'hindi' ? 'Hinglish (Hindi + English mix)' : 'English'}
- Ask one question at a time and wait for the candidate's response
- Keep questions clear and concise
- Provide brief, encouraging feedback after each answer
- Keep the conversation natural and engaging
- Track which questions you've asked (there are ${totalQuestions} total questions)
- After asking ALL ${totalQuestions} questions and receiving answers, you MUST:
  1. Give a brief summary of their performance
  2. Use the endCall tool to end the call (it will automatically say the closing message)

Questions to ask (${totalQuestions} total):
${questionList}

IMPORTANT: After asking question ${totalQuestions} and receiving the answer, immediately use the endCall tool to end the call. The tool will automatically deliver the closing message. Do not ask any additional questions.

Key Guidelines:
- Be friendly, engaging, and professional
- Keep responses short and natural
- Adapt based on the candidate's confidence level
- Focus on the technical and behavioral aspects of the role
- ${language === 'hindi' ? 'Speak in Hinglish (Hindi + English mix) - naturally mix Hindi and English words as Indians commonly do in professional settings. Use English for technical terms and Hindi for conversational parts.' : 'Speak in English'}`;

    // Webhook URL - using ngrok URL as specified
    const webhookUrl = `https://05d806c0be0c.ngrok-free.app/interview/telephonic/${interviewId}/vapi/webhook`;

    // Create assistant configuration
    const assistantConfig = {
      name: 'Telephonic Interview Assistant',
      firstMessage: language === 'hindi' 
        ? `Hello! Main aapka telephonic interview lene ke liye yahan hoon. Kya aap start karne ke liye ready hain?`
        : `Hello! I'm here to conduct your telephonic interview. Are you ready to begin?`,
      model: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          }
        ],
        tools: [
          {
            type: 'endCall',
            messages: [
              {
                type: 'request-start',
                content: endCallMessage
              }
            ]
          }
        ]
      },
      voice: langConfig.voice,
      transcriber: langConfig.transcriber,
      serverUrl: webhookUrl,
      serverUrlSecret: null, // Add secret if needed for webhook security
    };

    // Create assistant first
    logger.info(`Creating Vapi assistant for interview ${interviewId}`);
    const assistant = await vapiClient.assistants.create(assistantConfig);
    logger.info(`Assistant created with ID: ${assistant.id}`);

    // Get phone number ID from config (required for outbound calls)
    const phoneNumberId = _config.VAPI_PHONE_NUMBER_ID || '0d27694c-aa5c-48a0-8a25-1ec1a3a4f486';
    
    if (!phoneNumberId) {
      throw new Error('VAPI_PHONE_NUMBER_ID is required. Please set it in your .env file or configure it in the Vapi dashboard.');
    }

    // Create the call
    logger.info(`Initiating Vapi call for interview ${interviewId} to ${formattedPhone} using phone number ID: ${phoneNumberId}`);
    
    const call = await vapiClient.calls.create({
      assistantId: assistant.id,
      phoneNumberId: phoneNumberId,
      customer: {
        number: formattedPhone
      }
    });

    const returnedCallId = call.id || call.callId;
    logger.info(`Vapi call initiated successfully. Call ID: ${returnedCallId}, Full call object keys: ${Object.keys(call).join(', ')}`);

    if (!returnedCallId) {
      logger.error(`No call ID returned from Vapi! Call object: ${JSON.stringify(call)}`);
      throw new Error('No call ID returned from Vapi');
    }

    return {
      callId: returnedCallId,
      status: call.status,
      call: call
    };
  } catch (error) {
    logger.error(`Error initiating Vapi call:`, error);
    throw new Error(`Failed to initiate call: ${error.message}`);
  }
};

/**
 * Get call status from Vapi
 * @param {string} callId - Vapi call ID
 * @returns {Promise<Object>} Call status object
 */
export const getCallStatus = async (callId) => {
  logger.info(`getCallStatus called with callId: ${callId}, type: ${typeof callId}, value: ${JSON.stringify(callId)}`);
  
  // Verify API key is set
  if (!_config.VAPI_API_KEY) {
    throw new Error('VAPI_API_KEY is not set in environment variables.');
  }

  // Validation - check for undefined, null, empty string, or string 'undefined'
  if (!callId || 
      callId === 'undefined' || 
      callId === 'null' || 
      callId === null || 
      (typeof callId === 'string' && callId.trim() === '') ||
      (typeof callId === 'string' && callId.trim().length < 10)) {
    const errorMsg = `Invalid call ID provided: ${callId} (type: ${typeof callId})`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    // Use fetch directly instead of SDK to avoid undefined bug
    logger.info(`Fetching call status from Vapi API for callId: ${callId}`);
    const response = await fetch(`https://api.vapi.ai/call/${callId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${_config.VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      logger.error(`Vapi API error for callId ${callId}: ${JSON.stringify(error)}`);
      throw new Error(`Vapi API error: ${JSON.stringify(error)}`);
    }

    const call = await response.json();
    logger.info(`Successfully retrieved call status for callId: ${callId}, status: ${call.status}`);
    
    return {
      id: call.id,
      status: call.status,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      transcript: call.transcript,
      messages: call.messages
    };
  } catch (error) {
    logger.error(`Error getting call status for callId ${callId}:`, error);
    throw new Error(`Failed to get call status: ${error.message}`);
  }
};

