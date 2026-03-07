/**
 * AI Utility Configuration
 * Now uses centralized AI config system
 * This file provides backward-compatible functions that use the new config system
 */

import { getOpenAIClient as getOpenAIClientFromConfig, getModel as getModelFromConfig } from '../config/aiConfig.js';

/**
 * Initialize OpenAI client with configured settings
 * Uses 'generation' use case by default for backward compatibility
 * @returns {OpenAI} - OpenAI client instance
 */
export const getOpenAIClient = () => {
  return getOpenAIClientFromConfig('generation');
};

/**
 * Get the configured AI model
 * Uses 'generation' use case by default for backward compatibility
 * @returns {string} - Model name
 */
export const getAIModel = () => {
  return getModelFromConfig('generation');
};

// Export for backward compatibility
export const aiConfig = {
  // These are deprecated - use getOpenAIClient('useCase') and getModel('useCase') instead
  baseURL: null, // Will be resolved dynamically
  apiKey: null, // Will be resolved dynamically
  model: null // Will be resolved dynamically
};
