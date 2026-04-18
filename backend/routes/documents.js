const express = require('express');
const multer = require('multer');

// ── Vercel Serverless Polyfill ──────────────────────────────────────────────
if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {};
}

// ── FIX: Bulletproof pdf-parse loader for Vercel Node.js runtime ────────────
// Vercel's bundler can expose pdf-parse as { default: fn }, { pdf: fn },
// a plain function, or a nested object. We try every known shape.
let pdf;
try {
  const pdfModule = require('pdf-parse');
  if (typeof pdfModule === 'function') {
    pdf = pdfModule;
  } else if (pdfModule && typeof pdfModule.default === 'function') {
    pdf = pdfModule.default;
  } else if (pdfModule && typeof pdfModule.pdf === 'function') {
    pdf = pdfModule.pdf;
  } else {
    // Last resort: find the first exported function
    const fn = Object.values(pdfModule || {}).find(v => typeof v === 'function');
    if (fn) {
      pdf = fn;
    } else {
      throw new Error('pdf-parse: no callable export found');
    }
  }
  console.log('pdf-parse loaded successfully, type:', typeof pdf);
} catch (err) {
  console.error('pdf-parse load failed:', err.message);
  pdf = null;
}

const mammoth = require('mammoth');
const db = require('../db');
const auth = require('../middleware/auth');
const { chunkText } = require('../utils/chunker');
const { batchEmbedChunks } = require('../utils/gemini');
const aiProvider = require('../utils/aiProvider');
const router = express.Router();

// ── multer: memoryStorage (Vercel filesystem is read-only) ──────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4.5 * 1024 * 1024 }
});

// ── Supabase: import at top level with error catching ───────────────────────
let supabase;
try {
  supabase = require('../supabase').supabase;
  if (!supabase) throw new Error('supabase client is null');
} catch (err) {
  console.error('Supabase import failed:', err.message);
}

// ── GET /documents ──────────────────────────────────────────────────────────
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

// ── POST /documents/upload ──────────────────────────────────────────────────
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  let progress = '0: Initializing';
  try {
    // Guard: supabase must be ready
    if (!supabase) {
      return res.status(500).json({
        error: 'Upload failed at Step 0: Supabase not initialized',
        message: 'Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Vercel Dashboard → Settings → Environment Variables, then redeploy.'
      });
    }

    const { file } = req;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const fileBuffer = file.buffer; // memoryStorage — no disk path exists

    // ── STEP 1: Extract text ────────────────────────────────────────────────
    progress = '1: Extraction';
    let text = '';
    const isImage = file.mimetype.startsWith('image/');

    if (file.mimetype === 'application/pdf') {
      // Guard: pdf-parse must have loaded correctly
      if (typeof pdf !== 'function') {
        throw new Error(
          'pdf-parse did not load as a function on this server. ' +
          'Try: npm remove pdf-parse && npm install pdf-parse@1.1.1 then redeploy.'
        );
      }
      const result = await pdf(fileBuffer);
      text = result.text;

    } else if (
      file.mimetype === 'text/plain' ||
      file.mimetype === 'text/markdown'
    ) {
      text = fileBuffer.toString('utf-8');

    } else if (
      file.mimetype ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      // mammoth must use buffer: not path: (no local file exists in serverless)
      const docResult = await mammoth.extractRawText({ buffer: fileBuffer });
      text = docResult.value;

    } else if (isImage) {
      text = `[Image Content: ${file.originalname}]`;

    } else {
      return res.status(400).json({
        error: 'Unsupported file type. Supported: PDF, DOCX, TXT, PNG, JPG.'
      });
    }

    // ── STEP 2: Upload to Supabase Storage ──────────────────────────────────
    progress = '2: Cloud Storage Upload';
    const storagePath = `user_${req.user.id}/${Date.now()}-${file.originalname}`;
    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.mimetype,
        upsert: true
      });
    if (storageError) throw new Error(`Storage Error: ${storageError.message}`);

    // ── STEP 3: Save metadata to database ───────────────────────────────────
    progress = '3: Save to Database';
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${storagePath}`;
    const docResult = await db.query(
      'INSERT INTO documents (user_id, filename, file_type, file_path) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.user.id, file.originalname, file.mimetype, publicUrl]
    );
    const documentId = docResult.rows[0].id;

    // ── STEP 4: Chunk and embed (skip images) ────────────────────────────────
    if (!isImage && text.trim().length > 0) {
      progress = '4: Chunks & Embeddings';
      const chunks = chunkText(text);
      const BATCH_SIZE = 50;
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const embeddings = await batchEmbedChunks(batch);
        await Promise.all(
          batch.map((chunk, index) => {
            const embeddingArray = `[${embeddings[index].join(',')}]`;
            return db.query(
              'INSERT INTO document_chunks (document_id, content, embedding) VALUES ($1, $2, $3)',
              [documentId, chunk, embeddingArray]
            );
          })
        );
      }
    }

    // ── STEP 5: Summarize ────────────────────────────────────────────────────
    progress = '5: Summarization';
    let summary = isImage
      ? 'Image uploaded successfully.'
      : 'Summary unavailable.';
    if (!isImage && text.trim().length > 0) {
      try {
        summary = await aiProvider.callAI({
          question: `Summarize: ${text.substring(0, 8000)}`
        });
        await db.query(
          'UPDATE documents SET summary = $1 WHERE id = $2',
          [summary, documentId]
        );
      } catch (sumErr) {
        console.warn('Summarization skipped:', sumErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Document processed successfully',
      documentId,
      url: publicUrl,
      summary
    });

  } catch (error) {
    console.error(`[FAILED AT STEP ${progress}]:`, error.message, error.stack);
    res.status(500).json({
      error: `Upload failed at Step ${progress}`,
      message: error.message
    });
  }
});

// ── GET /documents/:id/view ──────────────────────────────────────────────────
router.get('/:id/view', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT file_path, file_type, filename FROM documents WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];
    if (doc.file_path && doc.file_path.startsWith('http'))
      return res.redirect(doc.file_path);
    return res.status(404).json({ error: 'File not found in cloud storage' });
  } catch (error) {
    console.error('View document error:', error);
    res.status(500).json({ error: 'Failed to serve document' });
  }
});

// ── DELETE /documents/:id ────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT file_path FROM documents WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Document not found' });
    const filePath = result.rows[0].file_path;
    if (
      filePath &&
      filePath.includes('storage/v1/object/public/documents/') &&
      supabase
    ) {
      const storagePath = filePath.split('documents/')[1];
      await supabase.storage.from('documents').remove([storagePath]);
    }
    await db.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
