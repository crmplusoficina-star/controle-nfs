from pathlib import Path

path = Path('app/dashboard/inventory/adjustments/page.tsx')
source = path.read_text()

source = source.replace(
"""function normalize(value?: string | null) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .trim();
}
""",
"""function normalize(value?: string | null) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
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
""")

source = source.replace(
"""  const [branchId, setBranchId] = useState('');
  const [tools, setTools] = useState<Tool[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
""",
"""  const [branchId, setBranchId] = useState('');
  const [tools, setTools] = useState<Tool[]>([]);
  const [catalog, setCatalog] = useState<Tool[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
""")

source = source.replace(
"""  const [successId, setSuccessId] = useState('');
  const cameraInputRef = useRef<HTMLInputElement>(null);
""",
"""  const [successId, setSuccessId] = useState('');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const catalogRef = useRef<Tool[]>([]);
  const draftsRef = useRef<Record<string, Draft>>({});
  const lookupTimersRef = useRef<Record<string, number>>({});

  useEffect(() => { catalogRef.current = catalog; }, [catalog]);
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);
  useEffect(() => () => {
    Object.values(lookupTimersRef.current).forEach(timer => window.clearTimeout(timer));
  }, []);
""")

old_load = """    setLoading(true);
    setMessage('');
    const { data, error } = await supabase
      .from('tools')
      .select('id,name,code,brand,branch,branch_id,location,quantity_available,cautela_quantity,borrowed_quantity,status,image_url,image_urls,created_at,updated_at')
      .eq('branch_id', selectedBranchId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error(error);
      setMessage(error.message || 'Não foi possível carregar as ferramentas desta filial.');
      setLoading(false);
      return;
    }

    const rows = (data || []) as Tool[];
"""
new_load = """    setLoading(true);
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
"""
if old_load not in source:
    raise SystemExit('loadTools block not found')
source = source.replace(old_load, new_load)

anchor = """  const hasChanges = (tool: Tool) => {
    const draft = drafts[tool.id];
    if (!draft) return false;
    return draft.name !== (tool.name || '')
      || draft.code !== (tool.code || '')
      || draft.brand !== (tool.brand || '')
      || draft.location !== (tool.location || '')
      || draft.quantity_available !== Math.max(0, Number(tool.quantity_available) || 0);
  };

"""
insert = anchor + """  const templateByCode = (tool: Tool, value: string) => {
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
    const currentName = currentDraft.name.trim();
    const pendingName = !currentName || normalize(currentName).includes('ferramenta nao identificada');
    const nextName = pendingName ? String(template.name || '').trim() : currentDraft.name;
    const nextBrand = currentDraft.brand.trim() || String(template.brand || '').trim();
    const localPhotos = toolPhotos(tool);
    const referencePhotos = toolPhotos(template);
    const imageUrls = Array.from(new Set([...localPhotos, ...referencePhotos]));
    const primaryPhoto = tool.image_url || imageUrls[0] || null;
    const sameBranchConflict = catalogRef.current.some(item =>
      item.id !== tool.id && item.branch_id === tool.branch_id && normalizeCode(item.code) === normalizeCode(template.code)
    );
    const canAdoptCode = adoptCode && !sameBranchConflict && Boolean(template.code) && (
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

"""
if anchor not in source:
    raise SystemExit('hasChanges anchor not found')
source = source.replace(anchor, insert)

source = source.replace(
"""    setUploadingPhotoId(toolId);
    setMessage('');
    try {
      const uploaded = await Promise.all(
""",
"""    setUploadingPhotoId(toolId);
    setMessage('');
    const identification = identifyTemplateFromPhoto(selectedFiles[0], tool);
    try {
      const uploaded = await Promise.all(
""")

old_after_photo = """      setTools(current => current.map(item => item.id === tool.id
        ? { ...item, image_url: primaryPhoto, image_urls: imageUrls, updated_at: updatedAt }
        : item));

      if (replacing && replacePhotoUrl && replacePhotoUrl !== uploadedUrls[0]) {
        const deleted = await deleteFile(replacePhotoUrl);
        if (!deleted) console.warn('A foto antiga saiu do cadastro, mas não foi possível removê-la do storage.');
      }

      setSuccessId(tool.id);
"""
new_after_photo = """      const toolWithNewPhotos = { ...tool, image_url: primaryPhoto, image_urls: imageUrls, updated_at: updatedAt };
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
"""
if old_after_photo not in source:
    raise SystemExit('photo update block not found')
source = source.replace(old_after_photo, new_after_photo)

source = source.replace(
"""      const deleted = await deleteFile(photoUrl);
      if (!deleted) console.warn('A foto foi removida do cadastro, mas o arquivo não pôde ser apagado do storage.');
""",
"""      await deleteFileIfUnused(photoUrl, tool.id);
""")

source = source.replace(
"""    setTools(current => current.map(item => item.id === tool.id ? { ...item, ...payload } : item));
    setDrafts(current => ({ ...current, [tool.id]: { ...draft, ...payload, brand: draft.brand.trim(), location: draft.location.trim().toUpperCase() } }));
""",
"""    const updatedTool = { ...tool, ...payload } as Tool;
    setTools(current => current.map(item => item.id === tool.id ? updatedTool : item));
    setCatalog(current => {
      const next = current.map(item => item.id === tool.id ? updatedTool : item);
      catalogRef.current = next;
      return next;
    });
    setDrafts(current => ({ ...current, [tool.id]: { ...draft, ...payload, brand: draft.brand.trim(), location: draft.location.trim().toUpperCase() } }));
""")

old_code_input = """<input value={draft.code} onChange={event => updateDraft(tool.id, { code: event.target.value.toUpperCase() })} className=\"w-full pl-9 pr-3 py-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-mono font-bold text-sm\" />"""
new_code_input = """<input value={draft.code} onChange={event => { const code = event.target.value.toUpperCase(); updateDraft(tool.id, { code }); scheduleCodeLookup(tool, code); }} className=\"w-full pl-9 pr-3 py-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 font-mono font-bold text-sm\" />"""
if old_code_input not in source:
    raise SystemExit('code input not found')
source = source.replace(old_code_input, new_code_input)

path.write_text(source)
print('Automatic catalog enrichment patch applied.')
