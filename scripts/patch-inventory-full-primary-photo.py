from pathlib import Path

path = Path('components/inventory/PhotoInventoryRapid.tsx')
source = path.read_text(encoding='utf-8')

marker = "  const includedItems = useMemo(() => items.filter(item => item.included), [items]);\n"
helper = r'''  const primaryPreviewForItem = (item: Candidate) => {
    const latestExtra = item.extraPhotos[item.extraPhotos.length - 1]?.preview;
    if (latestExtra) return latestExtra;
    const sourcePhoto = item.sourcePhotoId
      ? photosRef.current.find(photo => photo.id === item.sourcePhotoId)?.preview
      : null;
    return sourcePhoto || item.cropPreview || null;
  };

'''
if marker not in source:
    raise SystemExit('includedItems marker not found')
source = source.replace(marker, helper + marker, 1)

old_save = r'''      for (const item of selected) {
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
'''
new_save = r'''      // Uma foto da fila pode originar vários itens. Fazemos upload da imagem
      // completa uma única vez e reutilizamos a URL, evitando salvar recortes como padrão.
      const sourceUploadCache = new Map<string, string | null>();

      for (const item of selected) {
        const identity = resolveIdentity(item);
        const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
        const safeName = normalize(identity.name).replace(/\s+/g, '-').slice(0, 50) || 'item';

        let sourceUrl: string | null = null;
        if (item.sourcePhotoId) {
          if (sourceUploadCache.has(item.sourcePhotoId)) {
            sourceUrl = sourceUploadCache.get(item.sourcePhotoId) || null;
          } else {
            const sourcePhoto = photosRef.current.find(photo => photo.id === item.sourcePhotoId);
            sourceUrl = sourcePhoto
              ? await uploadFile(sourcePhoto.file, 'ferramentas/inventario/originais')
              : null;
            sourceUploadCache.set(item.sourcePhotoId, sourceUrl);
          }
        } else if (item.cropPreview) {
          // Item manual: cropPreview neste fluxo é a própria foto aproximada completa.
          sourceUrl = await uploadFile(
            dataUrlToFile(item.cropPreview, `${safeName}-${Date.now()}.jpg`),
            'ferramentas/inventario/itens',
          );
        }

        const extraUrls = (await Promise.all(
          item.extraPhotos.map((photo, photoIndex) => uploadFile(
            photo.file,
            `ferramentas/inventario/itens/${safeName}-${photoIndex + 1}`,
          )),
        )).filter((url): url is string => Boolean(url));

        // Regra de foto principal: a última foto adicionada pelo usuário sempre vence.
        // Se não houver complementar, usamos a foto COMPLETA da captura em massa.
        const latestExtraUrl = extraUrls.length ? extraUrls[extraUrls.length - 1] : null;
        const newPrimaryUrl = latestExtraUrl || sourceUrl || null;
        const capturedUrls = Array.from(new Set([
          newPrimaryUrl,
          ...[...extraUrls].reverse(),
          sourceUrl,
        ].filter(Boolean) as string[]));

        const { data: existing, error: findError } = await supabase
'''
if old_save not in source:
    raise SystemExit('save upload block not found')
source = source.replace(old_save, new_save, 1)

source = source.replace("            image_url: capturedUrls[0] || existing.image_url || null,\n", "            image_url: newPrimaryUrl || existing.image_url || null,\n", 1)
source = source.replace("            image_url: capturedUrls[0] || null,\n", "            image_url: newPrimaryUrl || null,\n", 1)

old_summary = '''                    <div className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-slate-100 border border-slate-100">\n                      {item.cropPreview ? <Image src={item.cropPreview} alt={item.name || `Item ${index + 1}`} fill unoptimized className="object-contain" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Package size={24} /></div>}\n                    </div>'''
new_summary = '''                    <div className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-slate-100 border border-slate-100">\n                      {primaryPreviewForItem(item) ? <Image src={primaryPreviewForItem(item)!} alt={item.name || `Item ${index + 1}`} fill unoptimized className="object-contain bg-slate-950" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Package size={24} /></div>}\n                    </div>'''
if old_summary not in source:
    raise SystemExit('summary image block not found')
source = source.replace(old_summary, new_summary, 1)

old_text = 'O recorte da IA fica como principal. Adicione quantas fotos complementares precisar antes de salvar.'
new_text = 'A foto completa é preservada. A última foto que você adicionar neste item será usada como principal.'
if old_text not in source:
    raise SystemExit('photo helper text not found')
source = source.replace(old_text, new_text, 1)

old_extra = '''                                <Image src={photo.preview} alt={`Foto complementar ${photoIndex + 1}`} fill unoptimized className="object-contain bg-slate-950" />\n                                <button type="button" onClick={() => removeItemPhoto(item.id, photo.id)} className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/65 text-white" aria-label="Remover foto complementar"><Trash2 size={12} /></button>'''
new_extra = '''                                <Image src={photo.preview} alt={`Foto complementar ${photoIndex + 1}`} fill unoptimized className="object-contain bg-slate-950" />\n                                {photoIndex === item.extraPhotos.length - 1 && <span className="absolute left-1.5 bottom-1.5 rounded-md bg-emerald-600 px-1.5 py-1 text-[7px] font-black uppercase text-white">Principal</span>}\n                                <button type="button" onClick={() => removeItemPhoto(item.id, photo.id)} className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/65 text-white" aria-label="Remover foto complementar"><Trash2 size={12} /></button>'''
if old_extra not in source:
    raise SystemExit('extra photo image block not found')
source = source.replace(old_extra, new_extra, 1)

path.write_text(source, encoding='utf-8')
print('inventory full-primary-photo patch applied')
