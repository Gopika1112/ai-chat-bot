import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, LayoutDashboard, MessageSquare, Upload, History, ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">AI Support</div>
      </div>
      
      <nav className="sidebar-nav">
        <NavLink to="/landing" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <Home size={20} />
          <span>Home</span>
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/chat" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <MessageSquare size={20} />
          <span>Chat</span>
        </NavLink>
        <NavLink to="/upload" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <Upload size={20} />
          <span>Upload</span>
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          <History size={20} />
          <span>History</span>
        </NavLink>
        
        {user?.role === 'admin' && (
          <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <ShieldCheck size={20} />
            <span>Admin</span>
          </NavLink>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <img src={user?.picture} alt={user?.name} className="user-avatar" />
          <div className="user-details">
            <div className="user-name">{user?.name}</div>
            <div className="user-email">{user?.email}</div>
          </div>
        </div>
        <button onClick={handleLogout} className="logout-btn">
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
