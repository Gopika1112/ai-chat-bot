const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { getEmbeddings } = require('../utils/gemini');
const aiProvider = require('../utils/aiProvider');
const router = express.Router();

router.post('/query', auth, async (req, res) => {
  const { question, chatId, documentId } = req.body;
  if (!question) return res.status(400).json({ error: 'Question is required' });

  try {
    const q = question.toLowerCase();
    
    // 1. Intent Detection
    let intent = 'general';
    const casualRegex = /^(hi|hello|hey|thanks|thank you|how are you|good morning|good evening)/i;
    const summaryRegex = /(summarize|summary|tl;dr|overview|shorten|brief)/i;
    const docQueryRegex = /(find in|according to the document|in this file|suggest from|what does the pdf say)/i;
    const factualRegex = /^(who is|what is|when is|where is|tell me about|explain the)/i;

    if (casualRegex.test(q)) intent = 'casual';
    else if (summaryRegex.test(q)) intent = 'summarize';
    else if (docQueryRegex.test(q) || (documentId && q.length > 15)) intent = 'doc_query';
    else if (factualRegex.test(q)) intent = 'general';

    console.log(`🧠 [Intent Classifier]: Detected "${intent}" for query: "${q.substring(0, 30)}..."`);

    let currentChatId = chatId;
    if (!currentChatId) {
      const chatRes = await db.query('INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING id', [req.user.id, question.substring(0, 50)]);
      currentChatId = chatRes.rows[0].id;
    }

    // --- Path 1: Casual ---
    if (intent === 'casual') {
      const fallbacks = [
        "Hey there! 👋 How can I help you today?",
        "Hello! I'm ready to help with your documents.",
        "Hi! Need a summary or have a question about a file?",
        "Greetings! I'm your AI assistant."
      ];
      const response = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      await saveMessagePair(currentChatId, question, response);
      res.setHeader('X-Chat-Id', currentChatId);
      return res.send(response);
    }

    // --- Path 2: Summarize (Sequential Chunk Stitching) ---
    if (intent === 'summarize' && documentId) {
      const chunksRes = await db.query(
        'SELECT content FROM document_chunks WHERE document_id = $1 ORDER BY id ASC LIMIT 30',
        [documentId]
      );
      const fullDocText = chunksRes.rows.map(c => c.content).join('\n\n');
      
      const prompt = `Summarize the following document in a clear, structured, and human-friendly way. Use bullet points and headers where appropriate. Focus on the core message and key takeaways.\n\nDOCUMENT CONTENT:\n${fullDocText}`;
      
      const summaryStream = await aiProvider.callAI({
        question: prompt,
        onChunk: (chunk) => {
          if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('X-Chat-Id', currentChatId);
          }
          res.write(chunk);
        }
      });

      await saveMessagePair(currentChatId, question, summaryStream, [documentId]);
      return res.end();
    }

    // --- Path 3: Doc Query (RAG Mode) ---
    if (intent === 'doc_query' && documentId) {
      const questionEmbedding = await getEmbeddings(question);
      const embeddingArray = `[${questionEmbedding.join(',')}]`;
      
      const searchResult = await db.query(
        `SELECT dc.content, dc.embedding <=> $1::vector as distance 
         FROM document_chunks dc
         WHERE dc.document_id = $2
         ORDER BY distance ASC
         LIMIT 5`,
        [embeddingArray, documentId]
      );

      const relevantChunks = searchResult.rows.filter(r => r.distance < 0.65);
      
      if (relevantChunks.length > 0) {
        const context = relevantChunks.map(r => r.content).join('\n\n');
        const ragPrompt = `Answer ONLY using the provided context. If the answer is not in the context, say "I couldn't find that in the document."\n\nCONTEXT:\n${context}`;
        
        const response = await aiProvider.callAI({
          question,
          context: ragPrompt,
          onChunk: (chunk) => {
            if (!res.headersSent) {
              res.setHeader('Content-Type', 'text/plain');
              res.setHeader('X-Chat-Id', currentChatId);
            }
            res.write(chunk);
          }
        });

        await saveMessagePair(currentChatId, question, response, [documentId]);
        return res.end();
      }
    }

    // --- Path 4: General (Knowledge/Wiki) ---
    let wikiContext = "";
    if (intent === 'general') {
      const { getWikipediaSummary } = require('../utils/wikipedia');
      const subject = q.replace(factualRegex, '').trim();
      wikiContext = await getWikipediaSummary(subject) || "";
    }

    const finalResponse = await aiProvider.callAI({
      question,
      context: wikiContext ? `Wikipedia Context: ${wikiContext}` : "General knowledge mode.",
      onChunk: (chunk) => {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'text/plain');
          res.setHeader('X-Chat-Id', currentChatId);
        }
        res.write(chunk);
      }
    });

    await saveMessagePair(currentChatId, question, finalResponse);
    res.end();

  } catch (error) {
    console.error('❌ Chat Error:', error);
    if (!res.headersSent) {
        res.status(500).json({ error: error.message });
    } else {
        res.write(`\n\n[SYSTEM ERROR]: ${error.message}`);
        res.end();
    }
  }
});

async function saveMessagePair(chatId, userMsg, assistantMsg, sources = []) {
  try {
    await db.query('INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3)', [chatId, 'user', userMsg]);
    await db.query('INSERT INTO messages (chat_id, role, content, sources) VALUES ($1, $2, $3, $4)', [chatId, 'assistant', assistantMsg, JSON.stringify(sources)]);
  } catch (err) {
    console.error('Failed to save message pair:', err);
  }
}

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
    const chat = await db.query('SELECT id FROM chats WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (chat.rows.length === 0) return res.status(404).json({ error: 'Chat not found' });

    await db.query('DELETE FROM chats WHERE id = $1', [id]);
    res.json({ message: 'Chat deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

module.exports = router;
