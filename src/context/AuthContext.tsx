import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial session check
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const userData = {
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
          picture: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture,
          role: session.user.role
        };
        setUser(userData);
        setToken(session.access_token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`;
      }
      setLoading(false);
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('🔔 Auth Event:', _event);
      if (session) {
        const userData = {
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
          picture: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture,
          role: session.user.role
        };
        setUser(userData);
        setToken(session.access_token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`;
      } else {
        setUser(null);
        setToken(null);
        delete axios.defaults.headers.common['Authorization'];
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      // Explicitly clear state in case of network lag or listener delay
      setUser(null);
      setToken(null);
      delete axios.defaults.headers.common['Authorization'];
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
