const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabaseUrl = config.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = config.SUPABASE_SERVICE_ROLE_KEY || 'placeholder_key';

if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase environment variables! Using placeholders to prevent fatal crash.');
} else {
  console.log('📡 Supabase Backend Client initialized');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = { supabase };
