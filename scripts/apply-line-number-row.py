from pathlib import Path

path = Path('app/dashboard/nfs/page.tsx')
text = path.read_text(encoding='utf-8')
marker = 'LINE_NUMBER_CELL_V2'

if marker in text:
    print('Line number cell already applied.')
    raise SystemExit(0)

# Add a compact Linha column inside the existing table row.
header_anchor = '''              <th className="px-3 py-3 w-[140px]">Status</th>'''
if header_anchor not in text:
    raise RuntimeError('Table header anchor not found')

text = text.replace(
    header_anchor,
    '''              {/* LINE_NUMBER_CELL_V2 */}
              <th className="px-2 py-3 w-[72px]">Linha</th>
              <th className="px-3 py-3 w-[140px]">Status</th>''',
    1,
)

# Table now has 8 columns instead of 7.
text = text.replace('colSpan={7}', 'colSpan={8}', 2)

row_anchor = '''              <tr key={inv.id} className="hover:bg-indigo-50/30 transition-colors group text-xs md:text-sm border-l-4 border-transparent hover:border-indigo-400">
                <td className="px-3 py-3 w-[140px]">'''
if row_anchor not in text:
    raise RuntimeError('Invoice row anchor not found')

row_replacement = '''              <tr key={inv.id} className="hover:bg-indigo-50/30 transition-colors group text-xs md:text-sm border-l-4 border-transparent hover:border-indigo-400">
                <td className="px-2 py-3 w-[72px] align-middle">
                  <input
                    type="text"
                    value={inv.line_number || ''}
                    placeholder="-"
                    onChange={(e) => {
                      const value = e.target.value;
                      setInvoices(prev => prev.map(row => row.id === inv.id ? { ...row, line_number: value } : row));
                    }}
                    onBlur={async (e) => {
                      const value = e.target.value.trim();
                      const { error } = await supabase
                        .from('nfs')
                        .update({ line_number: value || null })
                        .eq('id', inv.id);
                      if (error) console.error('Erro ao salvar linha:', error);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className="w-14 px-1.5 py-1 bg-white border border-slate-200 rounded-md text-[10px] font-mono font-bold text-indigo-600 text-center focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                    aria-label="Número da linha"
                  />
                </td>
                <td className="px-3 py-3 w-[140px]">'''

text = text.replace(row_anchor, row_replacement, 1)

path.write_text(text, encoding='utf-8')
print('Line number cell applied successfully.')
