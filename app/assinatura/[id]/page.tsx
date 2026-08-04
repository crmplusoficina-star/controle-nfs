'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import Image from 'next/image';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { exportToPDF } from '@/lib/pdf-export';
import { 
  FileCheck, 
  AlertTriangle, 
  Package, 
  Zap, 
  CheckCircle2, 
  X,
  Signature as SignatureIcon,
  Download
} from 'lucide-react';

export default function ExternalSignaturePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  
  const [audit, setAudit] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const fetchAudit = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        // Fetch audit data
        const { data: auditData, error: auditError } = await supabase
          .from('cautelia_audits')
          .select('*, cautelia_audit_items(*, cautelia_standard_tools(*), tools:stock_tool_id(id, name, code, image_url))')
          .eq('id', id)
          .maybeSingle();

        if (auditError) throw auditError;
        if (!auditData) {
          setError('Cautelia não encontrada ou link expirado.');
          return;
        }

        // Fetch user data separately since joint might fail due to lack of FK
        if (auditData.user_id) {
          const reg = auditData.user_id.trim();

          const { data: userData } = await supabase
            .from('users_access')
            .select('name, registration')
            .eq('registration', reg)
            .maybeSingle();
          
          if (userData) {
            auditData.users_access = userData;
          }
        }

        if (auditData.status === 'signed') {
          setError('Esta cautelia já foi assinada.');
          setAudit(auditData);
          return;
        }

        // Initialize local copy of items for interactivity
        setAudit(auditData);
      } catch (err: any) {
        console.error('Erro ao buscar cautelia:', err);
        setError('Ocorreu um erro ao carregar os dados.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAudit();
  }, [id]);

  const updateItemStatus = (idx: number, newStatus: string) => {
    if (!audit || audit.status === 'signed') return;
    
    const newItems = [...(audit.cautelia_audit_items || [])];
    newItems[idx] = { ...newItems[idx], status: newStatus };
    
    setAudit({ ...audit, cautelia_audit_items: newItems });
  };

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas resolution based on display size
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.resetTransform();
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      };
      
      resize();
      window.addEventListener('resize', resize);

      let drawing = false;

      const getPos = (e: any) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
          x: clientX - rect.left,
          y: clientY - rect.top
        };
      };

      const start = (e: any) => {
        if (e.type === 'touchstart') e.preventDefault();
        drawing = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      };

      const stop = (e: any) => {
        if (e.type === 'touchend') e.preventDefault();
        if (drawing) {
          drawing = false;
          ctx.closePath();
          setSignature(canvas.toDataURL());
        }
      };

      const draw = (e: any) => {
        if (!drawing) return;
        if (e.type === 'touchmove') e.preventDefault();
        const pos = getPos(e);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        setHasDrawn(true);
      };

      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mouseup', stop);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseleave', stop);
      
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchend', stop, { passive: false });
      canvas.addEventListener('touchmove', draw, { passive: false });

      return () => {
        window.removeEventListener('resize', resize);
        canvas.removeEventListener('mousedown', start);
        canvas.removeEventListener('mouseup', stop);
        canvas.removeEventListener('mousemove', draw);
        canvas.removeEventListener('mouseleave', stop);
        canvas.removeEventListener('touchstart', start);
        canvas.removeEventListener('touchend', stop);
        canvas.removeEventListener('touchmove', draw);
      };
    }
  }, [audit]);

  const handleSubmit = async () => {
    if (!signature) {
      alert('Por favor, assine para confirmar.');
      return;
    }
    setIsSubmitting(true);
    try {
      // 1. Update the audit items with final statuses if changed
      const auditItems = audit.cautelia_audit_items || [];
      const batchUpdates = auditItems.map((item: any) => 
        supabase
          .from('cautelia_audit_items')
          .update({ status: item.status })
          .eq('id', item.id)
      );
      await Promise.all(batchUpdates);

      // 2. Upload signature to R2 if configured, otherwise use base64
      let finalSignatureUrl = signature;
      try {
        const uploadRes = await fetch('/api/upload-signature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature, auditId: id })
        });
        
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          if (url) finalSignatureUrl = url;
        }
      } catch (uploadErr) {
        console.error('Error uploading to R2, falling back to base64:', uploadErr);
      }

      // 3. Update the audit header (foto e obs já foram salvas pelo operador ao criar a cautela)
      const { error: updateErr } = await supabase
        .from('cautelia_audits')
        .update({
          status: 'signed',
          signature_url: finalSignatureUrl,
          check_date: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateErr) throw updateErr;

      // 3. Sync history items to current states
      const syncPromises = auditItems.map(async (item: any) => {
        if (item.tool_id) {
          return supabase.from('cautelia_reports').upsert({
            user_id: audit.user_id,
            tool_id: item.tool_id,
            status: item.status || 'ok',
            last_check: new Date().toISOString()
          }, { onConflict: 'user_id, tool_id' });
        } else if (item.stock_tool_id) {
          if (audit.type === 'caution' || audit.type === 'loan') {
            const { data: currentTool } = await supabase.from('tools')
              .select('id, borrowed_quantity, cautela_quantity, quantity_available')
              .eq('id', item.stock_tool_id)
              .maybeSingle();
            
            if (currentTool) {
               const qty = item.quantity || 1;
               const updateFields: any = {
                 quantity_available: Math.max(0, (currentTool.quantity_available || 0) - qty)
               };
               if (audit.type === 'loan') {
                  updateFields.borrowed_quantity = (currentTool.borrowed_quantity || 0) + qty;
               } else {
                  updateFields.cautela_quantity = (currentTool.cautela_quantity || 0) + qty;
               }
               await supabase.from('tools').update(updateFields).eq('id', item.stock_tool_id);
            }
          }

          return supabase.from('cautelas').upsert({
            user_id: audit.user_id,
            tool_id: item.stock_tool_id,
            status: item.status || 'ok',
            type: audit.type === 'loan' ? 'loan' : 'caution',
            last_check: new Date().toISOString()
          }, { onConflict: 'user_id, tool_id' });
        }
        return Promise.resolve();
      });
      await Promise.all(syncPromises);

      // 4. Update transactions status
      const toolIds = auditItems.map((item: any) => item.stock_tool_id).filter(Boolean);
      if (toolIds.length > 0) {
        await supabase
          .from('transactions')
          .update({ 
            status: 'active',
            obs: `Assinatura confirmada em ${new Date().toLocaleString('pt-BR')}`
          })
          .eq('user_id', audit.user_id)
          .in('tool_id', toolIds)
          .eq('status', 'pending_signature');
      }

      confetti();
      setAudit({ ...audit, status: 'signed', signature_url: signature });
    } catch (err) {
      console.error(err);
      alert('Erro ao confirmar assinatura.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!audit) return;
    try {
      const fileName = `Comprovante_${audit.users_access?.name?.replace(/\s+/g, '_') || 'assinatura'}.pdf`;
      await exportToPDF('printable-receipt-content', fileName);
    } catch (err) {
      console.error('Falha ao gerar PDF:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
           <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
           <p className="text-xs font-black uppercase text-slate-400 tracking-widest italic">Sincronizando cautelia...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 sm:p-8 font-sans">
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
            display: block !important;
            z-index: 99999;
            background: white;
          }
          @page {
            margin: 0;
          }
        }
      `}</style>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100"
      >
        <div className="bg-white p-8 text-slate-900 relative border-b border-slate-100 print:hidden">
          <div className="flex items-center justify-between mb-8">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-100">
              <FileCheck size={28} className="text-white" />
            </div>
            <div className="">
               <div className="relative h-10 w-32">
                  <Image 
                   src="https://apreflorestas.com.br/wp-content/uploads/2017/05/tracbel-2-1980x708.png"
                   alt="Tracbel"
                   fill
                   className="object-contain"
                   unoptimized
                   referrerPolicy="no-referrer"
                  />
               </div>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-black italic uppercase tracking-tighter leading-none">
                Assinatura Digital
              </h1>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-3">
                Controle de estoque Ferramentas
              </p>
            </div>
            {audit?.type && (
               <div className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm ${audit.type === 'caution' ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white'}`}>
                  {audit.type === 'caution' ? 'Cautela' : 'Empréstimo'}
               </div>
            )}
          </div>
        </div>

        <div className="p-8 space-y-8">
          {error && audit?.status !== 'signed' ? (
            <div className="text-center py-10 space-y-4">
               <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                 <AlertTriangle size={32} />
               </div>
               <p className="text-sm font-black text-slate-800 uppercase italic leading-tight">{error}</p>
            </div>
          ) : audit?.status === 'signed' ? (
            <div className="text-center py-10 space-y-6">
               <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                 <CheckCircle2 size={40} />
               </div>
               <div>
                  <h2 className="text-xl font-black italic uppercase text-slate-900">Assinatura Efetuada!</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-widest">A cautelia foi confirmada com sucesso.</p>
               </div>
               
               {audit.signature_url && (
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center gap-2 mb-6">
                    <p className="text-[8px] font-black text-slate-400 uppercase">Sua Assinatura:</p>
                    <Image src={audit.signature_url} alt="Assinatura" width={200} height={64} className="h-16 object-contain" />
                 </div>
               )}

               <button 
                onClick={handleDownloadPDF}
                className="w-full bg-indigo-600 text-white font-black italic py-4 rounded-[2rem] shadow-2xl flex items-center justify-center gap-4 text-xs hover:bg-indigo-700 transition-all uppercase tracking-widest print:hidden"
               >
                 Gerar Comprovante (PDF)
                 <Download size={18} />
               </button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Responsável</h3>
                   <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[9px] font-black uppercase border border-amber-100 shadow-sm">Aguardando Assinatura</span>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4 border border-slate-100">
                   <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-slate-400 border border-slate-200">
                      <Image 
                        src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(audit.users_access?.name || 'User')}`}
                        alt="User"
                        width={40}
                        height={40}
                        unoptimized
                        className="rounded-xl"
                      />
                   </div>
                   <div>
                      <p className="text-sm font-black text-slate-800 uppercase italic leading-none">{audit.users_access?.name || audit.user_id}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">Matrícula: {audit.user_id}</p>
                   </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumo dos Itens</h3>
                <div className="grid gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {(audit.cautelia_audit_items || []).map((item: any, idx: number) => (
                    <div key={idx} className="flex flex-col p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-colors">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 bg-white rounded-2xl border border-slate-100 relative overflow-hidden flex-shrink-0 shadow-sm">
                          {item.tools?.image_url ? (
                            <Image 
                              src={item.tools.image_url} 
                              alt={item.tools?.name || 'Item'} 
                              fill 
                              className="object-cover"
                              unoptimized
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-200">
                               <Package size={24} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              {item.tool_id ? (
                                <div className="w-6 h-6 bg-indigo-50 text-indigo-500 rounded-lg flex items-center justify-center">
                                  <Zap size={10} />
                                </div>
                              ) : (
                                <div className="w-6 h-6 bg-emerald-50 text-emerald-500 rounded-lg flex items-center justify-center">
                                  <Package size={10} />
                                </div>
                              )}
                              <p className="text-[11px] font-black text-slate-700 uppercase italic">
                                {item.cautelia_standard_tools?.name || item.tools?.name || 'Ferramenta'}
                              </p>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${item.status === 'ok' ? 'bg-emerald-100 text-emerald-600' : item.status === 'missing' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                              {item.status === 'ok' ? 'OK' : item.status === 'missing' ? 'AUSENTE' : 'AVARIADO'}
                            </span>
                          </div>
                          {item.quantity > 1 && (
                             <p className="text-[9px] font-bold text-slate-400 uppercase">Qtd: {item.quantity}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        {['ok', 'missing', 'damaged'].map((st) => (
                          <button
                            key={st}
                            onClick={() => updateItemStatus(idx, st)}
                            className={`flex-1 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${
                              item.status === st 
                                ? (st === 'ok' ? 'bg-emerald-500 text-white shadow-lg' : st === 'missing' ? 'bg-rose-500 text-white shadow-lg' : 'bg-amber-500 text-white shadow-lg') 
                                : 'bg-white text-slate-400 border border-slate-100 hover:border-slate-200'
                            }`}
                          >
                            {st === 'ok' ? 'OK' : st === 'missing' ? 'AUSENTE' : 'AVARIADO'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="relative p-6 bg-slate-50 rounded-[2rem] border-2 border-slate-100 overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                  <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-3 italic flex items-center gap-2">
                    <FileCheck size={14} className="text-indigo-500" />
                    Termo de Responsabilidade e Compromisso
                  </h4>
                  <p className="text-[10px] text-slate-600 leading-relaxed font-bold uppercase text-justify">
                    Pelo presente termo, declaro que recebi os equipamentos e ferramentas acima relacionados em perfeitas condições de conservação e funcionamento. Assumo total responsabilidade pela guarda, zelo e uso exclusivo em atividades profissionais da empresa.
                  </p>
                  <p className="text-[10px] text-slate-600 leading-relaxed font-bold uppercase text-justify mt-3">
                    Comprometo-me a comunicar imediatamente qualquer ocorrência, dano ou extravio, sob pena de responsabilidade administrativa e civil, autorizando desde já, conforme o Art. 462 § 1º da CLT, o desconto do valor correspondente em caso de negligência ou mau uso.
                  </p>
                </div>
              </div>

              {/* Foto da ferramenta registrada pelo operador — somente leitura */}
              {audit?.tool_photo_url && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Foto das Ferramentas</h3>
                  <div className="rounded-3xl overflow-hidden border-2 border-slate-100">
                    <img
                      src={audit.tool_photo_url}
                      alt="Foto das ferramentas"
                      className="w-full object-cover"
                    />
                  </div>
                </div>
              )}

              {/* Observação registrada pelo operador — somente leitura */}
              {audit?.obs && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observação</h3>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[11px] font-bold text-slate-600 leading-relaxed">{audit.obs}</p>
                  </div>
                </div>
              )}

              <div className="space-y-4 pt-4">
                <div className="text-center">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">ASSINE NO QUADRO ABAIXO</h3>
                </div>
                <div className="bg-slate-50 rounded-3xl border-2 border-slate-200 h-48 relative overflow-hidden group">
                   <canvas 
                    ref={canvasRef} 
                    width={500} 
                    height={200} 
                    className="w-full h-full cursor-crosshair touch-none"
                   />
                   <button 
                    onClick={() => {
                      const ctx = canvasRef.current?.getContext('2d');
                      ctx?.clearRect(0,0, canvasRef.current!.width, canvasRef.current!.height);
                      setSignature(null);
                      setHasDrawn(false);
                    }}
                    className="absolute bottom-4 right-4 text-[8px] font-black text-slate-300 hover:text-rose-500 uppercase tracking-widest"
                   >
                     Limpar
                   </button>
                   {!hasDrawn && (
                     <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                        <SignatureIcon size={40} className="text-slate-400" />
                     </div>
                   )}
                </div>

                <button 
                  onClick={handleSubmit}
                  disabled={isSubmitting || !hasDrawn}
                  className="w-full bg-slate-900 text-white font-black italic py-5 rounded-[2rem] shadow-2xl flex items-center justify-center gap-4 text-sm active:scale-95 transition-all disabled:opacity-50 uppercase tracking-widest"
                >
                  {isSubmitting ? 'ENVIANDO...' : 'CONFIRMAR RECEBIMENTO'}
                  <CheckCircle2 size={20} />
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
      
      <div className="mt-8 text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] flex items-center gap-4 print:hidden">
         <span>SEGURANÇA</span>
         <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
         <span>RASTREABILIDADE</span>
         <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
         <span>FERRAMENTARIA</span>
      </div>

      {audit?.status === 'signed' && (
        <div id="printable-receipt-content" className="hidden print:block printable-receipt fixed inset-0 z-[99999] bg-white overflow-y-auto">
          <div className="p-10 bg-white min-h-screen text-slate-900 border-[10px] border-slate-900">
            <div className="p-8 font-sans">
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
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Protocolo: #{id.substring(0, 8).toUpperCase()}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-10 mb-10 border-b-2 border-slate-100 pb-10">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Colaborador</p>
                  <p className="text-xl font-black uppercase italic">{audit.users_access?.name || 'Não identificado'}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Matrícula: {audit.user_id}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Data e Hora</p>
                  <p className="text-xl font-black uppercase italic">
                    {audit.check_date ? format(new Date(audit.check_date), "dd/MM/yyyy HH:mm", { locale: ptBR }) : format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </p>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${audit.type === 'caution' ? 'text-amber-600' : 'text-indigo-600'}`}>
                    Tipo: {audit.type === 'caution' ? 'Cautela' : 'Empréstimo'}
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
                    {audit.cautelia_audit_items?.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td className="py-3 text-[10px] font-bold uppercase">{item.tools?.code || '-'}</td>
                        <td className="py-3 text-[10px] font-black uppercase italic">{item.cautelia_standard_tools?.name || item.tools?.name || 'Ferramenta'}</td>
                        <td className="py-3 text-[10px] font-black text-right">{item.quantity || 1}</td>
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
                {audit.obs && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Observação</p>
                    <p className="text-[9px] font-bold text-slate-600 leading-relaxed">{audit.obs}</p>
                  </div>
                )}
              </div>

              {/* Foto das ferramentas no comprovante */}
              {audit.tool_photo_url && (
                <div className="mb-10">
                  <p className="text-[11px] font-black uppercase tracking-widest mb-4 italic">Registro Fotográfico das Ferramentas</p>
                  <div className="rounded-2xl overflow-hidden border-2 border-slate-200">
                    <img
                      src={audit.tool_photo_url}
                      alt="Foto das ferramentas"
                      style={{ width: '100%', maxHeight: '300px', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-2 text-center">
                    Foto registrada no ato da entrega
                  </p>
                </div>
              )}

              <div className="flex flex-col items-center mt-20">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8">Assinatura Certificada Digitalmente</p>
                <div className="w-full max-w-md h-32 border-b-2 border-slate-900 flex items-center justify-center relative">
                  {audit.signature_url && (
                    <Image 
                      src={audit.signature_url} 
                      alt="Assinatura" 
                      width={400} 
                      height={100} 
                      className="h-24 object-contain" 
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
                <p className="mt-4 text-[11px] font-black uppercase italic tracking-tighter">{audit.users_access?.name || 'Colaborador'}</p>
              </div>

              <div className="mt-20 pt-10 border-t border-slate-100 text-center">
                <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.4em]">
                  Este documento possui validade jurídica interna.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
