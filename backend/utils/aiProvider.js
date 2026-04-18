const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const config = require('../config');
const fs = require('fs');

class AIProvider {
    constructor() {
        // Safe Initialization: Avoid throwing errors on Vercel module instantiation if keys are missing
        this.gemini = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null;
        
        this.openRouter = config.OPENROUTER_API_KEY ? new OpenAI({
            apiKey: config.OPENROUTER_API_KEY,
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
                "HTTP-Referer": "http://localhost:5000",
                "X-Title": "AI Document Assistant",
            }
        }) : null;

        this.groq = config.GROQ_API_KEY ? new OpenAI({
            apiKey: config.GROQ_API_KEY,
            baseURL: "https://api.groq.com/openai/v1"
        }) : null;
    }

    async callAI({ question, context, onChunk, history = [] }) {
        const models = [
            { provider: 'gemini', model: config.AI.PRIMARY_MODEL },
            ...config.AI.FALLBACK_MODELS
        ];

        let errors = [];
        for (const entry of models) {
            try {
                console.log(`🤖 [AI] Attempting ${entry.provider}:${entry.model}...`);
                return await this._executeRequest(entry, question, context, onChunk, history);
            } catch (error) {
                const errorMsg = `${entry.provider}:${entry.model} failed: ${error.message}`;
                errors.push(errorMsg);
                console.warn(`⚠️ [AI] ${errorMsg}`);

                // If it's a rate limit (429), try a quick retry inside the next loop or just proceed
                // We keep it simple to avoid nested try-catch complexity
            }
        }

        const finalError = new Error(`All AI providers failed:\n- ${errors.join('\n- ')}`);
        console.error('❌ [AI] All providers exhausted.', finalError.message);
        throw finalError;
    }

    async _executeRequest({ provider, model }, question, context, onChunk, history) {
        const hasContext = context && context.trim().length > 0;
        
        const systemPrompt = hasContext 
            ? `You are a professional AI Assistant. 
Your goal is to help the user with their questions.
Answer from the provided document if relevant. If the question is unrelated to the document, or the answer isn't in the context, answer using your general knowledge.
Maintain a helpful, professional, and friendly tone.

Context:
${context}`
            : `You are a helpful AI assistant. Answer all questions using your general knowledge. Maintain a helpful, professional, and friendly tone.`;

        if (provider === 'gemini') {
            if (!this.gemini) throw new Error("GEMINI_API_KEY is completely missing in Vercel environment.");
            return await this._streamGemini(model, question, systemPrompt, onChunk, history);
        } else if (provider === 'openrouter' || provider === 'groq') {
            return await this._streamOpenAI(provider, model, question, systemPrompt, onChunk, history);
        } else {
            throw new Error(`Unsupported AI provider mapping: ${provider}`);
        }
    }

    async _streamGemini(modelName, question, systemInstruction, onChunk, history) {
        const model = this.gemini.getGenerativeModel({ 
            model: modelName.replace('google/', ''), 
            systemInstruction 
        }, { apiVersion: 'v1beta' });

        // Convert history for Gemini format
        const chatHistory = history.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        const chat = model.startChat({
            history: chatHistory,
            generationConfig: {
                maxOutputTokens: 2048,
            },
        });

        const result = await chat.sendMessageStream(question);
        let fullText = '';
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullText += chunkText;
            if (onChunk) onChunk(chunkText);
        }
        return fullText;
    }

    async _streamOpenAI(provider, model, question, systemPrompt, onChunk, history) {
        const client = provider === 'groq' ? this.groq : this.openRouter;
        if (!client) throw new Error(`${provider} API key not configured`);

        const messages = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: question }
        ];

        const stream = await client.chat.completions.create({
            model: model,
            messages: messages,
            stream: true,
            max_tokens: 2048,
        });

        let fullText = '';
        for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            fullText += text;
            if (onChunk) onChunk(text);
        }
        return fullText;
    }
}

module.exports = new AIProvider();
