const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testFlashEmbedding() {
  try {
    console.log(`Testing model: gemini-1.5-flash for embedding...`);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.embedContent("Hello world");
    console.log(`✅ Success! Embedding length: ${result.embedding.values.length}`);
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
  }
}

testFlashEmbedding();
