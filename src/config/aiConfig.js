import OpenAI from 'openai';
import { _config } from './config.js';
import logger from '../utils/logger.js';

/**
 * Get AI config for a specific use case from environment variables
 * @param {string} useCase - The use case (generation, embedding)
 * @returns {Object} - Config object with baseUrl, apiKey, model
 */
export const getAIConfig = (useCase) => {
  const envConfig = getEnvConfigForUseCase(useCase);
  if (!envConfig) {
    throw new Error(`No AI config found for use case: ${useCase}. Please set environment variables (AI_${useCase.toUpperCase()}_BASE_URL, AI_${useCase.toUpperCase()}_API_KEY, AI_${useCase.toUpperCase()}_MODEL)`);
  }
  return envConfig;
};

/**
 * Get environment variable config for a use case
 * @param {string} useCase - The use case
 * @returns {Object|null} - Config object or null
 */
const getEnvConfigForUseCase = (useCase) => {
  const useCaseUpper = useCase.toUpperCase().replace(/-/g, '_');
  
  const baseUrl = _config[`AI_${useCaseUpper}_BASE_URL`];
  const apiKey = _config[`AI_${useCaseUpper}_API_KEY`];
  const model = _config[`AI_${useCaseUpper}_MODEL`];

  if (!baseUrl || !apiKey || !model) {
    return null;
  }

  return {
    baseUrl,
    apiKey,
    model,
    provider: 'custom', // Default provider for env-based configs
    useCase
  };
};

/**
 * Get OpenAI client for a specific use case
 * @param {string} useCase - The use case
 * @returns {OpenAI} - OpenAI client instance
 */
export const getOpenAIClient = (useCase) => {
  try {
    const config = getAIConfig(useCase);
    
    if (!config.apiKey) {
      throw new Error(`API key not configured for use case: ${useCase}`);
    }

    return new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    });
  } catch (error) {
    logger.error(`Error getting OpenAI client for use case ${useCase}:`, error);
    throw error;
  }
};

/**
 * Get model name for a specific use case
 * @param {string} useCase - The use case
 * @returns {string} - Model name
 */
export const getModel = (useCase) => {
  try {
    const config = getAIConfig(useCase);
    return config.model;
  } catch (error) {
    logger.error(`Error getting model for use case ${useCase}:`, error);
    throw error;
  }
};

/**
 * Get OpenAI client for a specific feature
 * All features use generation use case
 * @param {string} feature - The feature name (e.g., 'course_generation', 'lesson_generation')
 * @returns {OpenAI} - OpenAI client instance
 */
export const getClientForFeature = (feature) => {
  // All features use generation use case
  return getOpenAIClient('generation');
};

/**
 * Get model name for a specific feature
 * All features use generation use case
 * @param {string} feature - The feature name
 * @returns {string} - Model name
 */
export const getModelForFeature = (feature) => {
  // All features use generation use case
  return getModel('generation');
};

/**
 * Get OpenAI client for audio analysis
 * Uses audio use case configuration
 * @returns {OpenAI} - OpenAI client instance configured for audio
 */
export const getAudioClient = () => {
  try {
    const config = getAIConfig('audio');
    
    if (!config.apiKey) {
      throw new Error('API key not configured for audio use case');
    }

    return new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      defaultHeaders: {
        "HTTP-Referer": _config.FRONTEND_URL || "http://localhost:5173",
        "X-Title": "Academy Interview System",
      },
    });
  } catch (error) {
    logger.error('Error getting audio client:', error);
    throw error;
  }
};

/**
 * Get audio model name
 * @returns {string} - Audio model name
 */
export const getAudioModel = () => {
  try {
    const config = getAIConfig('audio');
    return config.model || 'mistralai/voxtral-small-24b-2507';
  } catch (error) {
    logger.error('Error getting audio model:', error);
    // Fallback to default model
    return 'mistralai/voxtral-small-24b-2507';
  }
};

