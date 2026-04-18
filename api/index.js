let app;
try {
  app = require('../backend/index.js');
} catch (err) {
  console.error("CRITICAL STARTUP ERROR:", err);
  app = require('express')();
  app.all('*', (req, res) => {
    res.status(500).json({
      error: "SERVER_STARTUP_CRASH",
      message: err.message,
      stack: err.stack,
      hint: "Check your Vercel Environment Variables - one might be wrong or missing."
    });
  });
}

module.exports = app;
