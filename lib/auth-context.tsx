'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

interface AuthUser {
  id: string;
  registration: string;
  role: 'Administrador' | 'Operador' | 'Técnico';
  name: string;
  branch_id: string;
  avatar?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (registration: string) => Promise<boolean>;
  logout: () => void;
  updateUser: (updates: Partial<AuthUser>) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('controle_nfs_user');
    const timer = setTimeout(() => {
      if (saved) {
        setUser(JSON.parse(saved));
      }
      setIsLoading(false);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const login = async (registration: string) => {
    try {
      const { data, error } = await supabase
        .from('users_access')
        .select('*')
        .eq('registration', registration)
        .eq('active', true)
        .maybeSingle();

      if (error || !data) {
        console.error('Login failed:', error);
        return false;
      }

      if (!['Administrador', 'Operador'].includes(data.role)) {
        console.warn('Usuário sem perfil de acesso ao backoffice.');
        return false;
      }

      const authUser: AuthUser = {
        id: data.id,
        registration: data.registration,
        role: data.role,
        name: data.name,
        branch_id: data.branch_id,
        avatar: data.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(data.name)}&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9`,
      };

      setUser(authUser);
      localStorage.setItem('controle_nfs_user', JSON.stringify(authUser));
      return true;
    } catch (err) {
      console.error('Auth error:', err);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('controle_nfs_user');
  };

  const updateUser = (updates: Partial<AuthUser>) => {
    setUser(prev => {
      if (!prev) return null;
      const newUser = { ...prev, ...updates };
      localStorage.setItem('controle_nfs_user', JSON.stringify(newUser));
      return newUser;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
