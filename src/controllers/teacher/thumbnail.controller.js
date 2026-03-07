import { getOpenAIClient, getModel } from '../../config/aiConfig.js';
import logger from '../../utils/logger.js';

/**
 * Enhance a prompt using the generation model
 * @param {string} prompt - The original prompt
 * @returns {Promise<string>} - Enhanced prompt
 */
const enhancePrompt = async (prompt) => {
  try {
    const client = getOpenAIClient('generation');
    const model = getModel('generation');

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'Enhance image prompts briefly. Return only the enhanced prompt.'
        },
        {
          role: 'user',
          content: `Enhance: "${prompt}"`
        }
      ],
      temperature: 0.7,
      max_tokens: 100
    });

    const enhancedPrompt = response.choices[0]?.message?.content?.trim() || prompt;
    return enhancedPrompt;
  } catch (error) {
    logger.error('Error enhancing prompt:', error);
    // Return original prompt if enhancement fails
    return prompt;
  }
};

/**
 * Generate thumbnail image using AI
 * @param {string} prompt - The prompt for image generation
 * @param {boolean} enhancePrompt - Whether to enhance the prompt first
 * @returns {Promise<string>} - Base64 image data URL
 */
export const generateThumbnail = async (req, res) => {
  try {
    const { prompt, enhancePrompt: shouldEnhance } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Prompt is required'
      });
    }

    let finalPrompt = prompt.trim();

    // Enhance prompt if requested
    if (shouldEnhance) {
      logger.info('Enhancing prompt...');
      finalPrompt = await enhancePrompt(finalPrompt);
      logger.info(`Enhanced prompt: ${finalPrompt}`);
    }

    // Generate image using image_gen model
    logger.info(`Generating image with prompt: ${finalPrompt}`);
    const client = getOpenAIClient('image_gen');
    const model = getModel('image_gen');

    const apiResponse = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: finalPrompt
        }
      ],
      modalities: ['image', 'text'],
      max_tokens: 50 // Minimal tokens needed for image generation response
    });

    const response = apiResponse.choices[0]?.message;
    
    if (!response || !response.images || response.images.length === 0) {
      logger.error('No images generated in response:', response);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate image. No images in response.'
      });
    }

    // Extract the first image
    const imageUrl = response.images[0]?.image_url?.url;
    
    if (!imageUrl) {
      logger.error('No image URL found in response:', response.images[0]);
      return res.status(500).json({
        success: false,
        message: 'Failed to extract image from response.'
      });
    }

    logger.info('Image generated successfully');
    
    return res.json({
      success: true,
      imageUrl,
      prompt: finalPrompt
    });

  } catch (error) {
    logger.error('Error generating thumbnail:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate thumbnail'
    });
  }
};

