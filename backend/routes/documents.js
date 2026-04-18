const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfRaw = require('pdf-parse');
const pdf = (typeof pdfRaw === 'function') ? pdfRaw : (pdfRaw.default || pdfRaw);
const mammoth = require('mammoth');
const db = require('../db');
const auth = require('../middleware/auth');
const { chunkText } = require('../utils/chunker');
const { batchEmbedChunks } = require('../utils/gemini');
const aiProvider = require('../utils/aiProvider');
const { supabase } = require('../supabase');
const router = express.Router();

// [FIX 1 & 2] Use MemoryStorage and strict size limits to prevent Vercel 500
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 4.5 * 1024 * 1024 } // Vercel Free Plan Limit
});

router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, filename, file_type, created_at, summary FROM documents WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const { file } = req;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // [FIX 3 & 4] Immediate Cloud availability check
    if (!supabase) throw new Error('Cloud Storage (Supabase) is not configured.');

    // 1. DYNAMIC EXTRACTION (Using [FIX 5 & 6] buffer instead of path)
    let text = '';
    const isImage = file.mimetype.startsWith('image/');
    
    if (file.mimetype === 'application/pdf') {
       const result = await pdf(file.buffer);
       text = result.text;
    } else if (file.mimetype === 'text/plain' || file.mimetype === 'text/markdown') {
       text = file.buffer.toString('utf-8');
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
       const docResult = await mammoth.extractRawText({ buffer: file.buffer });
       text = docResult.value;
    } else if (isImage) {
       text = `[Image Content: ${file.originalname}]`;
    } else {
       return res.status(400).json({ error: 'Unsupported file type' });
    }

    // 2. CLOUD STORAGE UPLOAD
    const storagePath = `user_${req.user.id}/${Date.now()}-${file.originalname}`;
    const { data: storageData, error: storageError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (storageError) throw new Error(`Storage Error: ${storageError.message}`);

    // 3. DATABASE RECORDING
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${storagePath}`;
    const docResult = await db.query(
      'INSERT INTO documents (user_id, filename, file_type, file_path) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.user.id, file.originalname, file.mimetype, publicUrl]
    );
    const documentId = docResult.rows[0].id;

    // 4. CHUNKING & EMBEDDINGS (Skip for images)
    if (!isImage && text.trim().length > 0) {
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
    let summary = isImage ? 'Image file uploaded successfully.' : 'Summary not available.';
    if (!isImage && text.trim().length > 0) {
        try {
          const prompt = `Summarize in 2 paragraphs:\n\n${text.substring(0, 8000)}`;
          summary = await aiProvider.callAI({ question: prompt });
          await db.query('UPDATE documents SET summary = $1 WHERE id = $2', [summary, documentId]);
        } catch (sumErr) { console.warn('Summary Skip:', sumErr.message); }
    }

    res.json({ success: true, documentId, url: publicUrl, summary });

  } catch (error) {
    console.error('❌ Upload Fatal Error:', error.message);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

router.get('/:id/view', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT file_path FROM documents WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];
    if (doc.file_path.startsWith('http')) return res.redirect(doc.file_path);
    res.status(404).json({ error: 'File available in cloud storage only' });
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
    if (filePath && filePath.includes('storage/v1/object/public/documents/')) {
        const storagePath = filePath.split('documents/')[1];
        await supabase.storage.from('documents').remove([storagePath]);
    }
    await db.query('DELETE FROM documents WHERE id = $1', [id]);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
