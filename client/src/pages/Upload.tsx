import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { Upload as UploadIcon, File, X, CheckCircle, AlertCircle, MessageSquare } from 'lucide-react';
import './Upload.css';

const Upload: React.FC = () => {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'warning' | '', message: string }>({ type: '', message: '' });
  const [lastUploadedId, setLastUploadedId] = useState<string | null>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.type === 'application/pdf' || droppedFile.type === 'text/plain')) {
      setFile(droppedFile);
      if (droppedFile.size > 50 * 1024 * 1024) {
        setStatus({ type: 'warning', message: 'Large file detected. Processing may take several minutes.' });
      } else {
        setStatus({ type: '', message: '' });
      }
    } else {
      setStatus({ type: 'error', message: 'Only PDF and TXT files are supported.' });
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (selectedFile.size > 50 * 1024 * 1024) {
        setStatus({ type: 'warning', message: 'Large file detected. Processing may take several minutes.' });
      } else {
        setStatus({ type: '', message: '' });
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    try {
      setUploading(true);
      setStatus({ type: 'warning', message: 'Verifying session and preparing upload...' });

      // Fetch fresh session as requested
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        setStatus({ type: 'error', message: 'Your session has expired. Please log in again.' });
        setUploading(false);
        return;
      }

      setStatus({ type: 'warning', message: 'Uploading and analyzing document... Please do not close this page.' });

      const formData = new FormData();
      formData.append('file', file);

      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const res = await axios.post(`${apiBaseUrl}/documents/upload`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        },
        timeout: 600000, 
      });
      
      const docId = res.data.documentId;
      setStatus({ 
        type: 'success', 
        message: 'Document uploaded and analyzed successfully! Click below to start chatting.' 
      });
      setLastUploadedId(docId);
      setFile(null);
    } catch (err: any) {
      console.error('Upload failed', err);
      const errorMsg = err.response?.data?.error || 'Failed to upload document. Please try again.';
      setStatus({ type: 'error', message: errorMsg });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-page">
      <header className="page-header">
        <h1>Upload Knowledge</h1>
        <p>Add PDF or TXT files to train your AI assistant.</p>
      </header>

      <div 
        className={`dropzone ${file ? 'has-file' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {!file ? (
          <>
            <div className="upload-icon-wrapper">
              <UploadIcon size={48} />
            </div>
            <h3>Drag & Drop file here</h3>
            <p>or click to browse from your computer</p>
            <input type="file" id="fileInput" accept=".pdf,.txt" onChange={handleFileChange} />
            <label htmlFor="fileInput" className="browse-btn">Browse Files</label>
          </>
        ) : (
          <div className="file-preview">
            <File size={48} color="var(--accent-color)" />
            <div className="file-info">
              <span className="file-name">{file.name}</span>
              <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
            </div>
            <button className="remove-file" onClick={() => setFile(null)}><X size={20} /></button>
          </div>
        )}
      </div>

      {file && (
        <button 
          className="upload-submit-btn" 
          onClick={handleUpload} 
          disabled={uploading}
        >
          {uploading ? 'Processing...' : 'Start Upload'}
        </button>
      )}

      {status.message && (
        <div className="upload-result-container">
          <div className={`status-message ${status.type}`}>
            {status.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span>{status.message}</span>
          </div>
          
          {status.type === 'success' && lastUploadedId && (
            <a href={`/chat?docId=${lastUploadedId}`} className="go-to-chat-btn">
              <MessageSquare size={18} />
              Start Chatting with Doc
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default Upload;
