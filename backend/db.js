const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_URL?.includes('supabase.co') ? {
    rejectUnauthorized: false,
  } : false,
  connectionTimeoutMillis: 10000, 
});

pool.on('error', (err) => {
  console.error('❌ Unexpected DB client error:', err.message);
});

module.exports = {
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (error) {
      console.error('❌ DB Query Error:', error.message);
      throw error;
    }
  },
  pool // Exporting pool for health checks
};
