const path = require('path');
const dotenv = require('dotenv');

// Load .env from the server directory explicitly
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

// Server-side required environment variables validation
const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY'
];

const missingVars = requiredEnvVars.filter(key => !process.env[key] && !process.env[`VITE_${key}`]);

if (missingVars.length > 0) {
    console.error(`🚨 CRITICAL CONFIGURATION ERROR: Missing required server environment variables: ${missingVars.join(', ')}`);
    console.error(`Please check your Vercel environment variables. This will cause 500 errors.`);
}

// Ensure no secrets are leaked in console log strings
module.exports = {
    MISSING_VARS: missingVars,
    PORT: process.env.PORT || 5000,
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    TOGETHER_API_KEY: process.env.TOGETHER_API_KEY,
    JWT_SECRET: process.env.JWT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    
    // AI Model Strategy
    AI: {
        PRIMARY_MODEL: 'google/gemini-2.0-flash',
        FALLBACK_MODELS: [
            { provider: 'openrouter', model: 'google/gemini-2.0-flash-lite-preview-02-05:free' },
            { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct' },
            { provider: 'groq', model: 'llama-3.3-70b-versatile' },
            { provider: 'openrouter', model: 'mistralai/mistral-7b-instruct-v0.1' }
        ]
    }
};
