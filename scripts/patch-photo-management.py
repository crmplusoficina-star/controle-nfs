from pathlib import Path

path = Path('app/dashboard/inventory/adjustments/page.tsx')
source = path.read_text()

def replace_once(old: str, new: str, label: str):
    global source
    if old not in source:
        raise RuntimeError(f'Trecho não encontrado: {label}')
    source = source.replace(old, new, 1)
    print('OK:', label)

replace_once(
    '  ImageIcon,\n  Loader2,',
    '  ImageIcon,\n  Loader2,\n  Pencil,',
    'ícone Pencil',
)
replace_once(
    '  SlidersHorizontal,\n  Tag,',
    '  SlidersHorizontal,\n  Tag,\n  Trash2,',
    'ícone Trash2',
)
replace_once(
    "import { uploadFile } from '@/lib/storage';",
    "import { deleteFile, uploadFile } from '@/lib/storage';",
    'import deleteFile',
)
replace_once(
    "  const [photoTargetId, setPhotoTargetId] = useState('');\n  const [message, setMessage] = useState('');",
    "  const [photoTargetId, setPhotoTargetId] = useState('');\n  const [replacePhotoUrl, setReplacePhotoUrl] = useState('');\n  const [deletingPhotoId, setDeletingPhotoId] = useState('');\n  const [message, setMessage] = useState('');",
    'estados de gerenciamento',
)
replace_once(
    "  const openCamera = (toolId: string) => {\n    if (uploadingPhotoId) return;\n    setPhotoTargetId(toolId);\n    setMessage('');\n    cameraInputRef.current?.click();\n  };",
    "  const openCamera = (toolId: string, photoUrl = '') => {\n    if (uploadingPhotoId || deletingPhotoId) return;\n    setPhotoTargetId(toolId);\n    setReplacePhotoUrl(photoUrl);\n    setMessage('');\n    if (cameraInputRef.current) cameraInputRef.current.value = '';\n    cameraInputRef.current?.click();\n  };",
    'abrir câmera em modo adicionar/trocar',
)

save_start = source.index('  const savePhotos = async (files: FileList | File[] | null | undefined) => {')
save_tool = source.index('  const saveTool = async (tool: Tool) => {', save_start)
if save_start < 0 or save_tool < 0:
    raise RuntimeError('Bloco savePhotos não encontrado')

new_save_block = '''  const savePhotos = async (files: FileList | File[] | null | undefined) => {
    const toolId = photoTargetId;
    const tool = tools.find(item => item.id === toolId);
    const allSelected = Array.from(files || []).filter(file => file.type.startsWith('image/'));
    const selectedFiles = replacePhotoUrl ? allSelected.slice(0, 1) : allSelected;
    if (!selectedFiles.length || !tool) return;

    setUploadingPhotoId(toolId);
    setMessage('');
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

      setTools(current => current.map(item => item.id === tool.id
        ? { ...item, image_url: primaryPhoto, image_urls: imageUrls, updated_at: updatedAt }
        : item));

      if (replacing && replacePhotoUrl && replacePhotoUrl !== uploadedUrls[0]) {
        const deleted = await deleteFile(replacePhotoUrl);
        if (!deleted) console.warn('A foto antiga saiu do cadastro, mas não foi possível removê-la do storage.');
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

      const deleted = await deleteFile(photoUrl);
      if (!deleted) console.warn('A foto foi removida do cadastro, mas o arquivo não pôde ser apagado do storage.');

      setSuccessId(tool.id);
      window.setTimeout(() => setSuccessId(current => current === tool.id ? '' : current), 1800);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Não foi possível excluir a foto.');
    } finally {
      setDeletingPhotoId('');
    }
  };

'''
source = source[:save_start] + new_save_block + source[save_tool:]
print('OK: salvar, trocar e excluir fotos')

replace_once(
    '        multiple\n        className="hidden"',
    '        multiple={!replacePhotoUrl}\n        className="hidden"',
    'seleção única ao trocar foto',
)
replace_once(
    '        <p className="text-[10px] font-bold text-slate-400">Toque na foto para abrir a câmera quantas vezes precisar. Todas as fotos ficam vinculadas ao mesmo item; código, saldo e histórico não são recriados. Em aparelhos compatíveis, também é possível selecionar várias imagens de uma vez.</p>',
    '        <p className="text-[10px] font-bold text-slate-400">Use “Adicionar foto” para incluir novas imagens. Em cada foto você pode trocar ou excluir individualmente; código, saldo e histórico da ferramenta são preservados.</p>',
    'texto de orientação',
)
replace_once(
    'lg:grid-cols-[110px_1fr_auto]',
    'lg:grid-cols-[190px_1fr_auto]',
    'coluna maior para gerenciar galeria',
)
replace_once(
    '            const uploadingPhoto = uploadingPhotoId === tool.id;\n            const saved = successId === tool.id;',
    "            const uploadingPhoto = uploadingPhotoId === tool.id;\n            const deletingPhoto = deletingPhotoId === tool.id;\n            const photoBusy = uploadingPhoto || deletingPhoto;\n            const saved = successId === tool.id;",
    'estado visual da galeria',
)

start_marker = '                  <div className="space-y-2 w-full lg:w-[110px]">'
end_marker = '\n\n                  <div className="space-y-3 min-w-0">'
gallery_start = source.index(start_marker)
gallery_end = source.index(end_marker, gallery_start)
if gallery_start < 0 or gallery_end < 0:
    raise RuntimeError('Galeria atual não encontrada')

new_gallery = '''                  <div className="space-y-2 w-full lg:w-[190px]">
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
                  </div>'''
source = source[:gallery_start] + new_gallery + source[gallery_end:]
print('OK: controles de troca e exclusão na galeria')

path.write_text(source)
print('Patch concluído.')
