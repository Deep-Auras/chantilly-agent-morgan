const { GoogleGenAI } = require('@google/genai');
const config = require('./env');
const { logger } = require('../utils/logger');

let geminiClient;
let model;

function initializeGemini() {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: config.GEMINI_API_KEY
    });
    model = {
      generateContent: async (prompt) => {
        return await geminiClient.models.generateContent({
          model: config.GEMINI_MODEL,
          contents: typeof prompt === 'string' ?
            [{ role: 'user', parts: [{ text: prompt }] }] : prompt.contents || prompt
        });
      },
      startChat: (options = {}) => {
        return {
          sendMessage: async (prompt) => {
            const contents = options.history || [];
            contents.push({
              role: 'user',
              parts: [{ text: prompt }]
            });

            const result = await geminiClient.models.generateContent({
              model: config.GEMINI_MODEL,
              contents,
              systemInstruction: options.systemInstruction
            });

            // Use centralized response extraction
            const responseText = extractGeminiText(result);

            return {
              response: {
                text: () => responseText
              }
            };
          }
        };
      }
    };
    logger.info(`Gemini initialized with model: ${config.GEMINI_MODEL}`);
  }
  return { client: geminiClient, model };
}

function getGeminiModel() {
  if (!model) {
    initializeGemini();
  }
  return model;
}

function getGeminiClient() {
  if (!geminiClient) {
    initializeGemini();
  }
  return geminiClient;
}

// Helper function to create a model with specific settings
function createCustomModel(modelConfig = {}) {
  const client = getGeminiClient();
  return {
    generateContent: async (request) => {
      return await client.models.generateContent({
        model: modelConfig.model || config.GEMINI_MODEL,
        ...request,
        generationConfig: {
          temperature: modelConfig.temperature || 0.7,
          topK: modelConfig.topK || 40,
          topP: modelConfig.topP || 0.95,
          maxOutputTokens: modelConfig.maxOutputTokens || 1024,
          ...modelConfig.generationConfig
        },
        safetySettings: modelConfig.safetySettings || [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          }
        ]
      });
    }
  };
}

/**
 * Extracts text from Gemini API response, handling multi-part responses
 * and filtering out thought parts (Gemini 2.5 reasoning)
 *
 * @param {Object} result - Gemini API result object
 * @param {Object} options - Optional configuration
 * @param {boolean} options.includeLogging - Whether to log parts breakdown (default: false)
 * @param {Function} options.logger - Logger function to use for debugging
 * @returns {string} Combined text from all non-thought parts
 */
function extractGeminiText(result, options = {}) {
  const { includeLogging = false, logger: customLogger } = options;

  // Extract all parts from the response
  const allParts = result.candidates?.[0]?.content?.parts || [];

  // Optional debug logging
  if (includeLogging && customLogger) {
    customLogger('debug', 'Gemini response parts breakdown', {
      totalParts: allParts.length,
      partTypes: allParts.map((p, i) => ({
        index: i,
        hasText: !!p.text,
        isThought: !!p.thought,
        textLength: p.text?.length || 0,
        textPreview: p.text?.substring(0, 100) || ''
      }))
    });
  }

  // Filter out thought parts (Gemini 2.5 includes reasoning with thought: true)
  const textParts = allParts.filter(part => !part.thought);

  // Combine all text parts into a single string
  return textParts.map(part => part.text || '').join('');
}

module.exports = {
  initializeGemini,
  getGeminiModel,
  getGeminiClient,
  createCustomModel,
  extractGeminiText
};