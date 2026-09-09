from pathlib import Path

path = Path('app/dashboard/nfs/page.tsx')
text = path.read_text(encoding='utf-8')
marker = 'COLUMN_SORT_V1'

if marker in text:
    print('Column sorting already applied.')
    raise SystemExit(0)

# This patch runs after apply-line-number-row.py so the visible table already
# contains the Linha column shown in production.
if 'LINE_NUMBER_CELL_V2' not in text:
    raise RuntimeError('Line number patch must run before column sorting patch')

state_anchor = "  const [sortBy, setSortBy] = useState<'recent' | 'old' | 'value' | 'status'>('recent');\n"
if state_anchor not in text:
    raise RuntimeError('Sort state anchor not found')

state_replacement = state_anchor + """  // COLUMN_SORT_V1\n  type ColumnSortKey = 'line_number' | 'status' | 'supplier' | 'date' | 'amount' | 'payment_date' | 'order_number';\n  const [columnSort, setColumnSort] = useState<{ key: ColumnSortKey; direction: 'asc' | 'desc' } | null>(null);\n\n  const toggleColumnSort = (key: ColumnSortKey) => {\n    setColumnSort(prev => {\n      if (prev?.key === key) {\n        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };\n      }\n      return { key, direction: 'asc' };\n    });\n  };\n"""
text = text.replace(state_anchor, state_replacement, 1)

sort_anchor = """  }).sort((a, b) => {\n    const dateA = a.date || '';\n    const dateB = b.date || '';\n\n    if (sortBy === 'recent') return dateB.localeCompare(dateA);\n"""
if sort_anchor not in text:
    raise RuntimeError('Invoice sort anchor not found')

sort_replacement = """  }).sort((a, b) => {\n    if (columnSort) {\n      const direction = columnSort.direction === 'asc' ? 1 : -1;\n      const textCompare = (left: any, right: any) =>\n        String(left ?? '').localeCompare(String(right ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' });\n\n      let comparison = 0;\n      switch (columnSort.key) {\n        case 'line_number':\n          comparison = textCompare(a.line_number, b.line_number);\n          break;\n        case 'status': {\n          const statusRank: Record<string, number> = {\n            rc_created: 1,\n            waiting_order: 2,\n            waiting_docs: 3,\n            waiting_schedule: 4,\n            paid: 5\n          };\n          comparison = (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);\n          break;\n        }\n        case 'supplier':\n          comparison = textCompare(a.supplier, b.supplier);\n          break;\n        case 'date':\n          comparison = textCompare(a.date, b.date);\n          if (comparison === 0) comparison = textCompare(a.invoice_number, b.invoice_number);\n          break;\n        case 'amount': {\n          const valA = typeof a.amount === 'number' ? a.amount : parseCurrency(a.amount);\n          const valB = typeof b.amount === 'number' ? b.amount : parseCurrency(b.amount);\n          comparison = valA - valB;\n          break;\n        }\n        case 'payment_date':\n          comparison = textCompare(a.payment_date, b.payment_date);\n          break;\n        case 'order_number':\n          comparison = textCompare(a.order_number, b.order_number);\n          break;\n      }\n      return comparison * direction;\n    }\n\n    const dateA = a.date || '';\n    const dateB = b.date || '';\n\n    if (sortBy === 'recent') return dateB.localeCompare(dateA);\n"""
text = text.replace(sort_anchor, sort_replacement, 1)

headers = {
    '              <th className="px-2 py-3 w-[72px]">Linha</th>': """              <th className=\"px-2 py-3 w-[72px]\">\n                <button type=\"button\" onClick={() => toggleColumnSort('line_number')} className=\"inline-flex items-center gap-1.5 hover:text-indigo-600 transition-colors\" title=\"Ordenar por linha\">\n                  Linha\n                  <ArrowUpDown size={11} className={columnSort?.key === 'line_number' ? 'text-indigo-600' : 'text-slate-300'} />\n                </button>\n              </th>""",
    '              <th className="px-3 py-3 w-[140px]">Status</th>': """              <th className=\"px-3 py-3 w-[140px]\">\n                <button type=\"button\" onClick={() => toggleColumnSort('status')} className=\"inline-flex items-center gap-1.5 hover:text-indigo-600 transition-colors\" title=\"Ordenar por status\">\n                  Status\n                  <ArrowUpDown size={11} className={columnSort?.key === 'status' ? 'text-indigo-600' : 'text-slate-300'} />\n                </button>\n              </th>""",
    '              <th className="px-3 py-3">Fornecedor</th>': """              <th className=\"px-3 py-3\">\n                <button type=\"button\" onClick={() => toggleColumnSort('supplier')} className=\"inline-flex items-center gap-1.5 hover:text-indigo-600 transition-colors\" title=\"Ordenar por fornecedor\">\n                  Fornecedor\n                  <ArrowUpDown size={11} className={columnSort?.key === 'supplier' ? 'text-indigo-600' : 'text-slate-300'} />\n                </button>\n              </th>""",
    '              <th className="px-3 py-3">Data/NF</th>': """              <th className=\"px-3 py-3\">\n                <button type=\"button\" onClick={() => toggleColumnSort('date')} className=\"inline-flex items-center gap-1.5 hover:text-indigo-600 transition-colors\" title=\"Ordenar por data\">\n                  Data/NF\n                  <ArrowUpDown size={11} className={columnSort?.key === 'date' ? 'text-indigo-600' : 'text-slate-300'} />\n                </button>\n              </th>""",
    '              <th className="px-3 py-3">Valor</th>': """              <th className=\"px-3 py-3\">\n                <button type=\"button\" onClick={() => toggleColumnSort('amount')} className=\"inline-flex items-center gap-1.5 hover:text-indigo-600 transition-colors\" title=\"Ordenar por valor\">\n                  Valor\n                  <ArrowUpDown size={11} className={columnSort?.key === 'amount' ? 'text-indigo-600' : 'text-slate-300'} />\n                </button>\n              </th>""",
    '              <th className="px-3 py-3">Prog. Pagamento</th>': """              <th className=\"px-3 py-3\">\n                <button type=\"button\" onClick={() => toggleColumnSort('payment_date')} className=\"inline-flex items-center gap-1.5 hover:text-indigo-600 transition-colors\" title=\"Ordenar por programação de pagamento\">\n                  Prog. Pagamento\n                  <ArrowUpDown size={11} className={columnSort?.key === 'payment_date' ? 'text-indigo-600' : 'text-slate-300'} />\n                </button>\n              </th>""",
    '              <th className="px-3 py-3">Pedido</th>': """              <th className=\"px-3 py-3\">\n                <button type=\"button\" onClick={() => toggleColumnSort('order_number')} className=\"inline-flex items-center gap-1.5 hover:text-indigo-600 transition-colors\" title=\"Ordenar por pedido\">\n                  Pedido\n                  <ArrowUpDown size={11} className={columnSort?.key === 'order_number' ? 'text-indigo-600' : 'text-slate-300'} />\n                </button>\n              </th>""",
}

for old, new in headers.items():
    if old not in text:
        raise RuntimeError(f'Header anchor not found: {old}')
    text = text.replace(old, new, 1)

# The existing global sorting dropdown should take precedence again when used.
for value in ('recent', 'old', 'value', 'status'):
    old = f"onClick={{() => setSortBy('{value}')}}"
    new = f"onClick={{() => {{ setColumnSort(null); setSortBy('{value}'); }}}}"
    if old in text:
        text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Column sorting applied successfully.')
