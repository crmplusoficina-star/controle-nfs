from pathlib import Path

path = Path('components/inventory/PhotoInventoryRapid.tsx')
source = path.read_text()

source = source.replace(
"""type Photo = {\n  id: string;\n  file: File;\n  preview: string;\n  status: PhotoStatus;\n  attempts: number;\n  error?: string;\n};\ntype ReviewState = 'auto' | 'review' | 'manual';\n""",
"""type Photo = {\n  id: string;\n  file: File;\n  preview: string;\n  status: PhotoStatus;\n  attempts: number;\n  error?: string;\n};\ntype ItemPhoto = {\n  id: string;\n  file: File;\n  preview: string;\n};\ntype ReviewState = 'auto' | 'review' | 'manual';\n""")

source = source.replace(
"""  cropPreview: string | null;\n  included: boolean;\n""",
"""  cropPreview: string | null;\n  extraPhotos: ItemPhoto[];\n  included: boolean;\n""")

source = source.replace(
"""  useEffect(() => () => {\n    photosRef.current.forEach(photo => URL.revokeObjectURL(photo.preview));\n    retryTimersRef.current.forEach(timer => window.clearTimeout(timer));\n  }, []);\n""",
"""  useEffect(() => () => {\n    photosRef.current.forEach(photo => URL.revokeObjectURL(photo.preview));\n    itemsRef.current.forEach(item => item.extraPhotos.forEach(photo => URL.revokeObjectURL(photo.preview)));\n    retryTimersRef.current.forEach(timer => window.clearTimeout(timer));\n  }, []);\n""")

source = source.replace(
"""  const clearSession = (clearLocation = true) => {\n    photosRef.current.forEach(photo => URL.revokeObjectURL(photo.preview));\n    setPhotosSynced(() => []);\n    setItemsSynced(() => []);\n""",
"""  const clearSession = (clearLocation = true) => {\n    photosRef.current.forEach(photo => URL.revokeObjectURL(photo.preview));\n    itemsRef.current.forEach(item => item.extraPhotos.forEach(photo => URL.revokeObjectURL(photo.preview)));\n    setPhotosSynced(() => []);\n    setItemsSynced(() => []);\n""")

source = source.replace(
"""        cropPreview,\n        included: true,\n""",
"""        cropPreview,\n        extraPhotos: [],\n        included: true,\n""")

source = source.replace(
"""    cropPreview,\n    included: true,\n""",
"""    cropPreview,\n    extraPhotos: [],\n    included: true,\n""")

anchor = """  const updateItem = (id: string, patch: Partial<Candidate>) => {\n    setItemsSynced(current => current.map(item => item.id === id ? { ...item, ...patch } : item));\n  };\n\n"""
insert = """  const addItemPhotos = (id: string, files: FileList | null) => {\n    if (!files) return;\n    const additions = Array.from(files)\n      .filter(file => file.type.startsWith('image/'))\n      .map(file => ({ id: uid(), file, preview: URL.createObjectURL(file) }));\n    if (!additions.length) return;\n    setItemsSynced(current => current.map(item => item.id === id\n      ? { ...item, extraPhotos: [...item.extraPhotos, ...additions] }\n      : item));\n    setSaved(null);\n  };\n\n  const removeItemPhoto = (itemId: string, photoId: string) => {\n    const item = itemsRef.current.find(candidate => candidate.id === itemId);\n    const target = item?.extraPhotos.find(photo => photo.id === photoId);\n    if (target) URL.revokeObjectURL(target.preview);\n    setItemsSynced(current => current.map(candidate => candidate.id === itemId\n      ? { ...candidate, extraPhotos: candidate.extraPhotos.filter(photo => photo.id !== photoId) }\n      : candidate));\n  };\n\n  const removeItem = (id: string) => {\n    const item = itemsRef.current.find(candidate => candidate.id === id);\n    item?.extraPhotos.forEach(photo => URL.revokeObjectURL(photo.preview));\n    setItemsSynced(current => current.filter(candidate => candidate.id !== id));\n  };\n\n""" + anchor
if anchor not in source:
    raise SystemExit('updateItem anchor not found')
source = source.replace(anchor, insert)

old_save_crop = """        let cropUrl: string | null = null;\n        if (item.cropPreview) {\n          const safeName = normalize(identity.name).replace(/\\s+/g, '-').slice(0, 50) || 'item';\n          cropUrl = await uploadFile(\n            dataUrlToFile(item.cropPreview, `${safeName}-${Date.now()}.jpg`),\n            'ferramentas/inventario/recortes',\n          );\n        }\n\n        const { data: existing, error: findError } = await supabase\n"""
new_save_crop = """        let cropUrl: string | null = null;\n        const safeName = normalize(identity.name).replace(/\\s+/g, '-').slice(0, 50) || 'item';\n        if (item.cropPreview) {\n          cropUrl = await uploadFile(\n            dataUrlToFile(item.cropPreview, `${safeName}-${Date.now()}.jpg`),\n            'ferramentas/inventario/recortes',\n          );\n        }\n        const extraUrls = (await Promise.all(\n          item.extraPhotos.map((photo, photoIndex) => uploadFile(\n            photo.file,\n            `ferramentas/inventario/itens/${safeName}-${photoIndex + 1}`,\n          )),\n        )).filter((url): url is string => Boolean(url));\n        const capturedUrls = Array.from(new Set([cropUrl, ...extraUrls].filter(Boolean) as string[]));\n\n        const { data: existing, error: findError } = await supabase\n"""
if old_save_crop not in source:
    raise SystemExit('save crop block not found')
source = source.replace(old_save_crop, new_save_crop)

source = source.replace(
"""          const finalUrls = cropUrl ? Array.from(new Set([cropUrl, ...oldUrls])) : oldUrls;\n""",
"""          const finalUrls = capturedUrls.length ? Array.from(new Set([...capturedUrls, ...oldUrls])) : oldUrls;\n""")

source = source.replace(
"""            image_url: cropUrl || existing.image_url || null,\n""",
"""            image_url: capturedUrls[0] || existing.image_url || null,\n""")

source = source.replace(
"""            image_url: cropUrl,\n            image_urls: cropUrl ? [cropUrl] : [],\n""",
"""            image_url: capturedUrls[0] || null,\n            image_urls: capturedUrls,\n""")

old_note = """                      <p className=\"mt-2 text-[10px] font-bold text-slate-400\">Se não souber o nome agora, deixe em branco. O item será salvo pelo código automático, foto, filial e locação.</p>\n                      <div className=\"flex flex-wrap gap-2 mt-3\">\n"""
new_note = """                      <div className=\"mt-4 rounded-2xl bg-white border border-slate-200 p-3\">\n                        <div className=\"flex flex-col sm:flex-row sm:items-center justify-between gap-2\">\n                          <div><p className=\"text-[9px] font-black uppercase tracking-widest text-slate-500\">Fotos deste item</p><p className=\"mt-1 text-[10px] font-bold text-slate-400\">O recorte da IA fica como principal. Adicione quantas fotos complementares precisar antes de salvar.</p></div>\n                          <div className=\"flex gap-2\">\n                            <label className=\"px-3 py-2 rounded-lg bg-slate-900 text-white font-black uppercase text-[9px] flex items-center gap-1.5 cursor-pointer\"><Camera size={13} /> Câmera<input type=\"file\" accept=\"image/*\" capture=\"environment\" className=\"hidden\" onChange={event => { addItemPhotos(item.id, event.target.files); event.currentTarget.value = ''; }} /></label>\n                            <label className=\"px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 font-black uppercase text-[9px] flex items-center gap-1.5 cursor-pointer\"><Images size={13} /> Galeria<input type=\"file\" accept=\"image/*\" multiple className=\"hidden\" onChange={event => { addItemPhotos(item.id, event.target.files); event.currentTarget.value = ''; }} /></label>\n                          </div>\n                        </div>\n                        {item.extraPhotos.length > 0 && (\n                          <div className=\"grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3\">\n                            {item.extraPhotos.map((photo, photoIndex) => (\n                              <div key={photo.id} className=\"relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200\">\n                                <Image src={photo.preview} alt={`Foto complementar ${photoIndex + 1}`} fill unoptimized className=\"object-cover\" />\n                                <button type=\"button\" onClick={() => removeItemPhoto(item.id, photo.id)} className=\"absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/65 text-white\" aria-label=\"Remover foto complementar\"><Trash2 size={12} /></button>\n                              </div>\n                            ))}\n                          </div>\n                        )}\n                      </div>\n                      <p className=\"mt-2 text-[10px] font-bold text-slate-400\">Se não souber o nome agora, deixe em branco. O item será salvo pelo código automático, fotos, filial e locação.</p>\n                      <div className=\"flex flex-wrap gap-2 mt-3\">\n"""
if old_note not in source:
    raise SystemExit('review note anchor not found')
source = source.replace(old_note, new_note)

source = source.replace(
"""<button onClick={() => setItemsSynced(current => current.filter(candidate => candidate.id !== item.id))} className=\"px-3 py-2 rounded-lg bg-rose-50 text-rose-700 font-black uppercase text-[9px] flex items-center gap-1.5\"><Trash2 size={13} /> Remover</button>""",
"""<button onClick={() => removeItem(item.id)} className=\"px-3 py-2 rounded-lg bg-rose-50 text-rose-700 font-black uppercase text-[9px] flex items-center gap-1.5\"><Trash2 size={13} /> Remover</button>""")

path.write_text(source)
print('Multiple item photos patch applied successfully.')
