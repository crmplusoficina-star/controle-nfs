import fs from 'node:fs';

const file = 'app/dashboard/stock/page.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldValue, newValue, label) {
  if (!source.includes(oldValue)) throw new Error(`Trecho não encontrado: ${label}`);
  source = source.replace(oldValue, newValue);
  console.log(`OK: ${label}`);
}

function replaceBetween(startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Início não encontrado: ${label}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Fim não encontrado: ${label}`);
  source = source.slice(0, start) + replacement + source.slice(end + endMarker.length);
  console.log(`OK: ${label}`);
}

replaceOnce(
  "  const [tools, setTools] = useState<any[]>([]);\n",
  "  const [tools, setTools] = useState<any[]>([]);\n  const [globalTools, setGlobalTools] = useState<any[]>([]);\n",
  'estado globalTools',
);

replaceBetween(
  "  useEffect(() => {\n    const fetchHoldersAndHistory = async () => {",
  "  }, [selectedTool, isFichaModalOpen]);",
  `  useEffect(() => {\n    const fetchHoldersAndHistory = async () => {\n      if (!selectedTool) {\n        setToolHolders([]);\n        setToolHistory([]);\n        return;\n      }\n\n      try {\n        const [{ data: cautelasData }, { data: historyData }, { data: handoversData }] = await Promise.all([\n          supabase\n            .from('cautelas')\n            .select('id, user_id, type, status, created_at')\n            .eq('tool_id', selectedTool.id)\n            .order('created_at', { ascending: false }),\n          supabase\n            .from('transactions')\n            .select('*, tools(name)')\n            .eq('tool_id', selectedTool.id)\n            .order('created_at', { ascending: false }),\n          supabase\n            .from('tool_handovers')\n            .select('*')\n            .eq('tool_id', selectedTool.id)\n            .eq('status', 'active')\n            .is('returned_at', null)\n            .order('created_at', { ascending: false }),\n        ]);\n\n        setToolHistory(historyData || []);\n\n        const normalizedRegistration = (value: any) => String(value || '').replace('#', '').trim();\n        const registrations = new Set<string>();\n        (cautelasData || []).forEach((row: any) => row.user_id && registrations.add(normalizedRegistration(row.user_id)));\n        (historyData || []).forEach((row: any) => row.user_id && registrations.add(normalizedRegistration(row.user_id)));\n        (handoversData || []).forEach((row: any) => {\n          if (row.lender_registration) registrations.add(normalizedRegistration(row.lender_registration));\n          if (row.borrower_registration) registrations.add(normalizedRegistration(row.borrower_registration));\n          if (row.original_owner_registration) registrations.add(normalizedRegistration(row.original_owner_registration));\n        });\n\n        const userMap = new Map<string, string>();\n        if (registrations.size > 0) {\n          const queryIds = Array.from(registrations).flatMap(id => [id, \`#\${id}\`]);\n          const { data: people } = await supabase\n            .from('users_access')\n            .select('registration, name')\n            .in('registration', queryIds);\n          (people || []).forEach((person: any) => userMap.set(normalizedRegistration(person.registration), person.name));\n        }\n        const nameFor = (registration: string) => userMap.get(normalizedRegistration(registration)) || registration;\n        const holders = new Map<string, any>();\n\n        (cautelasData || [])\n          .filter((row: any) => row.user_id && String(row.status || '').toLowerCase() !== 'missing')\n          .forEach((row: any) => {\n            const registration = normalizedRegistration(row.user_id);\n            const isLoan = ['loan', 'borrow', 'emprestimo', 'empréstimo'].includes(String(row.type || '').toLowerCase());\n            holders.set(registration, {\n              source: 'cautela',\n              user_id: row.user_id,\n              registration,\n              responsible_name: nameFor(registration),\n              possession_name: nameFor(registration),\n              raw_type: isLoan ? 'loan' : 'caution',\n              type: isLoan ? 'Empréstimo' : 'Cautela',\n              created_at: row.created_at,\n            });\n          });\n\n        const latestByUser = new Map<string, any>();\n        (historyData || []).forEach((row: any) => {\n          if (!row.user_id || !['borrow', 'return'].includes(String(row.type || ''))) return;\n          const registration = normalizedRegistration(row.user_id);\n          if (!latestByUser.has(registration)) latestByUser.set(registration, row);\n        });\n        latestByUser.forEach((row: any, registration: string) => {\n          if (row.type !== 'borrow' || ['cancelled', 'returned', 'pending', 'pending_signature'].includes(String(row.status || '').toLowerCase())) return;\n          if (holders.has(registration)) return;\n          const isCaution = String(row.obs || '').toLowerCase().includes('cautela');\n          holders.set(registration, {\n            source: 'transaction',\n            user_id: row.user_id,\n            registration,\n            responsible_name: nameFor(registration),\n            possession_name: nameFor(registration),\n            raw_type: isCaution ? 'caution' : 'loan',\n            type: isCaution ? 'Cautela' : 'Empréstimo',\n            created_at: row.created_at,\n          });\n        });\n\n        (handoversData || []).forEach((row: any) => {\n          const borrower = normalizedRegistration(row.borrower_registration);\n          const lender = normalizedRegistration(row.lender_registration);\n          const owner = normalizedRegistration(row.original_owner_registration || row.lender_registration);\n          const kind = String(row.handover_type || '').toLowerCase();\n          if (!borrower) return;\n\n          if (['transfer', 'loan_transfer'].includes(kind)) {\n            if (lender) holders.delete(lender);\n            if (owner) holders.delete(owner);\n            holders.set(borrower, {\n              source: 'handover',\n              user_id: row.borrower_registration,\n              registration: borrower,\n              responsible_name: nameFor(borrower),\n              possession_name: nameFor(borrower),\n              raw_type: 'loan',\n              type: 'Empréstimo',\n              created_at: row.created_at,\n              note: lender ? \`Responsabilidade transferida por \${nameFor(lender)}.\` : 'Responsabilidade transferida.',\n            });\n            return;\n          }\n\n          if (kind.includes('peer')) {\n            const responsible = owner || lender;\n            if (!responsible) return;\n            const current = holders.get(responsible);\n            holders.set(responsible, {\n              source: current?.source || 'handover',\n              user_id: current?.user_id || row.original_owner_registration || row.lender_registration,\n              registration: responsible,\n              responsible_name: nameFor(responsible),\n              possession_name: nameFor(borrower),\n              possession_registration: borrower,\n              raw_type: 'caution',\n              type: 'Cautela',\n              created_at: current?.created_at || row.created_at,\n              note: \`Responsabilidade com \${nameFor(responsible)}; posse atual com \${nameFor(borrower)}.\`,\n            });\n          }\n        });\n\n        setToolHolders(Array.from(holders.values()));\n      } catch (err) {\n        console.error('Erro ao buscar dados da ferramenta:', err);\n        setToolHolders([]);\n      }\n    };\n\n    if (isFichaModalOpen) {\n      fetchHoldersAndHistory();\n    }\n  }, [selectedTool, isFichaModalOpen]);`,
  'responsáveis atuais completos',
);

replaceOnce(
  `      if (toolsData) {\n        console.log('DEBUG StockPage toolsData:', toolsData);\n        setTools(toolsData);\n      }\n`,
  `      if (toolsData) {\n        console.log('DEBUG StockPage toolsData:', toolsData);\n        setTools(toolsData);\n        if (user.role !== 'Operador') setGlobalTools(toolsData);\n      }\n\n      // A operação normal do Operador continua limitada à sua filial, mas a busca\n      // de disponibilidade precisa consultar o catálogo global, assim como o app\n      // Ferramentaria. Nenhuma alteração de estoque é liberada por este carregamento.\n      if (user.role === 'Operador') {\n        const { data: globalToolsData, error: globalToolsError } = await supabase\n          .from('tools')\n          .select('*')\n          .order('created_at', { ascending: false });\n        if (globalToolsError) throw globalToolsError;\n        setGlobalTools(globalToolsData || []);\n      }\n`,
  'carregamento global para busca',
);

replaceOnce(
  `  const filteredTools = tools.filter(tool => {\n    const matchesSearch = !searchTerm || \n                         tool.name?.toLowerCase().includes(searchTerm.toLowerCase()) || \n                         tool.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||\n                         tool.branch?.toLowerCase().includes(searchTerm.toLowerCase());\n    \n    const matchesBranch = selectedBranchIds.length === 0 || selectedBranchIds.includes(tool.branch_id);\n    \n    return matchesSearch && matchesBranch;\n  });\n`,
  `  const hasGlobalSearch = searchTerm.trim().length > 0;\n  const searchSource = hasGlobalSearch ? (globalTools.length > 0 ? globalTools : tools) : tools;\n  const searchLower = searchTerm.trim().toLowerCase();\n  const searchCompact = searchLower.replace(/[^a-z0-9]/g, '');\n  const filteredTools = searchSource.filter(tool => {\n    const codeCompact = String(tool.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');\n    const matchesSearch = !hasGlobalSearch ||\n                         tool.name?.toLowerCase().includes(searchLower) ||\n                         tool.code?.toLowerCase().includes(searchLower) ||\n                         (searchCompact && codeCompact.includes(searchCompact)) ||\n                         tool.branch?.toLowerCase().includes(searchLower) ||\n                         tool.location?.toLowerCase().includes(searchLower);\n\n    // Quando existe termo de busca, a resposta é global por definição. O filtro\n    // de filial continua valendo normalmente quando a busca está vazia.\n    const matchesBranch = hasGlobalSearch || selectedBranchIds.length === 0 || selectedBranchIds.includes(tool.branch_id);\n\n    return matchesSearch && matchesBranch;\n  });\n`,
  'filtro global independente da filial',
);

replaceOnce(
  `            {filteredTools.length} / {tools.length} itens\n`,
  `            {filteredTools.length} / {searchSource.length} itens\n`,
  'contador da fonte global',
);

replaceOnce(
  `          <div className="text-[10px] font-black text-slate-300 tracking-widest uppercase mr-4 hidden lg:block">\n            {filteredTools.length} / {searchSource.length} itens\n          </div>\n`,
  `          <div className="text-[10px] font-black text-slate-300 tracking-widest uppercase mr-4 hidden lg:block">\n            {filteredTools.length} / {searchSource.length} itens\n          </div>\n          {hasGlobalSearch && (\n            <div className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-lg uppercase tracking-widest whitespace-nowrap">\n              Busca global · todas as filiais\n            </div>\n          )}\n`,
  'indicador de busca global',
);

replaceOnce(
  `      ) : selectedBranchIds.length === 0 && user?.role !== 'Operador' ? (\n`,
  `      ) : selectedBranchIds.length === 0 && user?.role !== 'Operador' && !hasGlobalSearch ? (\n`,
  'não bloquear busca pela seleção de filial',
);

replaceOnce(
  `              whileHover={{ y: -8 }}\n              className="bg-white rounded-[2rem] border border-slate-200 shadow-xl group overflow-hidden"\n`,
  `              whileHover={{ y: -8 }}\n              onClick={() => {\n                setSelectedTool(tool);\n                setIsFichaModalOpen(true);\n              }}\n              className="bg-white rounded-[2rem] border border-slate-200 shadow-xl group overflow-hidden cursor-pointer"\n`,
  'card clicável abre ficha',
);

replaceOnce(
  `                            onClick={() => handleEdit(tool)}\n`,
  `                            onClick={(e) => { e.stopPropagation(); handleEdit(tool); }}\n`,
  'menu editar sem abrir ficha',
);

replaceOnce(
  `                            onClick={() => handleDeleteClick(tool.id)}\n`,
  `                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(tool.id); }}\n`,
  'menu excluir sem abrir ficha',
);

replaceOnce(
  `                      onClick={() => {\n                        setSelectedTool(tool);\n                        setIsAdjustmentModalOpen(true);\n                      }}\n                      className="flex-1 h-12 bg-white border-2 border-slate-100 hover:border-indigo-600 hover:text-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95"\n`,
  `                      onClick={(e) => {\n                        e.stopPropagation();\n                        setSelectedTool(tool);\n                        setIsAdjustmentModalOpen(true);\n                      }}\n                      className="flex-1 h-12 bg-white border-2 border-slate-100 hover:border-indigo-600 hover:text-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95"\n`,
  'ajuste sem abrir ficha por propagação',
);

replaceOnce(
  `                    onClick={() => {\n                      setSelectedTool(tool);\n                      setIsFichaModalOpen(true);\n                    }}\n                    className="flex-1 h-12 bg-indigo-950 hover:bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all group-hover:shadow-2xl group-hover:shadow-indigo-200 active:scale-95"\n`,
  `                    onClick={(e) => {\n                      e.stopPropagation();\n                      setSelectedTool(tool);\n                      setIsFichaModalOpen(true);\n                    }}\n                    className="flex-1 h-12 bg-indigo-950 hover:bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all group-hover:shadow-2xl group-hover:shadow-indigo-200 active:scale-95"\n`,
  'botão ficha sem dupla propagação',
);

replaceOnce(
  `                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">\n                   <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">\n                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cód. Sistema</p>\n                      <p className="text-sm font-black text-slate-900 font-mono tracking-widest">{selectedTool.code}</p>\n                   </div>\n                   <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">\n                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Unidade</p>\n                      <p className="text-sm font-black text-indigo-900 italic">{selectedTool.branch}</p>\n                   </div>\n                   <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">\n                      <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Disponível</p>\n                      <p className="text-sm font-black text-emerald-900">{selectedTool.quantity_available}</p>\n                   </div>\n                   <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">\n                      <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1">Ocupado</p>\n                      <p className="text-sm font-black text-rose-900">{(selectedTool.cautela_quantity || 0) + (selectedTool.borrowed_quantity || 0)}</p>\n                   </div>\n                </div>\n`,
  `                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-10">\n                   <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">\n                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cód. Sistema</p>\n                      <p className="text-sm font-black text-slate-900 font-mono tracking-widest">{selectedTool.code}</p>\n                   </div>\n                   <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">\n                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Unidade</p>\n                      <p className="text-sm font-black text-indigo-900 italic">{selectedTool.branch || '---'}</p>\n                   </div>\n                   <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">\n                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Locação</p>\n                      <p className="text-sm font-black text-slate-900 font-mono">{selectedTool.location || '---'}</p>\n                   </div>\n                   <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">\n                      <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Disponível</p>\n                      <p className="text-sm font-black text-emerald-900">{selectedTool.quantity_available || 0}</p>\n                   </div>\n                   <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">\n                      <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Cautelada</p>\n                      <p className="text-sm font-black text-amber-900">{selectedTool.cautela_quantity || 0}</p>\n                   </div>\n                   <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">\n                      <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1">Emprestada</p>\n                      <p className="text-sm font-black text-rose-900">{selectedTool.borrowed_quantity || 0}</p>\n                   </div>\n                </div>\n`,
  'ficha com locação e três saldos',
);

replaceOnce(
  `                                  <p className="text-[10px] font-black uppercase text-slate-800 leading-none">{holder.responsible_name}</p>\n                                  <p className="text-[9px] font-bold text-rose-400 uppercase mt-1">{holder.type === 'caution' ? 'Cautela Fixa' : 'Empréstimo'}</p>\n`,
  `                                  <p className="text-[10px] font-black uppercase text-slate-800 leading-none">{holder.possession_name || holder.responsible_name}</p>\n                                  <p className="text-[9px] font-bold text-rose-400 uppercase mt-1">{holder.raw_type === 'caution' ? 'Cautela' : 'Empréstimo'}</p>\n                                  {holder.possession_name && holder.possession_name !== holder.responsible_name && (\n                                    <p className="text-[8px] font-bold text-slate-400 mt-1">Responsável: {holder.responsible_name}</p>\n                                  )}\n                                  {holder.note && <p className="text-[8px] font-bold text-indigo-500 mt-1">{holder.note}</p>}\n`,
  'identificação do possuidor e responsabilidade',
);

replaceOnce(
  `                                <button\n                                  onClick={() => handleReturnFromFicha(holder)}\n                                  disabled={isSyncing}\n                                  className="ml-2 p-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-all shadow-sm flex items-center justify-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-3"\n                                >\n                                  {isSyncing ? '...' : <><RotateCcw size={12} /> Devolver</>}\n                                </button>\n`,
  `                                {holder.source === 'cautela' && (\n                                  <button\n                                    onClick={() => handleReturnFromFicha(holder)}\n                                    disabled={isSyncing}\n                                    className="ml-2 p-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-all shadow-sm flex items-center justify-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-3"\n                                  >\n                                    {isSyncing ? '...' : <><RotateCcw size={12} /> Devolver</>}\n                                  </button>\n                                )}\n`,
  'devolução somente em vínculo cautela seguro',
);

fs.writeFileSync(file, source);
console.log('Patch global de estoque aplicado com sucesso.');
