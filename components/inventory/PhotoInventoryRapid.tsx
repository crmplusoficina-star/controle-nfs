'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  Images,
  Link2,
  Loader2,
  Lock,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  X,
  Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { uploadFile } from '@/lib/storage';
import { findSafeToolNameMatch } from '@/lib/tool-name-match';

type Branch = { id: string; name: string; city?: string | null };
type Tool = {
  id: string;
  name: string;
  code: string;
  brand?: string | null;
  branch?: string | null;
  branch_id?: string | null;
  location?: string | null;
  quantity_available?: number | null;
  image_url?: string | null;
  image_urls?: string[] | null;
};
type BoundingBox = { x1: number; y1: number; x2: number; y2: number };
type PhotoStatus = 'pending' | 'processing' | 'waiting' | 'done' | 'unrecognized' | 'error';
type Photo = {
  id: string;
  file: File;
  preview: string;
  status: PhotoStatus;
  attempts: number;
  error?: string;
};
type ItemPhoto = {
  id: string;
  file: File;
  preview: string;
};
type ReviewState = 'auto' | 'review' | 'manual';
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
  sourcePhotoId: string | null;
  bbox: BoundingBox | null;
  cropPreview: string | null;
  extraPhotos: ItemPhoto[];
  included: boolean;
  reviewState: ReviewState;
  manual: boolean;
};
type AiItem = {
  name?: string;
  code?: string | null;
  brand?: string | null;
  quantity?: number | null;
  confidence?: number | null;
  catalogCode?: string | null;
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

type SavedSummary = { created: number; updated: number; missing: number };

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

function numericTokens(value: string) {
  return Array.from(new Set((normalize(value).match(/\d+(?:[.,]\d+)?/g) || []).map(item => item.replace(',', '.'))));
}

function compatibleNumbers(a: string, b: string) {
  const one = numericTokens(a);
  const two = numericTokens(b);
  if (!one.length || !two.length) return true;
  return one.length === two.length && one.every(token => two.includes(token));
}

function boxIoU(a: BoundingBox | null, b: BoundingBox | null) {
  if (!a || !b) return 0;
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - intersection;
  return union > 0 ? intersection / union : 0;
}

function durationToMs(value?: string | null) {
  if (!value) return 0;
  let total = 0;
  const regex = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    if (match[2] === 'h') total += amount * 3_600_000;
    else if (match[2] === 'm') total += amount * 60_000;
    else if (match[2] === 's') total += amount * 1_000;
    else total += amount;
  }
  return Math.round(total);
}

async function fileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function optimizedImage(file: File, maxSide = 900, quality = 0.64) {
  const original = await fileAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = original;
  });

  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return original;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let q = quality;
  let result = canvas.toDataURL('image/jpeg', q);
  while (result.length > 380_000 && q > 0.38) {
    q -= 0.06;
    result = canvas.toDataURL('image/jpeg', q);
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

  const x1 = image.width * box.x1 / 1000;
  const y1 = image.height * box.y1 / 1000;
  const x2 = image.width * box.x2 / 1000;
  const y2 = image.height * box.y2 / 1000;
  const width = Math.max(1, x2 - x1);
  const height = Math.max(1, y2 - y1);
  const padX = width * 0.12;
  const padY = height * 0.12;
  const sx = Math.max(0, x1 - padX);
  const sy = Math.max(0, y1 - padY);
  const ex = Math.min(image.width, x2 + padX);
  const ey = Math.min(image.height, y2 + padY);
  const sw = Math.max(1, ex - sx);
  const sh = Math.max(1, ey - sy);

  const scale = Math.min(1, 720 / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
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

function statusLabel(status: PhotoStatus) {
  if (status === 'pending') return 'Na fila';
  if (status === 'processing') return 'Analisando';
  if (status === 'waiting') return 'Aguardando IA';
  if (status === 'done') return 'Processada';
  if (status === 'unrecognized') return 'Sem item';
  return 'Falhou';
}

function statusClass(status: PhotoStatus) {
  if (status === 'done') return 'bg-emerald-600 text-white';
  if (status === 'processing') return 'bg-indigo-600 text-white';
  if (status === 'waiting') return 'bg-amber-500 text-white';
  if (status === 'unrecognized') return 'bg-slate-700 text-white';
  if (status === 'error') return 'bg-rose-600 text-white';
  return 'bg-black/65 text-white';
}

export default function PhotoInventoryRapid() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [catalog, setCatalog] = useState<Tool[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [location, setLocation] = useState('');
  const [locationLocked, setLocationLocked] = useState(false);
  const [quickMode, setQuickMode] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [items, setItems] = useState<Candidate[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState('');
  const [rateInfo, setRateInfo] = useState<RateInfo | null>(null);
  const [queueNote, setQueueNote] = useState('');
  const [saved, setSaved] = useState<SavedSummary | null>(null);

  const photosRef = useRef<Photo[]>([]);
  const itemsRef = useRef<Candidate[]>([]);
  const branchRef = useRef<Branch | null>(null);
  const locationRef = useRef('');
  const processingRef = useRef(false);
  const retryTimersRef = useRef<number[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const manualCameraRef = useRef<HTMLInputElement>(null);
  const manualGalleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { branchRef.current = branch; }, [branch]);
  useEffect(() => { locationRef.current = location; }, [location]);
  useEffect(() => () => {
    photosRef.current.forEach(photo => URL.revokeObjectURL(photo.preview));
    itemsRef.current.forEach(item => item.extraPhotos.forEach(photo => URL.revokeObjectURL(photo.preview)));
    retryTimersRef.current.forEach(timer => window.clearTimeout(timer));
  }, []);

  const setPhotosSynced = (updater: (current: Photo[]) => Photo[]) => {
    setPhotos(current => {
      const next = updater(current);
      photosRef.current = next;
      return next;
    });
  };

  const setItemsSynced = (updater: (current: Candidate[]) => Candidate[]) => {
    setItems(current => {
      const next = updater(current);
      itemsRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: branchData, error: branchError }, { data: toolData, error: toolError }] = await Promise.all([
        supabase.from('branches').select('id,name,city').order('name'),
        supabase.from('tools').select('id,name,code,brand,branch,branch_id,location,quantity_available,image_url,image_urls').order('name'),
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
    const params = new URLSearchParams(window.location.search);
    const id = params.get('branch');
    const found = id ? visibleBranches.find(item => item.id === id) : null;
    if (found) {
      setBranch(found);
      const queryLocation = (params.get('location') || '').trim().toUpperCase();
      if (queryLocation) {
        setLocation(queryLocation);
        setLocationLocked(true);
      }
    }
  }, [branch, visibleBranches]);

  const clearSession = (clearLocation = true) => {
    photosRef.current.forEach(photo => URL.revokeObjectURL(photo.preview));
    itemsRef.current.forEach(item => item.extraPhotos.forEach(photo => URL.revokeObjectURL(photo.preview)));
    setPhotosSynced(() => []);
    setItemsSynced(() => []);
    setExpanded(new Set());
    setSaved(null);
    setMessage('');
    setRateInfo(null);
    setQueueNote('');
    if (clearLocation) {
      setLocation('');
      setLocationLocked(false);
    }
  };

  const selectBranch = (selected: Branch) => {
    clearSession(true);
    setBranch(selected);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('branch', selected.id);
      url.searchParams.delete('location');
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
  };

  const leaveBranch = () => {
    clearSession(true);
    setBranch(null);
    if (typeof window !== 'undefined') window.history.replaceState({}, '', window.location.pathname);
  };

  const copyBranchLink = async (selected: Branch) => {
    if (typeof window === 'undefined') return;
    const url = new URL('/dashboard/inventory', window.location.origin);
    url.searchParams.set('branch', selected.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(`branch:${selected.id}`);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      window.prompt('Copie o link desta filial:', url.toString());
    }
  };

  const copyLocationLink = async () => {
    if (!branch || !location.trim() || typeof window === 'undefined') return;
    const url = new URL('/dashboard/inventory', window.location.origin);
    url.searchParams.set('branch', branch.id);
    url.searchParams.set('location', location.trim().toUpperCase());
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied('location');
      setTimeout(() => setCopied(''), 1500);
    } catch {
      window.prompt('Este é o link para gerar o QR desta locação:', url.toString());
    }
  };

  const prioritizedCatalog = () => {
    const loc = normalize(locationRef.current);
    const currentBranch = branchRef.current?.id;
    const atLocation = catalog.filter(tool => tool.branch_id === currentBranch && normalize(tool.location) === loc);
    const atBranch = catalog.filter(tool => tool.branch_id === currentBranch && normalize(tool.location) !== loc);
    const elsewhere = catalog.filter(tool => tool.branch_id !== currentBranch);
    return [...atLocation, ...atBranch, ...elsewhere];
  };

  const catalogMatch = (ai: AiItem) => {
    const ordered = prioritizedCatalog();
    const code = normalizeCode(ai.catalogCode || ai.code);

    // Código visível é identidade rígida. Se a IA leu um código, nunca usamos
    // semelhança de nome para trocar por outro cadastro.
    if (code) {
      const exactCode = ordered.filter(tool => normalizeCode(tool.code) === code);
      const identities = new Set(exactCode.map(tool => `${normalizeCode(tool.code)}|${normalize(tool.name)}`));
      if (exactCode.length && identities.size === 1) return exactCode[0];
      return null;
    }

    const detectedName = String(ai.name || '').trim();
    if (!detectedName || normalize(detectedName).includes('ferramenta nao identificada')) return null;

    const exact = ordered.filter(tool => normalize(tool.name) === normalize(detectedName));
    const exactCodes = new Set(exact.map(tool => normalizeCode(tool.code)).filter(Boolean));
    if (exact.length && exactCodes.size === 1) return exact[0];

    // Sem código só aceitamos fuzzy quando ele aponta para uma única identidade.
    const fuzzy = ordered.filter(tool => Boolean(findSafeToolNameMatch(detectedName, [tool])));
    const fuzzyCodes = new Set(fuzzy.map(tool => normalizeCode(tool.code)).filter(Boolean));
    if (fuzzy.length && fuzzyCodes.size === 1) return fuzzy[0];
    return null;
  };

  const candidateMatchesTool = (candidate: Candidate, tool: Tool) => {
    if (candidate.code && tool.code && normalizeCode(candidate.code) === normalizeCode(tool.code)) return true;
    if (!candidate.name || !tool.name || !compatibleNumbers(candidate.name, tool.name)) return false;
    return Boolean(findSafeToolNameMatch(candidate.name, [tool]));
  };

  const mergeCandidates = (current: Candidate[], incoming: Candidate[]) => {
    const next = [...current];

    for (const candidate of incoming) {
      // Uma nova foto da fila representa uma nova leitura. Nunca misturamos
      // ferramenta A com ferramenta B só porque os nomes são parecidos.
      // Dedupe só é permitido dentro da MESMA foto de origem.
      let index = next.findIndex(item => {
        if (!item.sourcePhotoId || !candidate.sourcePhotoId || item.sourcePhotoId !== candidate.sourcePhotoId) return false;

        const itemCode = normalizeCode(item.code);
        const candidateCode = normalizeCode(candidate.code);
        if (itemCode || candidateCode) return Boolean(itemCode && candidateCode && itemCode === candidateCode);

        // Para itens sem código, só eliminamos detecção duplicada quando as caixas
        // praticamente cobrem o mesmo objeto na mesma imagem.
        return boxIoU(item.bbox, candidate.bbox) >= 0.7;
      });

      if (index < 0) {
        next.push(candidate);
        continue;
      }

      const previous = next[index];
      const useIncomingCrop = Boolean(candidate.cropPreview) && (!previous.cropPreview || (candidate.confidence || 0) > (previous.confidence || 0));
      next[index] = {
        ...previous,
        // Depois que uma leitura cria o item, outra detecção da mesma foto não
        // pode trocar silenciosamente nome/código por outra ferramenta.
        name: previous.name || candidate.name,
        code: previous.code || candidate.code,
        brand: previous.brand || candidate.brand,
        quantity: Math.max(previous.quantity, candidate.quantity),
        confidence: Math.max(previous.confidence || 0, candidate.confidence || 0),
        matchedCatalog: previous.matchedCatalog || candidate.matchedCatalog,
        existsInBranch: previous.existsInBranch || candidate.existsInBranch,
        reviewState: previous.reviewState === 'manual' || candidate.reviewState === 'manual'
          ? 'manual'
          : previous.reviewState === 'review' || candidate.reviewState === 'review' ? 'review' : 'auto',
        sourcePhotoId: useIncomingCrop ? candidate.sourcePhotoId : previous.sourcePhotoId,
        bbox: useIncomingCrop ? candidate.bbox : previous.bbox,
        cropPreview: useIncomingCrop ? candidate.cropPreview : previous.cropPreview,
      };
    }

    return next;
  };

  const candidatesFromAi = async (found: AiItem[], photo: Photo) => {
    const result: Candidate[] = [];
    for (const ai of found) {
      const match = catalogMatch(ai);
      const detectedName = String(ai.name || '').trim();
      if (!match && !detectedName) continue;
      const uncertain = !match && normalize(detectedName).includes('ferramenta nao identificada');
      const name = uncertain ? '' : (match?.name || detectedName);
      const code = match?.code || String(ai.code || '').trim();
      const bbox = safeBox(ai.bbox);
      let cropPreview: string | null = null;
      if (bbox) {
        try {
          cropPreview = await cropItem(photo.file, bbox);
        } catch (error) {
          console.warn('Falha ao recortar item:', error);
        }
      }
      const confidence = typeof ai.confidence === 'number' ? ai.confidence : null;
      const existsInBranch = Boolean(code && catalog.some(tool =>
        tool.branch_id === branchRef.current?.id && normalizeCode(tool.code) === normalizeCode(code)
      ));
      const auto = !uncertain && Boolean(match) && Boolean(cropPreview) && (confidence || 0) >= 0.78;
      result.push({
        id: uid(),
        name,
        code,
        brand: String(ai.brand || match?.brand || '').trim(),
        quantity: Math.max(1, Math.round(Number(ai.quantity) || 1)),
        location: locationRef.current.trim().toUpperCase(),
        confidence,
        matchedCatalog: Boolean(match),
        existsInBranch,
        sourcePhotoId: photo.id,
        bbox,
        cropPreview,
        extraPhotos: [],
        included: true,
        reviewState: auto ? 'auto' : uncertain ? 'manual' : 'review',
        manual: uncertain,
      });
    }
    return result;
  };

  const updatePhoto = (id: string, patch: Partial<Photo>) => {
    setPhotosSynced(current => current.map(photo => photo.id === id ? { ...photo, ...patch } : photo));
  };

  const waitBeforeNextRequest = async (rate: RateInfo | null) => {
    if (!rate) return;
    const remaining = Number.parseInt(rate.remainingTokens || '', 10);
    if (!Number.isFinite(remaining) || remaining >= 2300) return;
    const resetMs = durationToMs(rate.resetTokens);
    if (resetMs <= 0) return;
    const wait = Math.min(resetMs + 250, 60_000);
    setQueueNote(`IA renovando capacidade. Você pode continuar fotografando; próxima análise em ${Math.ceil(wait / 1000)}s.`);
    await new Promise(resolve => setTimeout(resolve, wait));
    setQueueNote('');
  };

  const scheduleRetry = (photo: Photo, rate: RateInfo | null) => {
    const fromRetry = Number(rate?.retryAfter || 0) * 1000;
    const fromReset = durationToMs(rate?.resetTokens);
    const wait = Math.min(Math.max(fromRetry, fromReset, 2500) + 300, 60_000);
    updatePhoto(photo.id, {
      status: 'waiting',
      attempts: photo.attempts + 1,
      error: `Aguardando ${Math.ceil(wait / 1000)}s para tentar novamente`,
    });
    const timer = window.setTimeout(() => {
      const current = photosRef.current.find(item => item.id === photo.id);
      if (!current) return;
      if (current.attempts >= 3) {
        updatePhoto(photo.id, { status: 'error', error: 'A IA não ficou disponível após 3 tentativas. Toque em tentar novamente.' });
      } else {
        updatePhoto(photo.id, { status: 'pending', error: '' });
      }
    }, wait);
    retryTimersRef.current.push(timer);
  };

  const analyzeOnePhoto = async (photo: Photo, sessionKey: string) => {
    try {
      const image = await optimizedImage(photo.file);
      const payloadCatalog = prioritizedCatalog().map(tool => ({ name: tool.name, code: tool.code, brand: tool.brand || null }));
      const response = await fetch('/api/ai/inventory-fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          locationHint: locationRef.current.trim().toUpperCase(),
          catalog: payloadCatalog,
        }),
      });
      const data = await response.json().catch(() => ({}));
      const rate = data?.rateLimit || null;
      if (rate) setRateInfo(rate);

      const currentSession = `${branchRef.current?.id || ''}|${locationRef.current.trim().toUpperCase()}`;
      if (currentSession !== sessionKey) {
        updatePhoto(photo.id, { status: 'pending', error: '' });
        return { stop: true, rate: null as RateInfo | null };
      }

      if (response.status === 429) {
        scheduleRetry(photo, rate);
        return { stop: true, rate };
      }

      if (!response.ok) {
        updatePhoto(photo.id, { status: 'error', error: data?.details || data?.error || 'Falha ao analisar esta foto.' });
        return { stop: false, rate };
      }

      const found = Array.isArray(data?.items) ? data.items as AiItem[] : [];
      if (!found.length) {
        updatePhoto(photo.id, { status: 'unrecognized', error: 'Nenhum item de estoque identificado.' });
        return { stop: false, rate };
      }

      const incoming = await candidatesFromAi(found, photo);
      setItemsSynced(current => mergeCandidates(current, incoming));
      const reviewIds = incoming.filter(item => item.reviewState !== 'auto').map(item => item.id);
      if (reviewIds.length) setExpanded(current => new Set([...current, ...reviewIds]));
      updatePhoto(photo.id, { status: 'done', error: '' });
      return { stop: false, rate };
    } catch (error) {
      console.error(error);
      updatePhoto(photo.id, { status: 'error', error: 'Falha de rede ou processamento. O restante do inventário continua funcionando.' });
      return { stop: false, rate: null as RateInfo | null };
    }
  };

  const processQueue = async () => {
    if (processingRef.current || !branchRef.current || !locationRef.current.trim()) return;
    processingRef.current = true;
    const sessionKey = `${branchRef.current.id}|${locationRef.current.trim().toUpperCase()}`;
    setLocationLocked(true);
    try {
      while (true) {
        const currentSession = `${branchRef.current?.id || ''}|${locationRef.current.trim().toUpperCase()}`;
        if (currentSession !== sessionKey) break;
        const photo = photosRef.current.find(item => item.status === 'pending');
        if (!photo) break;
        updatePhoto(photo.id, { status: 'processing', error: '' });
        const outcome = await analyzeOnePhoto(photo, sessionKey);
        if (outcome.stop) break;
        await waitBeforeNextRequest(outcome.rate);
      }
    } finally {
      processingRef.current = false;
    }
  };

  useEffect(() => {
    if (!quickMode || !branch || !location.trim()) return;
    if (photos.some(photo => photo.status === 'pending')) void processQueue();
  }, [photos, quickMode, branch, location]);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (!valid.length) return;
    const additions = valid.map(file => ({
      id: uid(),
      file,
      preview: URL.createObjectURL(file),
      status: 'pending' as PhotoStatus,
      attempts: 0,
    }));
    setPhotosSynced(current => [...current, ...additions]);
    setSaved(null);
    setMessage('');
    if (location.trim()) setLocationLocked(true);
  };

  const removePhoto = (id: string) => {
    const target = photosRef.current.find(photo => photo.id === id);
    if (target) URL.revokeObjectURL(target.preview);
    setPhotosSynced(current => current.filter(photo => photo.id !== id));
  };

  const retryPhoto = (id: string) => {
    updatePhoto(id, { status: 'pending', attempts: 0, error: '' });
    setMessage('');
  };

  const blankItem = (cropPreview: string | null = null): Candidate => ({
    id: uid(),
    name: '',
    code: '',
    brand: '',
    quantity: 1,
    location: locationRef.current.trim().toUpperCase(),
    confidence: null,
    matchedCatalog: false,
    existsInBranch: false,
    sourcePhotoId: null,
    bbox: null,
    cropPreview,
    extraPhotos: [],
    included: true,
    reviewState: 'manual',
    manual: true,
  });

  const addManualItem = (cropPreview: string | null = null) => {
    const item = blankItem(cropPreview);
    setItemsSynced(current => [...current, item]);
    setExpanded(current => new Set([...current, item.id]));
  };

  const addManualCloseup = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const closeup = await optimizedImage(file, 900, 0.82);
      addManualItem(closeup);
    } catch {
      addManualItem(null);
      setMessage('Não consegui preparar a foto aproximada, mas o item manual foi criado e pode ser salvo sem nome.');
    }
  };

  const addItemPhotos = (id: string, files: FileList | null) => {
    if (!files) return;
    const additions = Array.from(files)
      .filter(file => file.type.startsWith('image/'))
      .map(file => ({ id: uid(), file, preview: URL.createObjectURL(file) }));
    if (!additions.length) return;
    setItemsSynced(current => current.map(item => item.id === id
      ? { ...item, extraPhotos: [...item.extraPhotos, ...additions] }
      : item));
    setSaved(null);
  };

  const removeItemPhoto = (itemId: string, photoId: string) => {
    const item = itemsRef.current.find(candidate => candidate.id === itemId);
    const target = item?.extraPhotos.find(photo => photo.id === photoId);
    if (target) URL.revokeObjectURL(target.preview);
    setItemsSynced(current => current.map(candidate => candidate.id === itemId
      ? { ...candidate, extraPhotos: candidate.extraPhotos.filter(photo => photo.id !== photoId) }
      : candidate));
  };

  const removeItem = (id: string) => {
    const item = itemsRef.current.find(candidate => candidate.id === id);
    item?.extraPhotos.forEach(photo => URL.revokeObjectURL(photo.preview));
    setItemsSynced(current => current.filter(candidate => candidate.id !== id));
  };

  const updateItem = (id: string, patch: Partial<Candidate>) => {
    setItemsSynced(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const applyCatalogSuggestion = (id: string) => {
    const item = itemsRef.current.find(candidate => candidate.id === id);
    if (!item?.name.trim()) return;
    const match = findSafeToolNameMatch(item.name, prioritizedCatalog());
    if (!match) {
      setMessage(`Não encontrei um cadastro único e seguro para “${item.name}”. Você pode manter como novo item.`);
      return;
    }
    updateItem(id, {
      name: match.name,
      code: match.code,
      brand: item.brand || match.brand || '',
      matchedCatalog: true,
      existsInBranch: match.branch_id === branchRef.current?.id,
      reviewState: 'review',
    });
    setMessage('');
  };

  const changeLocation = (value: string) => {
    const next = value.toUpperCase();
    setLocation(next);
    locationRef.current = next;
    setItemsSynced(current => current.map(item => ({ ...item, location: next })));
    if (typeof window !== 'undefined' && branchRef.current) {
      const url = new URL(window.location.href);
      url.searchParams.set('branch', branchRef.current.id);
      if (next.trim()) url.searchParams.set('location', next.trim());
      else url.searchParams.delete('location');
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
  };

  const resolveIdentity = (item: Candidate) => {
    const typedName = item.name.trim();
    if (item.code.trim()) return { name: typedName, code: item.code.trim() };
    if (typedName) {
      const match = findSafeToolNameMatch(typedName, prioritizedCatalog());
      if (match) return { name: match.name, code: match.code };
    }
    return { name: typedName, code: generatedCode() };
  };

  const expectedAtLocation = useMemo(() => {
    if (!branch || !location.trim()) return [];
    const loc = normalize(location);
    return catalog.filter(tool => tool.branch_id === branch.id && normalize(tool.location) === loc);
  }, [catalog, branch, location]);

  const includedItems = useMemo(() => items.filter(item => item.included), [items]);
  const missingExpected = useMemo(() => expectedAtLocation.filter(tool =>
    !includedItems.some(item => candidateMatchesTool(item, tool))
  ), [expectedAtLocation, includedItems]);
  const unexpectedItems = useMemo(() => includedItems.filter(item =>
    !expectedAtLocation.some(tool => candidateMatchesTool(item, tool))
  ), [includedItems, expectedAtLocation]);

  const queueActive = photos.some(photo => ['pending', 'processing', 'waiting'].includes(photo.status));
  const analysisSettled = photos.length > 0 && !queueActive;
  const autoCount = items.filter(item => item.included && item.reviewState === 'auto').length;
  const reviewCount = items.filter(item => item.included && item.reviewState !== 'auto').length;
  const unrecognizedCount = photos.filter(photo => photo.status === 'unrecognized').length;
  const errorCount = photos.filter(photo => photo.status === 'error').length;

  const save = async () => {
    if (!branch || !user) return;
    const selected = itemsRef.current.filter(item => item.included);
    if (!selected.length) {
      setMessage('Nenhum item selecionado para salvar.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      let created = 0;
      let updated = 0;
      const missingBeforeSave = missingExpected.length;

      for (const item of selected) {
        const identity = resolveIdentity(item);
        const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
        let cropUrl: string | null = null;
        const safeName = normalize(identity.name).replace(/\s+/g, '-').slice(0, 50) || 'item';
        if (item.cropPreview) {
          cropUrl = await uploadFile(
            dataUrlToFile(item.cropPreview, `${safeName}-${Date.now()}.jpg`),
            'ferramentas/inventario/recortes',
          );
        }
        const extraUrls = (await Promise.all(
          item.extraPhotos.map((photo, photoIndex) => uploadFile(
            photo.file,
            `ferramentas/inventario/itens/${safeName}-${photoIndex + 1}`,
          )),
        )).filter((url): url is string => Boolean(url));
        const capturedUrls = Array.from(new Set([cropUrl, ...extraUrls].filter(Boolean) as string[]));

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
          const finalUrls = capturedUrls.length ? Array.from(new Set([...capturedUrls, ...oldUrls])) : oldUrls;
          const currentAvailable = Math.max(0, Number(existing.quantity_available) || 0);
          const { error } = await supabase.from('tools').update({
            name: identity.name,
            brand: item.brand.trim() || existing.brand || null,
            quantity_available: Math.max(currentAvailable, quantity),
            location: location.trim().toUpperCase(),
            image_url: capturedUrls[0] || existing.image_url || null,
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
            location: location.trim().toUpperCase(),
            image_url: capturedUrls[0] || null,
            image_urls: capturedUrls,
          });
          if (error) throw error;
          created += 1;
        }
      }

      const { data } = await supabase
        .from('tools')
        .select('id,name,code,brand,branch,branch_id,location,quantity_available,image_url,image_urls')
        .order('name');
      if (data) setCatalog(data as Tool[]);
      setSaved({ created, updated, missing: missingBeforeSave });
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Erro ao salvar o inventário.');
    } finally {
      setSaving(false);
    }
  };

  const nextLocation = () => clearSession(true);

  if (loading) return <div className="py-24 flex justify-center text-indigo-600"><Loader2 className="animate-spin" /></div>;

  if (!branch) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-7">
        <div>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900">Inventário Rápido</h1>
          <p className="text-sm font-bold text-slate-500 mt-2">Escolha a filial. O link da filial continua abrindo direto neste fluxo.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleBranches.map(item => (
            <div key={item.id} className="bg-white border border-slate-100 shadow-sm rounded-3xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-4 items-center">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><MapPin /></div>
                  <div><p className="font-black uppercase italic text-slate-900">{item.name}</p><p className="text-xs font-bold text-slate-400 mt-1">{item.city || 'Filial'}</p></div>
                </div>
                <button onClick={() => copyBranchLink(item)} className="p-3 rounded-xl bg-slate-50 text-slate-500" title="Copiar link da filial">{copied === `branch:${item.id}` ? <CheckCircle2 size={18} /> : <Copy size={18} />}</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5">
                <button onClick={() => selectBranch(item)} className="w-full py-4 rounded-2xl bg-slate-900 hover:bg-indigo-600 text-white transition-all font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"><Link2 size={16} /> Abrir inventário</button>
                <a href={`/dashboard/inventory/adjustments?branch=${item.id}`} className="w-full py-4 rounded-2xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 transition-all font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"><Package size={16} /> Ver / ajustar</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white border border-slate-100 shadow-xl rounded-[2.5rem] p-8 md:p-10 text-center">
          <CheckCircle2 size={58} className="text-emerald-600 mx-auto" />
          <h1 className="mt-5 text-3xl font-black italic uppercase text-slate-900">Locação salva</h1>
          <p className="mt-2 font-bold text-slate-500">{branch.name} • {location}</p>
          <div className="grid grid-cols-3 gap-3 mt-8">
            <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-2xl font-black text-emerald-700">{saved.created}</p><p className="text-[9px] font-black uppercase text-emerald-600">Novas</p></div>
            <div className="rounded-2xl bg-indigo-50 p-4"><p className="text-2xl font-black text-indigo-700">{saved.updated}</p><p className="text-[9px] font-black uppercase text-indigo-600">Atualizadas</p></div>
            <div className="rounded-2xl bg-amber-50 p-4"><p className="text-2xl font-black text-amber-700">{saved.missing}</p><p className="text-[9px] font-black uppercase text-amber-600">Não vistas</p></div>
          </div>
          <p className="mt-4 text-xs font-bold text-slate-400">Itens sem nome são salvos com código automático e ficam disponíveis na tela de ajustes manuais. Itens não vistos não reduzem saldo automaticamente.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
            <button onClick={nextLocation} className="py-4 rounded-2xl bg-indigo-600 text-white font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2"><RefreshCw size={17} /> Próxima locação</button>
            <a href={`/dashboard/inventory/adjustments?branch=${branch.id}`} className="py-4 rounded-2xl bg-slate-900 text-white font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2"><Package size={17} /> Ver / ajustar</a>
            <button onClick={leaveBranch} className="py-4 rounded-2xl bg-slate-100 text-slate-700 font-black uppercase text-xs tracking-widest">Trocar filial</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-7 pb-28 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button onClick={leaveBranch} className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 flex items-center gap-2"><ArrowLeft size={15} /> Filiais</button>
          <div className="flex items-center gap-3"><h1 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900">{branch.name}</h1><span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[9px] font-black uppercase tracking-widest">Rápido</span></div>
          <p className="text-sm font-bold text-slate-500 mt-1">Fotografe e continue andando. A fila da IA trabalha sem bloquear a câmera.</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <a href={`/dashboard/inventory/adjustments?branch=${branch.id}`} className="px-4 py-3 rounded-xl font-black uppercase text-xs flex items-center gap-2 bg-slate-900 text-white"><Package size={16} /> Ver / ajustar</a>
          <button onClick={() => setQuickMode(value => !value)} className={`px-4 py-3 rounded-xl font-black uppercase text-xs flex items-center gap-2 ${quickMode ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}><Zap size={16} /> {quickMode ? 'Automático ligado' : 'Automático desligado'}</button>
        </div>
      </div>

      <section className="bg-white border border-slate-100 shadow-sm rounded-[2rem] p-5 md:p-7">
        <div className="flex items-center gap-3 mb-4"><MapPin className="text-indigo-600" /><div className="flex-1"><h2 className="font-black uppercase italic text-slate-900">1. Locação</h2><p className="text-xs font-bold text-slate-400">A locação digitada é a fonte de verdade para toda a rodada.</p></div></div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <input value={location} disabled={locationLocked} onChange={event => changeLocation(event.target.value)} placeholder="A2" className={`w-full px-5 py-4 pr-12 rounded-2xl outline-none font-black uppercase tracking-widest ${locationLocked ? 'bg-indigo-50 text-indigo-800' : 'bg-slate-50 focus:ring-2 focus:ring-indigo-400'}`} />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{locationLocked ? <Lock size={18} /> : <Unlock size={18} />}</div>
          </div>
          <button onClick={() => setLocationLocked(value => !value)} className="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-black uppercase text-xs flex items-center justify-center gap-2">{locationLocked ? <><Unlock size={15} /> Alterar</> : <><Lock size={15} /> Fixar</>}</button>
          <button onClick={copyLocationLink} disabled={!location.trim()} className="px-4 py-3 rounded-xl bg-white border border-slate-200 disabled:opacity-40 text-slate-700 font-black uppercase text-xs flex items-center justify-center gap-2"><Link2 size={15} /> {copied === 'location' ? 'Copiado' : 'Link para QR'}</button>
        </div>
      </section>

      <section className="bg-white border border-slate-100 shadow-sm rounded-[2rem] p-5 md:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3"><Camera className="text-amber-600" /><div><h2 className="font-black uppercase italic text-slate-900">2. Fotos em fila</h2><p className="text-xs font-bold text-slate-400">A foto ampla é só para análise. Apenas o recorte individual é salvo.</p></div></div>
          <div className="flex gap-2">
            <button onClick={() => cameraRef.current?.click()} className="px-4 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-xs flex items-center gap-2"><Camera size={16} /> Câmera</button>
            <button onClick={() => galleryRef.current?.click()} className="px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-black uppercase text-xs flex items-center gap-2"><Images size={16} /> Galeria</button>
          </div>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { addPhotos(event.target.files); event.currentTarget.value = ''; }} />
        <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={event => { addPhotos(event.target.files); event.currentTarget.value = ''; }} />
        <input ref={manualCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { void addManualCloseup(event.target.files); event.currentTarget.value = ''; }} />
        <input ref={manualGalleryRef} type="file" accept="image/*" className="hidden" onChange={event => { void addManualCloseup(event.target.files); event.currentTarget.value = ''; }} />

        {!photos.length ? (
          <button onClick={() => cameraRef.current?.click()} className="w-full min-h-36 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 flex flex-col gap-3 items-center justify-center"><Camera size={30} /><span className="font-black uppercase tracking-widest text-xs">Tirar primeira foto</span></button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {photos.map((photo, index) => (
              <div key={photo.id} className="relative aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-100">
                <Image src={photo.preview} alt={`Foto ${index + 1}`} fill unoptimized className="object-contain bg-slate-950" />
                <span className={`absolute top-2 left-2 px-2 py-1 rounded-lg text-[9px] font-black ${statusClass(photo.status)}`}>{photo.status === 'processing' ? <span className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> {statusLabel(photo.status)}</span> : statusLabel(photo.status)}</span>
                <button onClick={() => removePhoto(photo.id)} className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded-lg"><Trash2 size={13} /></button>
                {(photo.status === 'error' || photo.status === 'unrecognized') && (
                  <div className="absolute inset-x-2 bottom-2 flex gap-1">
                    <button onClick={() => retryPhoto(photo.id)} className="flex-1 py-2 rounded-lg bg-white/95 text-slate-800 text-[9px] font-black uppercase flex justify-center items-center gap-1"><RotateCcw size={11} /> Tentar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mt-5">
          <button onClick={() => void processQueue()} disabled={!location.trim() || !photos.some(photo => photo.status === 'pending')} className="flex-1 py-4 bg-indigo-600 disabled:opacity-40 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"><Sparkles size={18} /> Processar pendentes</button>
          <button onClick={() => manualCameraRef.current?.click()} className="flex-1 py-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"><ScanLine size={18} /> Ferramenta não reconhecida</button>
        </div>

        {queueNote && <div className="mt-3 rounded-xl bg-indigo-50 text-indigo-700 px-4 py-3 text-xs font-bold flex items-center gap-2"><Clock3 size={15} /> {queueNote}</div>}
        {unrecognizedCount > 0 && <div className="mt-3 rounded-xl bg-slate-50 text-slate-600 px-4 py-3 text-xs font-bold">{unrecognizedCount} foto(s) sem item de estoque reconhecido. Se havia uma ferramenta real, use “Ferramenta não reconhecida”: ela pode ser salva com nome em branco e código automático para ajuste depois.</div>}
        {errorCount > 0 && <div className="mt-3 rounded-xl bg-rose-50 text-rose-700 px-4 py-3 text-xs font-bold">{errorCount} foto(s) falharam, mas a fila e a câmera continuam funcionando. Você pode tentar somente essas fotos novamente.</div>}
        {(rateInfo?.remainingTokens || rateInfo?.remainingRequests) && (
          <p className="mt-3 text-[10px] font-bold text-slate-400">{rateInfo.remainingTokens ? `Capacidade: ${rateInfo.remainingTokens}${rateInfo.limitTokens ? `/${rateInfo.limitTokens}` : ''} tokens${rateInfo.resetTokens ? ` • renova em ${rateInfo.resetTokens}` : ''}` : ''}{rateInfo.remainingTokens && rateInfo.remainingRequests ? ' • ' : ''}{rateInfo.remainingRequests ? `${rateInfo.remainingRequests} req. diárias` : ''}</p>
        )}
      </section>

      {message && <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 font-bold text-sm flex gap-3"><AlertTriangle size={20} className="shrink-0" />{message}<button onClick={() => setMessage('')} className="ml-auto"><X size={16} /></button></div>}

      {items.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div><h2 className="text-xl font-black italic uppercase text-slate-900">3. Revisão rápida</h2><p className="text-xs font-bold text-slate-500 mt-1">{autoCount} confirmado(s) automaticamente • {reviewCount} para revisar</p></div>
            <div className="flex gap-2"><button onClick={() => addManualItem(null)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl font-black uppercase text-[10px] flex gap-2 items-center"><Plus size={14} /> Manual</button><button onClick={() => manualGalleryRef.current?.click()} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl font-black uppercase text-[10px] flex gap-2 items-center"><Images size={14} /> Foto manual</button></div>
          </div>

          <div className="grid gap-3">
            {items.map((item, index) => {
              const isExpanded = expanded.has(item.id);
              return (
                <div key={item.id} className={`bg-white border shadow-sm rounded-2xl overflow-hidden ${item.included ? 'border-slate-100' : 'border-slate-200 opacity-60'}`}>
                  <div className="p-3 sm:p-4 flex items-center gap-3">
                    <button onClick={() => updateItem(item.id, { included: !item.included })} className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center border-2 ${item.included ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 text-transparent'}`}><Check size={17} /></button>
                    <div className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-slate-100 border border-slate-100">
                      {item.cropPreview ? <Image src={item.cropPreview} alt={item.name || `Item ${index + 1}`} fill unoptimized className="object-contain" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Package size={24} /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        {item.reviewState === 'auto' ? <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase">OK automático</span> : item.reviewState === 'manual' ? <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-[8px] font-black uppercase">Manual</span> : <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-[8px] font-black uppercase">Revisar</span>}
                        {item.matchedCatalog && <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-[8px] font-black uppercase">Cadastro encontrado</span>}
                      </div>
                      <p className={`font-black text-sm sm:text-base truncate ${item.name ? 'text-slate-900' : 'text-amber-700'}`}>{item.name || 'Sem nome — ajustar depois'}</p>
                      <p className="text-[10px] font-bold text-slate-400 truncate">{item.code || 'Código automático'} • Qtd {item.quantity} • {item.location || location}</p>
                    </div>
                    <button onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} className="p-2 text-slate-400">{isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-100 p-4 sm:p-5 bg-slate-50/50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        <label className="lg:col-span-2"><span className="block mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Ferramenta</span><input value={item.name} onChange={event => updateItem(item.id, { name: event.target.value, matchedCatalog: false, reviewState: item.manual ? 'manual' : 'review' })} placeholder="Pode deixar em branco" className="w-full px-4 py-3 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-400 font-black text-sm" /></label>
                        <label><span className="block mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Código</span><input value={item.code} onChange={event => updateItem(item.id, { code: event.target.value, matchedCatalog: false, reviewState: item.manual ? 'manual' : 'review' })} placeholder="Automático" className="w-full px-4 py-3 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-400 font-mono text-sm" /></label>
                        <label><span className="block mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Marca</span><input value={item.brand} onChange={event => updateItem(item.id, { brand: event.target.value })} className="w-full px-4 py-3 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-sm" /></label>
                        <label><span className="block mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Quantidade</span><input type="number" min={1} value={item.quantity} onChange={event => updateItem(item.id, { quantity: Math.max(1, Number(event.target.value) || 1) })} className="w-full px-4 py-3 rounded-xl bg-indigo-50 outline-none focus:ring-2 focus:ring-indigo-400 font-black text-indigo-700 text-sm" /></label>
                      </div>
                      <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Fotos deste item</p><p className="mt-1 text-[10px] font-bold text-slate-400">O recorte da IA fica como principal. Adicione quantas fotos complementares precisar antes de salvar.</p></div>
                          <div className="flex gap-2">
                            <label className="px-3 py-2 rounded-lg bg-slate-900 text-white font-black uppercase text-[9px] flex items-center gap-1.5 cursor-pointer"><Camera size={13} /> Câmera<input type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { addItemPhotos(item.id, event.target.files); event.currentTarget.value = ''; }} /></label>
                            <label className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 font-black uppercase text-[9px] flex items-center gap-1.5 cursor-pointer"><Images size={13} /> Galeria<input type="file" accept="image/*" multiple className="hidden" onChange={event => { addItemPhotos(item.id, event.target.files); event.currentTarget.value = ''; }} /></label>
                          </div>
                        </div>
                        {item.extraPhotos.length > 0 && (
                          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
                            {item.extraPhotos.map((photo, photoIndex) => (
                              <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                                <Image src={photo.preview} alt={`Foto complementar ${photoIndex + 1}`} fill unoptimized className="object-contain bg-slate-950" />
                                <button type="button" onClick={() => removeItemPhoto(item.id, photo.id)} className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/65 text-white" aria-label="Remover foto complementar"><Trash2 size={12} /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="mt-2 text-[10px] font-bold text-slate-400">Se não souber o nome agora, deixe em branco. O item será salvo pelo código automático, fotos, filial e locação.</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={() => applyCatalogSuggestion(item.id)} disabled={!item.name.trim()} className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 disabled:opacity-40 font-black uppercase text-[9px] flex items-center gap-1.5"><Search size={13} /> Procurar no cadastro</button>
                        <button onClick={() => removeItem(item.id)} className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 font-black uppercase text-[9px] flex items-center gap-1.5"><Trash2 size={13} /> Remover</button>
                        {item.confidence !== null && <span className="px-3 py-2 rounded-lg bg-white text-slate-500 font-black uppercase text-[9px]">IA {Math.round(item.confidence * 100)}%</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {analysisSettled && location.trim() && (
        <section className="bg-white border border-slate-100 shadow-sm rounded-[2rem] p-5 md:p-7">
          <div className="flex items-center gap-3 mb-4"><ShieldCheck className="text-emerald-600" /><div><h2 className="font-black uppercase italic text-slate-900">4. Conferência com o estoque</h2><p className="text-xs font-bold text-slate-400">Compara o que estava cadastrado em {location} com o que apareceu nas fotos.</p></div></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4 text-center"><p className="text-2xl font-black text-slate-800">{expectedAtLocation.length}</p><p className="text-[8px] font-black uppercase text-slate-400">Esperados</p></div>
            <div className="rounded-2xl bg-emerald-50 p-4 text-center"><p className="text-2xl font-black text-emerald-700">{includedItems.length}</p><p className="text-[8px] font-black uppercase text-emerald-600">Encontrados</p></div>
            <div className="rounded-2xl bg-amber-50 p-4 text-center"><p className="text-2xl font-black text-amber-700">{missingExpected.length}</p><p className="text-[8px] font-black uppercase text-amber-600">Não vistos</p></div>
          </div>
          {missingExpected.length > 0 && <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-100 p-4"><p className="text-xs font-black text-amber-800 uppercase">Não apareceram nas fotos</p><div className="mt-2 space-y-1">{missingExpected.slice(0, 8).map(tool => <p key={tool.id} className="text-xs font-bold text-amber-700">• {tool.name || 'Sem nome'} <span className="font-mono opacity-70">{tool.code}</span></p>)}{missingExpected.length > 8 && <p className="text-xs font-bold text-amber-600">+ {missingExpected.length - 8} outros</p>}</div></div>}
          {unexpectedItems.length > 0 && <div className="mt-3 rounded-2xl bg-indigo-50 border border-indigo-100 p-4"><p className="text-xs font-black text-indigo-800 uppercase">Novos ou em locação diferente</p><p className="text-xs font-bold text-indigo-700 mt-1">{unexpectedItems.length} item(ns) identificado(s) que não estavam cadastrados em {location}.</p></div>}
          <p className="mt-3 text-[10px] font-bold text-slate-400">Segurança: “não visto” não altera saldo sozinho e a foto nunca reduz saldo existente. Reduções podem ser feitas apenas na tela de ajustes manuais.</p>
        </section>
      )}

      <div className="sticky bottom-3 z-20 bg-white/95 backdrop-blur border border-slate-200 shadow-xl rounded-2xl p-3 flex flex-col sm:flex-row gap-2">
        <div className="flex-1 px-2 py-1"><p className="text-xs font-black text-slate-800">{includedItems.length} item(ns) selecionado(s)</p><p className="text-[9px] font-bold text-slate-400">{queueActive ? 'A fila ainda está processando; você pode salvar depois ou continuar fotografando.' : 'Fila concluída. Itens sem nome também podem ser salvos.'}</p></div>
        <button onClick={save} disabled={saving || items.filter(item => item.included).length === 0} className="px-6 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2">{saving ? <><Loader2 size={18} className="animate-spin" /> Salvando</> : <><Save size={18} /> Salvar locação</>}</button>
      </div>
    </div>
  );
}
