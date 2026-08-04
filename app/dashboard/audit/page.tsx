'use client';

import React, { useState } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RotateCcw,
  Plus, 
  Minus,
  CheckCircle2,
  X,
  User,
  Package,
  Calendar,
  AlertTriangle,
  Zap,
  MoreHorizontal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

export default function AuditPage() {
  const { user: currentUser } = useAuth();
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tools, setTools] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    tool_id: '',
    type: 'adjustment_gain' as 'adjustment_gain' | 'adjustment_loss',
    quantity: 1,
    date: new Date().toISOString().split('T')[0],
    obs: '',
    branch_id: '',
  });
  
  const fetchInitialData = React.useCallback(async () => {
    const [{ data: tData }, { data: bData }] = await Promise.all([
      supabase.from('tools').select('*').order('name'),
      supabase.from('branches').select('*').order('name')
    ]);
    if (tData) setTools(tData);
    if (bData) {
      setBranches(bData);
      setFormData(prev => ({ ...prev, branch_id: bData[0]?.id || '' }));
    }
  }, []);

  const fetchActivities = React.useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*, tools(name, code)')
      .order('created_at', { ascending: false });
    
    if (data) setActivities(data);
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      if (mounted) {
        await fetchActivities();
        await fetchInitialData();
      }
    };
    initialize();
    return () => { mounted = false; };
  }, [fetchActivities, fetchInitialData]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tool_id || !currentUser) return;
    setIsLoading(true);

    const selectedTool = tools.find(t => t.id === formData.tool_id);
    const selectedBranch = branches.find(b => b.id === formData.branch_id);

    const diff = formData.type === 'adjustment_gain' ? formData.quantity : -formData.quantity;
    const newQuantity = Math.max(0, (selectedTool?.quantity_available || 0) + diff);

    let auditDate: string;
    try {
      auditDate = formData.date ? new Date(formData.date).toISOString() : new Date().toISOString();
    } catch {
      auditDate = new Date().toISOString();
    }

    // 1. Insert Transaction
    const { error: transError } = await supabase.from('transactions').insert([{
      tool_id: formData.tool_id,
      user_id: currentUser.registration,
      type: formData.type,
      quantity: formData.quantity,
      obs: `Lançamento Manual: ${formData.obs}`,
      branch: selectedBranch?.name || '',
      branch_id: formData.branch_id,
      status: 'confirmed',
      created_at: auditDate
    }]);

    if (!transError) {
      // 2. Update Tool Stock
      await supabase.from('tools')
        .update({ quantity_available: newQuantity })
        .eq('id', formData.tool_id);

      setIsModalOpen(false);
      setFormData({
        tool_id: '',
        type: 'adjustment_gain',
        quantity: 1,
        date: new Date().toISOString().split('T')[0],
        obs: '',
        branch_id: branches[0]?.id || '',
      });
      fetchActivities();
    }
    setIsLoading(false);
  };

  const handleConfirm = async (act: any) => {
    const { error } = await supabase
      .from('transactions')
      .update({ status: 'confirmed' })
      .eq('id', act.id);
    
    if (!error) fetchActivities();
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'cautela_check': return <History className="text-indigo-500" />;
      case 'inventory_report': return <Zap className="text-amber-500" />;
      case 'adjustment_gain': return <Plus className="text-emerald-500" />;
      case 'adjustment_loss': return <Minus className="text-rose-500" />;
      default: return <History className="text-slate-400" />;
    }
  };

  const getLabel = (type: string) => {
    switch(type) {
      case 'cautela_check': return 'Check Cautela';
      case 'inventory_report': return 'Inventário';
      case 'adjustment_gain': return 'Ajuste Ganho';
      case 'adjustment_loss': return 'Ajuste Perda';
      case 'cautela': return 'Check Cautela';
      default: return 'Registro';
    }
  };

  const filteredActivities = activities.filter(act => 
    (act.tools?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (act.obs || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
           <h1 className="text-2xl font-black text-slate-900 tracking-tight italic uppercase">Auditoria & Movimentações</h1>
           <p className="text-slate-500 text-sm font-medium italic opacity-75">Rastreabilidade completa de todas as alterações de patrimônio.</p>
        </div>
        <div className="flex items-center gap-3">
           <button 
             onClick={() => setIsModalOpen(true)}
             className="bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-2xl font-black italic uppercase tracking-widest text-[10px] shadow-xl shadow-slate-100 transition-all active:scale-95 flex items-center gap-2"
           >
             <Plus size={16} /> Novo Lançamento
           </button>
        </div>
      </header>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
         <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1 relative z-10">Movimentações</p>
            <p className="text-3xl font-black text-slate-800 italic relative z-10">{activities.length}</p>
            <History size={48} className="absolute -bottom-2 -right-2 text-slate-50 opacity-10 rotate-12" />
         </div>
         <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 shadow-sm relative overflow-hidden">
            <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-widest mb-1 relative z-10">Ajustes Positivos</p>
            <p className="text-3xl font-black text-emerald-700 italic relative z-10">+{activities.filter(a => a.type === 'adjustment_gain').length}</p>
            <Plus size={48} className="absolute -bottom-2 -right-2 text-emerald-500 opacity-10 rotate-12" />
         </div>
         <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100 shadow-sm relative overflow-hidden">
            <p className="text-[10px] uppercase font-bold text-rose-600 tracking-widest mb-1 relative z-10">Ajustes Negativos</p>
            <p className="text-3xl font-black text-rose-700 italic relative z-10">-{activities.filter(a => a.type === 'adjustment_loss').length}</p>
            <Minus size={48} className="absolute -bottom-2 -right-2 text-rose-500 opacity-10 rotate-12" />
         </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-2.5 rounded-[1.5rem] border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por item, motivo ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 rounded-xl text-xs transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-2 px-2">
          <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
            <Calendar size={16} /> Período
          </button>
          <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
            <Filter size={16} />
          </button>
        </div>
      </div>

      {/* Audit List */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[1000px] font-sans">
           <thead>
              <tr className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">
                 <th className="px-8 py-5">Identificação</th>
                 <th className="px-8 py-5">Colaborador / Autor</th>
                 <th className="px-8 py-5">Item / Ferramenta</th>
                 <th className="px-8 py-5 text-center">Quant.</th>
                 <th className="px-8 py-5">Data / Hora</th>
                 <th className="px-8 py-5">Filial</th>
                 <th className="px-8 py-5 text-right">Ação Corretiva</th>
              </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                   <td colSpan={7} className="px-8 py-12 text-center text-slate-400 font-bold italic animate-pulse uppercase text-[10px] tracking-widest">Sincronizando auditoria...</td>
                </tr>
              ) : filteredActivities.length === 0 ? (
                <tr>
                   <td colSpan={7} className="px-8 py-12 text-center text-slate-400 font-bold italic uppercase text-[10px] tracking-widest">Nenhuma movimentação registrada.</td>
                </tr>
              ) : filteredActivities.map(act => (
                <tr key={act.id} className="hover:bg-indigo-50/30 transition-colors group text-sm border-l-4 border-transparent hover:border-indigo-400">
                   <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                         <div className={`p-2 rounded-xl bg-white shadow-sm border border-slate-100 group-hover:scale-110 transition-transform`}>
                            {getIcon(act.type)}
                         </div>
                         <div>
                            <span className="font-black text-slate-900 italic uppercase tracking-tighter block leading-none">{getLabel(act.type)}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 block">Ref: {act.type}</span>
                         </div>
                      </div>
                   </td>
                   <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                         <User size={14} className="text-slate-300" />
                         <span className="font-bold text-slate-600 truncate max-w-[120px]">{act.user_id}</span>
                      </div>
                   </td>
                   <td className="px-8 py-6">
                      <div>
                         <span className="font-extrabold text-slate-800 italic uppercase tracking-tight block leading-tight">{act.tools?.name || 'N/A'}</span>
                         <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mt-0.5">{act.obs || 'Nenhum motivo registrado'}</span>
                      </div>
                   </td>
                   <td className="px-8 py-6 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-black text-xs ${act.type.includes('gain') ? 'bg-emerald-100 text-emerald-700' : act.type.includes('loss') ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'}`}>
                         {act.type.includes('loss') ? '-' : act.type.includes('gain') ? '+' : ''}{act.quantity}
                      </span>
                   </td>
                   <td className="px-8 py-6 text-slate-400 font-bold text-xs">{new Date(act.created_at).toLocaleString()}</td>
                   <td className="px-8 py-6">
                      <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg tracking-widest border border-slate-100">{act.branch}</span>
                   </td>
                   <td className="px-8 py-6 text-right">
                      {act.status !== 'confirmed' ? (
                        <button 
                          onClick={() => handleConfirm(act)}
                          className="bg-indigo-600 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase italic tracking-widest shadow-xl shadow-indigo-100 transition-all active:scale-95"
                        >
                           Confirmar
                        </button>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5 text-emerald-500 font-black italic text-[9px] uppercase tracking-widest">
                           <CheckCircle2 size={14} /> Efetivado
                        </div>
                      )}
                   </td>
                </tr>
              ))}
           </tbody>
        </table>
      </div>
      {/* Modal Novo Lançamento */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setIsModalOpen(false)}
               className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
             >
                <div className="flex items-center justify-between mb-8">
                   <div>
                      <h2 className="text-xl font-black text-slate-900 italic uppercase">Lançamento Especial</h2>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ajuste de saldo ou registro retroativo</p>
                   </div>
                   <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400">
                     <X size={24} />
                   </button>
                </div>

                <form onSubmit={handleManualSubmit} className="space-y-6">
                   <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                      <button 
                        type="button"
                        onClick={() => setFormData({...formData, type: 'adjustment_gain'})}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.type === 'adjustment_gain' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                         Ajuste Ganho (+)
                      </button>
                      <button 
                        type="button"
                        onClick={() => setFormData({...formData, type: 'adjustment_loss'})}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.type === 'adjustment_loss' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                         Ajuste Perda (-)
                      </button>
                   </div>

                   <div className="space-y-4">
                      <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Ferramenta</label>
                         <select 
                           required
                           value={formData.tool_id}
                           onChange={e => setFormData({...formData, tool_id: e.target.value})}
                           className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-800 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                         >
                           <option value="">Selecione...</option>
                           {tools.map(t => <option key={t.id} value={t.id}>[{t.code}] {t.name}</option>)}
                         </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Quantidade</label>
                            <input 
                              type="number"
                              required
                              min="1"
                              value={formData.quantity}
                              onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 0})}
                              className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-black text-lg text-slate-800 focus:ring-4 focus:ring-indigo-100 transition-all"
                            />
                         </div>
                         <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Data (Retroativo)</label>
                            <input 
                              type="date"
                              required
                              value={formData.date}
                              onChange={e => setFormData({...formData, date: e.target.value})}
                              className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-800 focus:ring-4 focus:ring-indigo-100 transition-all"
                            />
                         </div>
                      </div>

                      <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Unidade / Filial</label>
                         <select 
                           required
                           value={formData.branch_id}
                           onChange={e => setFormData({...formData, branch_id: e.target.value})}
                           className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-800 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                         >
                           {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                         </select>
                      </div>

                      <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Justificativa</label>
                         <textarea 
                           required
                           rows={2}
                           value={formData.obs}
                           onChange={e => setFormData({...formData, obs: e.target.value})}
                           className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-medium text-sm text-slate-800 focus:ring-4 focus:ring-indigo-100 transition-all resize-none"
                           placeholder="Motivo da movimentação..."
                         />
                      </div>
                   </div>

                   <button 
                     type="submit"
                     disabled={isLoading}
                     className={`w-full py-5 rounded-[1.5rem] font-black text-white uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${formData.type === 'adjustment_gain' ? 'bg-emerald-600 shadow-emerald-100' : 'bg-rose-600 shadow-rose-100'}`}
                   >
                      {isLoading ? 'REGISTRANDO...' : <>EFETIVAR LANÇAMENTO <CheckCircle2 size={24} /></>}
                   </button>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
