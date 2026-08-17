import fs from 'node:fs';

const file = 'app/dashboard/inventory/adjustments/page.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldValue, newValue, label) {
  if (!source.includes(oldValue)) throw new Error(`Trecho não encontrado: ${label}`);
  source = source.replace(oldValue, newValue);
  console.log(`OK: ${label}`);
}

replaceOnce(
`function mainPhoto(tool: Tool) {
  if (tool.image_url) return tool.image_url;
  return Array.isArray(tool.image_urls) ? tool.image_urls.find(Boolean) || null : null;
}`,
`function toolPhotos(tool: Tool) {
  return Array.from(new Set([
    tool.image_url,
    ...(Array.isArray(tool.image_urls) ? tool.image_urls : []),
  ].filter(Boolean) as string[]));
}

function mainPhoto(tool: Tool) {
  return toolPhotos(tool)[0] || null;
}`,
'helper de galeria',
);

const savePhotoStart = source.indexOf('  const savePhoto = async (file: File | undefined) => {');
const saveToolStart = source.indexOf('  const saveTool = async (tool: Tool) => {', savePhotoStart);
if (savePhotoStart < 0 || saveToolStart < 0) throw new Error('Bloco savePhoto não encontrado');
source = source.slice(0, savePhotoStart) + `  const savePhotos = async (files: FileList | File[] | null | undefined) => {
    const toolId = photoTargetId;
    const tool = tools.find(item => item.id === toolId);
    const selectedFiles = Array.from(files || []).filter(file => file.type.startsWith('image/'));
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
      const imageUrls = Array.from(new Set([...oldUrls, ...uploadedUrls]));
      const primaryPhoto = uploadedUrls[0] || oldUrls[0] || null;
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
      setSuccessId(tool.id);
      window.setTimeout(() => setSuccessId(current => current === tool.id ? '' : current), 1800);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar as novas fotos.');
    } finally {
      setUploadingPhotoId('');
      setPhotoTargetId('');
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

` + source.slice(saveToolStart);
console.log('OK: upload múltiplo');

replaceOnce(
`        capture="environment"
        className="hidden"
        onChange={event => void savePhoto(event.target.files?.[0])}`,
`        capture="environment"
        multiple
        className="hidden"
        onChange={event => void savePhotos(event.target.files)}`,
'input múltiplo',
);

replaceOnce(
`        <p className="text-[10px] font-bold text-slate-400">Toque na foto da ferramenta para abrir a câmera. A nova foto fica vinculada ao mesmo item; código, saldo e histórico não são recriados.</p>`,
`        <p className="text-[10px] font-bold text-slate-400">Toque na foto para abrir a câmera quantas vezes precisar. Todas as fotos ficam vinculadas ao mesmo item; código, saldo e histórico não são recriados. Em aparelhos compatíveis, também é possível selecionar várias imagens de uma vez.</p>`,
'instrução de múltiplas fotos',
);

replaceOnce(
`            const photo = mainPhoto(tool);
            const dirty = hasChanges(tool);`,
`            const photo = mainPhoto(tool);
            const photoUrls = toolPhotos(tool);
            const dirty = hasChanges(tool);`,
'lista de fotos por item',
);

const oldPhotoBlock = `                  <button
                    type="button"
                    onClick={() => openCamera(tool.id)}
                    disabled={Boolean(uploadingPhotoId)}
                    className="group relative w-full lg:w-[110px] h-36 lg:h-[110px] rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    title="Tirar foto desta ferramenta"
                  >
                    {photo ? <Image src={photo} alt={draft.name || draft.code || 'Ferramenta'} fill unoptimized className="object-contain" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={30} className="text-slate-300" /></div>}
                    <span className="absolute inset-x-2 bottom-2 rounded-xl bg-slate-950/85 text-white py-2 px-2 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-wider">
                      {uploadingPhoto ? <><Loader2 size={13} className="animate-spin" /> Salvando</> : <><Camera size={13} /> Tirar foto</>}
                    </span>
                  </button>`;

const newPhotoBlock = `                  <div className="space-y-2 w-full lg:w-[110px]">
                    <button
                      type="button"
                      onClick={() => openCamera(tool.id)}
                      disabled={Boolean(uploadingPhotoId)}
                      className="group relative w-full h-36 lg:h-[110px] rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      title={photo ? 'Adicionar outra foto desta ferramenta' : 'Tirar foto desta ferramenta'}
                    >
                      {photo ? <Image src={photo} alt={draft.name || draft.code || 'Ferramenta'} fill unoptimized className="object-contain" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={30} className="text-slate-300" /></div>}
                      {photoUrls.length > 0 && (
                        <span className="absolute top-2 right-2 rounded-lg bg-white/95 px-2 py-1 text-[8px] font-black text-indigo-700 shadow-sm">
                          {photoUrls.length} {photoUrls.length === 1 ? 'foto' : 'fotos'}
                        </span>
                      )}
                      <span className="absolute inset-x-2 bottom-2 rounded-xl bg-slate-950/85 text-white py-2 px-2 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-wider">
                        {uploadingPhoto ? <><Loader2 size={13} className="animate-spin" /> Salvando</> : <><Camera size={13} /> {photo ? 'Adicionar foto' : 'Tirar foto'}</>}
                      </span>
                    </button>

                    {photoUrls.length > 1 && (
                      <div className="grid grid-cols-5 lg:grid-cols-4 gap-1.5" aria-label={`${photoUrls.length} fotos cadastradas`}>
                        {photoUrls.slice(0, 8).map((url, index) => (
                          <div key={`${url}-${index}`} className="relative h-11 lg:h-8 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                            <Image src={url} alt={`Foto ${index + 1}`} fill unoptimized className="object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>`;

replaceOnce(oldPhotoBlock, newPhotoBlock, 'galeria no cartão');

fs.writeFileSync(file, source);
console.log('Patch concluído.');
