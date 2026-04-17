const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PORT } = require('./config');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Bypass SSL chain issues in dev

const authRoutes = require('./routes/auth');
const docRoutes = require('./routes/documents');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/documents', docRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

// Global Error Handler for Multer/Other issues
app.use((err, req, res, next) => {
  console.error('🔥 Global Error:', err.message);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

console.log('🏁 Server starting...');

const db = require('./db');
console.log('📜 Testing DB connection...');
db.query('SELECT NOW()')
  .then(() => {
    console.log('✅ Database connected successfully');
    console.log('🚀 Attempting to listen on port', PORT);
    app.listen(PORT, () => {
      console.log(`🚀 Server (STABLE 5001) running on port ${PORT}`);
      console.log('🗝️ OPENROUTER_API_KEY present:', !!process.env.OPENROUTER_API_KEY);
    });
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    if (err.message.includes('password authentication failed')) {
      console.error('💡 HINT: Check your database password in .env and ensure special characters are URL-encoded.');
    }
    console.error('👉 TIP: Verify your Supabase project status and network connectivity.');
    console.warn('⚠️ SERVER WARNING: Starting in LIMITED MODE (No Database Connection)');
    console.log('🚀 Attempting to listen on port', PORT);
    app.listen(PORT, () => {
      console.log(`🚀 Server (LIMITED) running on port ${PORT}`);
      console.log('🗝️ OPENROUTER_API_KEY present:', !!process.env.OPENROUTER_API_KEY);
    });
  });
