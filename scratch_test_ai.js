const aiProvider = require('./backend/utils/aiProvider');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

async function testAI() {
    console.log('🤖 Testing Gemini AI responding...');
    try {
        const response = await aiProvider.callAI({
            question: "Hello! Say 'Ready to Summarize' if you can hear me.",
            onChunk: (chunk) => process.stdout.write(chunk)
        });
        console.log('\n✅ AI Test Passed!');
    } catch (err) {
        console.error('\n❌ AI Test Failed:', err.message);
    }
}

testAI();
