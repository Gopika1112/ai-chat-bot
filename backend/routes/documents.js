const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Vercel Serverless Polyfill: pdf-parse crashes instantly on cold-boot if DOMMatrix is missing in Node.js limited edge environments
if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {};
}
const pdfRaw = require('pdf-parse');
// Robust function extraction: pdf-parse can be the module itself, .default, or a named property depending on bundling
const pdf = (typeof pdfRaw === 'function') 
  ? pdfRaw 
  : (pdfRaw.default && typeof pdfRaw.default === 'function') 
    ? pdfRaw.default 
    : (pdfRaw.pdf && typeof pdfRaw.pdf === 'function')
      ? pdfRaw.pdf
      : pdfRaw; 
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

const { supabase } = require('../supabase');

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  let progress = "0: Initializing";
  let localPath = '';
  try {
    const { file } = req;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    localPath = file.path;

    // 0. SIZE CHECK (Vercel Limit is 4.5MB)
    const MAX_SIZE = 4.5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      return res.status(400).json({ error: 'File too large. Vercel limit is 4.5MB.' });
    }

    // 1. DYNAMIC EXTRACTION
    progress = "1: Extraction";
    let text = '';
    const isImage = file.mimetype.startsWith('image/');

    if (file.mimetype === 'application/pdf') {
      const fileBuffer = fs.readFileSync(localPath);
      const result = await pdf(fileBuffer);
      text = result.text;
    } else if (file.mimetype === 'text/plain' || file.mimetype === 'text/markdown') {
      text = fs.readFileSync(localPath, 'utf-8');
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const docResult = await mammoth.extractRawText({ path: localPath });
      text = docResult.value;
    } else if (isImage) {
      text = `[Image Content: ${file.originalname}]`; // Basic metadata for images
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // 2. CLOUD STORAGE UPLOAD (Supabase)
    progress = "2: Cloud Storage Upload";
    const storagePath = `user_${req.user.id}/${Date.now()}-${file.originalname}`;
    const fileBuffer = fs.readFileSync(localPath);
    
    const { data: storageData, error: storageError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (storageError) throw new Error(`Storage Error: ${storageError.message}`);

    // 3. DATABASE RECORDING
    progress = "3: Save to Database";
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${storagePath}`;
    const docResult = await db.query(
      'INSERT INTO documents (user_id, filename, file_type, file_path) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.user.id, file.originalname, file.mimetype, publicUrl]
    );
    const documentId = docResult.rows[0].id;

    // 4. CHUNKING & EMBEDDINGS (Skip for images)
    if (!isImage && text.trim().length > 0) {
        progress = "4: Chunks & Embeddings";
        const chunks = chunkText(text);
        const BATCH_SIZE = 50; 
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
          const batch = chunks.slice(i, i + BATCH_SIZE);
          const embeddings = await batchEmbedChunks(batch);
          await Promise.all(batch.map((chunk, index) => {
            const embeddingArray = `[${embeddings[index].join(',')}]`;
            return db.query(
              'INSERT INTO document_chunks (document_id, content, embedding) VALUES ($1, $2, $3)',
              [documentId, chunk, embeddingArray]
            );
          }));
        }
    }

    // 5. SUMMARIZATION
    progress = "5: Summarization";
    let summary = isImage ? 'Image file uploaded successfully.' : 'Summary generation failed or timed out.';
    if (!isImage && text.trim().length > 0) {
        try {
          const prompt = `Summarize: ${text.substring(0, 8000)}`;
          summary = await aiProvider.callAI({ question: prompt });
          await db.query('UPDATE documents SET summary = $1 WHERE id = $2', [summary, documentId]);
        } catch (sumErr) {
          console.warn('⚠️ Summarization Skip:', sumErr.message);
        }
    }

    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    res.json({ success: true, message: 'Document processed successfully', documentId, url: publicUrl, summary });

  } catch (error) {
    console.error(`❌ [FAILED AT STEP ${progress}]:`, error.message);
    if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
    res.status(500).json({ 
        error: `Upload failed at Step ${progress}`, 
        message: error.message 
    });
  }
});

router.get('/:id/view', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT file_path, file_type, filename FROM documents WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    
    const doc = result.rows[0];
    
    // If it's a cloud URL, redirect to it
    if (doc.file_path.startsWith('http')) {
      return res.redirect(doc.file_path);
    }

    // Legacy fallback for local files (Localhost only)
    if (!doc.file_path || !fs.existsSync(doc.file_path)) {
      return res.status(404).json({ error: 'File not found - may have been deleted in ephemeral storage' });
    }
    
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
    
    // 1. Delete from Cloud Storage if it's a URL
    if (filePath && filePath.includes('storage/v1/object/public/documents/')) {
      const storagePath = filePath.split('documents/')[1];
      await supabase.storage.from('documents').remove([storagePath]);
    } 
    // 2. Delete from local if it exists
    else if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await db.query('DELETE FROM documents WHERE id = $1', [id]);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
