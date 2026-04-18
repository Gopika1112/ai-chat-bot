import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, Clock, ExternalLink, MessageSquare, Trash2, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocs = async () => {
    if (!token) return;
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const res = await axios.get(`${apiBaseUrl}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(res.data);
    } catch (err) {
      console.error('Fetch docs failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [token]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      await axios.delete(`${apiBaseUrl}/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(docs => docs.filter(d => d.id !== id));
    } catch (err) {
      console.error('Delete failed', err);
      alert('Failed to delete document');
    }
  };

  return (
    <div className="dashboard">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p>Welcome back! Here's an overview of your knowledge base.</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon docs"><FileText size={24} /></div>
          <div className="stat-info">
            <span className="stat-label">Total Documents</span>
            <span className="stat-value">{documents.length}</span>
          </div>
        </div>
        {/* Add more stats if needed */}
      </div>

      <section className="recent-docs">
        <div className="section-header">
          <h2>Your Documents</h2>
          <ExternalLink size={18} className="view-all-icon" />
        </div>

        {loading ? (
          <div className="loading">Loading documents...</div>
        ) : documents.length > 0 ? (
          <div className="docs-list">
            {documents.map(doc => (
              <div key={doc.id} className="doc-item">
                <div className="doc-icon"><FileText size={20} /></div>
                <div className="doc-details">
                  <div className="doc-name">{doc.filename}</div>
                  {doc.summary && (
                    <div className="doc-summary-preview">
                      {doc.summary.substring(0, 150)}...
                    </div>
                  )}
                  <div className="doc-meta">
                    <Clock size={12} />
                    <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="doc-actions">
                  <button 
                    className="doc-action-btn view" 
                    title="View Original"
                    onClick={() => window.open(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/documents/${doc.id}/view`, '_blank')}
                  >
                    <ExternalLink size={16} />
                  </button>
                  <a 
                    href={`/chat?docId=${doc.id}`} 
                    className="doc-action-btn chat" 
                    title="Start Chat"
                  >
                    <MessageSquare size={16} />
                  </a>
                  <div className="doc-type-badge">{doc.file_type.split('/')[1]?.toUpperCase() || 'TXT'}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No documents uploaded yet. Go to the Upload page to get started.</p>
          </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
