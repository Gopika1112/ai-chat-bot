import React from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bot, Shield, Zap, FileText, MessageSquare, BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import './Login.css';

const LandingPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isSignUp, setIsSignUp] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authMessage, setAuthMessage] = React.useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = React.useState(false);

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/chat'
        }
      });
      if (error) throw error;
    } catch (err) {
      console.error('Login failed', err);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    setIsAuthLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setAuthMessage('Registration successful! Please check your email for confirmation.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/chat');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const features = [
    { icon: <FileText size={24} />, title: 'Smart Upload', desc: 'Drag-and-drop PDF and TXT files. We handle the parsing and indexing.' },
    { icon: <Zap size={24} />, title: 'Fast RAG', desc: 'Identify relevant information in milliseconds with our vector search engine.' },
    { icon: <MessageSquare size={24} />, title: 'Natural Chat', desc: 'Interact with your documents using conversational AI that cites its sources.' },
    { icon: <Shield size={24} />, title: 'Secure Auth', desc: 'Enterprise-grade Google OAuth ensures only your team has access.' },
    { icon: <BarChart3 size={24} />, title: 'Admin Insights', desc: 'Monitor usage, users, and document activity from a central dashboard.' },
    { icon: <Bot size={24} />, title: 'Gemini Powered', desc: 'Leverage the latest Gemini 1.5 models for deep reasoning and accuracy.' },
  ];

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-background">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
        </div>
        
        <motion.div 
          className="hero-content"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="hero-badge">Next-Gen AI Support</div>
          <h1>Transform your Documents into <span className="gradient-text">Intelligent Agents</span></h1>
          <p className="hero-subtitle">
            The ultimate RAG platform for businesses. Upload your knowledge base, 
            ask questions, and get cited answers in seconds.
          </p>
          
          <div className="hero-cta">
            <a href="#login" className="btn-primary">Get Started Free</a>
            <a href="#features" className="btn-secondary">Explore Features</a>
          </div>
        </motion.div>

        <motion.div 
          className="scroll-indicator"
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <ChevronDown size={32} />
        </motion.div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="section-header">
          <h2>Powerful Capabilities</h2>
          <p>Everything you need to build the perfect AI support system.</p>
        </div>
        
        <div className="features-grid">
          {features.map((f, i) => (
            <motion.div 
              key={i} 
              className="feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Login Area */}
      <section id="login" className="login-section">
        <motion.div 
          className="login-card"
          initial={{ scale: 0.9, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
        >
          <div className="login-header">
            <div className="logo-icon"><Bot size={40} /></div>
            <h2>{user ? `Welcome back, ${user.name || user.email.split('@')[0]}!` : (isSignUp ? 'Create Account' : 'Welcome Back')}</h2>
            <p>{user ? 'You are already signed in. Access your dashboard below.' : (isSignUp ? 'Start your journey with a new account' : 'Sign in to access your intelligent documents')}</p>
          </div>
          
          <div className="auth-container">
            {!user ? (
              <>
                <form onSubmit={handleAuth} className="email-auth-form">
                  <div className="input-group">
                    <input 
                      type="email" 
                      placeholder="Email Address" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="input-group">
                    <input 
                      type="password" 
                      placeholder="Password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  
                  {authError && <div className="auth-error">{authError}</div>}
                  {authMessage && <div className="auth-message">{authMessage}</div>}
                  
                  <button type="submit" className="btn-primary auth-submit" disabled={isAuthLoading}>
                    {isAuthLoading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Sign In')}
                  </button>
                </form>

                <div className="auth-divider">
                  <span>OR</span>
                </div>

                <button onClick={handleGoogleLogin} className="btn-google-login">
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  Continue with Google
                </button>

                <p className="auth-toggle">
                  {isSignUp ? 'Already have an account?' : 'New here?'} 
                  <button onClick={() => setIsSignUp(!isSignUp)} className="toggle-link">
                    {isSignUp ? 'Sign In' : 'Create Account'}
                  </button>
                </p>
              </>
            ) : (
              <div className="logged-in-actions">
                <button onClick={() => navigate('/chat')} className="btn-primary">
                  Go to Chat <ChevronRight size={18} />
                </button>
                <button onClick={async () => { await logout(); }} className="btn-secondary">
                  Sign Out
                </button>
              </div>
            )}
          </div>
          
          {user && (
            <div className="auth-debug">
              <span className="p-badge">Status: Authenticated</span>
              <code>User Email: {user.email}</code>
            </div>
          )}
        </motion.div>
      </section>

      <footer>
        <p>&copy; 2026 AI Support Agent Pro. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
