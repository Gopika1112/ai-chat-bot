let app;
try {
  app = require('../backend/index.js');
} catch (err) {
  console.error("CRITICAL STARTUP ERROR:", err);
  app = require('express')();
  app.all('(.*)', (req, res) => {
    res.status(500).json({
      error: "SERVER_STARTUP_CRASH",
      message: err.message,
      stack: err.stack,
      path: req.path,
      hint: "Check if all dependencies in backend/ (like pdfjs-dist) are also in root package.json. Also check Vercel environment variables."
    });
  });
}

module.exports = app;
