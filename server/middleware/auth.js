const { supabase } = require('../supabase');
const db = require('../db');

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.log('❌ Auth Error: No Authorization header');
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    console.log('🔒 Verifying session with Supabase...');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.log('❌ Supabase Auth Error:', error?.message || 'User not found');
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Ensure the user exists in our public 'users' table for foreign key compatibility
    // Supabase user ID is a UUID, matching our schema.
    // We check both ID and email to handle legacy users from the previous auth system.
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [user.id]);
    
    if (userResult.rows.length === 0) {
      const emailMatch = await db.query('SELECT id FROM users WHERE email = $1', [user.email]);
      const metadata = user.user_metadata || {};
      
      if (emailMatch.rows.length > 0) {
        // Legacy user found with different ID. Re-link it to the Supabase ID.
        // We update the ID in the users table. NOTE: Depending on DB constraints, 
        // this might need ON UPDATE CASCADE on foreign keys. 
        // Since we are in dev, we'll try to update it directly.
        console.log('🔄 Re-linking legacy user to Supabase ID:', user.email);
        await db.query('UPDATE users SET id = $1, name = $2, picture = $3 WHERE email = $4', [
          user.id,
          metadata.full_name || metadata.name || '', 
          metadata.avatar_url || metadata.picture || '',
          user.email
        ]);
      } else {
        // Brand new user
        console.log('👤 Synchronizing new user to public table:', user.email);
        await db.query(
          'INSERT INTO users (id, email, name, picture) VALUES ($1, $2, $3, $4)',
          [
            user.id, 
            user.email, 
            metadata.full_name || metadata.name || '', 
            metadata.avatar_url || metadata.picture || ''
          ]
        );
      }
    }

    console.log('✅ Token verified for user:', user.email);
    req.user = user;
    next();
  } catch (error) {
    console.log('❌ Auth Middleware Exception:', error.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};
