'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  CopyPlus,
  Images,
  Loader2,
  MapPin,
  PackagePlus,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { deleteFile, uploadFile } from '@/lib/storage';

type Branch = { id: string; name: string; city?: string | null };
type ManualRow = {
  id: string;
  name: string;
  code: string;
  brand: string;
  location: string;
  quantity: number;
  file: File | null;
  preview: string | null;
};

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function normalizeCode(value?: string | null) {
  return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function generatedCode() {
  return `GEN-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
}

function blankRow(location = ''): ManualRow {
  return {
    id: uid(),
    name: '',
    code: '',
    brand: '',
    location: location.trim().toUpperCase(),
    quantity: 1,
    file: null,
    preview: null,
  };
}

export default function ManualInventoryBulkPage() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [defaultLocation, setDefaultLocation] = useState('');
  const [rows, setRows] = useState<ManualRow[]>([blankRow()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [successCount, setSuccessCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('branches').select('id,name,city').order('name');
      if (error) {
        console.error(error);
        setMessage('Não foi possível carregar as filiais.');
        setLoading(false);
        return;
      }

      const all = (data || []) as Branch[];
      const visible = user?.role === 'Operador' && user.branch_id
        ? all.filter(branch => branch.id === user.branch_id)
        : all;
      setBranches(visible);

      let requestedBranch = '';
      let requestedLocation = '';
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        requestedBranch = params.get('branch') || '';
        requestedLocation = (params.get('location') || '').trim().toUpperCase();
      }

      const preferred = visible.find(branch => branch.id === requestedBranch)?.id
        || visible.find(branch => branch.id === user?.branch_id)?.id
        || visible[0]?.id
        || '';
      setBranchId(preferred);
      if (requestedLocation) {
        setDefaultLocation(requestedLocation);
        setRows([blankRow(requestedLocation)]);
      }
      setLoading(false);
    };

    void load();
  }, [user]);

  const currentBranch = branches.find(branch => branch.id === branchId) || null;
  const activeRows = useMemo(() => rows.filter(row =>
    Boolean(row.name.trim() || row.code.trim() || row.brand.trim() || row.file)
  ), [rows]);

  const updateRow = (id: string, patch: Partial<ManualRow>) => {
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
    setSuccessCount(0);
    setMessage('');
  };

  const addRows = (count: number) => {
    setRows(current => [
      ...current,
      ...Array.from({ length: count }, () => blankRow(defaultLocation)),
    ]);
    setSuccessCount(0);
  };

  const removeRow = (id: string) => {
    setRows(current => {
      const target = current.find(row => row.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      const next = current.filter(row => row.id !== id);
      return next.length ? next : [blankRow(defaultLocation)];
    });
  };

  const setRowPhoto = (id: string, file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    setRows(current => current.map(row => {
      if (row.id !== id) return row;
      if (row.preview) URL.revokeObjectURL(row.preview);
      return { ...row, file, preview: URL.createObjectURL(file) };
    }));
    setSuccessCount(0);
    setMessage('');
  };

  const removeRowPhoto = (id: string) => {
    setRows(current => current.map(row => {
      if (row.id !== id) return row;
      if (row.preview) URL.revokeObjectURL(row.preview);
      return { ...row, file: null, preview: null };
    }));
  };

  const addPhotosInBulk = (files: FileList | null) => {
    if (!files) return;
    const images = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (!images.length) return;
    const additions = images.map(file => ({
      ...blankRow(defaultLocation),
      file,
      preview: URL.createObjectURL(file),
    }));
    setRows(current => {
      const onlyBlank = current.length === 1
        && !current[0].name.trim()
        && !current[0].code.trim()
        && !current[0].brand.trim()
        && !current[0].file;
      return onlyBlank ? additions : [...current, ...additions];
    });
    setSuccessCount(0);
    setMessage('');
  };

  const applyDefaultLocation = () => {
    const location = defaultLocation.trim().toUpperCase();
    setDefaultLocation(location);
    setRows(current => current.map(row => ({ ...row, location })));
  };

  const clearRows = () => {
    rows.forEach(row => {
      if (row.preview) URL.revokeObjectURL(row.preview);
    });
    setRows([blankRow(defaultLocation)]);
    setSuccessCount(0);
    setMessage('');
  };

  const saveAll = async () => {
    if (!currentBranch || !user || saving) return;
    const selected = rows.filter(row =>
      Boolean(row.name.trim() || row.code.trim() || row.brand.trim() || row.file)
    );
    if (!selected.length) {
      setMessage('Adicione pelo menos uma ferramenta ou uma foto antes de salvar.');
      return;
    }

    const normalizedRows = selected.map(row => ({
      ...row,
      location: (row.location.trim() || defaultLocation.trim()).toUpperCase(),
      quantity: Math.max(1, Math.round(Number(row.quantity) || 1)),
    }));
    if (normalizedRows.some(row => !row.location)) {
      setMessage('Informe a locação padrão ou a locação de cada ferramenta.');
      return;
    }

    setSaving(true);
    setMessage('');
    setSuccessCount(0);
    const uploadedUrls: string[] = [];

    try {
      const { data: existingData, error: existingError } = await supabase
        .from('tools')
        .select('code')
        .eq('branch_id', currentBranch.id);
      if (existingError) throw existingError;

      const usedCodes = new Set((existingData || []).map(item => normalizeCode(item.code)).filter(Boolean));
      const batchCodes = new Set<string>();
      const identities = normalizedRows.map(row => {
        const typedCode = row.code.trim().toUpperCase();
        if (typedCode) {
          const normalized = normalizeCode(typedCode);
          if (usedCodes.has(normalized)) {
            throw new Error(`O código ${typedCode} já existe em ${currentBranch.name}. O cadastro manual em massa nunca sobrescreve ferramenta existente.`);
          }
          if (batchCodes.has(normalized)) {
            throw new Error(`O código ${typedCode} foi repetido neste lote.`);
          }
          batchCodes.add(normalized);
          return typedCode;
        }

        let generated = generatedCode();
        while (usedCodes.has(normalizeCode(generated)) || batchCodes.has(normalizeCode(generated))) {
          generated = generatedCode();
        }
        batchCodes.add(normalizeCode(generated));
        return generated;
      });

      const photos = await Promise.all(normalizedRows.map(async (row, index) => {
        if (!row.file) return null;
        const url = await uploadFile(
          row.file,
          `ferramentas/inventario/manual/${currentBranch.id}/${Date.now()}-${index + 1}`,
        );
        if (url) uploadedUrls.push(url);
        return url;
      }));

      const payload = normalizedRows.map((row, index) => ({
        name: row.name.trim(),
        code: identities[index],
        brand: row.brand.trim() || null,
        branch: currentBranch.name,
        branch_id: currentBranch.id,
        quantity_available: row.quantity,
        cautela_quantity: 0,
        borrowed_quantity: 0,
        status: 'disponivel',
        location: row.location,
        image_url: photos[index] || null,
        image_urls: photos[index] ? [photos[index]] : [],
      }));

      const { error } = await supabase.from('tools').insert(payload);
      if (error) throw error;

      rows.forEach(row => {
        if (row.preview) URL.revokeObjectURL(row.preview);
      });
      setRows([blankRow(defaultLocation)]);
      setSuccessCount(payload.length);
      setMessage(`${payload.length} ferramenta(s) adicionada(s) sem usar a fila da IA.`);
    } catch (error) {
      console.error(error);
      await Promise.all(uploadedUrls.map(url => deleteFile(url)));
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o lote manual.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-24 flex justify-center text-indigo-600"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-7 pb-28 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <a href="/dashboard/inventory" className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 flex items-center gap-2">
            <ArrowLeft size={15} /> Voltar ao inventário por fotos
          </a>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center"><PackagePlus size={23} /></div>
            <div>
              <h1 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900">Manual em massa</h1>
              <p className="text-sm font-bold text-slate-500 mt-1">Cadastre várias ferramentas e fotos sem esperar Groq, análise ou fila do inventário.</p>
            </div>
          </div>
        </div>
        <a href={branchId ? `/dashboard/inventory/adjustments?branch=${branchId}` : '/dashboard/inventory/adjustments'} className="px-4 py-3 rounded-xl bg-slate-900 text-white font-black uppercase tracking-widest text-[10px] text-center">
          Ver ferramentas cadastradas
        </a>
      </div>

      <section className="bg-white border border-slate-100 shadow-sm rounded-3xl p-5 md:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_minmax(180px,1fr)_auto] gap-3 items-end">
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Filial</span>
            <select
              value={branchId}
              disabled={user?.role === 'Operador'}
              onChange={event => setBranchId(event.target.value)}
              className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-100 font-black uppercase text-xs outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-70"
            >
              {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}{branch.city ? ` • ${branch.city}` : ''}</option>)}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Locação padrão</span>
            <div className="relative">
              <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={defaultLocation}
                onChange={event => setDefaultLocation(event.target.value.toUpperCase())}
                placeholder="A4"
                className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-slate-50 border border-slate-100 font-black uppercase outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </label>

          <button type="button" onClick={applyDefaultLocation} className="px-4 py-3.5 rounded-xl bg-indigo-50 text-indigo-700 font-black uppercase tracking-widest text-[10px]">
            Aplicar em todas
          </button>
        </div>
      </section>

      <section className="bg-white border border-slate-100 shadow-sm rounded-3xl p-4 md:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-black uppercase italic text-slate-900">Lote manual</h2>
            <p className="text-xs font-bold text-slate-400 mt-1">Foto é opcional. Código também: vazio gera um GEN exclusivo e nunca altera ferramenta antiga.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => addRows(1)} className="px-3.5 py-3 rounded-xl bg-slate-100 text-slate-700 font-black uppercase text-[9px] flex items-center gap-1.5"><Plus size={14} /> 1 linha</button>
            <button type="button" onClick={() => addRows(5)} className="px-3.5 py-3 rounded-xl bg-slate-100 text-slate-700 font-black uppercase text-[9px] flex items-center gap-1.5"><CopyPlus size={14} /> 5 linhas</button>
            <label className="px-3.5 py-3 rounded-xl bg-amber-500 text-white font-black uppercase text-[9px] flex items-center gap-1.5 cursor-pointer">
              <Images size={14} /> Adicionar várias fotos
              <input type="file" accept="image/*" multiple className="hidden" onChange={event => { addPhotosInBulk(event.target.files); event.currentTarget.value = ''; }} />
            </label>
            <button type="button" onClick={clearRows} className="px-3.5 py-3 rounded-xl bg-rose-50 text-rose-700 font-black uppercase text-[9px]">Limpar lote</button>
          </div>
        </div>
      </section>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <article key={row.id} className="bg-white border border-slate-100 shadow-sm rounded-3xl p-4 md:p-5">
            <div className="grid grid-cols-1 xl:grid-cols-[108px_2fr_1.2fr_1.2fr_0.8fr_0.65fr_auto] gap-3 items-end">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">#{index + 1}</span>
                  {rows.length > 1 && <button type="button" onClick={() => removeRow(row.id)} className="text-rose-500"><X size={15} /></button>}
                </div>
                <label className="relative h-20 rounded-2xl bg-slate-50 border border-dashed border-slate-200 overflow-hidden flex items-center justify-center cursor-pointer group">
                  {row.preview ? (
                    <img src={row.preview} alt={`Ferramenta ${index + 1}`} className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center text-slate-400"><Camera size={20} className="mx-auto" /><span className="text-[8px] font-black uppercase">Foto</span></div>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={event => { setRowPhoto(row.id, event.target.files?.[0] || null); event.currentTarget.value = ''; }} />
                </label>
                {row.preview && <button type="button" onClick={() => removeRowPhoto(row.id)} className="mt-1.5 w-full text-[8px] font-black uppercase text-rose-500 flex items-center justify-center gap-1"><Trash2 size={10} /> remover foto</button>}
              </div>

              <label className="space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Nome</span>
                <input value={row.name} onChange={event => updateRow(row.id, { name: event.target.value })} placeholder="Ex.: Chave de impacto" className="w-full px-3.5 py-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-sm" />
              </label>

              <label className="space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Código opcional</span>
                <input value={row.code} onChange={event => updateRow(row.id, { code: event.target.value.toUpperCase() })} placeholder="Vazio = GEN" className="w-full px-3.5 py-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-black uppercase text-sm" />
              </label>

              <label className="space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Marca</span>
                <input value={row.brand} onChange={event => updateRow(row.id, { brand: event.target.value })} placeholder="Opcional" className="w-full px-3.5 py-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-sm" />
              </label>

              <label className="space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Locação</span>
                <input value={row.location} onChange={event => updateRow(row.id, { location: event.target.value.toUpperCase() })} placeholder={defaultLocation || 'A4'} className="w-full px-3.5 py-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-black uppercase text-sm" />
              </label>

              <label className="space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Qtd.</span>
                <input type="number" min={1} value={row.quantity} onChange={event => updateRow(row.id, { quantity: Math.max(1, Number(event.target.value) || 1) })} className="w-full px-3.5 py-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-black text-sm" />
              </label>

              <button type="button" onClick={() => removeRow(row.id)} disabled={rows.length === 1} className="h-[46px] px-3 rounded-xl bg-rose-50 text-rose-600 disabled:opacity-30 flex items-center justify-center" title="Remover linha"><Trash2 size={17} /></button>
            </div>
          </article>
        ))}
      </div>

      {message && (
        <div className={`rounded-2xl px-4 py-3 font-bold text-sm flex items-center gap-2 ${successCount ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
          {successCount ? <CheckCircle2 size={18} /> : <PackagePlus size={18} />}{message}
        </div>
      )}

      <div className="sticky bottom-4 z-30 bg-slate-950/95 backdrop-blur rounded-2xl md:rounded-3xl p-3 md:p-4 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="text-white">
          <p className="font-black uppercase italic">{activeRows.length} ferramenta(s) pronta(s)</p>
          <p className="text-[10px] font-bold text-slate-400">Salvamento manual direto no estoque • sem análise de foto</p>
        </div>
        <button
          type="button"
          onClick={() => void saveAll()}
          disabled={saving || !activeRows.length || !currentBranch}
          className="px-6 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? 'Salvando lote...' : `Salvar ${activeRows.length || ''} ferramenta(s)`}
        </button>
      </div>
    </div>
  );
}
