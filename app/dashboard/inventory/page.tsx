'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Copy,
  Database,
  Images,
  Link2,
  Loader2,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { uploadFile } from '@/lib/storage';

type Branch = {
  id: string;
  name: string;
  city?: string | null;
};

type CatalogTool = {
  id: string;
  name: string;
  code: string;
  brand?: string | null;
  branch?: string | null;
  branch_id?: string | null;
  location?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
};

type InventoryPhoto = {
  id: string;
  file: File;
  preview: string;
};

type RateInfo = {
  remainingRequests?: string | null;
  resetRequests?: string | null;
  remainingTokens?: string | null;
  resetTokens?: string | null;
  retryAfter?: string | null;
};

type Candidate = {
  tempId: string;
  name: string;
  code: string;
  brand: string;
  quantity: number;
  location: string;
  confidence: number | null;
  matchedCatalog: boolean;
  existingInBranch: boolean;
};

type AiItem = {
  name?: string;
  code?: string | null;
  brand?: string | null;
  quantity?: number | null;
  location?: string | null;
  confidence?: number | null;
  catalogCode?: string | null;
};

const MAX_IMAGES_PER_REQUEST = 5;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function normalize(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeCode(value: string | null | undefined) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function tempId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function generateCode() {
  const random = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `GEN-${random}`;
}

async function compressImage(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = source;
  });

  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  let width = Math.max(1, Math.round(image.width * scale));
  let height = Math.max(1, Math.round(image.height * scale));
  let quality = 0.74;

  const render = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return source;
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  };

  let result = render();
  while (result.length > 650_000 && quality > 0.42) {
    quality -= 0.08;
    result = render();
  }

  if (result.length > 650_000) {
    width = Math.max(1, Math.round(width * 0.75));
    height = Math.max(1, Math.round(height * 0.75));
    result = render();
  }

  return result;
}

export default function InventoryPage() {
  const { user: currentUser } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [catalog, setCatalog] = useState<CatalogTool[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [photos, setPhotos] = useState<InventoryPhoto[]>([]);
  const [location, setLocation] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [rateInfo, setRateInfo] = useState<RateInfo | null>(null);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const allowedBranches = useMemo(() => {
    if (currentUser?.role === 'Operador' && currentUser?.branch_id) {
      return branches.filter(branch => branch.id === currentUser.branch_id);
    }
    return branches;
  }, [branches, currentUser]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const [{ data: branchData, error: branchError }, { data: toolData, error: toolError }] = await Promise.all([
        supabase.from('branches').select('id,name,city').order('name'),
        supabase
          .from('tools')
          .select('id,name,code,brand,branch,branch_id,location,image_url,image_urls')
          .order('name'),
      ]);

      if (branchError) console.error('Erro ao carregar filiais:', branchError);
      if (toolError) console.error('Erro ao carregar catálogo:', toolError);
      setBranches((branchData || []) as Branch[]);
      setCatalog((toolData || []) as CatalogTool[]);
      setIsLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (selectedBranch || allowedBranches.length === 0 || typeof window === 'undefined') return;
    const branchId = new URLSearchParams(window.location.search).get('branch');
    if (!branchId) return;
    const branch = allowedBranches.find(item => item.id === branchId);
    if (branch) setSelectedBranch(branch);
  }, [allowedBranches, selectedBranch]);

  useEffect(() => {
    return () => {
      photos.forEach(photo => URL.revokeObjectURL(photo.preview));
    };
  }, [photos]);

  const openBranch = (branch: Branch) => {
    setSelectedBranch(branch);
    setCandidates([]);
    setPhotos([]);
    setLocation('');
    setResult(null);
    setAnalysisError('');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('branch', branch.id);
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
  };

  const backToBranches = () => {
    photos.forEach(photo => URL.revokeObjectURL(photo.preview));
    setSelectedBranch(null);
    setPhotos([]);
    setCandidates([]);
    setLocation('');
    setResult(null);
    setAnalysisError('');
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const copyBranchLink = async (branch: Branch) => {
    if (typeof window === 'undefined') return;
    const url = new URL('/dashboard/inventory', window.location.origin);
    url.searchParams.set('branch', branch.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopyFeedback(branch.id);
      setTimeout(() => setCopyFeedback(''), 1800);
    } catch {
      window.prompt('Copie o link da filial:', url.toString());
    }
  };

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const incoming = Array.from(fileList).filter(file => file.type.startsWith('image/'));
    if (incoming.length === 0) return;
    setPhotos(prev => [
      ...prev,
      ...incoming.map(file => ({ id: tempId(), file, preview: URL.createObjectURL(file) })),
    ]);
    setCandidates([]);
    setResult(null);
    setAnalysisError('');
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const target = prev.find(photo => photo.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter(photo => photo.id !== id);
    });
    setCandidates([]);
  };

  const catalogMatch = (item: AiItem) => {
    const requestedCode = normalizeCode(item.catalogCode || item.code);
    if (requestedCode) {
      const byCode = catalog.filter(tool => normalizeCode(tool.code) === requestedCode);
      if (byCode.length > 0) return byCode[0];
    }

    const requestedName = normalize(item.name);
    if (!requestedName) return null;
    const byName = catalog.filter(tool => normalize(tool.name) === requestedName);
    const uniqueCodes = Array.from(new Set(byName.map(tool => normalizeCode(tool.code)).filter(Boolean)));
    if (byName.length > 0 && uniqueCodes.length === 1) return byName[0];
    return null;
  };

  const mergeAiResults = (items: AiItem[]) => {
    const merged = new Map<string, Candidate>();

    for (const item of items) {
      const match = catalogMatch(item);
      const canonicalName = match?.name || String(item.name || '').trim();
      const canonicalCode = match?.code || String(item.code || '').trim();
      if (!canonicalName) continue;

      const key = canonicalCode
        ? `code:${normalizeCode(canonicalCode)}`
        : `name:${normalize(canonicalName)}`;
      const existingInBranch = Boolean(
        canonicalCode && catalog.some(tool =>
          tool.branch_id === selectedBranch?.id && normalizeCode(tool.code) === normalizeCode(canonicalCode)
        )
      );

      const next: Candidate = {
        tempId: tempId(),
        name: canonicalName,
        code: canonicalCode,
        brand: String(item.brand || match?.brand || '').trim(),
        quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
        location: String(item.location || location || '').trim(),
        confidence: typeof item.confidence === 'number' ? item.confidence : null,
        matchedCatalog: Boolean(match),
        existingInBranch,
      };

      const previous = merged.get(key);
      if (!previous) {
        merged.set(key, next);
      } else {
        merged.set(key, {
          ...previous,
          brand: previous.brand || next.brand,
          quantity: Math.max(previous.quantity, next.quantity),
          confidence: Math.max(previous.confidence || 0, next.confidence || 0),
          matchedCatalog: previous.matchedCatalog || next.matchedCatalog,
          existingInBranch: previous.existingInBranch || next.existingInBranch,
        });
      }
    }

    return Array.from(merged.values());
  };

  const analyzePhotos = async () => {
    if (!selectedBranch) return;
    if (!location.trim()) {
      setAnalysisError('Informe a locação antes de analisar as fotos. Ex.: A1, A2, P1.');
      return;
    }
    if (photos.length === 0) {
      setAnalysisError('Adicione pelo menos uma foto.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError('');
    setRateInfo(null);

    try {
      const compressed = await Promise.all(photos.map(photo => compressImage(photo.file)));
      const batches: string[][] = [];
      for (let i = 0; i < compressed.length; i += MAX_IMAGES_PER_REQUEST) {
        batches.push(compressed.slice(i, i + MAX_IMAGES_PER_REQUEST));
      }

      const catalogForAi = catalog.map(tool => ({
        name: tool.name,
        code: tool.code,
        brand: tool.brand || null,
      }));
      const found: AiItem[] = [];
      let partialError = '';

      for (let i = 0; i < batches.length; i++) {
        const response = await fetch('/api/ai/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: batches[i],
            locationHint: location.trim(),
            catalog: catalogForAi,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (data?.rateLimit) setRateInfo(data.rateLimit);

        if (!response.ok) {
          const message = data?.details || data?.error || 'Falha na análise das fotos.';
          partialError = response.status === 429
            ? `Limite temporário do Groq atingido. ${data?.rateLimit?.retryAfter ? `Tente novamente em cerca de ${data.rateLimit.retryAfter}s.` : ''}`
            : message;
          break;
        }

        if (Array.isArray(data?.items)) found.push(...data.items);
        if (i < batches.length - 1) await sleep(900);
      }

      const merged = mergeAiResults(found);
      if (merged.length === 0) {
        merged.push({
          tempId: tempId(),
          name: '',
          code: '',
          brand: '',
          quantity: 1,
          location: location.trim(),
          confidence: null,
          matchedCatalog: false,
          existingInBranch: false,
        });
      }
      setCandidates(merged);
      if (partialError) setAnalysisError(`${partialError} O que já foi identificado ficou preservado para edição manual.`);
    } catch (error) {
      console.error(error);
      setAnalysisError('Não foi possível analisar as fotos. Você ainda pode preencher os itens manualmente abaixo.');
      setCandidates(prev => prev.length > 0 ? prev : [{
        tempId: tempId(),
        name: '',
        code: '',
        brand: '',
        quantity: 1,
        location: location.trim(),
        confidence: null,
        matchedCatalog: false,
        existingInBranch: false,
      }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addManualCandidate = () => {
    setCandidates(prev => [...prev, {
      tempId: tempId(),
      name: '',
      code: '',
      brand: '',
      quantity: 1,
      location: location.trim(),
      confidence: null,
      matchedCatalog: false,
      existingInBranch: false,
    }]);
  };

  const updateCandidate = (id: string, patch: Partial<Candidate>) => {
    setCandidates(prev => prev.map(item => item.tempId === id ? { ...item, ...patch } : item));
  };

  const removeCandidate = (id: string) => {
    setCandidates(prev => prev.filter(item => item.tempId !== id));
  };

  const resolveCodeForCandidate = (candidate: Candidate) => {
    if (candidate.code.trim()) return { name: candidate.name.trim(), code: candidate.code.trim() };

    const matches = catalog.filter(tool => normalize(tool.name) === normalize(candidate.name));
    const codes = Array.from(new Set(matches.map(tool => tool.code.trim()).filter(Boolean)));
    if (matches.length > 0 && codes.length === 1) {
      return { name: matches[0].name, code: codes[0] };
    }
    return { name: candidate.name.trim(), code: generateCode() };
  };

  const saveInventory = async () => {
    if (!selectedBranch || !currentUser) return;
    const validCandidates = candidates.filter(item => item.name.trim());
    if (validCandidates.length === 0) {
      setAnalysisError('Informe o nome de pelo menos uma ferramenta.');
      return;
    }

    setIsSaving(true);
    setAnalysisError('');
    try {
      const uploaded = await Promise.all(
        photos.map(photo => uploadFile(photo.file, 'ferramentas/inventario'))
      );
      const uploadedUrls = uploaded.filter((url): url is string => Boolean(url));
      let created = 0;
      let updated = 0;

      for (const candidate of validCandidates) {
        const resolved = resolveCodeForCandidate(candidate);
        const quantity = Math.max(1, Math.round(Number(candidate.quantity) || 1));

        const { data: existing, error: existingError } = await supabase
          .from('tools')
          .select('*')
          .eq('branch_id', selectedBranch.id)
          .eq('code', resolved.code)
          .maybeSingle();
        if (existingError) throw existingError;

        if (existing) {
          const currentUrls = Array.isArray(existing.image_urls)
            ? existing.image_urls
            : existing.image_url ? [existing.image_url] : [];
          const finalUrls = Array.from(new Set([...currentUrls, ...uploadedUrls]));
          const { error: updateError } = await supabase
            .from('tools')
            .update({
              name: resolved.name,
              brand: candidate.brand.trim() || existing.brand || null,
              quantity_available: quantity,
              location: candidate.location.trim() || null,
              image_url: finalUrls[0] || existing.image_url || null,
              image_urls: finalUrls,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          if (updateError) throw updateError;
          updated += 1;
        } else {
          const { error: insertError } = await supabase.from('tools').insert({
            name: resolved.name,
            code: resolved.code,
            brand: candidate.brand.trim() || null,
            branch: selectedBranch.name,
            branch_id: selectedBranch.id,
            quantity_available: quantity,
            cautela_quantity: 0,
            borrowed_quantity: 0,
            status: 'disponivel',
            location: candidate.location.trim() || null,
            image_url: uploadedUrls[0] || null,
            image_urls: uploadedUrls,
          });
          if (insertError) throw insertError;
          created += 1;
        }
      }

      const { data: refreshed } = await supabase
        .from('tools')
        .select('id,name,code,brand,branch,branch_id,location,image_url,image_urls')
        .order('name');
      if (refreshed) setCatalog(refreshed as CatalogTool[]);
      setResult({ created, updated });
    } catch (error) {
      console.error('Erro ao salvar inventário:', error);
      setAnalysisError(error instanceof Error ? error.message : 'Erro ao salvar inventário.');
    } finally {
      setIsSaving(false);
    }
  };

  const nextLocation = () => {
    photos.forEach(photo => URL.revokeObjectURL(photo.preview));
    setPhotos([]);
    setCandidates([]);
    setLocation('');
    setResult(null);
    setAnalysisError('');
    setRateInfo(null);
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-20 flex items-center justify-center text-indigo-600">
        <Loader2 className="animate-spin mr-3" />
        <span className="font-black uppercase tracking-widest text-xs">Carregando inventário...</span>
      </div>
    );
  }

  if (!selectedBranch) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8 font-sans">
        <header>
          <h1 className="text-3xl font-black italic text-slate-900 uppercase tracking-tighter">Inventariar Ferramentas</h1>
          <p className="text-slate-500 font-bold text-sm mt-2">Cada filial tem seu próprio link. Abra a filial, fotografe a locação e confirme o que foi identificado.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {allowedBranches.map(branch => (
            <div key={branch.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 hover:border-indigo-200 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <MapPin size={24} />
                  </div>
                  <div>
                    <h2 className="font-black text-slate-900 uppercase italic">{branch.name}</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">{branch.city || 'Filial'}</p>
                  </div>
                </div>
                <button
                  onClick={() => copyBranchLink(branch)}
                  className="p-3 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                  title="Copiar link desta filial"
                >
                  {copyFeedback === branch.id ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                </button>
              </div>
              <button
                onClick={() => openBranch(branch)}
                className="w-full mt-5 rounded-2xl bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase tracking-widest text-xs py-4 transition-all flex items-center justify-center gap-2"
              >
                <Link2 size={16} /> Abrir inventário
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-10 font-sans">
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl p-8 md:p-12 text-center">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={42} />
          </div>
          <h1 className="text-3xl font-black italic uppercase text-slate-900">Locação inventariada</h1>
          <p className="text-slate-500 font-bold mt-2">{selectedBranch.name} • {location}</p>
          <div className="grid grid-cols-2 gap-4 mt-8">
            <div className="rounded-2xl bg-emerald-50 p-5">
              <p className="text-3xl font-black text-emerald-700">{result.created}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mt-1">Novas</p>
            </div>
            <div className="rounded-2xl bg-indigo-50 p-5">
              <p className="text-3xl font-black text-indigo-700">{result.updated}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mt-1">Atualizadas</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <button onClick={nextLocation} className="flex-1 py-4 rounded-2xl bg-indigo-600 text-white font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2">
              <RefreshCw size={18} /> Próxima locação
            </button>
            <button onClick={backToBranches} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-700 font-black uppercase text-xs tracking-widest">
              Trocar filial
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-6 font-sans pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button onClick={backToBranches} className="text-slate-400 hover:text-indigo-600 text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-3">
            <ArrowLeft size={15} /> Filiais
          </button>
          <h1 className="text-3xl font-black italic text-slate-900 uppercase tracking-tighter">{selectedBranch.name}</h1>
          <p className="text-slate-500 font-bold text-sm mt-1">Inventário por foto • nomes e códigos podem ser reaproveitados de outras filiais.</p>
        </div>
        <button onClick={() => copyBranchLink(selectedBranch)} className="px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-600 font-black text-xs uppercase flex items-center gap-2 self-start">
          <Copy size={16} /> {copyFeedback === selectedBranch.id ? 'Link copiado' : 'Copiar link da filial'}
        </button>
      </div>

      <section className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><MapPin size={22} /></div>
          <div>
            <h2 className="font-black text-slate-900 uppercase italic">1. Informe a locação</h2>
            <p className="text-xs text-slate-400 font-bold">Use o código da prateleira/gaveta, por exemplo A1, A2, P1.</p>
          </div>
        </div>
        <input
          value={location}
          onChange={event => {
            setLocation(event.target.value.toUpperCase());
            if (candidates.length === 0) setAnalysisError('');
          }}
          placeholder="Ex.: A1"
          className="w-full md:max-w-sm px-5 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-black uppercase tracking-widest text-slate-900"
        />
      </section>

      <section className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center"><Camera size={22} /></div>
            <div>
              <h2 className="font-black text-slate-900 uppercase italic">2. Tire as fotos</h2>
              <p className="text-xs text-slate-400 font-bold">Pode usar várias fotos. A análise envia no máximo 5 por chamada ao Groq.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => cameraInputRef.current?.click()} className="px-4 py-3 rounded-xl bg-slate-900 text-white font-black text-xs uppercase flex items-center gap-2">
              <Camera size={16} /> Câmera
            </button>
            <button onClick={() => galleryInputRef.current?.click()} className="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-black text-xs uppercase flex items-center gap-2">
              <Images size={16} /> Galeria
            </button>
          </div>
        </div>

        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { addFiles(event.target.files); event.target.value = ''; }} />
        <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={event => { addFiles(event.target.files); event.target.value = ''; }} />

        {photos.length === 0 ? (
          <button onClick={() => cameraInputRef.current?.click()} className="w-full min-h-40 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-all flex flex-col items-center justify-center gap-3">
            <Camera size={32} />
            <span className="font-black uppercase tracking-widest text-xs">Adicionar primeira foto</span>
          </button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {photos.map((photo, index) => (
              <div key={photo.id} className="relative aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 group">
                <Image src={photo.preview} alt={`Foto ${index + 1}`} fill unoptimized className="object-cover" />
                <div className="absolute left-2 top-2 bg-black/60 text-white rounded-lg px-2 py-1 text-[9px] font-black">{index + 1}</div>
                <button onClick={() => removePhoto(photo.id)} className="absolute right-2 top-2 p-2 rounded-lg bg-black/60 text-white hover:bg-rose-600 transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={analyzePhotos}
          disabled={isAnalyzing || photos.length === 0}
          className="w-full mt-6 py-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-lg shadow-indigo-100"
        >
          {isAnalyzing ? <><Loader2 size={19} className="animate-spin" /> Identificando ferramentas...</> : <><Sparkles size={19} /> Identificar automaticamente</>}
        </button>

        {rateInfo?.remainingRequests && (
          <div className="mt-3 text-[10px] font-bold text-slate-400 flex items-center gap-2">
            <Database size={13} /> Groq: {rateInfo.remainingRequests} requisições restantes no limite informado pela API{rateInfo.resetRequests ? ` • reset em ${rateInfo.resetRequests}` : ''}.
          </div>
        )}
      </section>

      {analysisError && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 p-4 flex items-start gap-3 text-sm font-bold">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" /> {analysisError}
        </div>
      )}

      {candidates.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black italic uppercase text-slate-900">3. Confirme antes de salvar</h2>
              <p className="text-xs text-slate-500 font-bold mt-1">Nome, código, marca, quantidade e locação são editáveis. Nada é salvo só porque a IA identificou.</p>
            </div>
            <button onClick={addManualCandidate} className="px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-black uppercase text-xs flex items-center gap-2 self-start">
              <Plus size={16} /> Adicionar manualmente
            </button>
          </div>

          {candidates.map((candidate, index) => (
            <div key={candidate.tempId} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 md:p-8">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center"><Package size={20} /></div>
                  <div>
                    <p className="font-black text-slate-900 uppercase italic">Item {index + 1}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {candidate.matchedCatalog && <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600">Nome/código reaproveitado</span>}
                      {candidate.existingInBranch && <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600">Já existe nesta filial: será atualizado</span>}
                      {candidate.confidence !== null && <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-slate-50 text-slate-500">IA {Math.round(candidate.confidence * 100)}%</span>}
                    </div>
                  </div>
                </div>
                <button onClick={() => removeCandidate(candidate.tempId)} className="p-2 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={18} /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <label className="lg:col-span-2">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Ferramenta</span>
                  <input value={candidate.name} onChange={event => updateCandidate(candidate.tempId, { name: event.target.value, matchedCatalog: false })} placeholder="Nome da ferramenta" className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-transparent focus:border-indigo-400 outline-none font-black text-sm" />
                </label>
                <label>
                  <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Código</span>
                  <input value={candidate.code} onChange={event => updateCandidate(candidate.tempId, { code: event.target.value, matchedCatalog: false })} placeholder="Automático" className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-transparent focus:border-indigo-400 outline-none font-mono text-sm" />
                </label>
                <label>
                  <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Marca</span>
                  <input value={candidate.brand} onChange={event => updateCandidate(candidate.tempId, { brand: event.target.value })} placeholder="Ex.: Bosch" className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-transparent focus:border-indigo-400 outline-none font-bold text-sm" />
                </label>
                <label>
                  <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Quantidade</span>
                  <input type="number" min={1} value={candidate.quantity} onChange={event => updateCandidate(candidate.tempId, { quantity: Math.max(1, Number(event.target.value) || 1) })} className="w-full px-4 py-3.5 rounded-xl bg-indigo-50 border border-transparent focus:border-indigo-400 outline-none font-black text-indigo-700 text-sm" />
                </label>
                <label className="lg:col-span-2">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Locação</span>
                  <input value={candidate.location} onChange={event => updateCandidate(candidate.tempId, { location: event.target.value.toUpperCase() })} placeholder="A1" className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-transparent focus:border-indigo-400 outline-none font-black uppercase text-sm" />
                </label>
              </div>
            </div>
          ))}

          <button
            onClick={saveInventory}
            disabled={isSaving}
            className="w-full py-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-xl shadow-emerald-100"
          >
            {isSaving ? <><Loader2 size={20} className="animate-spin" /> Salvando inventário...</> : <><Save size={20} /> Confirmar e salvar {candidates.length} item(ns)</>}
          </button>
        </section>
      )}
    </div>
  );
}
