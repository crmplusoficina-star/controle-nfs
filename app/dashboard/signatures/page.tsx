'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { exportToPDF } from '@/lib/pdf-export';
import { 
  Signature, 
  Search, 
  Calendar, 
  User, 
  Filter,
  ArrowRight,
  FileCheck,
  Zap,
  ClipboardCheck,
  ChevronRight,
  X,
  ExternalLink,
  Loader2,
  Image as ImageIcon,
  Clock,
  HardHat,
  Download
} from 'lucide-react';
import Image from 'next/image';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function SignaturesGalleryPage() {
  const [audits, setAudits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAudit, setSelectedAudit] = useState<any | null>(null);

  useEffect(() => {
    async function fetchSignedAudits() {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('cautelia_audits')
          .select('*, cautelia_audit_items(*, cautelia_standard_tools(*), tools:stock_tool_id(id, name, code, image_url))')
          .eq('status', 'signed')
          .order('check_date', { ascending: false });

        if (error) {
          console.error('Supabase Query Error:', error);
          throw new Error(error.message);
        }

        if (!data || data.length === 0) {
           setAudits([]);
           return;
        }

        // Fetch user data for all unique user_ids
        const userRegistrations = Array.from(new Set(data?.map(a => a.user_id) || []));

        // Split into chunks if too many registrations to avoid query length limits
        const { data: userData } = await supabase
          .from('users_access')
          .select('registration, name')
          .in('registration', userRegistrations);

        const userMap = new Map();
        userData?.forEach(u => {
          userMap.set(u.registration, u.name);
        });

        const enrichedAudits = data?.map(a => ({
          ...a,
          technicianName: userMap.get(a.user_id) || 'Colaborador não identificado'
        }));

        setAudits(enrichedAudits || []);
      } catch (err) {
        console.error('Error fetching signed audits:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSignedAudits();
  }, []);

  const handlePrint = async () => {
    if (!selectedAudit) return;
    try {
      const fileName = `Recibo_${selectedAudit.technicianName.replace(/\s+/g, '_')}_${format(new Date(selectedAudit.check_date), 'yyyyMMdd_HHmm')}.pdf`;
      await exportToPDF('printable-receipt-content', fileName);
    } catch (err) {
      console.error('Falha ao gerar PDF:', err);
      // Removed window.print() as it fails in sandboxed environments
    }
  };

  const filteredAudits = audits.filter(a => 
    a.technicianName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 lg:px-10 py-8 space-y-8 font-sans print:p-0 print:m-0">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-receipt, .printable-receipt * {
            visibility: visible;
          }
          .printable-receipt {
            position: fixed;
            left: 0;
            top: 0;
            width: 100% !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            z-index: 99999;
            background: white;
          }
          /* Fix for Next.js/Tailwind print sizing */
          @page {
            size: auto;
            margin: 0;
          }
        }
      `}</style>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight italic uppercase">Galeria de Assinaturas</h1>
          <p className="text-slate-500 font-medium text-sm mt-1">Histórico visual das cautelas e empréstimos confirmados.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text"
              placeholder="Buscar colaborador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-6 py-3.5 bg-white border-2 border-slate-100 rounded-2xl text-xs font-bold focus:border-indigo-500 outline-none transition-all w-full sm:w-64 shadow-sm"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="h-96 flex flex-col items-center justify-center gap-4">
           <motion.div 
             animate={{ rotate: 360 }}
             transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
             className="text-indigo-600"
           >
             <Loader2 size={48} />
           </motion.div>
           <p className="font-bold text-slate-400 italic">Carregando galeria...</p>
        </div>
      ) : filteredAudits.length === 0 ? (
        <div className="bg-white rounded-[3rem] border-2 border-dashed border-slate-200 p-20 text-center">
           <div className="w-20 h-20 bg-slate-50 text-slate-300 rounded-3xl flex items-center justify-center mx-auto mb-6">
             <Signature size={40} />
           </div>
           <h3 className="font-black text-slate-900 text-xl uppercase italic">Nenhuma assinatura encontrada</h3>
           <p className="text-slate-400 mt-2 font-medium">As assinaturas aparecerão aqui assim que as cautelas forem finalizadas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAudits.map((audit) => (
            <motion.div 
              key={audit.id}
              layoutId={audit.id}
              onClick={() => setSelectedAudit(audit)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] border-2 border-slate-50 overflow-hidden shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all group cursor-pointer"
            >
              <div className="aspect-[4/3] bg-slate-50 relative flex items-center justify-center border-b border-slate-50">
                 {audit.signature_url ? (
                   <div className="relative w-full h-full p-6">
                      <div className={`absolute top-4 left-4 right-4 z-10 flex flex-wrap gap-1 pointer-events-none`}>
                         {audit.cautelia_audit_items?.slice(0, 5).map((item: any, i: number) => (
                           <span key={i} className="text-[7px] font-black bg-white/90 backdrop-blur-sm text-slate-900 border border-slate-200 px-1.5 py-0.5 rounded-md uppercase tracking-tighter shadow-sm flex items-center gap-1">
                             <Zap size={6} className="text-indigo-500" />
                             {item.cautelia_standard_tools?.name?.split(' ')[0] || item.tools?.name?.split(' ')[0] || 'Tool'}
                           </span>
                         ))}
                         {audit.cautelia_audit_items?.length > 5 && (
                           <span className="text-[7px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded-md uppercase tracking-tighter shadow-sm">
                             +{audit.cautelia_audit_items.length - 5}
                           </span>
                         )}
                      </div>
                      <Image 
                        src={audit.signature_url} 
                        alt="Assinatura" 
                        fill 
                        className="object-contain p-4 grayscale group-hover:grayscale-0 transition-all brightness-95 group-hover:brightness-100"
                        unoptimized
                        referrerPolicy="no-referrer"
                      />
                   </div>
                 ) : (
                   <div className="flex flex-col items-center gap-2 text-slate-300">
                      <ImageIcon size={32} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Sem imagem</span>
                   </div>
                 )}
                 
                 <div className={`absolute top-4 right-4 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest shadow-lg ${audit.type === 'caution' ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white'}`}>
                    {audit.type === 'caution' ? 'Cautela' : 'Empréstimo'}
                 </div>

                 <div className="absolute inset-0 bg-indigo-900/0 group-hover:bg-indigo-900/5 transition-colors" />
              </div>
              
              <div className="p-6">
                 {audit.cautelia_audit_items && audit.cautelia_audit_items.length > 0 && (
                   <div className="flex flex-wrap gap-1 mb-3">
                     {audit.cautelia_audit_items.slice(0, 3).map((item: any, i: number) => (
                       <span key={i} className="text-[8px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                         {item.cautelia_standard_tools?.name || item.tools?.name || 'Ferramenta'}
                       </span>
                     ))}
                     {audit.cautelia_audit_items.length > 3 && (
                       <span className="text-[8px] font-black bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                         +{audit.cautelia_audit_items.length - 3} itens
                       </span>
                     )}
                   </div>
                 )}
                 <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                       <User size={20} />
                    </div>
                    <div>
                       <h4 className="font-black text-slate-900 text-sm uppercase tracking-tight leading-none italic">{audit.technicianName}</h4>
                       <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{audit.user_id}</p>
                    </div>
                 </div>

                 <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                    <div className="flex items-center gap-2 text-slate-400">
                       <Clock size={14} />
                       <span className="text-[10px] font-black uppercase tracking-widest">
                         {audit.check_date ? format(new Date(audit.check_date), "dd/MM/yy HH:mm", { locale: ptBR }) : '-'}
                       </span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-300 group-hover:text-indigo-500 transition-colors">
                       <span className="text-[9px] font-black uppercase tracking-widest">Detalhes</span>
                       <ArrowRight size={12} />
                    </div>
                 </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal de Detalhes */}
      <AnimatePresence>
        {selectedAudit && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedAudit(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            <motion.div 
              layoutId={selectedAudit.id}
              className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className={`p-8 pb-12 text-white relative ${selectedAudit.type === 'caution' ? 'bg-amber-500' : 'bg-indigo-600'}`}>
                <button 
                  onClick={() => setSelectedAudit(null)}
                  className="absolute top-6 right-6 p-2 hover:bg-white/20 rounded-full transition-all"
                >
                  <X size={24} />
                </button>

                <div className="flex items-center gap-4 mb-6">
                   <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center">
                     <Signature size={32} />
                   </div>
                   <div>
                     <h3 className="text-2xl font-black italic uppercase tracking-tighter leading-none">Comprovante Digital</h3>
                     <p className="text-white/70 text-[10px] font-black uppercase tracking-widest mt-2">
                       Protocolo: #{selectedAudit.id.substring(0, 8).toUpperCase()}
                     </p>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                   <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60">Colaborador</p>
                      <p className="font-black text-lg skew-x-[-10deg] uppercase">{selectedAudit.technicianName}</p>
                   </div>
                   <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60">Data e Hora</p>
                      <p className="font-black text-lg skew-x-[-10deg] uppercase">
                        {selectedAudit.check_date ? format(new Date(selectedAudit.check_date), "dd MMMM, HH:mm", { locale: ptBR }) : '-'}
                      </p>
                   </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                 <div className="space-y-8">
                    <section>
                       <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Zap size={14} className="text-indigo-500" /> Itens do Comprovante
                       </h5>
                       <div className="space-y-3">
                          {selectedAudit.cautelia_audit_items?.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 italic">
                               <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-slate-400 shadow-sm">
                                     <HardHat size={16} />
                                  </div>
                                  <div>
                                     <p className="text-xs font-black text-slate-800 uppercase tracking-tight">
                                       {item.cautelia_standard_tools?.name || item.tools?.name || 'Ferramenta'}
                                     </p>
                                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                       Ref: {item.tools?.code || 'N/A'}
                                     </p>
                                  </div>
                               </div>
                               <div className="text-right px-4 py-2 bg-white rounded-xl shadow-sm border border-slate-100">
                                  <p className="text-[10px] font-black text-indigo-600 uppercase">Qtd: {item.quantity}</p>
                               </div>
                            </div>
                          ))}
                       </div>
                    </section>

                    <section className="bg-slate-50 p-6 rounded-[2.5rem] border-2 border-slate-100">
                       <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <ImageIcon size={14} className="text-indigo-500" /> Assinatura Coletada
                       </h5>
                       <div className="aspect-[2/1] bg-white rounded-3xl border border-slate-200 relative flex items-center justify-center overflow-hidden shadow-inner">
                          {selectedAudit.signature_url ? (
                            <Image 
                              src={selectedAudit.signature_url} 
                              alt="Assinatura Detalhada" 
                              fill 
                              className="object-contain p-8"
                              unoptimized
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="text-slate-300 flex flex-col items-center gap-2 italic font-black uppercase text-xs">
                               <Signature size={32} />
                               Sem imagem
                            </div>
                          )}
                       </div>
                    </section>

                    <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100/50">
                       <p className="text-[9px] text-indigo-400 leading-relaxed font-medium uppercase text-center italic">
                         Este documento possui validade jurídica interna e foi assinado digitalmente pelo colaborador supra-citado mediante autenticação no sistema Tracbel.
                       </p>
                    </div>
                 </div>
              </div>

              <div className="p-8 border-t border-slate-100 flex gap-4 bg-slate-50/50 print:hidden">
                 <button 
                  onClick={() => setSelectedAudit(null)}
                  className="flex-1 py-4 px-6 border-2 border-slate-200 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-white transition-all shadow-sm"
                 >
                   Fechar Visualização
                 </button>
                  <button 
                   onClick={handlePrint}
                   className="flex-1 py-4 px-6 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2"
                  >
                   <Download size={14} /> Baixar Recibo (PDF)
                  </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Versão para Impressão */}
      {selectedAudit && (
        <div id="printable-receipt-content" className="hidden print:block printable-receipt fixed inset-0 z-[99999] bg-white overflow-y-auto">
          <div className="p-10 bg-white min-h-screen text-slate-900 border-[10px] border-slate-900">
            <div className="p-8">
              <div className="flex justify-between items-start mb-10">
                <div className="relative h-16 w-48">
                  <Image 
                    src="https://apreflorestas.com.br/wp-content/uploads/2017/05/tracbel-2-1980x708.png"
                    alt="Tracbel"
                    fill
                    className="object-contain"
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="text-right">
                  <h2 className="text-2xl font-black italic uppercase tracking-tighter">Comprovante Digital</h2>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Protocolo: #{selectedAudit.id.substring(0, 8).toUpperCase()}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-10 mb-10 border-b-2 border-slate-100 pb-10">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Colaborador</p>
                  <p className="text-xl font-black uppercase italic">{selectedAudit.technicianName}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Matrícula: {selectedAudit.user_id}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Data e Hora</p>
                  <p className="text-xl font-black uppercase italic">
                    {selectedAudit.check_date ? format(new Date(selectedAudit.check_date), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-'}
                  </p>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${selectedAudit.type === 'caution' ? 'text-amber-600' : 'text-indigo-600'}`}>
                    Tipo: {selectedAudit.type === 'caution' ? 'Cautela' : 'Empréstimo'}
                  </p>
                </div>
              </div>

              <div className="mb-10">
                <h4 className="text-[11px] font-black uppercase tracking-widest mb-4">Itens Relacionados</h4>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Cód</th>
                      <th className="py-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Ferramenta</th>
                      <th className="py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right">Qtd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {selectedAudit.cautelia_audit_items?.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td className="py-3 text-[10px] font-bold uppercase">{item.tools?.code || '-'}</td>
                        <td className="py-3 text-[10px] font-black uppercase italic">{item.cautelia_standard_tools?.name || item.tools?.name || 'Ferramenta'}</td>
                        <td className="py-3 text-[10px] font-black text-right">{item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mb-10 p-6 bg-slate-50 rounded-2xl border-2 border-slate-100">
                <p className="text-[11px] font-black uppercase tracking-widest mb-3 italic">Termo de Responsabilidade</p>
                <p className="text-[9px] font-bold text-slate-500 text-justify leading-relaxed uppercase">
                  Pelo presente termo, declaro que recebi os equipamentos e ferramentas acima relacionados em perfeitas condições de conservação e funcionamento. Assumo total responsabilidade pela guarda, zelo e uso exclusivo em atividades profissionais da empresa. Comprometo-me a comunicar imediatamente qualquer ocorrência, dano ou extravio, sob pena de responsabilidade administrativa e civil, autorizando desde já o desconto do valor correspondente em caso de negligência ou mau uso.
                </p>
              </div>

              <div className="flex flex-col items-center mt-20">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8">Assinatura Certificada Digitalmente</p>
                <div className="w-full max-w-md h-32 border-b-2 border-slate-900 flex items-center justify-center relative">
                  {selectedAudit.signature_url && (
                    <Image 
                      src={selectedAudit.signature_url} 
                      alt="Assinatura" 
                      width={400} 
                      height={100} 
                      className="h-24 object-contain" 
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
                <p className="mt-4 text-[11px] font-black uppercase italic tracking-tighter">{selectedAudit.technicianName}</p>
              </div>

              <div className="mt-20 pt-10 border-t border-slate-100 text-center">
                <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.4em]">
                  Este documento possui validade jurídica interna. Gerado em {format(new Date(), "dd/MM/yyyy HH:mm:ss")}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
