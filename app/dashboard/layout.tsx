'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Package, 
  Zap, 
  UserCheck, 
  BarChart3, 
  History, 
  LogOut, 
  Menu, 
  X,
  Bell,
  Search,
  HardHat,
  Signature,
  User,
  Users
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { AxelAssistant } from '@/components/AxelAssistant';

const modules = [
  { id: 'nfs', name: 'Controle NF\'s', icon: FileText, color: 'bg-blue-500', path: '/dashboard/nfs' },
  { id: 'stock', name: 'Estoque', icon: Package, color: 'bg-emerald-500', path: '/dashboard/stock' },
  { id: 'cautelia', name: 'Cautelas e Empréstimos', icon: UserCheck, color: 'bg-indigo-500', path: '/dashboard/cautelia' },
  { id: 'inventory', name: 'Inventário', icon: BarChart3, color: 'bg-indigo-500', path: '/dashboard/inventory' },
  { id: 'signatures', name: 'Assinaturas', icon: Signature, color: 'bg-indigo-600', path: '/dashboard/signatures' },
  { id: 'pessoas', name: 'Pessoas', icon: Users, color: 'bg-violet-600', path: '/dashboard/pessoas' },
  { id: 'users', name: 'Usuários', icon: Users, color: 'bg-slate-700', path: '/dashboard/users' },
  { id: 'audit', name: 'Auditoria', icon: History, color: 'bg-slate-700', path: '/dashboard/audit' },
  { id: 'historico', name: 'Histórico', icon: History, color: 'bg-slate-700', path: '/dashboard/historico' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading, updateUser } = useAuth();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [branchName, setBranchName] = useState<string>('Carregando...');
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [avatarsList, setAvatarsList] = useState<any[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const handleOpenModal = () => setIsAvatarModalOpen(true);
    window.addEventListener('open-avatar-modal', handleOpenModal);
    return () => window.removeEventListener('open-avatar-modal', handleOpenModal);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    async function fetchBranch() {
      if (user?.branch_id) {
        const { data } = await supabase
          .from('branches')
          .select('name')
          .eq('id', user.branch_id)
          .maybeSingle();
        if (data) setBranchName(data.name);
      }
    }
    fetchBranch();
  }, [user]);

  useEffect(() => {
    async function fetchAvatars() {
      if (!isAvatarModalOpen) return;

      const fallbackAvatars = [
        { id: 'fallback-1', category: 'Padrão', url: `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(user?.name || 'Avatar 1')}` },
        { id: 'fallback-2', category: 'Padrão', url: `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent((user?.name || 'Avatar') + ' 2')}` },
        { id: 'fallback-3', category: 'Padrão', url: `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent((user?.name || 'Avatar') + ' 3')}` },
        { id: 'fallback-4', category: 'Padrão', url: `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent((user?.name || 'Avatar') + ' 4')}` },
      ];

      try {
        const { data, error } = await supabase
          .from('avatars_catalog')
          .select('*')
          .order('category', { ascending: true });

        if (error) throw error;

        const list = data && data.length > 0 ? data : fallbackAvatars;
        setAvatarsList(list);
        setSelectedAvatar(user?.avatar || list[0]?.url || '');
      } catch (error) {
        console.error('Erro ao carregar avatares:', error);
        setAvatarsList(fallbackAvatars);
        setSelectedAvatar(user?.avatar || fallbackAvatars[0]?.url || '');
      }
    }

    fetchAvatars();
  }, [isAvatarModalOpen, user]);

  const updateAvatarFromSidebar = async (newUrl: string) => {
    if (!user || !newUrl) return;

    setIsUpdatingAvatar(true);
    try {
      const { error } = await supabase
        .from('users_access')
        .update({ avatar_url: newUrl })
        .eq('registration', user.registration);

      if (error) throw error;

      updateUser?.({ avatar: newUrl });
      setSelectedAvatar(newUrl);
      setIsAvatarModalOpen(false);
    } catch (error) {
      console.error('Erro ao atualizar avatar:', error);
      alert('Não foi possível atualizar o avatar.');
    } finally {
      setIsUpdatingAvatar(false);
    }
  };

  if (isLoading || !user) return null;

  // Navigation
  const filteredModules = modules.filter(mod => {
    if (user?.role === 'Operador') {
      return !['audit', 'inventory', 'signatures', 'users', 'pessoas'].includes(mod.id);
    }
    return true;
  });

  return (
    <div className="flex h-screen bg-white overflow-hidden font-sans">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-slate-950 text-white transform transition-all duration-300 ease-in-out lg:relative lg:translate-x-0 overflow-hidden shadow-2xl ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'lg:w-20' : 'lg:w-72'} w-72`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className={`p-6 border-b border-slate-800 flex items-center ${isCollapsed ? 'flex-col gap-4' : 'justify-between'}`}>
            <Link href="/dashboard" className="flex flex-col w-full h-12 justify-center">
              {isCollapsed ? (
                <div className="mx-auto bg-indigo-900 w-10 h-10 flex items-center justify-center rounded-xl shrink-0">
                  <Zap size={24} className="text-amber-500" />
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Zap size={24} className="text-amber-500 shrink-0" />
                  <span className="text-xl font-black tracking-tighter text-white">
                    CONTROLE <span className="text-blue-400 italic">NFs</span>
                  </span>
                </div>
              )}
            </Link>
            
            {/* Desktop Collapse Toggle */}
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)} 
              className={`hidden lg:flex p-2 text-blue-400 hover:text-white transition-colors hover:bg-white/5 rounded-xl ${isCollapsed ? 'mt-4' : ''}`}
            >
              <Menu size={20} />
            </button>

            {/* Mobile Close */}
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 text-blue-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-6 flex flex-col gap-1 custom-scrollbar">
            {filteredModules.map((mod) => {
              const isActive = pathname === mod.path;
              return (
                <Link
                  key={mod.id}
                  href={mod.path}
                  title={isCollapsed ? mod.name : ''}
                  className={`flex items-center gap-3 px-6 py-3 transition-all group ${
                    isActive
                      ? 'bg-blue-950 border-r-4 border-indigo-400 text-white font-semibold'
                      : 'text-indigo-200/70 hover:text-white hover:bg-white/5 font-medium'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                >
                  <mod.icon 
                    size={20} 
                    className={isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-indigo-300'} 
                  />
                  {!isCollapsed && <span className="text-sm">{mod.name}</span>}
                  {mod.id === 'ferramentaria' && !isCollapsed && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                  )}
                  {mod.id === 'ferramentaria' && isCollapsed && (
                    <span className="absolute top-2 right-6 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Info Section */}
          <div className="px-2 py-2 bg-slate-950/60 border-t border-white/5 mt-auto">
            <div className={`flex items-center ${isCollapsed ? 'flex-col gap-3' : 'gap-2.5 min-w-0'}`}>
              <button
                type="button"
                onClick={() => setIsAvatarModalOpen(true)}
                className="relative shrink-0 w-8 h-8 group"
                title="Trocar avatar"
              >
                <div className="relative w-8 h-8 rounded-full border border-white/20 shadow-md overflow-hidden bg-indigo-900 flex items-center justify-center">
                  <Image 
                    src={user.avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(user.name)}&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9`} 
                    alt={user.name} 
                    fill
                    sizes="32px"
                    unoptimized
                    className="object-cover group-hover:scale-110 transition-transform"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(user.name)}&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9`;
                    }}
                  />
                  <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <User size={12} className="text-white" />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border border-indigo-950 shrink-0 z-10" />
              </button>

              {!isCollapsed && (
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p className="text-[10px] font-black text-white truncate leading-tight uppercase tracking-tight">{user.name}</p>
                  <div className="flex items-center gap-1 mt-0.5 opacity-80">
                    <p className="text-[8px] text-blue-400 font-mono tracking-wider leading-none">#{user.registration}</p>
                    <span className="text-[7.5px] text-slate-500 font-bold px-1 rounded italic truncate leading-none">{branchName}</span>
                  </div>
                </div>
              )}

              <button 
                onClick={logout} 
                className={`p-1 text-blue-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all ${isCollapsed ? '' : 'shrink-0'}`}
                title="Sair"
              >
                <LogOut size={12} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shadow-sm shrink-0 z-30">
          <div className="flex items-center gap-4 lg:gap-6">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
              <Menu size={24} />
            </button>
            
            <div className="flex items-center gap-4">
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${user.role === 'Administrador' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                {user.role === 'Administrador' ? 'ACESSO TOTAL' : 'MODO OPERACIONAL'}
              </span>
              <h2 className="text-lg font-bold text-slate-700 italic hidden sm:block">Central Administrativa</h2>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:gap-6">
            <div className="relative hidden xl:block">
              <AxelAssistant />
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

            <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-full relative transition-colors">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-white relative custom-scrollbar">
          {children}
        </div>
      </main>


      <AnimatePresence>
        {isAvatarModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl overflow-hidden"
            >
              <div className="p-6 bg-slate-950 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black italic uppercase tracking-tight">Trocar Avatar</h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 mt-1">
                    Escolha uma imagem para o perfil
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAvatarModalOpen(false)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {avatarsList.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs font-black uppercase tracking-widest">
                    Carregando avatares...
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                    {avatarsList.map((avatar: any) => {
                      const avatarUrl = avatar.url || avatar.avatar_url || avatar.image_url;
                      const isSelected = selectedAvatar === avatarUrl || user.avatar === avatarUrl;

                      return (
                        <button
                          key={avatar.id || avatarUrl}
                          type="button"
                          onClick={() => setSelectedAvatar(avatarUrl)}
                          className={`relative aspect-square rounded-2xl overflow-hidden border-4 transition-all bg-slate-100 ${
                            isSelected
                              ? 'border-indigo-600 shadow-xl shadow-indigo-100 scale-105'
                              : 'border-transparent hover:border-indigo-200 hover:scale-105'
                          }`}
                          title={avatar.category || 'Avatar'}
                        >
                          <Image
                            src={avatarUrl}
                            alt="Avatar"
                            fill
                            sizes="120px"
                            unoptimized
                            className="object-cover"
                            referrerPolicy="no-referrer"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-indigo-600/20 flex items-end justify-center p-2">
                              <span className="bg-indigo-600 text-white text-[8px] font-black uppercase px-2 py-1 rounded-full">
                                Selecionado
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAvatarModalOpen(false)}
                  className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!selectedAvatar || isUpdatingAvatar}
                  onClick={() => updateAvatarFromSidebar(selectedAvatar)}
                  className="px-6 py-3 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isUpdatingAvatar ? 'Salvando...' : 'Salvar Avatar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker 30s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
