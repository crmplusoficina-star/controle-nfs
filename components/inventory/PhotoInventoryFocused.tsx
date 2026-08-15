'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Copy,
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

type Branch = { id: string; name: string; city?: string | null };
type Tool = {
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
type Photo = { id: string; file: File; preview: string };
type BoundingBox = { x1: number; y1: number; x2: number; y2: number };
type Candidate = {
  id: string;
  name: string;
  code: string;
  brand: string;
  quantity: number;
  location: string;
  confidence: number | null;
  matchedCatalog: boolean;
  existsInBranch: boolean;
  sourcePhotoIndex: number | null;
  bbox: BoundingBox | null;
  cropPreview: string | null;
};
type AiItem = {
  name?: string;
  code?: string | null;
  brand?: string | null;
  quantity?: number | null;
  confidence?: number | null;
  catalogCode?: string | null;
  imageIndex?: number | null;
  bbox?: BoundingBox | number[] | null;
};
type RateInfo = {
  limitRequests?: string | null;
  remainingRequests?: string | null;
  resetRequests?: string | null;
  limitTokens?: string | null;
  remainingTokens?: string | null;
  resetTokens?: string | null;
  retryAfter?: string | null;
};

const MAX_IMAGES_PER_REQUEST = 5;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function normalize(value?: string | null) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeCode(value?: string | null) {
  return (value || '').toLowerCase().replace(/\s+/g, '').trim();
}

function generatedCode() {
  return `GEN-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
}

function safeBox(value: AiItem['bbox']): BoundingBox | null {
  if (!value) return null;
  const raw = Array.isArray(value)
    ? { x1: value[0], y1: value[1], x2: value[2], y2: value[3] }
    : value;
  const x1 = Number(raw.x1);
  const y1 = Number(raw.y1);
  const x2 = Number(raw.x2);
  const y2 = Number(raw.y2);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  const box = {
    x1: Math.max(0, Math.min(1000, x1)),
    y1: Math.max(0, Math.min(1000, y1)),
    x2: Math.max(0, Math.min(1000, x2)),
    y2: Math.max(0, Math.min(1000, y2)),
  };
  return box.x2 > box.x1 && box.y2 > box.y1 ? box : null;
}

async function fileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function imageAsDataUrl(file: File) {
  const original = await fileAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = original;
  });

  const scale = Math.min(1, 960 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return original;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.68;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > 420_000 && quality > 0.4) {
    quality -= 0.07;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  return result;
}

async function cropItem(file: File, box: BoundingBox) {
  const source = await fileAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = source;
  });

  const rawX1 = image.width * box.x1 / 1000;
  const rawY1 = image.height * box.y1 / 1000;
  const rawX2 = image.width * box.x2 / 1000;
  const rawY2 = image.height * box.y2 / 1000;
  const rawWidth = Math.max(1, rawX2 - rawX1);
  const rawHeight = Math.max(1, rawY2 - rawY1);

  // Uma pequena margem evita cortar pontas/cabos, mas mantém o enquadramento fechado no item.
  const padX = rawWidth * 0.12;
  const padY = rawHeight * 0.12;
  const sx = Math.max(0, rawX1 - padX);
  const sy = Math.max(0, rawY1 - padY);
  const ex = Math.min(image.width, rawX2 + padX);
  const ey = Math.min(image.height, rawY2 + padY);
  const sw = Math.max(1, ex - sx);
  const sh = Math.max(1, ey - sy);

  const outputScale = Math.min(1, 720 / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * outputScale));
  canvas.height = Math.max(1, Math.round(sh * outputScale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

function dataUrlToFile(dataUrl: string, fileName: string) {
  const [header, encoded] = dataUrl.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const binary = atob(encoded || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], fileName, { type: mime });
}

export default function PhotoInventoryFocused() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [catalog, setCatalog] = useState<Tool[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [location, setLocation] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState('');
  const [rateInfo, setRateInfo] = useState<RateInfo | null>(null);
  const [saved, setSaved] = useState<{ created: number; updated: number } | null>(null);
  const photosRef = useRef<Photo[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => () => {
    photosRef.current.forEach(photo => URL.revokeObjectURL(photo.preview));
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: branchData, error: branchError }, { data: toolData, error: toolError }] = await Promise.all([
        supabase.from('branches').select('id,name,city').order('name'),
        supabase.from('tools').select('id,name,code,brand,branch,branch_id,location,image_url,image_urls').order('name'),
      ]);
      if (branchError) console.error(branchError);
      if (toolError) console.error(toolError);
      setBranches((branchData || []) as Branch[]);
      setCatalog((toolData || []) as Tool[]);
      setLoading(false);
    };
    load();
  }, []);

  const visibleBranches = useMemo(() => {
    if (user?.role === 'Operador' && user?.branch_id) return branches.filter(item => item.id === user.branch_id);
    return branches;
  }, [branches, user]);

  useEffect(() => {
    if (branch || visibleBranches.length === 0 || typeof window === 'undefined') return;
    const id = new URLSearchParams(window.location.search).get('branch');
    const found = id ? visibleBranches.find(item => item.id === id) : null;
    if (found) setBranch(found);
  }, [branch, visibleBranches]);

  const clearPhotos = () => {
    photos.forEach(photo => URL.revokeObjectURL(photo.preview));
    setPhotos([]);
  };

  const selectBranch = (selected: Branch) => {
    clearPhotos();
    setBranch(selected);
    setLocation('');
    setItems([]);
    setSaved(null);
    setMessage('');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('branch', selected.id);
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
  };

  const leaveBranch = () => {
    clearPhotos();
    setBranch(null);
    setLocation('');
    setItems([]);
    setSaved(null);
    setMessage('');
    if (typeof window !== 'undefined') window.history.replaceState({}, '', window.location.pathname);
  };

  const copyBranchLink = async (selected: Branch) => {
    if (typeof window === 'undefined') return;
    const url = new URL('/dashboard/inventory', window.location.origin);
    url.searchParams.set('branch', selected.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(selected.id);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      window.prompt('Copie o link desta filial:', url.toString());
    }
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter(file => file.type.startsWith('image/'));
    setPhotos(previous => [
      ...previous,
      ...valid.map(file => ({ id: uid(), file, preview: URL.createObjectURL(file) })),
    ]);
    setItems([]);
    setSaved(null);
    setMessage('');
  };

  const removePhoto = (id: string) => {
    setPhotos(previous => {
      const target = previous.find(photo => photo.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return previous.filter(photo => photo.id !== id);
    });
    setItems([]);
  };

  const catalogMatch = (ai: AiItem) => {
    const code = normalizeCode(ai.catalogCode || ai.code);
    if (code) {
      const exactCode = catalog.find(tool => normalizeCode(tool.code) === code);
      if (exactCode) return exactCode;
    }
    const name = normalize(ai.name);
    if (!name) return null;
    const exactNames = catalog.filter(tool => normalize(tool.name) === name);
    const codes = Array.from(new Set(exactNames.map(tool => normalizeCode(tool.code)).filter(Boolean)));
    return exactNames.length > 0 && codes.length === 1 ? exactNames[0] : null;
  };

  const mergeAiItems = async (found: AiItem[]) => {
    const map = new Map<string, Candidate>();

    for (const ai of found) {
      const match = catalogMatch(ai);
      const name = match?.name || String(ai.name || '').trim();
      const code = match?.code || String(ai.code || '').trim();
      if (!name) continue;

      const sourcePhotoIndex = Number.isFinite(Number(ai.imageIndex)) ? Math.max(0, Math.round(Number(ai.imageIndex))) : null;
      const bbox = safeBox(ai.bbox);
      let cropPreview: string | null = null;
      if (sourcePhotoIndex !== null && bbox && photos[sourcePhotoIndex]) {
        try {
          cropPreview = await cropItem(photos[sourcePhotoIndex].file, bbox);
        } catch (error) {
          console.warn('Falha ao gerar recorte do item:', error);
        }
      }

      const key = code ? `c:${normalizeCode(code)}` : `n:${normalize(name)}`;
      const existsInBranch = Boolean(code && catalog.some(tool =>
        tool.branch_id === branch?.id && normalizeCode(tool.code) === normalizeCode(code)
      ));
      const candidate: Candidate = {
        id: uid(),
        name,
        code,
        brand: String(ai.brand || match?.brand || '').trim(),
        quantity: Math.max(1, Math.round(Number(ai.quantity) || 1)),
        // A locação preenchida no topo sempre prevalece sobre qualquer interpretação visual.
        location: location.trim().toUpperCase(),
        confidence: typeof ai.confidence === 'number' ? ai.confidence : null,
        matchedCatalog: Boolean(match),
        existsInBranch,
        sourcePhotoIndex,
        bbox,
        cropPreview,
      };

      const previous = map.get(key);
      if (!previous) {
        map.set(key, candidate);
        continue;
      }

      const candidateConfidence = candidate.confidence || 0;
      const previousConfidence = previous.confidence || 0;
      const useCandidateCrop = Boolean(candidate.cropPreview) && (!previous.cropPreview || candidateConfidence > previousConfidence);
      map.set(key, {
        ...previous,
        brand: previous.brand || candidate.brand,
        quantity: Math.max(previous.quantity, candidate.quantity),
        confidence: Math.max(previousConfidence, candidateConfidence),
        matchedCatalog: previous.matchedCatalog || candidate.matchedCatalog,
        existsInBranch: previous.existsInBranch || candidate.existsInBranch,
        sourcePhotoIndex: useCandidateCrop ? candidate.sourcePhotoIndex : previous.sourcePhotoIndex,
        bbox: useCandidateCrop ? candidate.bbox : previous.bbox,
        cropPreview: useCandidateCrop ? candidate.cropPreview : previous.cropPreview,
      });
    }
    return Array.from(map.values());
  };

  const blankItem = (): Candidate => ({
    id: uid(),
    name: '',
    code: '',
    brand: '',
    quantity: 1,
    location: location.trim().toUpperCase(),
    confidence: null,
    matchedCatalog: false,
    existsInBranch: false,
    sourcePhotoIndex: null,
    bbox: null,
    cropPreview: null,
  });

  const analyze = async () => {
    if (!branch) return;
    if (!location.trim()) {
      setMessage('Informe a locação primeiro. Ex.: A1, A2, P1.');
      return;
    }
    if (photos.length === 0) {
      setMessage('Adicione pelo menos uma foto.');
      return;
    }

    setAnalyzing(true);
    setMessage('');
    setRateInfo(null);
    try {
      const dataUrls = await Promise.all(photos.map(photo => imageAsDataUrl(photo.file)));
      const catalogPayload = catalog.map(tool => ({ name: tool.name, code: tool.code, brand: tool.brand || null }));
      const found: AiItem[] = [];
      let interrupted = '';

      for (let index = 0; index < dataUrls.length; index += MAX_IMAGES_PER_REQUEST) {
        const response = await fetch('/api/ai/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: dataUrls.slice(index, index + MAX_IMAGES_PER_REQUEST),
            locationHint: location.trim().toUpperCase(),
            catalog: catalogPayload,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (data?.rateLimit) setRateInfo(data.rateLimit);
        if (!response.ok) {
          interrupted = response.status === 429
            ? `Capacidade por minuto do Groq atingida.${data?.rateLimit?.retryAfter ? ` Tente novamente em cerca de ${data.rateLimit.retryAfter}s.` : ''}`
            : (data?.details || data?.error || 'Falha na análise das fotos.');
          break;
        }
        if (Array.isArray(data?.items)) {
          found.push(...data.items.map((item: AiItem) => ({
            ...item,
            imageIndex: Number.isFinite(Number(item.imageIndex)) ? Number(item.imageIndex) + index : null,
          })));
        }
        if (data?.partial || data?.warning) {
          interrupted = data?.warning || 'A análise foi concluída parcialmente.';
          break;
        }
        if (index + MAX_IMAGES_PER_REQUEST < dataUrls.length) await pause(900);
      }

      const merged = await mergeAiItems(found);
      setItems(merged.length ? merged : [blankItem()]);
      if (interrupted) setMessage(`${interrupted} O que já foi identificado ficou disponível para correção manual.`);
    } catch (error) {
      console.error(error);
      setItems(previous => previous.length ? previous : [blankItem()]);
      setMessage('A análise automática falhou. Você pode preencher e salvar os itens manualmente.');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateItem = (id: string, patch: Partial<Candidate>) => {
    setItems(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const resolveIdentity = (item: Candidate) => {
    if (item.code.trim()) return { name: item.name.trim(), code: item.code.trim() };
    const sameName = catalog.filter(tool => normalize(tool.name) === normalize(item.name));
    const uniqueCodes = Array.from(new Set(sameName.map(tool => tool.code.trim()).filter(Boolean)));
    if (sameName.length > 0 && uniqueCodes.length === 1) return { name: sameName[0].name, code: uniqueCodes[0] };
    return { name: item.name.trim(), code: generatedCode() };
  };

  const save = async () => {
    if (!branch || !user) return;
    const valid = items.filter(item => item.name.trim());
    if (valid.length === 0) {
      setMessage('Informe o nome de pelo menos uma ferramenta.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      let created = 0;
      let updated = 0;

      for (const item of valid) {
        const identity = resolveIdentity(item);
        const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
        let cropUrl: string | null = null;

        // A foto ampla nunca é enviada ao cadastro. Somente o recorte individual, quando disponível.
        if (item.cropPreview) {
          const safeName = normalize(identity.name).replace(/\s+/g, '-').slice(0, 50) || 'item';
          const cropFile = dataUrlToFile(item.cropPreview, `${safeName}-${Date.now()}.jpg`);
          cropUrl = await uploadFile(cropFile, 'ferramentas/inventario/recortes');
        }

        const { data: existing, error: findError } = await supabase
          .from('tools')
          .select('*')
          .eq('branch_id', branch.id)
          .eq('code', identity.code)
          .maybeSingle();
        if (findError) throw findError;

        if (existing) {
          const oldUrls = Array.isArray(existing.image_urls)
            ? existing.image_urls.filter(Boolean)
            : existing.image_url ? [existing.image_url] : [];
          const finalUrls = cropUrl
            ? Array.from(new Set([cropUrl, ...oldUrls]))
            : oldUrls;
          const { error } = await supabase.from('tools').update({
            name: identity.name,
            brand: item.brand.trim() || existing.brand || null,
            quantity_available: quantity,
            location: item.location.trim().toUpperCase() || location.trim().toUpperCase(),
            image_url: cropUrl || existing.image_url || null,
            image_urls: finalUrls,
            updated_at: new Date().toISOString(),
          }).eq('id', existing.id);
          if (error) throw error;
          updated += 1;
        } else {
          const { error } = await supabase.from('tools').insert({
            name: identity.name,
            code: identity.code,
            brand: item.brand.trim() || null,
            branch: branch.name,
            branch_id: branch.id,
            quantity_available: quantity,
            cautela_quantity: 0,
            borrowed_quantity: 0,
            status: 'disponivel',
            location: item.location.trim().toUpperCase() || location.trim().toUpperCase(),
            image_url: cropUrl,
            image_urls: cropUrl ? [cropUrl] : [],
          });
          if (error) throw error;
          created += 1;
        }
      }

      const { data } = await supabase
        .from('tools')
        .select('id,name,code,brand,branch,branch_id,location,image_url,image_urls')
        .order('name');
      if (data) setCatalog(data as Tool[]);
      setSaved({ created, updated });
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Erro ao salvar o inventário.');
    } finally {
      setSaving(false);
    }
  };

  const nextLocation = () => {
    clearPhotos();
    setLocation('');
    setItems([]);
    setSaved(null);
    setMessage('');
    setRateInfo(null);
  };

  if (loading) return <div className="py-24 flex justify-center text-indigo-600"><Loader2 className="animate-spin" /></div>;

  if (!branch) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-7">
        <div>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900">Inventariar Ferramentas</h1>
          <p className="text-sm font-bold text-slate-500 mt-2">Escolha a filial. Cada uma possui um link próprio para iniciar o inventário já no local correto.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleBranches.map(item => (
            <div key={item.id} className="bg-white border border-slate-100 shadow-sm rounded-3xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-4 items-center">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><MapPin /></div>
                  <div><p className="font-black uppercase italic text-slate-900">{item.name}</p><p className="text-xs font-bold text-slate-400 mt-1">{item.city || 'Filial'}</p></div>
                </div>
                <button onClick={() => copyBranchLink(item)} className="p-3 rounded-xl bg-slate-50 text-slate-500" title="Copiar link da filial">{copied === item.id ? <CheckCircle2 size={18} /> : <Copy size={18} />}</button>
              </div>
              <button onClick={() => selectBranch(item)} className="w-full mt-5 py-4 rounded-2xl bg-slate-900 hover:bg-indigo-600 text-white transition-all font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"><Link2 size={16} /> Abrir inventário</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white border border-slate-100 shadow-xl rounded-[2.5rem] p-10 text-center">
          <CheckCircle2 size={58} className="text-emerald-600 mx-auto" />
          <h1 className="mt-5 text-3xl font-black italic uppercase text-slate-900">Locação inventariada</h1>
          <p className="mt-2 font-bold text-slate-500">{branch.name} • {location}</p>
          <div className="grid grid-cols-2 gap-4 mt-8">
            <div className="rounded-2xl bg-emerald-50 p-5"><p className="text-3xl font-black text-emerald-700">{saved.created}</p><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Novas</p></div>
            <div className="rounded-2xl bg-indigo-50 p-5"><p className="text-3xl font-black text-indigo-700">{saved.updated}</p><p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Atualizadas</p></div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <button onClick={nextLocation} className="flex-1 py-4 rounded-2xl bg-indigo-600 text-white font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2"><RefreshCw size={17} /> Próxima locação</button>
            <button onClick={leaveBranch} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-700 font-black uppercase text-xs tracking-widest">Trocar filial</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 pb-24 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button onClick={leaveBranch} className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 flex items-center gap-2"><ArrowLeft size={15} /> Filiais</button>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900">{branch.name}</h1>
          <p className="text-sm font-bold text-slate-500 mt-1">Fotografe a locação, revise os recortes identificados e só então salve.</p>
        </div>
        <button onClick={() => copyBranchLink(branch)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl font-black uppercase text-xs text-slate-600 flex items-center gap-2 self-start"><Copy size={16} /> {copied === branch.id ? 'Link copiado' : 'Copiar link'}</button>
      </div>

      <section className="bg-white border border-slate-100 shadow-sm rounded-[2rem] p-6 md:p-8">
        <div className="flex items-center gap-3 mb-5"><MapPin className="text-indigo-600" /><div><h2 className="font-black uppercase italic text-slate-900">1. Locação</h2><p className="text-xs font-bold text-slate-400">Esta locação será aplicada a todos os itens identificados. Ex.: A1, A2, P1.</p></div></div>
        <input value={location} onChange={event => setLocation(event.target.value.toUpperCase())} placeholder="A1" className="w-full md:max-w-sm px-5 py-4 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-400 font-black uppercase tracking-widest" />
      </section>

      <section className="bg-white border border-slate-100 shadow-sm rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3"><Camera className="text-amber-600" /><div><h2 className="font-black uppercase italic text-slate-900">2. Fotos</h2><p className="text-xs font-bold text-slate-400">A foto ampla serve somente para análise. Ela não será salva como imagem dos itens.</p></div></div>
          <div className="flex gap-2">
            <button onClick={() => cameraRef.current?.click()} className="px-4 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-xs flex items-center gap-2"><Camera size={16} /> Câmera</button>
            <button onClick={() => galleryRef.current?.click()} className="px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-black uppercase text-xs flex items-center gap-2"><Images size={16} /> Galeria</button>
          </div>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { addPhotos(event.target.files); event.currentTarget.value = ''; }} />
        <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={event => { addPhotos(event.target.files); event.currentTarget.value = ''; }} />

        {photos.length === 0 ? (
          <button onClick={() => cameraRef.current?.click()} className="w-full min-h-40 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 flex flex-col gap-3 items-center justify-center"><Camera size={32} /><span className="font-black uppercase tracking-widest text-xs">Adicionar primeira foto</span></button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {photos.map((photo, index) => (
              <div key={photo.id} className="relative aspect-square rounded-2xl overflow-hidden bg-slate-100">
                <Image src={photo.preview} alt={`Foto ${index + 1}`} fill unoptimized className="object-cover" />
                <span className="absolute top-2 left-2 bg-black/60 text-white px-2 py-1 rounded-lg text-[9px] font-black">{index + 1}</span>
                <button onClick={() => removePhoto(photo.id)} className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-rose-600 text-white rounded-lg"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}

        <button onClick={analyze} disabled={analyzing || photos.length === 0} className="w-full mt-6 py-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3">
          {analyzing ? <><Loader2 size={19} className="animate-spin" /> Identificando e recortando...</> : <><Sparkles size={19} /> Identificar automaticamente</>}
        </button>
        {(rateInfo?.remainingTokens || rateInfo?.remainingRequests) && (
          <p className="mt-3 text-[10px] font-bold text-slate-400">
            {rateInfo?.remainingTokens ? `Capacidade neste minuto: ${rateInfo.remainingTokens}${rateInfo.limitTokens ? ` de ${rateInfo.limitTokens}` : ''} tokens${rateInfo.resetTokens ? ` • renova em ${rateInfo.resetTokens}` : ''}` : ''}
            {rateInfo?.remainingTokens && rateInfo?.remainingRequests ? ' • ' : ''}
            {rateInfo?.remainingRequests ? `${rateInfo.remainingRequests} requisições disponíveis no limite diário` : ''}
          </p>
        )}
      </section>

      {message && <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 font-bold text-sm flex gap-3"><AlertTriangle size={20} className="shrink-0" />{message}</div>}

      {items.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div><h2 className="text-xl font-black italic uppercase text-slate-900">3. Revise e confirme</h2><p className="text-xs font-bold text-slate-500 mt-1">Cada item identificado recebe seu próprio recorte com zoom. Nome, código, marca, quantidade e locação continuam editáveis.</p></div>
            <button onClick={() => setItems(previous => [...previous, blankItem()])} className="px-4 py-3 bg-white border border-slate-200 rounded-xl font-black uppercase text-xs flex gap-2 items-center self-start"><Plus size={16} /> Manual</button>
          </div>

          {items.map((item, index) => (
            <div key={item.id} className="bg-white border border-slate-100 shadow-sm rounded-[2rem] p-6 md:p-8">
              <div className="flex justify-between gap-4 mb-5">
                <div className="flex items-center gap-3"><Package className="text-slate-400" /><div><p className="font-black uppercase italic text-slate-900">Item {index + 1}</p><div className="flex flex-wrap gap-2 mt-1">{item.matchedCatalog && <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase">Nome/código reaproveitado</span>}{item.existsInBranch && <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase">Já existe nesta filial</span>}{item.confidence !== null && <span className="px-2 py-1 rounded-lg bg-slate-50 text-slate-500 text-[9px] font-black uppercase">IA {Math.round(item.confidence * 100)}%</span>}</div></div></div>
                <button onClick={() => setItems(previous => previous.filter(candidate => candidate.id !== item.id))} className="p-2 text-slate-300 hover:text-rose-600"><Trash2 size={18} /></button>
              </div>

              {item.cropPreview ? (
                <div className="mb-6 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3 flex gap-4 items-center">
                  <div className="relative w-28 h-28 sm:w-36 sm:h-36 shrink-0 overflow-hidden rounded-2xl bg-white border border-indigo-100">
                    <Image src={item.cropPreview} alt={`Recorte de ${item.name || `item ${index + 1}`}`} fill unoptimized className="object-contain" />
                  </div>
                  <div>
                    <p className="font-black text-sm text-slate-900">Recorte do item identificado</p>
                    <p className="text-xs font-bold text-slate-500 mt-1">Zoom gerado da foto {item.sourcePhotoIndex !== null ? item.sourcePhotoIndex + 1 : ''}. Somente este recorte será usado como imagem do inventário.</p>
                  </div>
                </div>
              ) : item.confidence !== null ? (
                <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800">O item foi identificado, mas não houve recorte seguro. A foto ampla não será salva.</div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <label className="lg:col-span-2"><span className="block mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Ferramenta</span><input value={item.name} onChange={event => updateItem(item.id, { name: event.target.value, matchedCatalog: false })} className="w-full px-4 py-3.5 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-black text-sm" /></label>
                <label><span className="block mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Código</span><input value={item.code} onChange={event => updateItem(item.id, { code: event.target.value, matchedCatalog: false })} placeholder="Automático" className="w-full px-4 py-3.5 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-mono text-sm" /></label>
                <label><span className="block mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Marca</span><input value={item.brand} onChange={event => updateItem(item.id, { brand: event.target.value })} placeholder="Ex.: Bosch" className="w-full px-4 py-3.5 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-sm" /></label>
                <label><span className="block mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Quantidade</span><input type="number" min={1} value={item.quantity} onChange={event => updateItem(item.id, { quantity: Math.max(1, Number(event.target.value) || 1) })} className="w-full px-4 py-3.5 rounded-xl bg-indigo-50 outline-none focus:ring-2 focus:ring-indigo-400 font-black text-indigo-700 text-sm" /></label>
                <label className="lg:col-span-2"><span className="block mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Locação</span><input value={item.location} onChange={event => updateItem(item.id, { location: event.target.value.toUpperCase() })} className="w-full px-4 py-3.5 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-black uppercase text-sm" /></label>
              </div>
            </div>
          ))}

          <button onClick={save} disabled={saving} className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3">
            {saving ? <><Loader2 size={20} className="animate-spin" /> Salvando...</> : <><Save size={20} /> Confirmar e salvar {items.length} item(ns)</>}
          </button>
        </section>
      )}
    </div>
  );
}
