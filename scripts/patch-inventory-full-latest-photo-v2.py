from pathlib import Path

rapid = Path('components/inventory/PhotoInventoryRapid.tsx')
source = rapid.read_text(encoding='utf-8')

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
if 'const primaryPreviewForItem' not in source:
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
new_save = r'''      // A foto ampla nunca é recortada para persistência. Uma mesma captura pode
      // originar vários itens, então subimos a imagem completa uma vez e reutilizamos a URL.
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
          // No item manual, cropPreview representa a própria foto aproximada inteira.
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

        // A última foto adicionada pelo usuário é sempre a principal.
        const latestExtraUrl = extraUrls.length ? extraUrls[extraUrls.length - 1] : null;
        const newPrimaryUrl = latestExtraUrl || sourceUrl || null;
        const capturedUrls = Array.from(new Set([
          newPrimaryUrl,
          ...[...extraUrls].reverse(),
          sourceUrl,
        ].filter(Boolean) as string[]));

        const { data: existing, error: findError } = await supabase
'''
if old_save in source:
    source = source.replace(old_save, new_save, 1)
elif 'const sourceUploadCache = new Map<string, string | null>();' not in source:
    raise SystemExit('save upload block not found')

source = source.replace(
    '            image_url: capturedUrls[0] || existing.image_url || null,\n',
    '            image_url: newPrimaryUrl || existing.image_url || null,\n',
    1,
)
source = source.replace(
    '            image_url: capturedUrls[0] || null,\n',
    '            image_url: newPrimaryUrl || null,\n',
    1,
)

source = source.replace(
    'A foto ampla é só para análise. Apenas o recorte individual é salvo.',
    'A foto completa é preservada. Se você adicionar outra foto ao item, a última vira a principal.'
)

old_summary = '''                    <div className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-slate-100 border border-slate-100">\n                      {item.cropPreview ? <Image src={item.cropPreview} alt={item.name || `Item ${index + 1}`} fill unoptimized className="object-contain" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Package size={24} /></div>}\n                    </div>'''
new_summary = '''                    <div className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-slate-100 border border-slate-100">\n                      {primaryPreviewForItem(item) ? <Image src={primaryPreviewForItem(item)!} alt={item.name || `Item ${index + 1}`} fill unoptimized className="object-contain bg-slate-950" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Package size={24} /></div>}\n                    </div>'''
if old_summary in source:
    source = source.replace(old_summary, new_summary, 1)
elif 'primaryPreviewForItem(item)' not in source:
    raise SystemExit('summary image block not found')

source = source.replace(
    'O recorte da IA fica como principal. Adicione quantas fotos complementares precisar antes de salvar.',
    'A foto completa é preservada. A última foto que você adicionar neste item será usada como principal.'
)

old_extra = '''                                <Image src={photo.preview} alt={`Foto complementar ${photoIndex + 1}`} fill unoptimized className="object-contain bg-slate-950" />\n                                <button type="button" onClick={() => removeItemPhoto(item.id, photo.id)} className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/65 text-white" aria-label="Remover foto complementar"><Trash2 size={12} /></button>'''
new_extra = '''                                <Image src={photo.preview} alt={`Foto complementar ${photoIndex + 1}`} fill unoptimized className="object-contain bg-slate-950" />\n                                {photoIndex === item.extraPhotos.length - 1 && <span className="absolute left-1.5 bottom-1.5 rounded-md bg-emerald-600 px-1.5 py-1 text-[7px] font-black uppercase text-white">Principal</span>}\n                                <button type="button" onClick={() => removeItemPhoto(item.id, photo.id)} className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/65 text-white" aria-label="Remover foto complementar"><Trash2 size={12} /></button>'''
if old_extra in source:
    source = source.replace(old_extra, new_extra, 1)

rapid.write_text(source, encoding='utf-8')

adjustments = Path('app/dashboard/inventory/adjustments/page.tsx')
source = adjustments.read_text(encoding='utf-8')
old_urls = ': Array.from(new Set([...oldUrls, ...uploadedUrls]));'
new_urls = ': Array.from(new Set([...uploadedUrls].reverse().concat(oldUrls)));'
if old_urls in source:
    source = source.replace(old_urls, new_urls, 1)
elif new_urls not in source:
    raise SystemExit('imageUrls marker not found in adjustments')

old_primary = ': (uploadedUrls[0] || oldUrls[0] || null);'
new_primary = ': (uploadedUrls[uploadedUrls.length - 1] || oldUrls[0] || null);'
if old_primary in source:
    source = source.replace(old_primary, new_primary, 1)
elif new_primary not in source:
    raise SystemExit('primaryPhoto marker not found in adjustments')

adjustments.write_text(source, encoding='utf-8')
print('final inventory photo patch applied')
