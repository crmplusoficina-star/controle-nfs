'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { 
  Users, 
  Search, 
  UserX, 
  UserCheck, 
  Shield, 
  MoreHorizontal,
  Mail,
  Hash,
  MapPin,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';

export default function UsersManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      const [{ data: userData }, { data: branchData }] = await Promise.all([
        supabase.from('users_access').select('*').order('name'),
        supabase.from('branches').select('*')
      ]);
      if (userData) setUsers(userData);
      if (branchData) setBranches(branchData);
      setIsLoading(false);
    }
    fetchData();
  }, []);

  const toggleUserAccess = async (registration: string, currentStatus: boolean) => {
    if (!currentUser || currentUser.role !== 'Administrador') return;
    
    setActionLoading(registration);
    const { error } = await supabase
      .from('users_access')
      .update({ active: !currentStatus })
      .eq('registration', registration);

    if (!error) {
      setUsers(prev => prev.map(u => 
        u.registration === registration ? { ...u, active: !currentStatus } : u
      ));
    }
    setActionLoading(null);
  };

  const getBranchName = (id: string) => {
    return branches.find(b => b.id === id)?.name || 'N/A';
  };

  if (currentUser?.role !== 'Administrador') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8">
        <Shield size={64} className="text-slate-200 mb-4" />
        <h2 className="text-xl font-black italic uppercase text-slate-800">Acesso Restrito</h2>
        <p className="text-slate-500 max-w-sm mt-2 font-medium">Apenas administradores podem gerenciar o acesso de colaboradores.</p>
      </div>
    );
  }

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.registration.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight italic uppercase">Gestão de Acessos</h1>
          <p className="text-slate-500 text-sm font-medium italic opacity-75">Habilite ou desative o acesso de técnicos e operadores do sistema.</p>
        </div>
      </header>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por nome ou matrícula..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest hidden md:block">
          Total: {filteredUsers.length} Colaboradores
        </div>
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-3xl p-6 border border-slate-100 animate-pulse h-48" />
          ))
        ) : filteredUsers.length === 0 ? (
          <div className="col-span-full py-20 text-center text-slate-400 font-bold italic uppercase tracking-widest text-xs">
            Nenhum colaborador encontrado.
          </div>
        ) : filteredUsers.map((u) => (
          <motion.div 
            layout
            key={u.registration}
            className={`bg-white rounded-[2rem] p-6 border transition-all relative overflow-hidden group ${
              u.active ? 'border-slate-200 shadow-xl' : 'border-slate-100 opacity-60 grayscale'
            }`}
          >
            {!u.active && (
              <div className="absolute top-4 right-4 bg-rose-100 text-rose-600 text-[8px] font-black uppercase px-2 py-1 rounded-full z-10">
                Inativo
              </div>
            )}
            
            <div className="flex items-start gap-4 mb-6">
              <div className="relative shrink-0">
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 border-2 border-white shadow-lg">
                  <Image 
                    src={u.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${u.name}`} 
                    alt={u.name}
                    width={56}
                    height={56}
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-slate-800 italic uppercase leading-none truncate">{u.name}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">{u.role}</p>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center gap-1 text-slate-500">
                    <Hash size={10} />
                    <span className="text-[9px] font-mono">{u.registration}</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-500">
                    <MapPin size={10} />
                    <span className="text-[9px] font-bold uppercase truncate max-w-[80px]">{getBranchName(u.branch_id)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-slate-50">
              <button 
                onClick={() => toggleUserAccess(u.registration, u.active)}
                disabled={actionLoading === u.registration || u.registration === currentUser.registration}
                className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                  u.active 
                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white' 
                    : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {actionLoading === u.registration ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : u.active ? (
                  <><UserX size={14} /> Desativar Acesso</>
                ) : (
                  <><UserCheck size={14} /> Ativar Acesso</>
                )}
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
