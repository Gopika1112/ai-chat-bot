const { Client } = require('pg');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  try {
    await client.connect();
    console.log('🔗 Connected to database for schema update...');

    // 1. Update Documents table constraint
    console.log('🔄 Updating documents foreign key...');
    await client.query(`
      ALTER TABLE documents 
      DROP CONSTRAINT IF EXISTS documents_user_id_fkey,
      ADD CONSTRAINT documents_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) 
      ON DELETE CASCADE 
      ON UPDATE CASCADE;
    `);

    // 2. Update Chats table constraint
    console.log('🔄 Updating chats foreign key...');
    await client.query(`
      ALTER TABLE chats 
      DROP CONSTRAINT IF EXISTS chats_user_id_fkey,
      ADD CONSTRAINT chats_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) 
      ON DELETE CASCADE 
      ON UPDATE CASCADE;
    `);

    console.log('✅ Schema migration complete! User re-linking will now propagate.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();
