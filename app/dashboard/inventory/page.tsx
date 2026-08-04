'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { 
  Plus, 
  MapPin, 
  CheckCircle2, 
  Package,
  ArrowLeft,
  RotateCcw,
  Timer,
  Zap,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

export default function InventoryPage() {
  const { user: currentUser } = useAuth();
  const [step, setStep] = useState<'select' | 'counting' | 'results'>('select');
  const [selectedBranch, setSelectedBranch] = useState<any | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [countCycle, setCountCycle] = useState(1);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [toolsToCount, setToolsToCount] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  useEffect(() => {
    const fetchBranches = async () => {
      const { data } = await supabase.from('branches').select('*').order('name');
      if (data) setBranches(data);
    };
    fetchBranches();
  }, []);

  const handleStart = async (branch: any) => {
    setSelectedBranch(branch);
    setIsLoading(true);
    
    // Fetch real tools for the branch
    const { data } = await supabase
      .from('tools')
      .select('*')
      .eq('branch_id', branch.id)
      .order('name');
    
    if (data) {
      setToolsToCount(data.map(t => ({
        id: t.id,
        name: t.name,
        code: t.code,
        image_url: t.image_url,
        expected: t.quantity_available
      })));
      setStep('counting');
    }
    setIsLoading(false);
  };

  const handleFinishCount = () => {
    setStep('results');
    confetti({ particleCount: 150, spread: 60 });
    alert('Contagem finalizada. Veja as divergências abaixo.');
  };

  const handleNextCycle = () => {
    setCountCycle(prev => prev + 1);
    setCounts({});
    setStep('counting');
  };

  const handleCancelInventoryStatus = () => {
    setIsCancelModalOpen(true);
  };

  const confirmCancelInventory = () => {
    setStep('select');
    setCounts({});
    setCountCycle(1);
    setIsCancelModalOpen(false);
  };

  return (
    <div className="max-w-5xl mx-auto px-6 space-y-8 font-sans">
      <header>
        <h1 className="text-3xl font-black italic text-slate-800 uppercase tracking-tighter">Inventário de Ciclos</h1>
        <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1 italic">Contagem cega e verificação de estoque por filial</p>
      </header>

      <AnimatePresence mode="wait">
        {step === 'select' && (
          <motion.div 
            key="select"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl"
          >
             <div className="flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center shadow-inner">
                   <MapPin size={40} />
                </div>
                <div>
                   <h2 className="text-2xl font-black italic uppercase tracking-tight text-slate-800">ONDE VAMOS CONTAR?</h2>
                   <p className="text-slate-500 mt-2 font-medium">Selecione a filial para iniciar uma nova rodada de inventário.</p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                   {branches.map(b => (
                     <button
                       key={b.id}
                       onClick={() => handleStart(b)}
                       className="p-6 rounded-3xl border-2 border-slate-100 bg-slate-50 text-slate-700 hover:border-indigo-600 hover:bg-indigo-50 transition-all font-black uppercase tracking-tight text-sm shadow-sm group"
                     >
                       <div className="flex items-center justify-between">
                         <span className="group-hover:text-indigo-700">{b.name}</span>
                         <ArrowRight size={18} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                       </div>
                       <p className="text-[10px] text-slate-400 mt-1 text-left font-bold lowercase tracking-normal">{b.city}</p>
                     </button>
                   ))}
                </div>

                {isLoading && (
                  <div className="text-indigo-600 font-black italic text-sm animate-pulse uppercase tracking-widest">Preparando lista de contagem...</div>
                )}
             </div>
          </motion.div>
        )}

        {step === 'counting' && (
          <motion.div 
            key="counting"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="space-y-6"
          >
             <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-2xl">
                <div className="relative z-10">
                   <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-amber-900 shadow-lg shadow-amber-500/20">
                         <Timer size={24} />
                      </div>
                      <p className="text-xl font-black italic uppercase tracking-tighter">CONTAGEM EM CURSO</p>
                   </div>
                   <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">{selectedBranch?.name} • CICLO {countCycle}</p>
                </div>
                <div className="relative z-10 flex items-center gap-4">
                  <div className="text-center font-black italic border-r border-white/10 px-6">
                     <p className="text-3xl text-emerald-400 leading-none">{Object.keys(counts).length}</p>
                     <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Contados</p>
                  </div>
                  <div className="text-center font-black italic px-6">
                     <p className="text-3xl text-white/20 leading-none">{toolsToCount.length}</p>
                     <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Total</p>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
             </div>

             <div className="grid grid-cols-1 gap-4">
                {toolsToCount.map(tool => (
                  <div key={tool.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-indigo-200 transition-all">
                     <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 group-hover:text-indigo-400 transition-colors overflow-hidden">
                           {tool.image_url ? (
                             <Image 
                               src={tool.image_url} 
                               alt={tool.name}
                               width={56}
                               height={56}
                               className="w-full h-full object-cover"
                               referrerPolicy="no-referrer"
                             />
                           ) : (
                             <Package size={24} />
                           )}
                        </div>
                        <div>
                           <h3 className="font-extrabold text-slate-800 uppercase italic leading-tight">{tool.name}</h3>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic mt-0.5">REF: {tool.code}</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-4">
                        <input 
                           type="number"
                           placeholder="?"
                           className="w-24 text-center px-4 py-3 bg-slate-50 border-2 border-slate-100 focus:border-indigo-500 focus:bg-white rounded-2xl font-black text-xl text-slate-800 transition-all"
                           onChange={(e) => setCounts({...counts, [tool.id]: parseInt(e.target.value) || 0})}
                        />
                     </div>
                  </div>
                ))}
             </div>

             <div className="flex items-center justify-between gap-4 pt-6">
                <button 
                  onClick={handleCancelInventoryStatus}
                  className="px-8 py-4 text-slate-400 font-bold uppercase transition-all hover:text-slate-600 flex items-center gap-2"
                >
                   <ArrowLeft size={20} /> Cancelar
                </button>
                <button 
                  onClick={handleFinishCount}
                  className="bg-indigo-600 hover:bg-slate-900 text-white font-black italic px-12 py-5 rounded-[2rem] shadow-xl shadow-indigo-100 transition-all active:scale-95 text-lg uppercase flex items-center gap-3"
                >
                   CONCLUIR CONTAGEM <CheckCircle2 size={24} />
                </button>
             </div>
          </motion.div>
        )}

        {step === 'results' && (
          <motion.div 
            key="results"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 h-full pb-20"
          >
             <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 relative overflow-hidden flex flex-col items-center text-center">
                <div className="w-24 h-24 bg-amber-100 text-amber-600 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner">
                   <Zap size={48} fill="currentColor" />
                </div>
                <h2 className="text-3xl font-black italic uppercase tracking-tight text-slate-800">DIVERGÊNCIAS ENCONTRADAS</h2>
                <p className="text-slate-400 font-bold italic mt-1 uppercase tracking-widest text-xs">{selectedBranch?.name} • CICLO {countCycle}</p>

                <div className="grid grid-cols-3 gap-3 w-full mt-8">
                   <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
                      <p className="text-2xl font-black text-slate-800 leading-none">
                         {toolsToCount.length}
                      </p>
                      <p className="text-[8px] uppercase font-black text-slate-400 tracking-widest mt-2">Total Itens</p>
                   </div>
                   <div className="p-4 bg-rose-50 rounded-3xl border border-rose-100">
                      <p className="text-2xl font-black text-rose-600 leading-none">
                         {toolsToCount.filter(tool => (counts[tool.id] || 0) !== tool.expected).length}
                      </p>
                      <p className="text-[8px] uppercase font-black text-rose-400 tracking-widest mt-2">Divergências</p>
                   </div>
                   <div className="p-4 bg-emerald-50 rounded-3xl border border-emerald-100">
                      <p className="text-2xl font-black text-emerald-600 leading-none">
                         {toolsToCount.length > 0 ? Math.round((toolsToCount.filter(t => (counts[t.id] || 0) === t.expected).length / toolsToCount.length) * 100) : 100}%
                      </p>
                      <p className="text-[8px] uppercase font-black text-emerald-600 tracking-widest mt-2">Acuracidade</p>
                   </div>
                </div>

                <div className="w-full mt-8 overflow-hidden rounded-[2rem] border border-slate-100 text-left">
                   <table className="w-full">
                      <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-widest">
                         <tr>
                            <th className="px-6 py-4">Ferramenta</th>
                            <th className="px-6 py-4 text-center">Contado</th>
                            <th className="px-6 py-4 text-center">Sistema</th>
                            <th className="px-6 py-4 text-right">Diferença</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                         {toolsToCount.map((tool) => {
                            const count = counts[tool.id] || 0;
                            const diff = count - tool.expected;
                            const isExact = diff === 0;
                            return (
                               <tr key={tool.id} className="text-xs group hover:bg-slate-50/50 transition-colors">
                                  <td className="px-6 py-4 font-black text-slate-800 uppercase italic flex items-center gap-3">
                                     <div className="w-8 h-8 rounded-lg bg-slate-50 flex-shrink-0 overflow-hidden flex items-center justify-center">
                                        {tool.image_url ? (
                                          <Image 
                                            src={tool.image_url} 
                                            alt={tool.name}
                                            width={32}
                                            height={32}
                                            className="w-full h-full object-cover"
                                            referrerPolicy="no-referrer"
                                          />
                                        ) : (
                                          <Package size={14} className="text-slate-300" />
                                        )}
                                     </div>
                                     {tool.name}
                                  </td>
                                  <td className="px-6 py-4 text-center font-black italic text-indigo-600 bg-indigo-50/30">{count}</td>
                                  <td className="px-6 py-4 text-center text-slate-400 font-bold">{tool.expected}</td>
                                  <td className="px-6 py-4 text-right font-black">
                                     {isExact ? (
                                        <span className="text-emerald-500 font-black italic">CONFERE</span>
                                     ) : (
                                        <span className={`px-2 py-1 rounded-lg ${diff > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                           {diff > 0 ? `+${diff}` : diff}
                                        </span>
                                     )}
                                  </td>
                               </tr>
                            );
                         })}
                      </tbody>
                   </table>
                </div>

                <div className="mt-8 p-6 bg-amber-50 rounded-[2rem] border border-amber-100 text-left w-full">
                   <div className="flex items-start gap-4">
                      <div className="p-3 bg-amber-200 text-amber-700 rounded-2xl">
                         <RotateCcw size={24} />
                      </div>
                      <div>
                         <h4 className="font-black text-amber-800 uppercase italic tracking-tighter">Rodada de Verificação</h4>
                         <p className="text-xs text-amber-700 font-bold mt-1 opacity-80 leading-snug">
                            Se houveram divergências, você pode iniciar um novo ciclo de contagem (máximo 3). Os ajustes de estoque devem ser feitos manualmente na tela de Estoque após a confirmação.
                         </p>
                      </div>
                   </div>
                </div>

                <div className="mt-8 flex flex-col gap-3 w-full max-w-sm">
                   {countCycle < 3 && toolsToCount.some(t => (counts[t.id] || 0) !== t.expected) && (
                      <button 
                         onClick={handleNextCycle}
                         className="w-full bg-slate-900 hover:bg-black text-white font-black italic py-5 rounded-[1.5rem] shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95 text-lg uppercase"
                      >
                         <RotateCcw size={20} /> INICIAR CICLO {countCycle + 1}
                      </button>
                   )}
                   <button 
                     onClick={async () => {
                       // Save as audit transaction
                       setIsLoading(true);
                       if (!selectedBranch) {
                         alert('Filial não identificada.');
                         setIsLoading(false);
                         return;
                       }

                       const auditLogs = toolsToCount.map(t => ({
                         tool_id: t.id,
                         type: 'cautela_check',
                         quantity: counts[t.id] || 0,
                         obs: `Inventário Ciclo ${countCycle} - Ref: ${t.expected}`,
                         branch_id: selectedBranch.id,
                         branch: selectedBranch.name,
                         status: (counts[t.id] || 0) === t.expected ? 'confirmed' : 'pending_adjustment',
                         user_id: currentUser?.registration || 'SISTEMA'
                       }));

                       const { error } = await supabase.from('transactions').insert(auditLogs);
                       
                       if (!error) {
                         confetti();
                         alert('Inventário finalizado e registrado!');
                         setStep('select');
                         setCounts({});
                         setCountCycle(1);
                       } else {
                         console.error("Erro no Supabase:", error);
                         alert(`Erro ao salvar: ${error.message}`);
                       }
                       setIsLoading(false);
                     }}
                     className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black italic py-5 rounded-[1.5rem] flex items-center justify-center gap-3 transition-all uppercase shadow-xl shadow-emerald-50"
                   >
                     {isLoading ? 'SALVANDO...' : 'FINALIZAR INVENTÁRIO'}
                   </button>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Confirmação Cancelamento */}
      <AnimatePresence>
        {isCancelModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCancelModalOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <RotateCcw size={32} />
              </div>
              <h2 className="text-xl font-black text-slate-900 italic uppercase mb-2">Cancelar Inventário?</h2>
              <p className="text-sm text-slate-500 font-medium mb-8">Todos os dados da contagem atual serão perdidos. Deseja realmente cancelar?</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsCancelModalOpen(false)}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
                >
                  Voltar
                </button>
                <button 
                  onClick={confirmCancelInventory}
                  className="flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-rose-200"
                >
                  Sim, Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
