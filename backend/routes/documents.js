const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Vercel Serverless Polyfill: pdf-parse crashes instantly on cold-boot if DOMMatrix is missing in Node.js limited edge environments
if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {};
}
const pdfRaw = require('pdf-parse');
const pdf = typeof pdfRaw === 'function' ? pdfRaw : pdfRaw.default;
const mammoth = require('mammoth');
const db = require('../db');
const auth = require('../middleware/auth');
const { chunkText } = require('../utils/chunker');
const { getEmbeddings, batchEmbedChunks } = require('../utils/gemini');
const aiProvider = require('../utils/aiProvider');
const config = require('../config');
const router = express.Router();

// Use disk storage to handle large files (avoiding OOM)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.VERCEL ? '/tmp/uploads/' : 'uploads/'; 
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 200 * 1024 * 1024 } 
});

router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, filename, file_type, created_at, summary FROM documents WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch documents error:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  console.log('🚀 POST /upload request received');
  let filePath = '';
  try {
    const { file } = req;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    filePath = file.path;

    let text = '';
    if (file.mimetype === 'application/pdf') {
      const fileBuffer = fs.readFileSync(filePath);
      const result = await pdf(fileBuffer);
      text = result.text;
    } else if (file.mimetype === 'text/plain' || file.mimetype === 'text/markdown') {
      text = fs.readFileSync(filePath, 'utf-8');
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const docResult = await mammoth.extractRawText({ path: filePath });
      text = docResult.value;
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    if (!text || text.trim().length === 0) {
      throw new Error('No readable text found in PDF.');
    }

    const docResult = await db.query(
      'INSERT INTO documents (user_id, filename, file_type, file_path) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.user.id, file.originalname, file.mimetype, file.path]
    );
    const documentId = docResult.rows[0].id;

    const chunks = chunkText(text);
    const BATCH_SIZE = 100;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      try {
        const embeddings = await batchEmbedChunks(batch);
        await Promise.all(batch.map(async (chunk, index) => {
          const embeddingArray = `[${embeddings[index].join(',')}]`;
          await db.query(
            'INSERT INTO document_chunks (document_id, content, embedding) VALUES ($1, $2, $3)',
            [documentId, chunk, embeddingArray]
          );
        }));
      } catch (err) {
        console.error(`Batch Embedding Error at offset ${i}:`, err.message);
      }
    }

    let summary = 'Summary not available.';
    try {
      const prompt = `Provide a concise, professional summary (2-3 paragraphs) of the following document. Focus on key themes and information.`;
      const context = text.substring(0, 10000); 
      summary = await aiProvider.callAI({ question: prompt, context });
      await db.query('UPDATE documents SET summary = $1 WHERE id = $2', [summary, documentId]);
    } catch (sumErr) {
      console.error('Summary Error:', sumErr.message);
    }

    res.json({ message: 'Document processed successfully', documentId, summary });
  } catch (error) {
    console.error('Upload Error:', error);
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: 'Failed to process document: ' + error.message });
  }
});

router.get('/:id/view', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT file_path, file_type, filename FROM documents WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];
    if (!doc.file_path || !fs.existsSync(doc.file_path)) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Content-Type', doc.file_type);
    fs.createReadStream(doc.file_path).pipe(res);
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve document' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT file_path FROM documents WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const filePath = result.rows[0].file_path;
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await db.query('DELETE FROM documents WHERE id = $1', [id]);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
