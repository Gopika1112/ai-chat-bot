const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');

// Initialize Gemini for Embeddings safely to avoid Vercel module instantiation crashes
const genAI = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null;

/**
 * Generates embeddings for a single piece of text.
 * Falls back to a zero-vector if embedding fails to prevent crash.
 */
const getEmbeddings = async (text) => {
  try {
    const formattedText = text ? text.toString().replace(/\n/g, ' ') : '';
    if (!formattedText) return Array(768).fill(0);

    const model = genAI.getGenerativeModel({ 
      model: "text-embedding-004",
      outputDimensionality: 768 
    }, { apiVersion: 'v1' });
    
    // Attempt with retry logic for 429
    const makeRequest = async (retries = 3) => {
      try {
        const result = await model.embedContent(formattedText);
        return result.embedding.values;
      } catch (error) {
        if (error.message.includes('429') && retries > 0) {
          console.warn(`⚠️ Embedding 429. Retrying... (${retries} left)`);
          await new Promise(r => setTimeout(r, 2000 * (4 - retries)));
          return makeRequest(retries - 1);
        }
        throw error;
      }
    };

    return await makeRequest();
  } catch (error) {
    console.error('❌ Gemini Embedding Error:', error.message);
    return Array(768).fill(0);
  }
};

/**
 * Generates embeddings for multiple chunks in a single batch.
 */
const batchEmbedChunks = async (chunks) => {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "text-embedding-004",
      outputDimensionality: 768 
    }, { apiVersion: 'v1' });
    
    const requests = chunks.map(chunk => ({
      content: { parts: [{ text: chunk.toString().replace(/\n/g, ' ') }] }
    }));

    const result = await model.batchEmbedContents({ requests });
    return result.embeddings.map(e => e.values);
  } catch (error) {
    console.error('❌ Gemini Batch Embedding Error:', error.message);
    // Return dummy embeddings to allow the process to continue
    return chunks.map(() => Array(768).fill(0));
  }
};

module.exports = { getEmbeddings, batchEmbedChunks };
