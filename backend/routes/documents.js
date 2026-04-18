const express = require('express');
const multer = require('multer');

// --- Vercel Serverless Polyfill ---
if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {};
}

// --- Robust pdf-parse Loader ---
let pdf;
try {
  const pdfModule = require('pdf-parse');
  // Handle various export shapes (Standard, ESM, and Vercel-specific bundles)
  pdf = (typeof pdfModule === 'function') 
    ? pdfModule 
    : (pdfModule.default && typeof pdfModule.default === 'function')
      ? pdfModule.default 
      : (pdfModule.pdf && typeof pdfModule.pdf === 'function')
        ? pdfModule.pdf
        : pdfModule;
} catch (err) {
  console.error('pdf-parse initialization failed:', err.message);
}

const mammoth = require('mammoth');
const db = require('../db');
const auth = require('../middleware/auth');
const { chunkText } = require('../utils/chunker');
const { batchEmbedChunks } = require('../utils/gemini');
const aiProvider = require('../utils/aiProvider');
const router = express.Router();

// --- Multer: Memory Storage (Vercel filesystem is read-only) ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4.5 * 1024 * 1024 }
});

// --- Supabase: Import from central config ---
let supabase;
try {
  supabase = require('../supabase').supabase;
} catch (err) {
  console.error('Supabase initialization failed:', err.message);
}

// GET all documents
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

// POST upload
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  let progress = '0: Initializing';
  try {
    if (!supabase) throw new Error('Supabase client not available');
    const { file } = req;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const fileBuffer = file.buffer;

    // STEP 1: Text extraction
    progress = '1: Extraction';
    let text = '';
    const isImage = file.mimetype.startsWith('image/');

    if (file.mimetype === 'application/pdf') {
      if (typeof pdf !== 'function') throw new Error('PDF extractor not loaded');
      const result = await pdf(fileBuffer);
      text = result.text;
    } else if (file.mimetype === 'text/plain' || file.mimetype === 'text/markdown') {
      text = fileBuffer.toString('utf-8');
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const docResult = await mammoth.extractRawText({ buffer: fileBuffer });
      text = docResult.value;
    } else if (isImage) {
      text = `[Image: ${file.originalname}]`;
    }

    // STEP 2: Storage
    progress = '2: Storage';
    const storagePath = `user_${req.user.id}/${Date.now()}-${file.originalname}`;
    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, { contentType: file.mimetype, upsert: true });

    if (storageError) throw new Error(`Storage Error: ${storageError.message}`);

    // STEP 3: DB
    progress = '3: Database';
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${storagePath}`;
    const docResult = await db.query(
      'INSERT INTO documents (user_id, filename, file_type, file_path) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.user.id, file.originalname, file.mimetype, publicUrl]
    );
    const documentId = docResult.rows[0].id;

    // STEP 4: AI Logic
    if (!isImage && text.trim().length > 0) {
      progress = '4: AI processing';
      const chunks = chunkText(text);
      const BATCH_SIZE = 50;
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const embeddings = await batchEmbedChunks(batch);
        await Promise.all(batch.map((chunk, index) => {
          return db.query(
            'INSERT INTO document_chunks (document_id, content, embedding) VALUES ($1, $2, $3)',
            [documentId, chunk, `[${embeddings[index].join(',')}]`]
          );
        }));
      }

      // Summary
      try {
        const summary = await aiProvider.callAI({ question: `Summarize: ${text.substring(0, 5000)}` });
        await db.query('UPDATE documents SET summary = $1 WHERE id = $2', [summary, documentId]);
      } catch (sumErr) {
        console.warn('Summary generation failed');
      }
    }

    res.json({ success: true, message: 'Processed', documentId, url: publicUrl });

  } catch (error) {
    console.error(`Error at ${progress}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /documents/:id/view
router.get('/:id/view', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT file_path FROM documents WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).send('Not found');
    res.redirect(result.rows[0].file_path);
  } catch (error) {
    res.status(500).send('Error');
  }
});

// DELETE /documents/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT file_path FROM documents WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length > 0 && result.rows[0].file_path.includes('documents/') && supabase) {
      const storagePath = result.rows[0].file_path.split('documents/')[1];
      await supabase.storage.from('documents').remove([storagePath]);
    }
    await db.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
