import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MessageSquare, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './History.css';

const History: React.FC = () => {
  const { token } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchHistory = async () => {
      if (!token) return;
      try {
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        const res = await axios.get(`${apiBaseUrl}/chat/history`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setHistory(res.data);
      } catch (err) {
        console.error('Fetch history failed', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [token]);

  return (
    <div className="history-page">
      <header className="page-header">
        <h1>Chat History</h1>
        <p>Review your previous conversations with the AI.</p>
      </header>

      {loading ? (
        <div className="loading">Loading history...</div>
      ) : history.length > 0 ? (
        <div className="history-list">
          {history.map(chat => (
            <div key={chat.id} className="history-item" onClick={() => navigate(`/chat?id=${chat.id}`)}>
              <div className="history-icon"><MessageSquare size={20} /></div>
              <div className="history-info">
                <div className="history-title">{chat.title}</div>
                <div className="history-meta">
                  <Clock size={12} />
                  <span>{new Date(chat.created_at).toLocaleString()}</span>
                </div>
              </div>
              <ArrowRight size={18} className="arrow-icon" />
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>You haven't started any chats yet.</p>
        </div>
      )}
    </div>
  );
};

export default History;
