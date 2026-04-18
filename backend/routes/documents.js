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
  console.log('🚀 [INGESTION START] Root deployment trace: File received');
  let localPath = '';
  try {
    const { file } = req;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    localPath = file.path;

    // 1. DYNAMIC EXTRACTION
    let text = '';
    console.log(`📝 [Extraction]: Processing ${file.mimetype}...`);
    if (file.mimetype === 'application/pdf') {
      const fileBuffer = fs.readFileSync(localPath);
      const result = await pdf(fileBuffer);
      text = result.text;
    } else if (file.mimetype === 'text/plain' || file.mimetype === 'text/markdown') {
      text = fs.readFileSync(localPath, 'utf-8');
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const docResult = await mammoth.extractRawText({ path: localPath });
      text = docResult.value;
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    if (!text || text.trim().length === 0) {
      throw new Error('No readable text found in document.');
    }

    // 2. CLOUD STORAGE UPLOAD (Supabase)
    console.log('☁️ [Cloud Storage]: Uploading to Supabase documents bucket...');
    const storagePath = `user_${req.user.id}/${Date.now()}-${file.originalname}`;
    const fileBuffer = fs.readFileSync(localPath);
    
    const { data: storageData, error: storageError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (storageError) throw new Error(`Supabase Storage Error: ${storageError.message}`);

    // 3. DATABASE RECORDING
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${storagePath}`;
    const docResult = await db.query(
      'INSERT INTO documents (user_id, filename, file_type, file_path) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.user.id, file.originalname, file.mimetype, publicUrl]
    );
    const documentId = docResult.rows[0].id;

    // 4. CHUNKING & EMBEDDINGS (RAG PREP)
    console.log('✂️ [Chunking]: Generating vector embeddings...');
    const chunks = chunkText(text);
    const BATCH_SIZE = 50; // Smaller batch for serverless stability
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

    // 5. SUMMARIZATION
    let summary = 'Summary generation failed or timed out.';
    try {
      const prompt = `Summarize the following content in 2-3 structured paragraphs. Focus on key themes.\n\nCONTENT:\n${text.substring(0, 8000)}`;
      summary = await aiProvider.callAI({ question: prompt });
      await db.query('UPDATE documents SET summary = $1 WHERE id = $2', [summary, documentId]);
    } catch (sumErr) {
      console.warn('⚠️ [Summarization Timeout/Skip]:', sumErr.message);
    }

    // Cleanup local temp file
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

    console.log('✨ [COMPLETE]: Document successfully ingested and stored in cloud.');
    res.json({ message: 'Document processed successfully', documentId, summary });

  } catch (error) {
    console.error('❌ [FATAL UPLOAD ERROR]:', error.message);
    if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
    res.status(500).json({ error: error.message || 'Server encountered an error during upload' });
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
