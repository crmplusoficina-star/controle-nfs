'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  Paperclip,
  Receipt,
  Share2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { uploadFile } from '@/lib/storage';
import { extractInvoiceData } from '@/lib/ai';

type CaptureKind = 'consumo' | 'ferramenta' | 'volvo';

type Branch = {
  id: string;
  name: string;
  city?: string | null;
};

const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MOBILE_CAPTURE_PATH = '/dashboard/capturar-nf';

function formatAmount(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseAmount(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  return Number.parseFloat(normalized) || 0;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

async function compressCameraImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const source = await fileToDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível processar a foto.'));
    img.src = source;
  });

  const maxDimension = 1800;
  const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = largestSide > maxDimension ? maxDimension / largestSide : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return file;

  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.82);
  });

  if (!blob) return file;

  const baseName = file.name.replace(/\.[^/.]+$/, '') || 'captura_nf';
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

async function prepareMobileFile(file: File) {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf && file.size > MAX_PDF_BYTES) {
    throw new Error('O PDF é maior que 4 MB. No celular, envie uma foto ou um PDF menor.');
  }

  return file.type.startsWith('image/') ? compressCameraImage(file) : file;
}

export default function MobileNFCapturePage() {
  const { user } = useAuth();
  const router = useRouter();
  const invoiceCameraRef = useRef<HTMLInputElement>(null);
  const invoiceFileRef = useRef<HTMLInputElement>(null);
  const boletoCameraRef = useRef<HTMLInputElement>(null);
  const boletoFileRef = useRef<HTMLInputElement>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [boletoFiles, setBoletoFiles] = useState<File[]>([]);
  const [captureKind, setCaptureKind] = useState<CaptureKind>('consumo');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [amount, setAmount] = useState('');
  const [branchId, setBranchId] = useState('');
  const [obs, setObs] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [readMessage, setReadMessage] = useState('');
  const [linkFeedback, setLinkFeedback] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const loadBranches = async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, city')
        .order('name');

      if (error) {
        setErrorMessage('Não foi possível carregar as filiais.');
        return;
      }

      const nextBranches = (data || []) as Branch[];
      setBranches(nextBranches);

      if (user.role === 'Operador' && user.branch_id) {
        setBranchId(user.branch_id);
      } else if (nextBranches.length > 0) {
        setBranchId((current) => current || nextBranches[0].id);
      }
    };

    void loadBranches();
  }, [user]);

  const captureUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${MOBILE_CAPTURE_PATH}`
    : MOBILE_CAPTURE_PATH;

  const copyCaptureLink = async () => {
    try {
      await navigator.clipboard.writeText(captureUrl);
      setLinkFeedback('Link copiado. Envie para o celular.');
    } catch {
      setLinkFeedback(captureUrl);
    }
  };

  const shareCaptureLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Capturar NF pelo celular',
          text: 'Abra este link no celular para fotografar a NF e anexar o boleto.',
          url: captureUrl,
        });
        return;
      } catch {
        // O usuário pode cancelar o compartilhamento. Mantemos o fallback abaixo.
      }
    }

    await copyCaptureLink();
  };

  const readInvoice = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setReadMessage('Arquivo anexado. A leitura automática pelo celular funciona melhor com foto da NF.');
      return;
    }

    setIsReading(true);
    setReadMessage('');
    try {
      const image = await fileToDataUrl(file);
      const extracted = await extractInvoiceData({ image });

      if (extracted.supplierName) setSupplier(extracted.supplierName);
      if (extracted.invoiceNumber) setInvoiceNumber(extracted.invoiceNumber);
      if (extracted.date) setInvoiceDate(extracted.date);
      if (extracted.amount !== null && extracted.amount !== undefined) {
        setAmount(formatAmount(extracted.amount));
      }
      if (extracted.isTool && captureKind === 'consumo') {
        setCaptureKind('ferramenta');
      }

      setReadMessage('AXEL leu a foto. Confira os dados antes de enviar.');
    } catch (error: any) {
      console.error('Erro ao ler NF no celular:', error);
      setReadMessage('Não consegui ler todos os dados automaticamente. Preencha os campos abaixo e envie normalmente.');
    } finally {
      setIsReading(false);
    }
  };

  const handleInvoiceSelection = async (file?: File) => {
    if (!file) return;

    setErrorMessage('');
    setReadMessage('');
    try {
      const prepared = await prepareMobileFile(file);
      setInvoiceFile(prepared);
      await readInvoice(prepared);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Não foi possível preparar o arquivo da NF.');
    }
  };

  const handleBoletoSelection = async (files: FileList | null) => {
    if (!files?.length) return;

    setErrorMessage('');
    try {
      const prepared = await Promise.all(Array.from(files).map((file) => prepareMobileFile(file)));
      setBoletoFiles((current) => [...current, ...prepared]);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Não foi possível preparar o boleto.');
    }
  };

  const resetCapture = () => {
    setInvoiceFile(null);
    setBoletoFiles([]);
    setCaptureKind('consumo');
    setSupplier('');
    setInvoiceNumber('');
    setInvoiceDate('');
    setAmount('');
    setObs('');
    setReadMessage('');
    setErrorMessage('');
    setSavedId(null);
    if (user?.role === 'Operador') setBranchId(user.branch_id || '');
  };

  const submitCapture = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');

    if (!user) {
      setErrorMessage('Sua sessão não foi encontrada. Entre novamente no sistema.');
      return;
    }
    if (!invoiceFile) {
      setErrorMessage('Fotografe ou anexe a Nota Fiscal antes de enviar.');
      return;
    }
    if (!branchId) {
      setErrorMessage('Selecione a filial.');
      return;
    }
    if (!supplier.trim()) {
      setErrorMessage('Informe o fornecedor.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (invoiceNumber.trim()) {
        const { data: duplicate, error: duplicateError } = await supabase
          .from('nfs')
          .select('id')
          .eq('invoice_number', invoiceNumber.trim())
          .eq('supplier', supplier.trim())
          .limit(1);

        if (duplicateError) throw duplicateError;
        if (duplicate && duplicate.length > 0) {
          throw new Error(`Já existe uma NF ${invoiceNumber.trim()} desse fornecedor no Controle de NFs.`);
        }
      }

      const invoiceUrl = await uploadFile(invoiceFile, 'nfs');
      if (!invoiceUrl) throw new Error('Não foi possível enviar o arquivo da NF.');

      const boletoUrls = boletoFiles.length > 0
        ? (await Promise.all(boletoFiles.map((file) => uploadFile(file, 'nfs')))).filter(Boolean) as string[]
        : [];

      const isVolvo = captureKind === 'volvo';
      const databaseType = isVolvo ? 'ferramenta' : captureKind;
      const payload = {
        supplier: supplier.trim(),
        date: invoiceDate || null,
        invoice_number: invoiceNumber.trim() || null,
        amount: amount ? parseAmount(amount) : 0,
        payment_date: null,
        order_number: null,
        status: 'rc_created',
        obs: obs.trim()
          ? `[Captura pelo celular] ${obs.trim()}`
          : '[Captura pelo celular]',
        file_url: invoiceUrl,
        boleto_url: boletoUrls[0] || null,
        boleto_urls: boletoUrls,
        is_tool: databaseType === 'ferramenta',
        type: databaseType,
        responsible_registration: user.registration,
        quantity: 1,
        branch_id: branchId,
        ticket_number: null,
        is_volvo: isVolvo,
      };

      const { data: inserted, error } = await supabase
        .from('nfs')
        .insert([payload])
        .select('id')
        .single();

      if (error) throw error;
      setSavedId(inserted?.id || 'ok');
    } catch (error: any) {
      console.error('Erro no envio mobile:', error);
      setErrorMessage(error?.message || 'Não foi possível enviar a NF.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (savedId) {
    return (
      <div className="min-h-full bg-slate-50 p-4 sm:p-8 flex items-start justify-center">
        <section className="w-full max-w-xl bg-white rounded-[2rem] border border-emerald-100 shadow-xl p-7 sm:p-10 text-center mt-4 sm:mt-10">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6">
            <CheckCircle2 size={40} strokeWidth={2.5} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-600 mb-2">Enviado com sucesso</p>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">NF salva no Controle</h1>
          <p className="text-sm text-slate-500 mt-3">
            A nota e os boletos já foram anexados e o registro está em <strong>Pendências</strong> para continuidade do processo.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8">
            <button
              type="button"
              onClick={resetCapture}
              className="rounded-2xl border-2 border-slate-200 px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition"
            >
              Enviar outra NF
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/nfs?tab=pending')}
              className="rounded-2xl bg-slate-950 px-5 py-4 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800 transition"
            >
              Abrir Controle de NFs
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-3 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard/nfs"
              className="shrink-0 w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 flex items-center justify-center shadow-sm"
              aria-label="Voltar para Controle de NFs"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Captura pelo celular</p>
              <h1 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tight truncate">Escanear NF e boleto</h1>
            </div>
          </div>
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200 shrink-0">
            <Camera size={23} />
          </div>
        </div>

        <section className="bg-slate-950 text-white rounded-[1.75rem] p-5 sm:p-6 shadow-xl overflow-hidden relative">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300">Link para abrir no telefone</p>
              <p className="mt-2 text-sm font-bold break-all text-white/90">{captureUrl}</p>
              {linkFeedback && <p className="text-[10px] mt-2 text-emerald-300 font-bold">{linkFeedback}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={copyCaptureLink}
                className="flex-1 sm:flex-none px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Copy size={15} /> Copiar
              </button>
              <button
                type="button"
                onClick={shareCaptureLink}
                className="flex-1 sm:flex-none px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Share2 size={15} /> Enviar link
              </button>
            </div>
          </div>
        </section>

        <form onSubmit={submitCapture} className="space-y-5">
          <section className="bg-white rounded-[1.75rem] border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-600">1. Nota Fiscal</p>
                <h2 className="text-lg font-black text-slate-900">Fotografe a NF</h2>
              </div>
              {isReading && (
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-indigo-600">
                  <Loader2 size={15} className="animate-spin" /> AXEL lendo
                </div>
              )}
            </div>

            <input
              ref={invoiceCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                void handleInvoiceSelection(event.target.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
            <input
              ref={invoiceFileRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              className="hidden"
              onChange={(event) => {
                void handleInvoiceSelection(event.target.files?.[0]);
                event.currentTarget.value = '';
              }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => invoiceCameraRef.current?.click()}
                className="rounded-2xl bg-blue-600 hover:bg-blue-500 text-white p-5 flex items-center justify-center gap-3 font-black uppercase tracking-widest text-xs transition active:scale-[0.99]"
              >
                <Camera size={22} /> Abrir câmera
              </button>
              <button
                type="button"
                onClick={() => invoiceFileRef.current?.click()}
                className="rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 p-5 flex items-center justify-center gap-3 font-black uppercase tracking-widest text-xs transition"
              >
                <Upload size={21} /> Anexar arquivo
              </button>
            </div>

            {invoiceFile && (
              <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-100 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <FileText size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-800 truncate">{invoiceFile.name}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 mt-1">NF pronta para envio</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceFile(null);
                    setReadMessage('');
                  }}
                  className="p-2 text-slate-400 hover:text-rose-500"
                  aria-label="Remover NF"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            )}

            {readMessage && (
              <div className="mt-4 rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 text-xs text-indigo-700 font-semibold flex items-start gap-2">
                <Sparkles size={16} className="shrink-0 mt-0.5" />
                <span>{readMessage}</span>
              </div>
            )}
          </section>

          <section className="bg-white rounded-[1.75rem] border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="mb-5">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-600">2. Boleto</p>
              <h2 className="text-lg font-black text-slate-900">Fotografe ou anexe o boleto</h2>
              <p className="text-xs text-slate-400 mt-1">Opcional. Você pode anexar mais de um.</p>
            </div>

            <input
              ref={boletoCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                void handleBoletoSelection(event.target.files);
                event.currentTarget.value = '';
              }}
            />
            <input
              ref={boletoFileRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleBoletoSelection(event.target.files);
                event.currentTarget.value = '';
              }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => boletoCameraRef.current?.click()}
                className="rounded-2xl bg-amber-500 hover:bg-amber-400 text-white p-4 flex items-center justify-center gap-3 font-black uppercase tracking-widest text-xs transition"
              >
                <Camera size={20} /> Foto do boleto
              </button>
              <button
                type="button"
                onClick={() => boletoFileRef.current?.click()}
                className="rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 p-4 flex items-center justify-center gap-3 font-black uppercase tracking-widest text-xs transition"
              >
                <Paperclip size={20} /> Anexar boleto
              </button>
            </div>

            {boletoFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {boletoFiles.map((file, index) => (
                  <div key={`${file.name}-${file.lastModified}-${index}`} className="rounded-xl border border-slate-200 px-3 py-3 flex items-center gap-3">
                    <Receipt size={17} className="text-amber-500 shrink-0" />
                    <span className="text-xs font-bold text-slate-600 truncate flex-1">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setBoletoFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      className="p-1.5 text-slate-400 hover:text-rose-500"
                      aria-label="Remover boleto"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white rounded-[1.75rem] border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="mb-5">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">3. Conferência</p>
              <h2 className="text-lg font-black text-slate-900">Confira os dados</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Tipo</span>
                <select
                  value={captureKind}
                  onChange={(event) => {
                    const nextKind = event.target.value as CaptureKind;
                    setCaptureKind(nextKind);
                    if (nextKind === 'volvo' && !supplier.trim()) {
                      setSupplier('VOLVO DO BRASIL VEICULOS LTDA');
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="consumo">Geral / Consumo</option>
                  <option value="ferramenta">Ferramenta</option>
                  <option value="volvo">Logística Volvo</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Filial</span>
                {user?.role === 'Operador' ? (
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">
                    {branches.find((branch) => branch.id === branchId)?.name || 'Sua filial'}
                  </div>
                ) : (
                  <select
                    value={branchId}
                    onChange={(event) => setBranchId(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                )}
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Fornecedor *</span>
                <input
                  value={supplier}
                  onChange={(event) => setSupplier(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nome do fornecedor"
                />
              </label>

              <label className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Número da NF</span>
                <input
                  value={invoiceNumber}
                  onChange={(event) => setInvoiceNumber(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex.: 123456"
                />
              </label>

              <label className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Data da NF</span>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(event) => setInvoiceDate(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Valor da NF</span>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">R$</span>
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0,00"
                  />
                </div>
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Observação</span>
                <textarea
                  value={obs}
                  onChange={(event) => setObs(event.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Opcional"
                />
              </label>
            </div>
          </section>

          {errorMessage && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isReading}
            className="w-full rounded-2xl bg-slate-950 hover:bg-slate-800 disabled:bg-slate-400 text-white py-5 px-5 font-black uppercase tracking-[0.14em] text-xs flex items-center justify-center gap-3 shadow-xl transition active:scale-[0.99]"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={20} className="animate-spin" /> Enviando NF e boleto...
              </>
            ) : (
              <>
                <CheckCircle2 size={20} /> Enviar para Controle de NFs
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
