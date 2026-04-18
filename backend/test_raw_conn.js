const { Client } = require('pg');

async function testConnection() {
    const connStr = 'postgresql://postgres:Gopika@123@db.yzvzenoxzajwriujnpaf.supabase.co:5432/postgres';
    console.log('Testing with raw connection string (from .env.example)...');
    
    const client = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected!');
        await client.end();
    } catch (err) {
        console.error('❌ Failed:', err.message);
    }
}

testConnection();
