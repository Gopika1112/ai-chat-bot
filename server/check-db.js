const db = require('./db');

async function checkDb() {
  try {
    console.log('--- Database Diagnostic ---');
    const now = await db.query('SELECT NOW()');
    console.log('✅ Connection: OK (' + now.rows[0].now + ')');
    
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('✅ Tables found:', tables.rows.map(r => r.table_name).join(', '));
    
    const usersCount = await db.query('SELECT COUNT(*) FROM users');
    console.log('✅ Users count:', usersCount.rows[0].count);
    
    console.log('---------------------------');
  } catch (err) {
    console.error('❌ Database error:', err.message);
  } finally {
    process.exit();
  }
}

checkDb();
