process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const db = require('./db');

async function checkSchema() {
    try {
        const result = await db.query(`
            SELECT column_name, udt_name, character_maximum_length, numeric_precision, numeric_scale
            FROM information_schema.columns 
            WHERE table_name = 'document_chunks' AND column_name = 'embedding'
        `);
        console.log('Column Info:', result.rows[0]);
        
        // Check vector dimension using a specific query if possible
        const dimResult = await db.query(`
            SELECT atttypmod as dimension 
            FROM pg_attribute 
            WHERE attrelid = 'document_chunks'::regclass 
            AND attname = 'embedding'
        `);
        console.log('Raw Dimension Info:', dimResult.rows[0]);
        // Note: For vector(768), atttypmod is usually 768 + some overhead if it's Postgres 15+
    } catch (error) {
        console.error('Failed to check schema:', error);
    } finally {
        process.exit();
    }
}

checkSchema();
