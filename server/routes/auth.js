const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const router = express.Router();

const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

router.post('/google', async (req, res) => {
  const { token } = req.body;
  console.log('📥 Received login request with token:', token ? 'Token present' : 'Token MISSING');
  try {
    console.log('🔍 Verifying ID token with Google...');
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    console.log('✅ Token verified successfully');
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    // Check if user exists, or create new one
    let userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;

    if (userResult.rows.length === 0) {
      const newUser = await db.query(
        'INSERT INTO users (email, name, picture) VALUES ($1, $2, $3) RETURNING *',
        [email, name, picture]
      );
      user = newUser.rows[0];
    } else {
      user = userResult.rows[0];
    }

    // Create JWT
    console.log('🔐 Signing new JWT...');
    console.log(`🔑 Using Secret (slice): ${process.env.JWT_SECRET?.substring(0, 10)}...`);
    const jwtToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token: jwtToken, user });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

module.exports = router;
