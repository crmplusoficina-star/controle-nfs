'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { motion } from 'motion/react';
import { 
  User, 
  MapPin, 
  Hash, 
  Shield, 
  Clock, 
  ArrowLeft,
  Camera
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

export default function ProfilePage() {
  const { user } = useAuth();
  const [history, setHistory] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchHistory() {
      if (!user) return;
      setIsLoading(true);

      const { data } = await supabase
        .from('cautelas')
        .select(`
          id,
          created_at,
          status,
          tools (
            name
          )
        `)
        .eq('user_id', user.registration)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (data) setHistory(data);
      setIsLoading(false);
    }
    fetchHistory();
  }, [user]);

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header className="flex items-center gap-4">
        <Link href="/dashboard" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft size={20} className="text-slate-600" />
        </Link>
        <h1 className="text-2xl font-black italic uppercase tracking-tight text-slate-900">Meu Perfil</h1>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Profile Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:col-span-1 space-y-6"
        >
          <div className="bg-white rounded-[2rem] p-8 shadow-xl border border-slate-200 text-center relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-24 bg-indigo-600 -z-0" />
            
            <div className="relative z-10 pt-4">
              <div className="relative inline-block">
                <div className="w-32 h-32 rounded-3xl border-4 border-white shadow-2xl overflow-hidden bg-slate-100 mb-4 mx-auto">
                  <Image 
                    src={user.avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${user.name}`} 
                    alt={user.name}
                    width={128}
                    height={128}
                    referrerPolicy="no-referrer"
                  />
                </div>
                <button 
                  onClick={() => window.dispatchEvent(new CustomEvent('open-avatar-modal'))}
                  title="Trocar avatar"
                  className="absolute bottom-6 right-2 w-8 h-8 bg-indigo-500 rounded-full border-2 border-white text-white flex items-center justify-center hover:bg-indigo-400 transition-colors shadow-lg">
                  <Camera size={14} />
                </button>
              </div>

              <h2 className="text-xl font-black italic text-slate-800 leading-tight">{user.name}</h2>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mt-1">{user.role}</p>
            </div>

            <div className="mt-8 pt-8 border-t border-slate-100 flex justify-center gap-8">
              <div className="text-center">
                <p className="text-lg font-black text-slate-800">{history.length}</p>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter leading-none">Ações<br/>Recentes</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-slate-800">100%</p>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter leading-none">Status<br/>Ativo</p>
              </div>
            </div>
          </div>

          <div className="bg-indigo-950 rounded-[2rem] p-6 shadow-xl text-white">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-4">Informações do Sistema</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-900 flex items-center justify-center text-indigo-300">
                  <Hash size={16} />
                </div>
                <div>
                  <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">Matrícula</p>
                  <p className="text-sm font-black italic">{user.registration}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-900 flex items-center justify-center text-indigo-300">
                  <MapPin size={16} />
                </div>
                <div>
                  <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">Filial</p>
                  <p className="text-sm font-black italic">ID: {user.branch_id || 'Não vinculada'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-900 flex items-center justify-center text-indigo-300">
                  <Shield size={16} />
                </div>
                <div>
                  <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">Permissões</p>
                  <p className="text-sm font-black italic">{user.role}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* History / Recent Actions */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="md:col-span-2 space-y-6"
        >
          <div className="bg-white rounded-[2rem] p-8 shadow-xl border border-slate-200 min-h-[500px]">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 italic flex items-center gap-2">
                <Clock size={16} className="text-indigo-500" />
                Histórico Recente
              </h3>
              <Link href="/dashboard/historico" className="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-tighter">
                Ver tudo
              </Link>
            </div>

            <div className="space-y-4">
              {isLoading ? (
                <div className="py-20 text-center animate-pulse text-slate-300 font-black uppercase tracking-widest text-xs italic">
                  Recuperando atividades...
                </div>
              ) : history.length === 0 ? (
                <div className="py-20 text-center space-y-4">
                   <Clock size={48} className="mx-auto text-slate-100" />
                   <p className="text-slate-400 font-bold italic italic italic italic">Nenhuma atividade registrada recentemente.</p>
                </div>
              ) : history.map((item, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={item.id} 
                  className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${item.status === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                      <User size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-800">Cautela: {item.tools?.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">Realizada em {new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-wider ${
                    item.status === 'ok' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                  }`}>
                    {item.status}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Help / Support Section */}
            <div className="mt-12 p-8 bg-slate-900 rounded-3xl text-white relative overflow-hidden">
               <div className="absolute -right-4 -bottom-4 opacity-10">
                 <Shield size={120} />
               </div>
               <h4 className="text-base font-black italic tracking-tight mb-2">Precisa alterar seus dados?</h4>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">Configurações de filial e cargo devem ser solicitadas ao administrador do sistema Tracbel.</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
