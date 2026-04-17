const { Client } = require('pg');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    await client.connect();
    
    // Check all records and their dimensions
    const dims = await client.query('SELECT vector_dims(embedding) as d, count(*) as c FROM document_chunks GROUP BY d');
    console.log('📏 Dimensions in table:', JSON.stringify(dims.rows, null, 2));
    
    // Check indexes
    const indexes = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'document_chunks'
    `);
    console.log('🗂️ Indexes:', JSON.stringify(indexes.rows, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Check failed:', err);
    process.exit(1);
  }
}

check();
