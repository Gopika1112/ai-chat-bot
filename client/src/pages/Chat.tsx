import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Send, Bot, Loader2, MessageSquare, Plus, X, 
  FileText, Home, Upload as UploadIcon, Copy, Check
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import './Chat.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp?: string;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
}

const SkeletonMessage: React.FC = () => (
  <div className="message-row assistant skeleton">
    <div className="message-bubble">
      <div className="skeleton-line" style={{ width: '80%' }}></div>
      <div className="skeleton-line" style={{ width: '60%' }}></div>
    </div>
  </div>
);

const TypingIndicator: React.FC<{ text?: string }> = ({ text = 'AI is thinking...' }) => (
  <div className="message-row assistant typing">
    <div className="message-bubble">
      <div className="typing-dots">
        <span></span><span></span><span></span>
      </div>
      <span className="typing-text">{text}</span>
    </div>
  </div>
);

const Chat: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [copyId, setCopyId] = useState<number | null>(null);
  
  // Refined Loading States
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const [chatId, setChatId] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatSession[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const docIdParam = searchParams.get('docId');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatTime = (date?: Date) => {
    const d = date || new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopyId(index);
    setTimeout(() => setCopyId(null), 2000);
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSendingMessage, isSummarizing]);

  useEffect(() => {
    fetchHistory();
    fetchDocuments();
    if (docIdParam) {
      setActiveDocId(docIdParam);
      handleInitialDocChat(docIdParam);
    }
  }, [token, docIdParam]);

  const fetchDocuments = async () => {
    if (!token) return;
    setDocsLoading(true);
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';
      const res = await axios.get(`${apiBaseUrl}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(res.data);
      if (activeDocId) {
        const active = res.data.find((d: any) => d.id === activeDocId);
        if (active) setActiveFileName(active.filename);
      }
    } catch (err) {
      console.error('Fetch documents failed', err);
    } finally {
      setDocsLoading(false);
    }
  };

  const handleInitialDocChat = async (docId: string) => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';
      const res = await axios.get(`${apiBaseUrl}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const doc = res.data.find((d: any) => d.id === docId);
      
      if (doc) {
        setActiveFileName(doc.filename);
        setMessages([
          { 
            role: 'assistant', 
            content: `I've loaded **${doc.filename}**. How can I help you analyze it?`,
            timestamp: formatTime()
          }
        ]);
      }
    } catch (err) {
      console.error('Initial doc chat failed', err);
    }
  };

  const fetchHistory = async () => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';
      const res = await axios.get(`${apiBaseUrl}/chat/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHistory(res.data);
    } catch (err) {
      console.error('Fetch history failed', err);
    }
  };

  const loadChat = async (id: string) => {
    setChatId(id);
    setIsChatLoading(true);
    setMessages([]); 
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';
      const res = await axios.get(`${apiBaseUrl}/chat/messages/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Harden parsing to prevent "Unexpected end of JSON input"
      const safeMessages = res.data.map((m: any) => {
        let sources = [];
        try {
          sources = m.sources && m.sources.trim() ? JSON.parse(m.sources) : [];
        } catch (e) {
          console.warn('Failed to parse sources for message', m.id);
        }
        return {
          role: m.role,
          content: m.content,
          sources,
          timestamp: formatTime(new Date(m.created_at))
        };
      });
      
      setMessages(safeMessages);
    } catch (err) {
      console.error('Load chat failed', err);
    } finally {
      setIsChatLoading(false);
    }
  };

  const startNewChat = () => {
    setChatId(null);
    setMessages([]);
  };

  const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this chat?')) return;
    
    const originalHistory = [...history];
    setHistory(prev => prev.filter(item => item.id !== id));
    if (chatId === id) {
      setChatId(null);
      setMessages([]);
    }

    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';
      await axios.delete(`${apiBaseUrl}/chat/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      setHistory(originalHistory);
      alert('Failed to delete chat.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';
      const res = await axios.post(`${apiBaseUrl}/documents/upload`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        }
      });
      fetchDocuments();
      setActiveDocId(res.data.documentId);
      setActiveFileName(file.name);
      handleInitialDocChat(res.data.documentId);
    } catch (err) {
      alert('Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDoc = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this document? This will remove all associated chunks.')) return;

    const originalDocs = [...documents];
    setDocuments(prev => prev.filter(doc => doc.id !== id));
    if (activeDocId === id) {
      setActiveDocId(null);
      setActiveFileName(null);
    }

    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';
      await axios.delete(`${apiBaseUrl}/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      setDocuments(originalDocs);
      alert('Failed to delete document.');
    }
  };

  const handleToolSelect = async (tool: string) => {
    if (!activeDocId) return alert('Please upload or select a document first.');
    
    let prompt = '';
    switch (tool) {
      case 'summarize': prompt = 'Summarize this PDF in detail.'; break;
      case 'key-points': prompt = 'Extract the key points from this document.'; break;
      case 'short': prompt = 'Give me a short summary (1 paragraph) of this document.'; break;
      case 'el5': prompt = "Explain the content of this document like I'm five years old."; break;
    }

    if (prompt) {
      setInput(prompt);
      setIsSummarizing(true);
      setTimeout(() => {
        const form = document.querySelector('.chat-input-box') as HTMLFormElement;
        form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }, 100);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSendingMessage) return;

    const userMessage: Message = { role: 'user', content: input, timestamp: formatTime() };
    setMessages(prev => [...prev, userMessage]);
    const question = input;
    setInput('');
    setIsSendingMessage(true);

    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';
      const response = await fetch(`${apiBaseUrl}/chat/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          question, 
          chatId, 
          documentId: activeDocId 
        }),
      });

      if (!response.ok) throw new Error('Chat failed');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      
      // We clear summarizing state once the actual stream starts
      setIsSummarizing(false);
      setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: formatTime() }]);

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          return [...prev.slice(0, -1), { ...last, content: assistantContent }];
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSendingMessage(false);
      setIsSummarizing(false);
    }
  };

  return (
    <div className="chat-interface">
      {/* Sidebar Area */}
      <aside className="chat-history-sidebar">
        <div className="sidebar-header">
          <h3>AI Assistant</h3>
          <button className="new-chat-btn" onClick={startNewChat} disabled={isChatLoading}>
            <Plus size={18} /> New Chat
          </button>
        </div>

        <div className="sidebar-content">
          <div className="sidebar-section">
            <h4>History</h4>
            <div className="history-list">
              {history.length === 0 ? (
                <div className="sidebar-item disabled">No recent chats</div>
              ) : (
                history.map((session) => (
                  <div 
                    key={session.id} 
                    className={`sidebar-item ${chatId === session.id ? 'active' : ''}`} 
                    onClick={() => !isChatLoading && loadChat(session.id)}
                  >
                    <MessageSquare size={16} />
                    <span className="item-text">{session.title}</span>
                    <button className="delete-btn" onClick={(e) => handleDeleteChat(e, session.id)}>
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <h4>Documents</h4>
            <div className="docs-list">
              {docsLoading ? (
                <div className="sidebar-item disabled">Loading...</div>
              ) : documents.length === 0 ? (
                <div className="sidebar-item disabled">No documents</div>
              ) : (
                documents.map((doc) => (
                  <div 
                    key={doc.id} 
                    className={`sidebar-item ${activeDocId === doc.id ? 'active' : ''}`} 
                    onClick={() => {
                      setActiveDocId(doc.id);
                      setActiveFileName(doc.filename);
                    }}
                  >
                    <FileText size={16} />
                    <span className="item-text">{doc.filename}</span>
                    <button className="delete-btn" onClick={(e) => handleDeleteDoc(e, doc.id)}>
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="chat-main">
        {/* Upload Overlay */}
        {isUploading && (
          <div className="global-overlay">
            <div className="overlay-content">
              <Loader2 size={32} className="animate-spin" />
              <p>Uploading PDF...</p>
            </div>
          </div>
        )}

        <header className="chat-header">
          <div className="header-left">
            <button className="landing-icon" onClick={() => navigate('/landing')}>
              <Home size={20} />
            </button>
            {activeFileName && (
              <div className="active-file-indicator">
                <FileText size={18} />
                <span className="filename-text">{activeFileName}</span>
              </div>
            )}
          </div>

          <div className="header-right">
            <select className="tool-dropdown" onChange={(e) => handleToolSelect(e.target.value)} defaultValue="" disabled={isSummarizing}>
              <option value="" disabled>Summarize</option>
              <option value="summarize">Summarize PDF</option>
              <option value="key-points">Key Points</option>
              <option value="short">Short Summary</option>
              <option value="el5">Explain Simple</option>
            </select>
          </div>
        </header>

        <div className="messages-container">
          {isChatLoading ? (
            <>
              <SkeletonMessage />
              <SkeletonMessage />
              <SkeletonMessage />
            </>
          ) : messages.length === 0 ? (
            <div className="chat-empty-state">
              <Bot size={48} />
              <h1>Start a conversation</h1>
              <p>Upload a file or select from your documents.</p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className={`message-row ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                <div className="message-bubble">
                  {msg.role === 'assistant' && (
                    <button 
                      className="copy-bubble-btn" 
                      onClick={() => handleCopy(msg.content, index)}
                      title="Copy response"
                    >
                      {copyId === index ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  )}
                  <div className="message-text">
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                  {msg.timestamp && <div className="message-timestamp">{msg.timestamp}</div>}
                </div>
              </div>
            ))
          )}
          
          {isSummarizing && <TypingIndicator text="AI is analyzing document..." />}
          {isSendingMessage && !isSummarizing && <TypingIndicator />}
          
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-container">
          <form className="chat-input-box" onSubmit={handleSubmit}>
            <button type="button" className="upload-btn" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
              <UploadIcon size={20} />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" hidden />
            
            <input
              type="text"
              placeholder="Message AI Assistant..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isSendingMessage || isSummarizing || isChatLoading}
            />
            <button type="submit" disabled={!input.trim() || isSendingMessage || isSummarizing}>
              <Send size={18} />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Chat;
