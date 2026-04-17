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
  const { question, chatId, documentId } = req.body;
  if (!question) return res.status(400).json({ error: 'Question is required' });

  // 0. Check Cache First
  const cacheKey = `${req.user.id}:${question.toLowerCase().trim()}`;
  if (queryCache.has(cacheKey)) {
    console.log('🎯 Cache Hit: Returning stored response');
    const cachedData = queryCache.get(cacheKey);
    
    // Optional: Only return if recent (e.g., 1 hour)
    if (Date.now() - cachedData.timestamp < 3600000) {
      res.setHeader('X-Chat-Id', chatId || 'cached');
      return res.send(cachedData.response);
    }
  }

  const now = Date.now();
  if (now - lastRequestTime < 2000) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  lastRequestTime = now;

  try {
    const { question, chatId, documentId } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required' });

    // 1. Embed the question
    console.log('🤖 Embedding question:', question.substring(0, 50));
    const questionEmbedding = await getEmbeddings(question);
    console.log(`📏 Question Embedding Dimension: ${questionEmbedding.length}`);
    const embeddingArray = `[${questionEmbedding.join(',')}]`;

    // 2. Search for relevant chunks
    console.log(`🔍 Searching database for chunks... ${documentId ? `(Filtered to doc: ${documentId})` : '(Auto-scoping to last uploaded doc)'}`);
    
    let effectiveDocId = documentId;
    if (effectiveDocId === 'none') {
      effectiveDocId = null; // Explicitly no context
    } else if (!effectiveDocId) {
      // Auto-scope only if documentId is missing or empty
      const lastDocRes = await db.query(
        'SELECT id FROM documents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [req.user.id]
      );
      if (lastDocRes.rows.length > 0) {
        effectiveDocId = lastDocRes.rows[0].id;
        console.log(`📌 Scoping context to document ID: ${effectiveDocId}`);
      }
    }

    let searchResult;
    if (effectiveDocId) {
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
      // Fallback: No documents found at all
      searchResult = { rows: [] };
      console.log('⚠️ No documents found for this user. Answering from general knowledge.');
    }

    console.log(`📊 Found ${searchResult.rows.length} relevant chunks`);
    const context = searchResult.rows.map(r => `Source: ${r.filename}\nContent: ${r.content}`).join('\n\n');
    const sources = [...new Set(searchResult.rows.map(r => r.filename))];
    const firstDocSummary = searchResult.rows[0]?.summary;

    // --- SHORT-CIRCUIT: If asking for summary, return pre-computed summary ---
    const q = question.toLowerCase();
    if (q.includes('summarize') || q.includes('summary') || q.includes('what is this') || q.includes('key points')) {
      if (firstDocSummary) {
        console.log('⚡ Short-circuiting: Returning pre-computed summary');
        const summaryResponse = `Here is the summary of **${sources[0]}**:\n\n${firstDocSummary}`;
        
        // Save assistant message and return
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

    // 3. Get Chat History for context
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
    }

    // Save user message
    await db.query(
      'INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3)',
      [currentChatId, 'user', question]
    );

    // 4. Stream AI response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('X-Chat-Id', currentChatId);

    const fullContent = await aiProvider.callAI({
      question,
      context: context.slice(0, 10000),
      history,
      onChunk: (chunkText) => {
        res.write(chunkText);
      }
    });

    console.log('✨ Gemini Streaming Complete');

    // Save to Cache
    queryCache.set(cacheKey, {
      response: fullContent,
      timestamp: Date.now()
    });

    // Save assistant message
    await db.query(
      'INSERT INTO messages (chat_id, role, content, sources) VALUES ($1, $2, $3, $4)',
      [currentChatId, 'assistant', fullContent, JSON.stringify(sources)]
    );

    res.end();
  } catch (error) {
    console.error('Chat Error:', error);
    // Removed fs.appendFileSync('debug.log', ...) to prevent EROFS crash on Vercel Serverless
    res.status(500).json({ error: error.message || 'Failed to generate response' });
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
