const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testModel(name) {
  try {
    console.log(`Testing model: ${name}`);
    const model = genAI.getGenerativeModel({ model: name });
    const result = await model.embedContent("Hello world");
    console.log(`✅ Success with ${name}: ${result.embedding.values.length} dimensions`);
    return true;
  } catch (error) {
    console.log(`❌ Failed with ${name}: ${error.message}`);
    return false;
  }
}

async function runTests() {
  await testModel("embedding-001");
  await testModel("models/embedding-001");
  await testModel("text-embedding-004");
  await testModel("models/text-embedding-004");
}

runTests();
