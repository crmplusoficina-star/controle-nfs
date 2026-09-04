from pathlib import Path

path = Path('app/dashboard/nfs/page.tsx')
text = path.read_text(encoding='utf-8')
marker = 'LINE_NUMBER_ROW_V1'

if marker in text:
    print('Line number row already applied.')
    raise SystemExit(0)

open_anchor = '''            ) : filteredInvoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-indigo-50/30 transition-colors group text-xs md:text-sm border-l-4 border-transparent hover:border-indigo-400">'''

if open_anchor not in text:
    raise RuntimeError('Invoice table row anchor not found')

replacement = '''            ) : filteredInvoices.map((inv) => (
              <React.Fragment key={inv.id}>
                {/* LINE_NUMBER_ROW_V1 */}
                <tr className="bg-slate-50/70">
                  <td colSpan={7} className="px-3 py-1.5 border-l-4 border-transparent">
                    {editingCell?.id === inv.id && editingCell?.field === 'line_number' ? (
                      <input
                        autoFocus
                        type="text"
                        defaultValue={inv.line_number || ''}
                        placeholder="Nº da linha"
                        onBlur={(e) => handleQuickUpdate(inv.id, 'line_number', e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleQuickUpdate(inv.id, 'line_number', (e.target as HTMLInputElement).value)}
                        className="w-32 px-2 py-1 bg-white border border-indigo-200 rounded-lg text-[10px] font-mono font-bold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingCell({ id: inv.id, field: 'line_number' })}
                        className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
                        title="Adicionar ou editar número da linha"
                      >
                        <span>Linha</span>
                        <span className="font-mono text-indigo-500 normal-case tracking-normal">
                          {inv.line_number || '+ adicionar número'}
                        </span>
                      </button>
                    )}
                  </td>
                </tr>
              <tr className="hover:bg-indigo-50/30 transition-colors group text-xs md:text-sm border-l-4 border-transparent hover:border-indigo-400">'''

text = text.replace(open_anchor, replacement, 1)

close_anchor = '''              </tr>
            ))}
          </tbody>'''

if close_anchor not in text:
    raise RuntimeError('Invoice table closing anchor not found')

text = text.replace(
    close_anchor,
    '''              </tr>
              </React.Fragment>
            ))}
          </tbody>''',
    1,
)

path.write_text(text, encoding='utf-8')
print('Line number row applied successfully.')
