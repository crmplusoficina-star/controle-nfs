from pathlib import Path

path = Path('app/dashboard/inventory/adjustments/page.tsx')
source = path.read_text(encoding='utf-8')

source = source.replace(
"  const [successId, setSuccessId] = useState('');\n",
"  const [successId, setSuccessId] = useState('');\n  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());\n  const [bulkDeleting, setBulkDeleting] = useState(false);\n"
)

source = source.replace(
"    setTools(rows);\n    setDrafts(Object.fromEntries(rows.map(tool => [tool.id, makeDraft(tool)])));\n",
"    setTools(rows);\n    setSelectedIds(new Set());\n    setDrafts(Object.fromEntries(rows.map(tool => [tool.id, makeDraft(tool)])));\n"
)

marker = "  const saveTool = async (tool: Tool) => {\n"
insert = r'''  const selectableVisibleIds = useMemo(() => visibleTools
    .filter(tool => (Number(tool.cautela_quantity) || 0) === 0 && (Number(tool.borrowed_quantity) || 0) === 0)
    .map(tool => tool.id), [visibleTools]);

  const selectedCount = selectedIds.size;
  const allVisibleSelected = selectableVisibleIds.length > 0 && selectableVisibleIds.every(id => selectedIds.has(id));

  const toggleSelected = (toolId: string) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (allVisibleSelected) selectableVisibleIds.forEach(id => next.delete(id));
      else selectableVisibleIds.forEach(id => next.add(id));
      return next;
    });
  };

  const bulkDeleteSelected = async () => {
    if (!selectedIds.size || bulkDeleting) return;
    const selectedTools = tools.filter(tool => selectedIds.has(tool.id));
    const active = selectedTools.filter(tool => (Number(tool.cautela_quantity) || 0) > 0 || (Number(tool.borrowed_quantity) || 0) > 0);
    const candidates = selectedTools.filter(tool => !active.includes(tool));
    if (!candidates.length) {
      setMessage('As ferramentas selecionadas estão cauteladas ou emprestadas e não podem ser excluídas.');
      return;
    }

    const confirmation = candidates.length === 1
      ? 'Excluir definitivamente esta ferramenta do inventário?'
      : `Excluir definitivamente ${candidates.length} ferramentas selecionadas do inventário?`;
    if (!window.confirm(`${confirmation}\n\nEsta ação remove o cadastro e as movimentações vinculadas a ele. Itens cautelados, emprestados ou presos em auditoria serão preservados.`)) return;

    setBulkDeleting(true);
    setMessage('');
    try {
      const candidateIds = candidates.map(tool => tool.id);
      const { data: auditRows, error: auditError } = await supabase
        .from('cautelia_audit_items')
        .select('stock_tool_id')
        .in('stock_tool_id', candidateIds);
      if (auditError) throw auditError;

      const auditLocked = new Set((auditRows || []).map((row: any) => row.stock_tool_id).filter(Boolean));
      const deletable = candidates.filter(tool => !auditLocked.has(tool.id));
      const blocked = candidates.length - deletable.length + active.length;

      if (!deletable.length) {
        setMessage(`Nenhuma ferramenta foi excluída. ${blocked} item(ns) estão em uso ou vinculados a auditoria.`);
        return;
      }

      const deletingIds = deletable.map(tool => tool.id);
      const photosToReview = deletable.flatMap(tool => toolPhotos(tool).map(url => ({ url, ownerToolId: tool.id })));
      const { error } = await supabase.from('tools').delete().in('id', deletingIds);
      if (error) throw error;

      setTools(current => current.filter(tool => !deletingIds.includes(tool.id)));
      setCatalog(current => {
        const next = current.filter(tool => !deletingIds.includes(tool.id));
        catalogRef.current = next;
        return next;
      });
      setDrafts(current => {
        const next = { ...current };
        deletingIds.forEach(id => delete next[id]);
        draftsRef.current = next;
        return next;
      });
      setSelectedIds(current => {
        const next = new Set(current);
        deletingIds.forEach(id => next.delete(id));
        return next;
      });

      for (const photo of photosToReview) {
        await deleteFileIfUnused(photo.url, photo.ownerToolId);
      }

      setMessage(blocked > 0
        ? `${deletable.length} ferramenta(s) excluída(s). ${blocked} preservada(s) por cautela, empréstimo ou auditoria.`
        : `${deletable.length} ferramenta(s) excluída(s) do inventário.`);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Não foi possível excluir as ferramentas selecionadas.');
    } finally {
      setBulkDeleting(false);
    }
  };

'''
if marker not in source:
    raise SystemExit('marker saveTool not found')
source = source.replace(marker, insert + marker, 1)

old = '''        <p className="text-[10px] font-bold text-slate-400">Use “Adicionar foto” para incluir novas imagens. Em “Classificação”, escolha “Últimos modificados” para ver primeiro tudo que foi alterado recentemente. Em cada foto você pode trocar ou excluir individualmente; código, saldo e histórico da ferramenta são preservados.</p>'''
new = '''        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[10px] font-bold text-slate-400">Use “Adicionar foto” para incluir novas imagens. Em “Classificação”, escolha “Últimos modificados” para ver primeiro tudo que foi alterado recentemente. Ferramentas cauteladas ou emprestadas não entram na exclusão em massa.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={toggleAllVisible} disabled={!selectableVisibleIds.length || bulkDeleting} className="px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 disabled:opacity-40 font-black uppercase text-[9px]">
              {allVisibleSelected ? 'Desmarcar exibidos' : `Selecionar exibidos (${selectableVisibleIds.length})`}
            </button>
            <button type="button" onClick={() => void bulkDeleteSelected()} disabled={!selectedCount || bulkDeleting} className="px-3 py-2.5 rounded-xl bg-rose-600 text-white disabled:opacity-40 font-black uppercase text-[9px] flex items-center gap-1.5">
              {bulkDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Excluir selecionados {selectedCount ? `(${selectedCount})` : ''}
            </button>
          </div>
        </div>'''
if old not in source:
    raise SystemExit('filter helper paragraph not found')
source = source.replace(old, new, 1)

old_article = '''              <article key={tool.id} className={`bg-white border rounded-3xl shadow-sm overflow-hidden ${!draft.name.trim() ? 'border-amber-200' : 'border-slate-100'}`}>
                <div className="p-4 md:p-5 grid grid-cols-1 lg:grid-cols-[190px_1fr_auto] gap-4 items-start">'''
new_article = '''              <article key={tool.id} className={`relative bg-white border rounded-3xl shadow-sm overflow-hidden ${selectedIds.has(tool.id) ? 'ring-2 ring-rose-400 border-rose-200' : !draft.name.trim() ? 'border-amber-200' : 'border-slate-100'}`}>
                <div className="absolute top-3 left-3 z-30">
                  <label className={`w-8 h-8 rounded-xl border-2 shadow-sm flex items-center justify-center cursor-pointer ${selectedIds.has(tool.id) ? 'bg-rose-600 border-rose-600' : 'bg-white/95 border-slate-300'} ${((Number(tool.cautela_quantity) || 0) > 0 || (Number(tool.borrowed_quantity) || 0) > 0) ? 'opacity-40 cursor-not-allowed' : ''}`} title={(Number(tool.cautela_quantity) || 0) > 0 || (Number(tool.borrowed_quantity) || 0) > 0 ? 'Em cautela ou empréstimo: exclusão bloqueada' : 'Selecionar para exclusão em massa'}>
                    <input type="checkbox" className="sr-only" checked={selectedIds.has(tool.id)} disabled={(Number(tool.cautela_quantity) || 0) > 0 || (Number(tool.borrowed_quantity) || 0) > 0 || bulkDeleting} onChange={() => toggleSelected(tool.id)} />
                    {selectedIds.has(tool.id) && <CheckCircle2 size={17} className="text-white" />}
                  </label>
                </div>
                <div className="p-4 md:p-5 pt-14 md:pt-5 md:pl-14 grid grid-cols-1 lg:grid-cols-[190px_1fr_auto] gap-4 items-start">'''
if old_article not in source:
    raise SystemExit('article marker not found')
source = source.replace(old_article, new_article, 1)

path.write_text(source, encoding='utf-8')
print('bulk delete patch applied')
