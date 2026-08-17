'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Filter,
  ImageIcon,
  Loader2,
  Pencil,
  MapPin,
  Package,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { deleteFile, uploadFile } from '@/lib/storage';

type Branch = {
  id: string;
  name: string;
  city?: string | null;
};

type Tool = {
  id: string;
  name: string;
  code: string;
  brand?: string | null;
  branch?: string | null;
  branch_id?: string | null;
  location?: string | null;
  quantity_available?: number | null;
  cautela_quantity?: number | null;
  borrowed_quantity?: number | null;
  status?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Draft = {
  name: string;
  code: string;
  brand: string;
  location: string;
  quantity_available: number;
};

type FilterMode = 'photos' | 'unnamed' | 'generated' | 'all';
type SortMode = 'pending' | 'recent';

function normalize(value?: string | null) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeCode(value?: string | null) {
  return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

async function fileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function optimizedImage(file: File, maxSide = 1100, quality = 0.72) {
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
  let result = canvas.toDataURL('image/jpeg', quality);
  let nextQuality = quality;
  while (result.length > 550_000 && nextQuality > 0.46) {
    nextQuality -= 0.06;
    result = canvas.toDataURL('image/jpeg', nextQuality);
  }
  return result;
}

function toolPhotos(tool: Tool) {
  return Array.from(new Set([
    tool.image_url,
    ...(Array.isArray(tool.image_urls) ? tool.image_urls : []),
  ].filter(Boolean) as string[]));
}

function mainPhoto(tool: Tool) {
  return toolPhotos(tool)[0] || null;
}

function photoFromInventory(tool: Tool) {
  const urls = [tool.image_url, ...(Array.isArray(tool.image_urls) ? tool.image_urls : [])].filter(Boolean) as string[];
  if (urls.some(url => normalize(url).includes('ferramentas/inventario/'))) return true;
  return normalize(tool.code).startsWith('gen-') && Boolean(mainPhoto(tool));
}

function makeDraft(tool: Tool): Draft {
  return {
    name: tool.name || '',
    code: tool.code || '',
    brand: tool.brand || '',
    location: tool.location || '',
    quantity_available: Math.max(0, Number(tool.quantity_available) || 0),
  };
}

export default function InventoryAdjustmentsPage() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [tools, setTools] = useState<Tool[]>([]);
  const [catalog, setCatalog] = useState<Tool[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('pending');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [uploadingPhotoId, setUploadingPhotoId] = useState('');
  const [photoTargetId, setPhotoTargetId] = useState('');
  const [replacePhotoUrl, setReplacePhotoUrl] = useState('');
  const [deletingPhotoId, setDeletingPhotoId] = useState('');
  const [message, setMessage] = useState('');
  const [successId, setSuccessId] = useState('');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const catalogRef = useRef<Tool[]>([]);
  const draftsRef = useRef<Record<string, Draft>>({});
  const lookupTimersRef = useRef<Record<string, number>>({});

  useEffect(() => { catalogRef.current = catalog; }, [catalog]);
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);
  useEffect(() => () => {
    Object.values(lookupTimersRef.current).forEach(timer => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const loadBranches = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('branches').select('id,name,city').order('name');
      if (error) {
        console.error(error);
        setMessage('Não foi possível carregar as filiais.');
        setLoading(false);
        return;
      }
      const all = (data || []) as Branch[];
      const visible = user?.role === 'Operador' && user?.branch_id
        ? all.filter(item => item.id === user.branch_id)
        : all;
      setBranches(visible);

      let requested = '';
      if (typeof window !== 'undefined') {
        requested = new URLSearchParams(window.location.search).get('branch') || '';
      }
      const preferred = visible.find(item => item.id === requested)?.id
        || (user?.branch_id && visible.find(item => item.id === user.branch_id)?.id)
        || visible[0]?.id
        || '';
      setBranchId(preferred);
      setLoading(false);
    };
    void loadBranches();
  }, [user]);

  const loadTools = async (selectedBranchId = branchId) => {
    if (!selectedBranchId) {
      setTools([]);
      setDrafts({});
      return;
    }
    setLoading(true);
    setMessage('');
    const [{ data, error }, { data: catalogData, error: catalogError }] = await Promise.all([
      supabase
        .from('tools')
        .select('id,name,code,brand,branch,branch_id,location,quantity_available,cautela_quantity,borrowed_quantity,status,image_url,image_urls,created_at,updated_at')
        .eq('branch_id', selectedBranchId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('tools')
        .select('id,name,code,brand,branch,branch_id,location,quantity_available,cautela_quantity,borrowed_quantity,status,image_url,image_urls,created_at,updated_at')
        .order('updated_at', { ascending: false }),
    ]);

    if (error) {
      console.error(error);
      setMessage(error.message || 'Não foi possível carregar as ferramentas desta filial.');
      setLoading(false);
      return;
    }
    if (catalogError) console.warn('Catálogo global indisponível para preenchimento automático:', catalogError);

    const rows = (data || []) as Tool[];
    const globalRows = (catalogData || rows) as Tool[];
    setCatalog(globalRows);
    catalogRef.current = globalRows;
    rows.sort((a, b) => {
      const blankA = a.name?.trim() ? 1 : 0;
      const blankB = b.name?.trim() ? 1 : 0;
      if (blankA !== blankB) return blankA - blankB;
      return String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''));
    });
    setTools(rows);
    setDrafts(Object.fromEntries(rows.map(tool => [tool.id, makeDraft(tool)])));
    setLoading(false);
  };

  useEffect(() => {
    if (!branchId) return;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('branch', branchId);
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
    void loadTools(branchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const currentBranch = branches.find(item => item.id === branchId) || null;
  const photoCount = useMemo(() => tools.filter(photoFromInventory).length, [tools]);
  const unnamedCount = useMemo(() => tools.filter(tool => !tool.name?.trim()).length, [tools]);
  const generatedCount = useMemo(() => tools.filter(tool => normalize(tool.code).startsWith('gen-')).length, [tools]);

  const visibleTools = useMemo(() => {
    const needle = normalize(query);
    const filtered = tools.filter(tool => {
      const draft = drafts[tool.id] || makeDraft(tool);
      if (filter === 'photos' && !photoFromInventory(tool)) return false;
      if (filter === 'unnamed' && draft.name.trim()) return false;
      if (filter === 'generated' && !normalize(draft.code).startsWith('gen-')) return false;
      if (!needle) return true;
      return [draft.name, draft.code, draft.brand, draft.location]
        .some(value => normalize(value).includes(needle));
    });

    return [...filtered].sort((a, b) => {
      const modified = String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''));
      if (sortMode === 'recent') return modified;

      const draftA = drafts[a.id] || makeDraft(a);
      const draftB = drafts[b.id] || makeDraft(b);
      const pendingA = draftA.name.trim() ? 1 : 0;
      const pendingB = draftB.name.trim() ? 1 : 0;
      if (pendingA !== pendingB) return pendingA - pendingB;
      return modified;
    });
  }, [tools, drafts, filter, query, sortMode]);

  const updateDraft = (toolId: string, patch: Partial<Draft>) => {
    setDrafts(current => {
      const next = {
        ...current,
        [toolId]: { ...(current[toolId] || makeDraft(tools.find(item => item.id === toolId)!)), ...patch },
      };
      draftsRef.current = next;
      return next;
    });
    setSuccessId('');
  };

  const hasChanges = (tool: Tool) => {
    const draft = drafts[tool.id];
    if (!draft) return false;
    return draft.name !== (tool.name || '')
      || draft.code !== (tool.code || '')
      || draft.brand !== (tool.brand || '')
      || draft.location !== (tool.location || '')
      || draft.quantity_available !== Math.max(0, Number(tool.quantity_available) || 0);
  };

  const templateByCode = (tool: Tool, value: string) => {
    const code = normalizeCode(value);
    if (!code) return null;
    const matches = catalogRef.current.filter(item => item.id !== tool.id && normalizeCode(item.code) === code);
    return matches.find(item => item.branch_id !== tool.branch_id) || matches[0] || null;
  };

  const deleteFileIfUnused = async (photoUrl: string, ownerToolId: string) => {
    if (!photoUrl) return;
    const { data, error } = await supabase
      .from('tools')
      .select('id,image_url,image_urls')
      .neq('id', ownerToolId);
    if (error) {
      console.warn('Não foi possível verificar uso compartilhado da foto:', error);
      return;
    }
    const shared = (data || []).some((item: any) => item.image_url === photoUrl || (Array.isArray(item.image_urls) && item.image_urls.includes(photoUrl)));
    if (!shared) {
      const deleted = await deleteFile(photoUrl);
      if (!deleted) console.warn('A foto saiu do cadastro, mas não foi possível removê-la do storage.');
    }
  };

  const applyCatalogTemplate = async (tool: Tool, template: Tool, adoptCode = false) => {
    if (!template || template.id === tool.id) return;
    const currentDraft = draftsRef.current[tool.id] || makeDraft(tool);
    const sameBranchConflict = catalogRef.current.some(item =>
      item.id !== tool.id && item.branch_id === tool.branch_id && normalizeCode(item.code) === normalizeCode(template.code)
    );
    if (adoptCode && sameBranchConflict) return;

    const currentName = currentDraft.name.trim();
    const pendingName = !currentName || normalize(currentName).includes('ferramenta nao identificada');
    const nameEditedManually = currentDraft.name !== (tool.name || '');
    const brandEditedManually = currentDraft.brand !== (tool.brand || '');
    const templateName = String(template.name || '').trim();
    const templateBrand = String(template.brand || '').trim();
    const nextName = !nameEditedManually && templateName && (adoptCode || pendingName)
      ? templateName
      : currentDraft.name;
    const nextBrand = !brandEditedManually && templateBrand
      ? templateBrand
      : currentDraft.brand;
    const localPhotos = toolPhotos(tool);
    const referencePhotos = toolPhotos(template);
    const imageUrls = Array.from(new Set([...localPhotos, ...referencePhotos]));
    const primaryPhoto = tool.image_url || imageUrls[0] || null;
    const canAdoptCode = adoptCode && Boolean(template.code) && (
      !currentDraft.code.trim()
      || normalize(currentDraft.code).startsWith('gen-')
      || normalizeCode(currentDraft.code) === normalizeCode(template.code)
    );
    const nextCode = canAdoptCode ? template.code : currentDraft.code;
    const updatedAt = new Date().toISOString();
    const payload: Record<string, unknown> = {
      name: nextName,
      brand: nextBrand || null,
      image_url: primaryPhoto,
      image_urls: imageUrls,
      updated_at: updatedAt,
    };
    if (canAdoptCode) payload.code = template.code;

    const { error } = await supabase.from('tools').update(payload).eq('id', tool.id);
    if (error) {
      console.warn('Preenchimento automático ignorado:', error);
      return;
    }

    const updatedTool = { ...tool, ...payload, code: nextCode } as Tool;
    setTools(current => current.map(item => item.id === tool.id ? updatedTool : item));
    setDrafts(current => {
      const next = {
        ...current,
        [tool.id]: {
          ...(current[tool.id] || makeDraft(tool)),
          name: nextName,
          brand: nextBrand,
          code: nextCode,
        },
      };
      draftsRef.current = next;
      return next;
    });
    setCatalog(current => {
      const next = current.map(item => item.id === tool.id ? updatedTool : item);
      catalogRef.current = next;
      return next;
    });
  };

  const scheduleCodeLookup = (tool: Tool, rawCode: string) => {
    const previous = lookupTimersRef.current[tool.id];
    if (previous) window.clearTimeout(previous);
    const code = normalizeCode(rawCode);
    if (!code || code.startsWith('GEN')) return;
    lookupTimersRef.current[tool.id] = window.setTimeout(() => {
      const template = templateByCode(tool, rawCode);
      if (template) void applyCatalogTemplate(tool, template, true);
    }, 260);
  };

  const identifyTemplateFromPhoto = async (file: File, tool: Tool) => {
    try {
      const image = await optimizedImage(file);
      const catalogPayload = catalogRef.current.map(item => ({
        name: item.name,
        code: item.code,
        brand: item.brand || null,
      }));
      const response = await fetch('/api/ai/inventory-fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, catalog: catalogPayload }),
      });
      if (!response.ok) return null;
      const data = await response.json().catch(() => ({}));
      const found = Array.isArray(data?.items) ? data.items : [];
      const matches: Tool[] = [];
      for (const item of found) {
        const visibleCode = String(item?.catalogCode || item?.code || '').trim();
        let template = visibleCode ? templateByCode(tool, visibleCode) : null;
        if (!template) {
          const detectedName = normalize(String(item?.name || ''));
          if (detectedName && !detectedName.includes('ferramenta nao identificada')) {
            const byName = catalogRef.current.filter(entry => entry.id !== tool.id && normalize(entry.name) === detectedName);
            const uniqueCodes = new Set(byName.map(entry => normalizeCode(entry.code)).filter(Boolean));
            if (byName.length && uniqueCodes.size === 1) {
              template = byName.find(entry => entry.branch_id !== tool.branch_id) || byName[0] || null;
            }
          }
        }
        if (template && !matches.some(existing => existing.id === template!.id)) matches.push(template);
      }
      return matches.length === 1 ? matches[0] : null;
    } catch (error) {
      console.warn('Reconhecimento silencioso do cadastro não concluído:', error);
      return null;
    }
  };

  const openCamera = (toolId: string, photoUrl = '') => {
    if (uploadingPhotoId || deletingPhotoId) return;
    setPhotoTargetId(toolId);
    setReplacePhotoUrl(photoUrl);
    setMessage('');
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    cameraInputRef.current?.click();
  };

  const savePhotos = async (files: FileList | File[] | null | undefined) => {
    const toolId = photoTargetId;
    const tool = tools.find(item => item.id === toolId);
    const allSelected = Array.from(files || []).filter(file => file.type.startsWith('image/'));
    const selectedFiles = replacePhotoUrl ? allSelected.slice(0, 1) : allSelected;
    if (!selectedFiles.length || !tool) return;

    setUploadingPhotoId(toolId);
    setMessage('');
    const identification = identifyTemplateFromPhoto(selectedFiles[0], tool);
    try {
      const uploaded = await Promise.all(
        selectedFiles.map(file => uploadFile(file, 'ferramentas/inventario/ajustes')),
      );
      const uploadedUrls = uploaded.filter((url): url is string => Boolean(url));
      if (!uploadedUrls.length) throw new Error('O upload das fotos não retornou nenhuma URL.');

      const oldUrls = toolPhotos(tool);
      const replacing = Boolean(replacePhotoUrl);
      const imageUrls = replacing
        ? oldUrls.map(url => url === replacePhotoUrl ? uploadedUrls[0] : url)
        : Array.from(new Set([...oldUrls, ...uploadedUrls]));
      const primaryPhoto = replacing
        ? (tool.image_url === replacePhotoUrl ? uploadedUrls[0] : (tool.image_url || imageUrls[0] || null))
        : (uploadedUrls[0] || oldUrls[0] || null);
      const updatedAt = new Date().toISOString();
      const { error } = await supabase.from('tools').update({
        image_url: primaryPhoto,
        image_urls: imageUrls,
        updated_at: updatedAt,
      }).eq('id', tool.id);
      if (error) throw error;

      const toolWithNewPhotos = { ...tool, image_url: primaryPhoto, image_urls: imageUrls, updated_at: updatedAt };
      setTools(current => current.map(item => item.id === tool.id ? toolWithNewPhotos : item));
      setCatalog(current => {
        const next = current.map(item => item.id === tool.id ? toolWithNewPhotos : item);
        catalogRef.current = next;
        return next;
      });

      const template = await identification;
      if (template) await applyCatalogTemplate(toolWithNewPhotos, template, true);

      if (replacing && replacePhotoUrl && replacePhotoUrl !== uploadedUrls[0]) {
        await deleteFileIfUnused(replacePhotoUrl, tool.id);
      }

      setSuccessId(tool.id);
      window.setTimeout(() => setSuccessId(current => current === tool.id ? '' : current), 1800);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar as fotos.');
    } finally {
      setUploadingPhotoId('');
      setPhotoTargetId('');
      setReplacePhotoUrl('');
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const removePhoto = async (tool: Tool, photoUrl: string) => {
    if (!photoUrl || uploadingPhotoId || deletingPhotoId) return;
    if (!window.confirm('Excluir esta foto da ferramenta? O código, saldo e histórico serão preservados.')) return;

    setDeletingPhotoId(tool.id);
    setMessage('');
    try {
      const remaining = toolPhotos(tool).filter(url => url !== photoUrl);
      const primaryPhoto = tool.image_url === photoUrl || !tool.image_url
        ? remaining[0] || null
        : tool.image_url;
      const updatedAt = new Date().toISOString();
      const { error } = await supabase.from('tools').update({
        image_url: primaryPhoto,
        image_urls: remaining,
        updated_at: updatedAt,
      }).eq('id', tool.id);
      if (error) throw error;

      setTools(current => current.map(item => item.id === tool.id
        ? { ...item, image_url: primaryPhoto, image_urls: remaining, updated_at: updatedAt }
        : item));

      await deleteFileIfUnused(photoUrl, tool.id);

      setSuccessId(tool.id);
      window.setTimeout(() => setSuccessId(current => current === tool.id ? '' : current), 1800);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Não foi possível excluir a foto.');
    } finally {
      setDeletingPhotoId('');
    }
  };

  const saveTool = async (tool: Tool) => {
    const draft = drafts[tool.id] || makeDraft(tool);
    const code = draft.code.trim().toUpperCase();
    if (!code) {
      setMessage('O código não pode ficar vazio. O nome pode ficar em branco para você preencher depois.');
      return;
    }

    setSavingId(tool.id);
    setMessage('');
    setSuccessId('');
    const payload = {
      name: draft.name.trim(),
      code,
      brand: draft.brand.trim() || null,
      location: draft.location.trim().toUpperCase() || null,
      quantity_available: Math.max(0, Math.round(Number(draft.quantity_available) || 0)),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('tools').update(payload).eq('id', tool.id);
    if (error) {
      console.error(error);
      setMessage(error.code === '23505'
        ? `O código ${code} já existe nesta filial. Escolha outro código.`
        : error.message || 'Não foi possível salvar a alteração.');
      setSavingId('');
      return;
    }

    const updatedTool = { ...tool, ...payload } as Tool;
    setTools(current => current.map(item => item.id === tool.id ? updatedTool : item));
    setCatalog(current => {
      const next = current.map(item => item.id === tool.id ? updatedTool : item);
      catalogRef.current = next;
      return next;
    });
    setDrafts(current => ({ ...current, [tool.id]: { ...draft, ...payload, brand: draft.brand.trim(), location: draft.location.trim().toUpperCase() } }));
    setSuccessId(tool.id);
    setSavingId('');
    window.setTimeout(() => setSuccessId(current => current === tool.id ? '' : current), 1800);
  };

  if (loading && !tools.length) {
    return <div className="py-24 flex justify-center text-indigo-600"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-7 pb-24 space-y-5">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={!replacePhotoUrl}
        className="hidden"
        onChange={event => void savePhotos(event.target.files)}
      />

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <a href={branchId ? `/dashboard/inventory?branch=${branchId}` : '/dashboard/inventory'} className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 flex items-center gap-2"><ArrowLeft size={15} /> Voltar ao inventário por fotos</a>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><SlidersHorizontal size={22} /></div>
            <div>
              <h1 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900">Ajustes manuais</h1>
              <p className="text-sm font-bold text-slate-500 mt-1">Veja o que entrou no estoque, fotografe a ferramenta e complete nome, código, marca, locação ou saldo.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <select value={branchId} onChange={event => setBranchId(event.target.value)} className="min-w-52 px-4 py-3 rounded-xl bg-white border border-slate-200 font-black uppercase text-xs outline-none focus:ring-2 focus:ring-indigo-400">
            {branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button onClick={() => void loadTools()} className="px-4 py-3 rounded-xl bg-slate-900 text-white font-black uppercase text-xs flex items-center justify-center gap-2"><RefreshCw size={15} /> Atualizar</button>
        </div>
      </div>

      {currentBranch && (
        <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3"><MapPin className="text-indigo-600" /><div><p className="font-black uppercase italic text-slate-900">{currentBranch.name}</p><p className="text-xs font-bold text-slate-400">{tools.length} ferramenta(s) cadastrada(s) nesta filial</p></div></div>
          <div className="grid grid-cols-3 gap-2 min-w-[300px]">
            <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-center"><p className="text-xl font-black text-indigo-700">{photoCount}</p><p className="text-[8px] font-black uppercase text-indigo-500">Das fotos</p></div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-center"><p className="text-xl font-black text-amber-700">{unnamedCount}</p><p className="text-[8px] font-black uppercase text-amber-500">Sem nome</p></div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-center"><p className="text-xl font-black text-slate-700">{generatedCount}</p><p className="text-[8px] font-black uppercase text-slate-500">GEN</p></div>
          </div>
        </div>
      )}

      <section className="bg-white border border-slate-100 shadow-sm rounded-3xl p-4 md:p-5 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nome, código, marca ou locação" className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-sm" />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={sortMode}
              onChange={event => setSortMode(event.target.value as SortMode)}
              className="px-3 py-2.5 rounded-xl bg-slate-900 text-white font-black uppercase text-[9px] outline-none focus:ring-2 focus:ring-indigo-400"
              aria-label="Classificar ferramentas"
              title="Classificar ferramentas"
            >
              <option value="pending">Classificação: pendências primeiro</option>
              <option value="recent">Classificação: últimos modificados</option>
            </select>
            {([
              ['photos', `Das fotos (${photoCount})`],
              ['unnamed', `Sem nome (${unnamedCount})`],
              ['generated', `Código GEN (${generatedCount})`],
              ['all', `Todos (${tools.length})`],
            ] as [FilterMode, string][]).map(([value, label]) => (
              <button key={value} onClick={() => setFilter(value)} className={`px-3 py-2.5 rounded-xl font-black uppercase text-[9px] flex items-center gap-1.5 ${filter === value ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-600'}`}><Filter size={12} /> {label}</button>
            ))}
          </div>
        </div>

        <p className="text-[10px] font-bold text-slate-400">Use “Adicionar foto” para incluir novas imagens. Em “Classificação”, escolha “Últimos modificados” para ver primeiro tudo que foi alterado recentemente. Em cada foto você pode trocar ou excluir individualmente; código, saldo e histórico da ferramenta são preservados.</p>
      </section>

      {message && <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 font-bold text-sm flex gap-3"><AlertTriangle size={20} className="shrink-0" />{message}</div>}

      {!visibleTools.length ? (
        <div className="bg-white border border-slate-100 rounded-3xl py-16 px-6 text-center">
          <Package size={42} className="mx-auto text-slate-200" />
          <p className="mt-4 font-black uppercase italic text-slate-500">Nenhuma ferramenta neste filtro</p>
          <p className="mt-1 text-xs font-bold text-slate-400">Troque o filtro para “Todos” ou faça um novo inventário por fotos.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {visibleTools.map(tool => {
            const draft = drafts[tool.id] || makeDraft(tool);
            const photo = mainPhoto(tool);
            const photoUrls = toolPhotos(tool);
            const dirty = hasChanges(tool);
            const saving = savingId === tool.id;
            const uploadingPhoto = uploadingPhotoId === tool.id;
            const deletingPhoto = deletingPhotoId === tool.id;
            const photoBusy = uploadingPhoto || deletingPhoto;
            const saved = successId === tool.id;
            return (
              <article key={tool.id} className={`bg-white border rounded-3xl shadow-sm overflow-hidden ${!draft.name.trim() ? 'border-amber-200' : 'border-slate-100'}`}>
                <div className="p-4 md:p-5 grid grid-cols-1 lg:grid-cols-[190px_1fr_auto] gap-4 items-start">
                  <div className="space-y-2 w-full lg:w-[190px]">
                    <div className="relative w-full h-40 lg:h-[140px] rounded-2xl overflow-hidden bg-slate-50 border border-slate-100">
                      {photo ? <Image src={photo} alt={draft.name || draft.code || 'Ferramenta'} fill unoptimized className="object-contain" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={30} className="text-slate-300" /></div>}
                      {photoUrls.length > 0 && (
                        <span className="absolute top-2 right-2 rounded-lg bg-white/95 px-2 py-1 text-[8px] font-black text-indigo-700 shadow-sm">
                          {photoUrls.length} {photoUrls.length === 1 ? 'foto' : 'fotos'}
                        </span>
                      )}

                      {photo && (
                        <div className="absolute top-2 left-2 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => openCamera(tool.id, photo)}
                            disabled={photoBusy}
                            className="rounded-lg bg-white/95 px-2 py-1.5 text-[8px] font-black uppercase text-slate-700 shadow-sm flex items-center gap-1 disabled:opacity-50"
                            title="Trocar foto principal"
                          >
                            <Pencil size={11} /> Trocar
                          </button>
                          <button
                            type="button"
                            onClick={() => void removePhoto(tool, photo)}
                            disabled={photoBusy}
                            className="rounded-lg bg-rose-600/95 px-2 py-1.5 text-[8px] font-black uppercase text-white shadow-sm flex items-center gap-1 disabled:opacity-50"
                            title="Excluir foto principal"
                          >
                            {deletingPhoto ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Excluir
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => openCamera(tool.id)}
                        disabled={photoBusy}
                        className="absolute inset-x-2 bottom-2 rounded-xl bg-slate-950/90 text-white py-2 px-2 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-wider disabled:opacity-60"
                      >
                        {uploadingPhoto && !replacePhotoUrl ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                        {uploadingPhoto && !replacePhotoUrl ? 'Salvando' : 'Adicionar foto'}
                      </button>
                    </div>

                    {photoUrls.length > 1 && (
                      <div className="grid grid-cols-3 gap-2" aria-label={photoUrls.length + ' fotos cadastradas'}>
                        {photoUrls.slice(1, 10).map((url, index) => (
                          <div key={url + '-' + index} className="relative h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                            <Image src={url} alt={'Foto ' + (index + 2)} fill unoptimized className="object-cover" />
                            <div className="absolute inset-x-1 bottom-1 flex gap-1">
                              <button
                                type="button"
                                onClick={() => openCamera(tool.id, url)}
                                disabled={photoBusy}
                                className="h-6 flex-1 rounded-md bg-white/95 text-slate-700 flex items-center justify-center shadow-sm disabled:opacity-50"
                                title="Trocar esta foto"
                                aria-label="Trocar esta foto"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void removePhoto(tool, url)}
                                disabled={photoBusy}
                                className="h-6 flex-1 rounded-md bg-rose-600/95 text-white flex items-center justify-center shadow-sm disabled:opacity-50"
                                title="Excluir esta foto"
                                aria-label="Excluir esta foto"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {!draft.name.trim() && <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-[8px] font-black uppercase tracking-widest">Nome pendente</span>}
                      {photoFromInventory(tool) && <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[8px] font-black uppercase tracking-widest">Veio do inventário por foto</span>}
                      {normalize(draft.code).startsWith('gen-') && <span className="px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 text-[8px] font-black uppercase tracking-widest">Código automático</span>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                      <label className="xl:col-span-2"><span className="block mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Nome da ferramenta</span><input value={draft.name} onChange={event => updateDraft(tool.id, { name: event.target.value })} placeholder="Pode deixar em branco" className={`w-full px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400 font-black text-sm ${draft.name.trim() ? 'bg-slate-50' : 'bg-amber-50 text-amber-900'}`} /></label>
                      <label><span className="block mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Código</span><div className="relative"><Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={draft.code} onChange={event => { const code = event.target.value.toUpperCase(); updateDraft(tool.id, { code }); scheduleCodeLookup(tool, code); }} className="w-full pl-9 pr-3 py-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-mono font-bold text-sm" /></div></label>
                      <label><span className="block mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Marca</span><input value={draft.brand} onChange={event => updateDraft(tool.id, { brand: event.target.value })} className="w-full px-4 py-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-sm" /></label>
                      <label><span className="block mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Locação</span><input value={draft.location} onChange={event => updateDraft(tool.id, { location: event.target.value.toUpperCase() })} placeholder="Ex.: A2" className="w-full px-4 py-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-black uppercase text-sm" /></label>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <label className="w-36"><span className="block mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Saldo disponível</span><input type="number" min={0} value={draft.quantity_available} onChange={event => updateDraft(tool.id, { quantity_available: Math.max(0, Number(event.target.value) || 0) })} className="w-full px-4 py-3 rounded-xl bg-indigo-50 text-indigo-800 outline-none focus:ring-2 focus:ring-indigo-400 font-black text-sm" /></label>
                      <div className="pb-3 text-[10px] font-bold text-slate-400">Cautela: {Number(tool.cautela_quantity) || 0} • Emprestado: {Number(tool.borrowed_quantity) || 0}</div>
                    </div>
                  </div>

                  <button onClick={() => void saveTool(tool)} disabled={!dirty || saving} className={`min-w-40 px-4 py-3.5 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 ${saved ? 'bg-emerald-600 text-white' : dirty ? 'bg-slate-900 hover:bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {saving ? <><Loader2 size={15} className="animate-spin" /> Salvando</> : saved ? <><CheckCircle2 size={15} /> Salvo</> : <><Save size={15} /> Salvar ajuste</>}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
