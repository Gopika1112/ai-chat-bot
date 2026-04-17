const aiProvider = require('../utils/aiProvider');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testModels() {
    console.log('🧪 Testing AI Model Fallbacks...');
    
    const testCases = [
        { question: 'What is 2+2?', context: 'Basic math context.' }
    ];

    for (const test of testCases) {
        console.log(`\n❓ Request: ${test.question}`);
        try {
            const response = await aiProvider.callAI({
                question: test.question,
                context: test.context,
                onChunk: (chunk) => process.stdout.write(chunk)
            });
            console.log('\n\n✅ Response successful!');
        } catch (err) {
            console.error('\n\n❌ All AI providers failed.');
            console.error(err.message);
        }
    }
}

testModels();
