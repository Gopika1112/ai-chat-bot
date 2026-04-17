const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabaseUrl = config.SUPABASE_URL;
const supabaseServiceKey = config.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables in server/.env (via config.js)');
} else {
  console.log('📡 Supabase Backend Client initialized');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = { supabase };
