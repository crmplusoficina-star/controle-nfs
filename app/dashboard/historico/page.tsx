'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { 
  Search, 
  Filter, 
  History, 
  Calendar, 
  MapPin, 
  RotateCcw, 
  ChevronRight,
  Package,
  ArrowRight,
  Loader2
} from 'lucide-react';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TYPE_TRANSLATIONS: Record<string, { label: string; color: string }> = {
  'caution': { label: 'Cautela', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  'loan': { label: 'Empréstimo', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  'return': { label: 'Devolução', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  'adjustment_gain': { label: 'Ajuste (+)', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  'adjustment_loss': { label: 'Ajuste (-)', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  'adjustment': { label: 'Ajuste', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  'loss': { label: 'Perda', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  'transfer': { label: 'Transferência', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
};

export default function HistoricoPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const toolIdParam = searchParams.get('tool_id');
  
  const [transactions, setTransactions] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const PAGE_SIZE = 100;

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchBranches = useCallback(async () => {
    const { data } = await supabase.from('branches').select('*').order('name');
    setBranches(data || []);
  }, []);

  const fetchTransactions = useCallback(async (isLoadMore = false) => {
    if (!user) return;
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    const currentPage = isLoadMore ? pageRef.current + 1 : 0;
    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      let query = supabase
        .from('transactions')
        .select(`
          *,
          tools:tool_id (name, code, image_url),
          branches:branch_id (name)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      // Apply Filters
      if (selectedType !== 'all') {
        if (selectedType === 'adjustment') {
           query = query.ilike('type', 'adjustment%');
        } else {
           query = query.eq('type', selectedType);
        }
      }

      if (selectedBranch !== 'all') {
        query = query.eq('branch_id', selectedBranch);
      }

      if (startDate) {
        query = query.gte('created_at', new Date(startDate).toISOString());
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte('created_at', end.toISOString());
      }

      if (toolIdParam) {
        query = query.eq('tool_id', toolIdParam);
      }

      // Search (Term)
      // Supabase doesn't support complex cross-table searches easily in a single .select() without RPC or full-text search.
      // We'll handle tool name/code search by fetching tool IDs first if there's a search term.
      if (searchTerm) {
        const { data: tools } = await supabase
          .from('tools')
          .select('id')
          .or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
        
        const toolIds = tools?.map(t => t.id) || [];
        if (toolIds.length > 0) {
          query = query.in('tool_id', toolIds);
        } else {
          // No tools found, return empty
          setTransactions([]);
          setHasMore(false);
          setLoading(false);
          setLoadingMore(false);
          return;
        }
      }

      const { data, count, error } = await query;

      if (error) throw error;

      if (isLoadMore) {
        setTransactions(prev => [...prev, ...(data || [])]);
        setPage(currentPage);
      } else {
        setTransactions(data || []);
        setPage(0);
      }

      setHasMore(count ? (currentPage + 1) * PAGE_SIZE < count : false);

    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, selectedType, selectedBranch, startDate, endDate, searchTerm, toolIdParam]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    const init = async () => {
      await fetchBranches();
    };
    init();
  }, [fetchBranches]);

  useEffect(() => {
    const load = async () => {
      await fetchTransactions();
    };
    load();
  }, [selectedType, selectedBranch, startDate, endDate, toolIdParam, fetchTransactions]);

  // Handle Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTransactions();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, fetchTransactions]);

  const clearFilters = async () => {
    setSearchTerm('');
    setSelectedType('all');
    setSelectedBranch('all');
    setStartDate('');
    setEndDate('');
    setPage(0);
    pageRef.current = 0;
    setHasMore(true);
    await fetchTransactions();
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 lg:px-10 py-8 space-y-8 font-sans pb-32">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight italic uppercase flex items-center gap-3">
            <History className="text-indigo-600" size={28} />
            Histórico de Movimentações
          </h1>
          <p className="text-slate-500 text-sm font-medium italic opacity-75">Visualização completa de todas as transações de ferramentas do sistema.</p>
        </div>
      </div>

      {toolIdParam && transactions.length > 0 && (
         <motion.div 
           initial={{ opacity: 0, y: -10 }}
           animate={{ opacity: 1, y: 0 }}
           className="bg-indigo-50 border border-indigo-100 p-5 rounded-[1.5rem] flex items-center justify-between shadow-sm"
         >
            <div className="flex items-center gap-4">
               <div className="p-3 bg-white rounded-xl text-indigo-600 shadow-sm">
                  <Filter size={18} />
               </div>
               <div>
                 <p className="text-[10px] font-black uppercase text-indigo-900 tracking-widest">Filtrando por ferramenta específica:</p>
                 <p className="text-sm font-black text-indigo-600 uppercase italic mt-0.5">{transactions[0]?.tools?.name} <span className="text-indigo-300 ml-1">#{transactions[0]?.tools?.code}</span></p>
               </div>
            </div>
            <button 
              onClick={() => router.push('/dashboard/historico')}
              className="px-6 py-3 bg-white hover:bg-indigo-600 hover:text-white text-indigo-600 font-black text-[9px] uppercase tracking-[0.2em] rounded-xl border border-indigo-200 transition-all active:scale-95 shadow-sm"
            >
              Ver Histórico Global
            </button>
         </motion.div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div className="relative group">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text"
              placeholder="Ferramenta ou código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white focus:ring-0 rounded-2xl text-[11px] transition-all font-black uppercase tracking-wider text-slate-700"
            />
          </div>

          {/* Type */}
          <div className="relative group">
            <Filter size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <select 
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white focus:ring-0 rounded-2xl text-[11px] transition-all font-black uppercase tracking-wider text-slate-700 appearance-none cursor-pointer"
            >
              <option value="all">Todos os Tipos</option>
              <option value="caution">Cautela</option>
              <option value="loan">Empréstimo</option>
              <option value="return">Devolução</option>
              <option value="adjustment">Ajuste</option>
              <option value="loss">Perda</option>
            </select>
          </div>

          {/* Branch */}
          <div className="relative group">
            <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <select 
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white focus:ring-0 rounded-2xl text-[11px] transition-all font-black uppercase tracking-wider text-slate-700 appearance-none cursor-pointer"
            >
              <option value="all">Todas as Filiais</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div className="relative group">
            <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white focus:ring-0 rounded-2xl text-[11px] transition-all font-black uppercase tracking-wider text-slate-700"
            />
          </div>

          {/* End Date */}
          <div className="relative group">
            <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white focus:ring-0 rounded-2xl text-[11px] transition-all font-black uppercase tracking-wider text-slate-700"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button 
            onClick={clearFilters}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
          >
            <RotateCcw size={14} /> Limpar Filtros
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 text-[9px] uppercase tracking-[0.2em] font-black text-slate-400 border-b border-slate-100">
                <th className="px-8 py-5">Ferramenta</th>
                <th className="px-8 py-5">Tipo</th>
                <th className="px-8 py-5">Responsável</th>
                <th className="px-8 py-5">Unidade / Filial</th>
                <th className="px-8 py-5">Observação</th>
                <th className="px-8 py-5 text-right">Data/Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 font-bold italic uppercase text-xs tracking-widest">Carregando movimentações...</p>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-300 font-black uppercase text-sm tracking-widest">Nenhum registro encontrado</p>
                  </td>
                </tr>
              ) : (
                transactions.map((t, idx) => {
                  const type = TYPE_TRANSLATIONS[t.type] || TYPE_TRANSLATIONS[t.type.split('_')[0]] || { label: t.type, color: 'bg-slate-100 text-slate-700' };
                  
                  return (
                    <motion.tr 
                      key={t.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx % 10 * 0.05 }}
                      className="hover:bg-slate-50/50 transition-colors group"
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300 relative overflow-hidden shrink-0">
                            {t.tools?.image_url ? (
                              <Image 
                                src={t.tools.image_url} 
                                alt={t.tools.name} 
                                fill 
                                sizes="48px"
                                className="object-cover"
                                unoptimized
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <Package size={20} />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-900 italic uppercase leading-none">{t.tools?.name || 'Desconhecido'}</p>
                            <p className="text-[10px] font-mono text-indigo-500 mt-1 uppercase tracking-tighter">#{t.tools?.code || '---'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase italic border ${type.color}`}>
                          {type.label}
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center text-[10px] font-black uppercase">
                            {t.users?.name?.[0] || '?'}
                          </div>
                          <div>
                            <p className="text-[11px] font-bold text-slate-700 leading-none">{t.users?.name || 'Sistema'}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5 tracking-wider font-mono">#{t.user_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-black uppercase tracking-wider">
                          <MapPin size={12} className="text-slate-300" />
                          {t.branches?.name || t.branch || 'Sede Central'}
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <p className="text-[11px] text-slate-500 italic max-w-xs truncate" title={t.obs}>
                          {t.obs || 'Sem observações'}
                        </p>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex flex-col items-end">
                          <p className="text-[11px] font-black text-slate-700 italic uppercase">
                            {format(new Date(t.created_at), "dd 'de' MMM", { locale: ptBR })}
                          </p>
                          <p className="text-[9px] font-mono text-slate-400 mt-0.5">
                            {format(new Date(t.created_at), 'HH:mm:ss')}
                          </p>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="p-8 bg-slate-50 flex justify-center border-t border-slate-100">
            <button 
              onClick={() => fetchTransactions(true)}
              disabled={loadingMore}
              className="px-8 py-4 bg-white border-2 border-slate-200 hover:border-indigo-600 hover:text-indigo-600 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center gap-3"
            >
              {loadingMore ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Carregando...
                </>
              ) : (
                <>
                  Carregar Mais Registros <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
