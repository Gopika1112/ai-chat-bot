const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

const envPath = path.join(__dirname, '.env');
console.log('Target Env Path:', envPath);
console.log('File exists:', fs.existsSync(envPath));
if (fs.existsSync(envPath)) {
    console.log('File stats:', fs.statSync(envPath).size, 'bytes');
    const content = fs.readFileSync(envPath, 'utf8');
    console.log('File content (first 50 chars):', content.substring(0, 50));
}

const result = dotenv.config({ path: envPath });
console.log('Dotenv result:', result.error ? 'Error' : 'Success');
if (result.error) console.error(result.error);

console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'PRESENT' : 'MISSING');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'PRESENT' : 'MISSING');
