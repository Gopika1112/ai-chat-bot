const { Pool } = require('pg');
const config = require('./config');

const pool = config.DATABASE_URL ? new Pool({
  connectionString: config.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  connectionTimeoutMillis: 30000, 
  idleTimeoutMillis: 30000,
  max: 20
}) : null;

if (!pool) {
  console.warn('⚠️ Database Pool could not be initialized: DATABASE_URL is missing.');
}

const dbHost = config.DATABASE_URL ? config.DATABASE_URL.split('@')[1]?.split(':')[0] : 'NOT_CONFIGURED';
console.log(`📡 [DB] Connecting to host: ${dbHost}`);

pool.on('error', (err) => {
  console.error('❌ Unexpected DB client error:', err.message);
});

module.exports = {
  query: async (text, params) => {
    if (!pool) {
      console.error('❌ Database query attempted but pool is not initialized.');
      throw new Error('Database connection not available. Check DATABASE_URL.');
    }
    try {
      return await pool.query(text, params);
    } catch (error) {
      console.error('❌ DB Query Error:', error.message);
      throw error;
    }
  },
  pool // Exporting pool for health checks
};
