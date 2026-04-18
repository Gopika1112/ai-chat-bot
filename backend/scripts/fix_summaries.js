const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { PDFParse } = require('pdf-parse');

// Load environment
dotenv.config({ path: path.join(__dirname, '..', '.env') });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Import AI tools
const aiProvider = require('../utils/aiProvider');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
});

async function runFix() {
    console.log('🧪 Starting Final Fix Script...');
    
    try {
        const client = await pool.connect();
        console.log('✅ Connected to Database!');

        // 1. Find documents without summaries
        const docsResult = await client.query('SELECT id, filename, file_path FROM documents WHERE summary IS NULL OR summary = \'Summary not available.\'');
        console.log(`📄 Found ${docsResult.rows.length} documents needing summary fix.`);

        for (const doc of docsResult.rows) {
            console.log(`\n📝 Fixing summary for: ${doc.filename}...`);
            
            if (!doc.file_path || !fs.existsSync(doc.file_path)) {
                console.log(`⚠️ Skipping ${doc.filename}: File not found on disk at ${doc.file_path}`);
                continue;
            }

            try {
                // Extract text
                const fileBuffer = fs.readFileSync(doc.file_path);
                const parser = new PDFParse({ data: fileBuffer });
                const result = await parser.getText();
                const text = result.text;

                if (!text || text.trim().length < 50) {
                    console.log(`⚠️ Skipping ${doc.filename}: Not enough text found.`);
                    continue;
                }

                // Call AI
                const prompt = `Provide a concise, professional summary (2-3 paragraphs) of the following document. Focus on key themes and information.`;
                const summary = await aiProvider.callAI({ 
                    question: prompt, 
                    context: text.substring(0, 10000) 
                });

                // Update DB
                await client.query('UPDATE documents SET summary = $1 WHERE id = $2', [summary, doc.id]);
                console.log(`✅ Fixed! Summary generated for ${doc.filename}`);
            } catch (err) {
                console.error(`❌ Failed to fix ${doc.filename}:`, err.message);
            }
        }

        client.release();
        console.log('\n✨ ALL DONE! Your documents should now have summaries in the UI.');
        process.exit(0);
    } catch (err) {
        console.error('❌ CRITICAL ERROR:', err.message);
        process.exit(1);
    }
}

runFix();
