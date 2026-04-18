const express = require('express');
const multer = require('multer');
const fs = require('fs');

// Vercel Serverless Polyfill
if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {};
}
const pdfRaw = require('pdf-parse');
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
const { batchEmbedChunks } = require('../utils/gemini');
const aiProvider = require('../utils/aiProvider');
const router = express.Router();

// FIX 1 + 2: memoryStorage (no disk writes) + 4.5MB limit inside multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4.5 * 1024 * 1024 }
});

// FIX 3: Import supabase at top level with error catching
let supabase;
try {
  supabase = require('../supabase').supabase;
  if (!supabase) throw new Error('supabase client is null');
} catch (err) {
  console.error('Supabase import failed:', err.message);
}

// GET all documents for logged-in user
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

// POST upload a document
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  let progress = '0: Initializing';
  try {
    // FIX 4: Check supabase is ready before anything else
    if (!supabase) {
      return res.status(500).json({
        error: 'Upload failed at Step 0: Supabase not initialized',
        message: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. Add them in Vercel Dashboard → Settings → Environment Variables.'
      });
    }

    const { file } = req;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // FIX 5: Use file.buffer (memoryStorage — no disk path exists)
    const fileBuffer = file.buffer;

    // STEP 1: Text extraction
    progress = '1: Extraction';
    let text = '';
    const isImage = file.mimetype.startsWith('image/');

    if (file.mimetype === 'application/pdf') {
      const result = await pdf(fileBuffer);
      text = result.text;
    } else if (file.mimetype === 'text/plain' || file.mimetype === 'text/markdown') {
      text = fileBuffer.toString('utf-8');
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // FIX 6: mammoth must use buffer: not path: (no local file exists)
      const docResult = await mammoth.extractRawText({ buffer: fileBuffer });
      text = docResult.value;
    } else if (isImage) {
      text = `[Image Content: ${file.originalname}]`;
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Supported: PDF, DOCX, TXT, images.' });
    }

    // STEP 2: Upload to Supabase Storage
    progress = '2: Cloud Storage Upload';
    const storagePath = `user_${req.user.id}/${Date.now()}-${file.originalname}`;
    const { data: storageData, error: storageError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, { contentType: file.mimetype, upsert: true });

    if (storageError) throw new Error(`Storage Error: ${storageError.message}`);

    // STEP 3: Save to database
    progress = '3: Save to Database';
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${storagePath}`;
    const docResult = await db.query(
      'INSERT INTO documents (user_id, filename, file_type, file_path) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.user.id, file.originalname, file.mimetype, publicUrl]
    );
    const documentId = docResult.rows[0].id;

    // STEP 4: Chunk and embed (skip images)
    if (!isImage && text.trim().length > 0) {
      progress = '4: Chunks & Embeddings';
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

    // STEP 5: Summarization
    progress = '5: Summarization';
    let summary = isImage ? 'Image uploaded successfully.' : 'Summary unavailable.';
    if (!isImage && text.trim().length > 0) {
      try {
        summary = await aiProvider.callAI({ question: `Summarize: ${text.substring(0, 8000)}` });
        await db.query('UPDATE documents SET summary = $1 WHERE id = $2', [summary, documentId]);
      } catch (sumErr) {
        console.warn('Summarization skipped:', sumErr.message);
      }
    }

    res.json({ success: true, message: 'Document processed successfully', documentId, url: publicUrl, summary });

  } catch (error) {
    console.error(`[FAILED AT STEP ${progress}]:`, error.message, error.stack);
    res.status(500).json({ error: `Upload failed at Step ${progress}`, message: error.message });
  }
});

// GET view/redirect to document
router.get('/:id/view', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT file_path, file_type, filename FROM documents WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];
    if (doc.file_path && doc.file_path.startsWith('http')) return res.redirect(doc.file_path);
    return res.status(404).json({ error: 'File not found in cloud storage' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve document' });
  }
});

// DELETE a document
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT file_path FROM documents WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const filePath = result.rows[0].file_path;
    if (filePath && filePath.includes('storage/v1/object/public/documents/') && supabase) {
      const storagePath = filePath.split('documents/')[1];
      await supabase.storage.from('documents').remove([storagePath]);
    }
    await db.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
