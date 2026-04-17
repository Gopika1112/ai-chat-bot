const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load .env
dotenv.config({ path: path.join(__dirname, '.env') });

async function verifyDB() {
    console.log('🧪 Verifying Database Connection...');
    console.log('URI:', process.env.DATABASE_URL ? (process.env.DATABASE_URL.substring(0, 30) + '...') : 'MISSING');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    });

    try {
        const client = await pool.connect();
        console.log('✅ Connection established successfully!');
        const res = await client.query('SELECT NOW()');
        console.log('✅ Query successful:', res.rows[0].now);
        client.release();
    } catch (err) {
        console.error('❌ Connection failed!');
        console.error('Error details:', err.message);
        if (err.message.includes('password authentication failed')) {
            console.error('\n💡 HINT: Your password in .env might be wrong or needs to be properly set.');
        }
    } finally {
        await pool.end();
    }
}

verifyDB();
