const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admins only.' });
  }
  next();
};

router.get('/users', auth, isAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT id, email, name, picture, role, created_at FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/documents', auth, isAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT d.*, u.email as user_email 
      FROM documents d 
      JOIN users u ON d.user_id = u.id 
      ORDER BY d.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch all documents' });
  }
});

router.get('/chats', auth, isAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT c.*, u.email as user_email 
      FROM chats c 
      JOIN users u ON c.user_id = u.id 
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch all chats' });
  }
});

router.get('/analytics', auth, isAdmin, async (req, res) => {
  try {
    const usersCount = await db.query('SELECT COUNT(*) FROM users');
    const docsCount = await db.query('SELECT COUNT(*) FROM documents');
    const messagesCount = await db.query('SELECT COUNT(*) FROM messages');
    
    res.json({
      totalUsers: parseInt(usersCount.rows[0].count),
      totalDocuments: parseInt(docsCount.rows[0].count),
      totalMessages: parseInt(messagesCount.rows[0].count),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;
