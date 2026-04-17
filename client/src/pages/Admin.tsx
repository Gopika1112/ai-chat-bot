import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, FileText, MessageSquare, BarChart3, Shield } from 'lucide-react';
import './Admin.css';

const Admin: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        const [usersRes, docsRes, analyticsRes] = await Promise.all([
          axios.get(`${apiBaseUrl}/admin/users`),
          axios.get(`${apiBaseUrl}/admin/documents`),
          axios.get(`${apiBaseUrl}/admin/analytics`),
        ]);
        setUsers(usersRes.data);
        setDocuments(docsRes.data);
        setAnalytics(analyticsRes.data);
      } catch (err) {
        console.error('Fetch admin data failed', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAdminData();
  }, []);

  if (loading) return <div className="loading">Loading admin data...</div>;

  return (
    <div className="admin-page">
      <header className="page-header">
        <div className="admin-badge"><Shield size={14} /> Admin</div>
        <h1>Admin Dashboard</h1>
        <p>Monitor system usage, users, and uploaded documents.</p>
      </header>

      <div className="analytics-grid">
        <div className="analytic-card">
          <Users size={24} />
          <div className="val">{analytics?.totalUsers}</div>
          <div className="lbl">Total Users</div>
        </div>
        <div className="analytic-card">
          <FileText size={24} />
          <div className="val">{analytics?.totalDocuments}</div>
          <div className="lbl">Total Documents</div>
        </div>
        <div className="analytic-card">
          <MessageSquare size={24} />
          <div className="val">{analytics?.totalMessages}</div>
          <div className="lbl">Total Messages</div>
        </div>
        <div className="analytic-card">
          <BarChart3 size={24} />
          <div className="val">N/A</div>
          <div className="lbl">Avg Messages/User</div>
        </div>
      </div>

      <div className="admin-content-grid">
        <section className="admin-section">
          <h2>Users</h2>
          <div className="admin-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="u-cell">
                        <img src={u.picture} alt="" className="u-pic" />
                        <div>
                          <div className="u-name">{u.name}</div>
                          <div className="u-email">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`role-tag ${u.role}`}>{u.role}</span></td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section">
          <h2>Global Documents</h2>
          <div className="admin-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Owner</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(d => (
                  <tr key={d.id}>
                    <td>{d.filename}</td>
                    <td className="u-email">{d.user_email}</td>
                    <td>{new Date(d.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Admin;
