const aiProvider = require('./utils/aiProvider');
const dotenv = require('dotenv');
const path = require('path');

// Load .env
dotenv.config({ path: path.join(__dirname, '.env') });

async function testAI() {
    console.log('🧪 Testing AI Provider...');
    console.log('Keys check:');
    console.log('- GEMINI_API_KEY:', !!process.env.GEMINI_API_KEY);
    console.log('- OPENROUTER_API_KEY:', !!process.env.OPENROUTER_API_KEY);
    console.log('- GROQ_API_KEY:', !!process.env.GROQ_API_KEY);

    const question = "Hello, who are you and what are you capable of?";
    const context = "You are a professional document analysis AI.";

    try {
        console.log('\n📡 Sending request (with streaming)...');
        let fullResponse = '';
        await aiProvider.callAI({
            question,
            context,
            onChunk: (chunk) => {
                process.stdout.write(chunk);
                fullResponse += chunk;
            }
        });

        console.log('\n\n✅ Test Complete. Response received.');
    } catch (err) {
        console.error('\n❌ Test Failed:', err.message);
    }
}

testAI();
