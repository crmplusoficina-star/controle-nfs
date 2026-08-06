'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

interface AuthUser {
  id: string;
  registration: string;
  role: 'Administrador' | 'Operador' | 'Técnico';
  name: string;
  branch_id: string;
  avatar: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (registration: string) => Promise<boolean>;
  logout: () => void;
  updateUser: (updates: Partial<AuthUser>) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const STORAGE_KEY = 'controle_nfs_user';
const FERRAMENTARIA_ORIGIN = (
  process.env.NEXT_PUBLIC_FERRAMENTARIA_URL || 'https://ferramentaria-gamma.vercel.app'
).replace(/\/$/, '');
const SHARED_AVATAR_VERSION = '20260806-sync1';
const SHARED_AVATAR_IDS = [
  'fox', 'gorilla', 'jaguar', 'panther', 'armadillo',
  'bison', 'bear', 'beaver', 'wolf', 'rhino',
] as const;

function avatarHash(key?: string | null) {
  const source = String(key || 'ferramentaria');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function defaultSharedAvatarPath(key?: string | null) {
  const avatarId = SHARED_AVATAR_IDS[avatarHash(key) % SHARED_AVATAR_IDS.length];
  return `/api/avatar/${avatarId}`;
}

function sharedAvatarPath(value?: string | null) {
  const avatar = String(value || '').trim();
  const validId = (id: string) => SHARED_AVATAR_IDS.includes(id as typeof SHARED_AVATAR_IDS[number]);

  const localMatch = avatar.match(/^\/api\/avatar\/([a-z0-9-]+)/i);
  if (localMatch && validId(localMatch[1].toLowerCase())) {
    return `/api/avatar/${localMatch[1].toLowerCase()}`;
  }

  if (/^https?:\/\//i.test(avatar)) {
    try {
      const parsed = new URL(avatar);
      const remoteMatch = parsed.pathname.match(/^\/api\/avatar\/([a-z0-9-]+)/i);
      if (remoteMatch && validId(remoteMatch[1].toLowerCase())) {
        return `/api/avatar/${remoteMatch[1].toLowerCase()}`;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function resolveSharedAvatar(value?: string | null, key?: string | null) {
  const avatar = String(value || '').trim();
  const sharedPath = sharedAvatarPath(avatar) || defaultSharedAvatarPath(key);

  if (/^https?:\/\//i.test(avatar)
    && !avatar.toLowerCase().includes('api.dicebear.com')
    && !avatar.toLowerCase().includes('/avatars/')
    && !sharedAvatarPath(avatar)) {
    return avatar;
  }

  return `${FERRAMENTARIA_ORIGIN}${sharedPath}?v=${SHARED_AVATAR_VERSION}`;
}

function userFromRow(data: Record<string, any>): AuthUser {
  return {
    id: String(data.id || ''),
    registration: String(data.registration || '').trim(),
    role: data.role,
    name: String(data.name || ''),
    branch_id: String(data.branch_id || ''),
    avatar: resolveSharedAvatar(data.avatar_url, data.registration || data.id || data.name),
  };
}

function usersAreEqual(left: AuthUser | null, right: AuthUser) {
  if (!left) return false;
  return left.id === right.id
    && left.registration === right.registration
    && left.role === right.role
    && left.name === right.name
    && left.branch_id === right.branch_id
    && left.avatar === right.avatar;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const persistUser = useCallback((nextUser: AuthUser | null) => {
    setUser((current) => {
      if (nextUser && usersAreEqual(current, nextUser)) return current;
      return nextUser;
    });

    if (nextUser) localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const refreshUser = useCallback(async (registration: string, silent = true) => {
    const normalizedRegistration = String(registration || '').trim();
    if (!normalizedRegistration) return null;

    const { data, error } = await supabase
      .from('users_access')
      .select('*')
      .eq('registration', normalizedRegistration)
      .eq('active', true)
      .maybeSingle();

    if (error) {
      if (!silent) console.error('Não foi possível atualizar o usuário:', error);
      return null;
    }

    if (!data || !['Administrador', 'Operador'].includes(data.role)) {
      if (!silent) persistUser(null);
      return null;
    }

    const refreshed = userFromRow(data);
    persistUser(refreshed);
    return refreshed;
  }, [persistUser]);

  useEffect(() => {
    let disposed = false;

    const restoreUser = async () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        if (!disposed) setIsLoading(false);
        return;
      }

      try {
        const parsed = JSON.parse(saved) as Partial<AuthUser>;
        if (!parsed.registration) {
          persistUser(null);
          return;
        }

        const restored = await refreshUser(parsed.registration, false);
        if (!restored) persistUser(null);
      } catch (error) {
        console.error('Sessão local inválida:', error);
        persistUser(null);
      } finally {
        if (!disposed) setIsLoading(false);
      }
    };

    void restoreUser();
    return () => {
      disposed = true;
    };
  }, [persistUser, refreshUser]);

  useEffect(() => {
    const registration = user?.registration;
    if (!registration) return;

    const synchronize = () => {
      void refreshUser(registration, true);
    };
    const synchronizeWhenVisible = () => {
      if (document.visibilityState === 'visible') synchronize();
    };
    const synchronizeFromStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) synchronize();
    };

    const channel = supabase
      .channel(`controle-nfs-user-sync-${registration}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users_access',
          filter: `registration=eq.${registration}`,
        },
        synchronize,
      )
      .subscribe();

    window.addEventListener('focus', synchronize);
    window.addEventListener('pageshow', synchronize);
    window.addEventListener('storage', synchronizeFromStorage);
    document.addEventListener('visibilitychange', synchronizeWhenVisible);
    const interval = window.setInterval(synchronize, 15000);

    return () => {
      window.removeEventListener('focus', synchronize);
      window.removeEventListener('pageshow', synchronize);
      window.removeEventListener('storage', synchronizeFromStorage);
      document.removeEventListener('visibilitychange', synchronizeWhenVisible);
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refreshUser, user?.registration]);

  const login = async (registration: string) => {
    try {
      const normalizedRegistration = String(registration || '').trim();
      const { data, error } = await supabase
        .from('users_access')
        .select('*')
        .eq('registration', normalizedRegistration)
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

      persistUser(userFromRow(data));
      return true;
    } catch (error) {
      console.error('Auth error:', error);
      return false;
    }
  };

  const logout = () => {
    persistUser(null);
  };

  const updateUser = (updates: Partial<AuthUser>) => {
    setUser((previous) => {
      if (!previous) return null;
      const avatar = updates.avatar
        ? resolveSharedAvatar(updates.avatar, previous.registration || previous.id || previous.name)
        : previous.avatar;
      const nextUser = { ...previous, ...updates, avatar };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
      return nextUser;
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
