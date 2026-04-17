const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load .env
dotenv.config({ path: path.join(__dirname, '.env') });

const HOST = 'db.yzvzenoxzajwriujnpaf.supabase.co';
const DB = 'postgres';
const USER = 'postgres';

async function testConnection(password, port) {
    const encodedPw = encodeURIComponent(password);
    const connStr = `postgresql://${USER}:${encodedPw}@${HOST}:${port}/${DB}?sslmode=require`;
    
    const client = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    });

    try {
        await client.connect();
        console.log(`✅ SUCCESS! Port: ${port}, Password: [${password}]`);
        await client.end();
        return true;
    } catch (err) {
        console.log(`❌ FAILED! Port: ${port}, Password: [${password}] - Error: ${err.message}`);
        return false;
    }
}

async function run() {
    console.log('🧪 Starting Advanced DB Diagnostic...');
    console.log(`Host: ${HOST}`);
    console.log(`User: ${USER}`);
    
    // Passwords to try (one from .env, others as common defaults/fallbacks)
    const passwordsToTry = [];
    
    // Get password from current DATABASE_URL in .env
    const currentUrl = process.env.DATABASE_URL || '';
    const match = currentUrl.match(/postgres:([^@]+)@/);
    if (match) {
        passwordsToTry.push(decodeURIComponent(match[1]));
    }
    
    // Add common ones IF they are not already in list
    const defaults = ['Gopika@123', 'Sasovigo@12345'];
    defaults.forEach(p => {
        if (!passwordsToTry.includes(p)) passwordsToTry.push(p);
    });

    const ports = [5432, 6543]; // 5432 = Direct, 6543 = Transaction Pooler

    for (const pw of passwordsToTry) {
        for (const port of ports) {
            console.log(`\n--- Testing Pw: ${pw} | Port: ${port} ---`);
            const success = await testConnection(pw, port);
            if (success) {
                console.log('\n✨ FOUND WORKING CONFIGURATION!');
                console.log(`Update your DATABASE_URL in .env to use port ${port} and this password.`);
                process.exit(0);
            }
        }
    }

    console.log('\n❌ ALL ATTEMPTS FAILED.');
    console.log('1. Verify your password in Supabase Dashboard (Project Settings > Database).');
    console.log('2. Reset your database password if you are unsure.');
    console.log('3. Ensure your project is not paused.');
    process.exit(1);
}

run();
