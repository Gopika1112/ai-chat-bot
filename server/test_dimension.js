const { getEmbeddings } = require('./utils/gemini');
const config = require('./config');

async function test() {
    console.log('Testing embedding dimensions...');
    try {
        const embedding = await getEmbeddings('Who is the president of India?');
        console.log('Embedding length:', embedding.length);
        if (embedding.length === 3072) {
            console.log('❌ ERROR: Dimension mismatch! Expected 768, got 3072.');
        } else if (embedding.length === 768) {
            console.log('✅ SUCCESS: Dimension is 768.');
        } else {
            console.log('❓ UNEXPECTED: Dimension is', embedding.length);
        }
    } catch (error) {
        console.error('Test failed:', error);
    }
}

test();
