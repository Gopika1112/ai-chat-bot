const express = require('express');
const fs = require('fs');
const db = require('../db');
const auth = require('../middleware/auth');
const { getEmbeddings } = require('../utils/gemini');
const aiProvider = require('../utils/aiProvider');
const config = require('../config');
const router = express.Router();

let lastRequestTime = 0;
const queryCache = new Map(); // Simple in-memory cache

router.post('/query', auth, async (req, res) => {
  console.log(`\n[🚀 POST /api/chat/query] Request Entry -> User: ${req.user?.id || 'Unknown'}`);
  
  try {
    const body = req.body || {};
    console.log(`[📦 Request Body]: ${JSON.stringify(body).substring(0, 150)}...`);
    const { question, chatId, documentId } = body;
    
    if (!question) {
      console.warn('⚠️ [Validation] Missing question in request body.');
      return res.status(400).json({ success: false, error: 'Question is required', details: 'req.body.question is empty' });
    }

    // 0. Check Cache First
    const cacheKey = `${req.user.id}:${question.toLowerCase().trim()}`;
    if (queryCache.has(cacheKey)) {
      console.log('🎯 [Cache Hit]: Returning stored response without hitting DB/AI');
      const cachedData = queryCache.get(cacheKey);
      if (Date.now() - cachedData.timestamp < 3600000) { // 1 hour
        res.setHeader('X-Chat-Id', chatId || 'cached');
        return res.send(cachedData.response); // Text response
      }
    }

    // Rate Limiter
    const now = Date.now();
    if (now - lastRequestTime < 2000) {
      console.warn('⚠️ [Rate Limiter] User clicking too fast.');
      return res.status(429).json({ success: false, error: 'Too many requests. Please slow down.' });
    }
    lastRequestTime = now;

    // 1. Embed the question
    console.log(`🤖 [Embedding Phase] Question: "${question.substring(0, 50)}..."`);
    const questionEmbedding = await getEmbeddings(question);
    console.log(`📏 [Embedding Complete] Dimension: ${questionEmbedding.length}`);
    const embeddingArray = `[${questionEmbedding.join(',')}]`;

    // 2. Search for relevant chunks
    console.log(`🔍 [Database Search Phase] Scope: ${documentId ? `Filtered to doc ${documentId}` : 'Auto-scoping'}`);
    let effectiveDocId = documentId;
    if (effectiveDocId === 'none') {
      effectiveDocId = null;
    } else if (!effectiveDocId) {
      const lastDocRes = await db.query(
        'SELECT id FROM documents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [req.user.id]
      );
      if (lastDocRes.rows.length > 0) {
        effectiveDocId = lastDocRes.rows[0].id;
        console.log(`📌 [Auto-Scope] Selected recent document ID: ${effectiveDocId}`);
      }
    }

    let searchResult;
    if (effectiveDocId) {
      console.log(`⏳ Executing pgvector similarity search on doc: ${effectiveDocId}...`);
      searchResult = await db.query(
        `SELECT dc.content, d.filename, d.summary 
         FROM document_chunks dc
         JOIN documents d ON dc.document_id = d.id
         WHERE d.user_id = $1 AND d.id = $2
         ORDER BY dc.embedding <=> $3::vector
         LIMIT 5`,
        [req.user.id, effectiveDocId, embeddingArray]
      );
    } else {
      searchResult = { rows: [] };
      console.log('⚠️ [No Context Strategy] No documents found. AI will answer from general knowledge.');
    }

    console.log(`📊 [Search Complete] Retrieved ${searchResult.rows.length} relevant chunks from PostgreSQL.`);
    const context = searchResult.rows.map(r => `Source: ${r.filename}\nContent: ${r.content}`).join('\n\n');
    const sources = [...new Set(searchResult.rows.map(r => r.filename))];
    const firstDocSummary = searchResult.rows[0]?.summary;

    // --- SHORT-CIRCUIT: Pre-computed summary ---
    const q = question.toLowerCase();
    if (q.includes('summarize') || q.includes('summary') || q.includes('what is this') || q.includes('key points')) {
      if (firstDocSummary) {
        console.log('⚡ [Short-circuit] Returning pre-computed summary directly.');
        const summaryResponse = `Here is the summary of **${sources[0]}**:\n\n${firstDocSummary}`;
        
        let currentChatId = chatId;
        if (!currentChatId) {
          const chatRes = await db.query('INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING id', [req.user.id, question.substring(0, 50)]);
          currentChatId = chatRes.rows[0].id;
        }
        await db.query('INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3)', [currentChatId, 'user', question]);
        await db.query('INSERT INTO messages (chat_id, role, content, sources) VALUES ($1, $2, $3, $4)', [currentChatId, 'assistant', summaryResponse, JSON.stringify(sources)]);
        
        res.setHeader('X-Chat-Id', currentChatId);
        return res.send(summaryResponse);
      }
    }

    // 3. Get Chat History
    console.log(`⏳ [History Phase] Fetching logic for chat ID: ${chatId || 'NEW_CHAT'}`);
    let currentChatId = chatId;
    let history = [];
    if (currentChatId) {
      const historyResult = await db.query(
        'SELECT role, content FROM messages WHERE chat_id = $1 ORDER BY created_at ASC LIMIT 10',
        [currentChatId]
      );
      history = historyResult.rows;
    } else {
      const chatResult = await db.query(
        'INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING id',
        [req.user.id, question.substring(0, 50)]
      );
      currentChatId = chatResult.rows[0].id;
      console.log(`🆕 [New Chat] Generated ID: ${currentChatId}`);
    }

    await db.query('INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3)', [currentChatId, 'user', question]);

    // 4. Stream AI response
    console.log(`⏳ [AI Generation Phase] Triggering upstream provider logic...`);
    
    // Defer writing headers until the stream starts successfully to prevent ERR_HTTP_HEADERS_SENT
    let isStreamingInitiated = false;

    const fullContent = await aiProvider.callAI({
      question,
      context: context.slice(0, 10000),
      history,
      onChunk: (chunkText) => {
        if (!isStreamingInitiated) {
          console.log(`🌊 [Stream] First byte received, explicitly starting text chunking.`);
          res.setHeader('Content-Type', 'text/plain');
          res.setHeader('X-Chat-Id', currentChatId);
          isStreamingInitiated = true;
        }
        res.write(chunkText);
      }
    });

    console.log('✨ [Success] LLM Stream Completed securely.');

    // If stream ended but chunk callback never fired (edge case of empty response)
    if (!isStreamingInitiated) {
       res.setHeader('Content-Type', 'text/plain');
       res.setHeader('X-Chat-Id', currentChatId);
       res.write(fullContent || "Hmm, I didn't get a proper response.");
    }

    queryCache.set(cacheKey, { response: fullContent, timestamp: Date.now() });

    await db.query(
      'INSERT INTO messages (chat_id, role, content, sources) VALUES ($1, $2, $3, $4)',
      [currentChatId, 'assistant', fullContent, JSON.stringify(sources)]
    );

    res.end(); // Safely terminate the Vercel execution boundary

  } catch (error) {
    console.error('\n❌ [FATAL ROUTE CRASH] Caught exception in /chat/query:', error);
    
    const errorPayload = {
      success: false,
      error: error.message || 'The server encountered an unexpected error generating the AI response.',
      details: error.stack || 'No details available'
    };

    if (res.headersSent) {
      console.error('⚠️ [Error Handling] Headers were already sent! Returning fallback string to stream.');
      if (!res.writableEnded) {
        res.write(`\n\n[SYSTEM ERROR]: ${errorPayload.error}`);
        res.end();
      }
    } else {
      console.log('↩️ [Error Handling] Sending clean JSON 500 rejection to client.');
      res.status(500).json(errorPayload);
    }
  }
});

router.get('/history', auth, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM chats WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

router.delete('/history/all', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM chats WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'All chat history cleared successfully' });
  } catch (error) {
    console.error('Clear all history error:', error);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

router.get('/messages/:chatId', auth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const result = await db.query(
      'SELECT m.* FROM messages m JOIN chats c ON m.chat_id = c.id WHERE c.id = $1 AND c.user_id = $2 ORDER BY m.created_at ASC',
      [chatId, req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    // Verify ownership
    const chat = await db.query('SELECT id FROM chats WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (chat.rows.length === 0) return res.status(404).json({ error: 'Chat not found' });

    await db.query('DELETE FROM chats WHERE id = $1', [id]);
    res.json({ message: 'Chat deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

module.exports = router;
