process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const db = require('./db');
const { getEmbeddings } = require('./utils/gemini');
const aiProvider = require('./utils/aiProvider');

async function verify() {
    console.log('🧪 Starting Verification of AI & Database Fixes...\n');

    // 1. Database Connection
    try {
        console.log('📡 Testing Database Connection...');
        const dbRes = await db.query('SELECT NOW()');
        console.log('✅ Database connected successfully. Current time:', dbRes.rows[0].now);
    } catch (err) {
        console.error('❌ Database connection FAILED:', err.message);
        if (err.message.includes('password authentication failed')) {
            console.error('   👉 ACTION REQUIRED: Update Supabase password in server/.env');
        }
    }

    console.log('\n---');

    // 2. Embedding Dimension
    try {
        console.log('📏 Testing Gemini Embedding Dimension...');
        const embedding = await getEmbeddings('Test dimension mismatch fix');
        console.log(`📊 Embedding length: ${embedding.length}`);
        
        if (embedding.length === 768) {
            console.log('✅ Embedding dimension is correct (768).');
        } else {
            console.error(`❌ Dimension MISMATCH: Got ${embedding.length}, expected 768.`);
        }
    } catch (err) {
        console.error('❌ Embedding generation FAILED:', err.message);
    }

    console.log('\n---');

    // 3. AI Chat Response
    try {
        console.log('🤖 Testing AI Chat Provider...');
        const response = await aiProvider.callAI({
            question: 'Say hello world in 3 words.',
            context: 'User is testing the system setup.',
            onChunk: (chunk) => process.stdout.write('.')
        });
        console.log('\n✅ AI Response received:', response);
    } catch (err) {
        console.error('\n❌ AI Chat FAILED:', err.message);
    }

    console.log('\n🏁 Verification Complete.');
    process.exit();
}

verify();
