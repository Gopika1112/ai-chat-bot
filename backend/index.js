const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PORT } = require('./config');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Removed to avoid interference with pg-pool SSL config

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

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    database: !!process.env.DATABASE_URL,
    ai: !!process.env.GEMINI_API_KEY,
    supabase: !!process.env.SUPABASE_URL,
    env: process.env.NODE_ENV || 'development'
  });
});

const config = require('./config');

if (config.MISSING_VARS && config.MISSING_VARS.length > 0) {
  console.warn('⚠️ Server running with degraded config. Missing:', config.MISSING_VARS.join(', '));
}

// Global Error Handler for Multer/Other issues
app.use((err, req, res, next) => {
  console.error('🔥 Global Error Caught in Serverless Boundary:', err.message);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Avoid triggering floating Unhandled Promise Rejections inside Serverless invocation environments.
if (require.main === module) {
  // Only execute this continuous DB listener code if running locally natively via nodemon/node
  console.log('🏁 Starting local development Express server...');
  const db = require('./db');
  console.log('📜 Testing Local DB connection...');
  
  db.query('SELECT NOW()')
    .then(() => {
      console.log('✅ Local Database connected successfully');
      app.listen(PORT, () => {
        console.log(`🚀 Server running dynamically on http://localhost:${PORT}`);
      });
    })
    .catch(err => {
      console.error('❌ Local Database connection failed:', err.message);
      console.warn('⚠️ Falling back to Database-less mode for local UI testing.');
      app.listen(PORT, () => console.log(`🚀 Server started safely on port ${PORT}`));
    });
} else {
  // Production / Serverless Mode (Vercel)
  // We simply export the Express app for Vercel's @vercel/node engine to intercept HTTP traffic
  console.log('⚡ Vercel Serverless Function module activated.');
}

module.exports = app;
