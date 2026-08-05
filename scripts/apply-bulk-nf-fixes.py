from pathlib import Path
import sys

path = Path('app/dashboard/nfs/page.tsx')
text = path.read_text(encoding='utf-8')

MARKER = '// BULK_NF_FIX_V2'

if MARKER in text:
    print('Bulk NF fixes already applied.')
    sys.exit(0)


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    "type BatchInvoiceStatus = 'pending' | 'processing' | 'ready' | 'error' | 'saved';",
    "// BULK_NF_FIX_V2\ntype BatchInvoiceStatus = 'pending' | 'processing' | 'ready' | 'error' | 'saved';",
    'fix marker'
)

replace_once(
    '''                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {batchInvoices.map((item, index) => {''',
    '''                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Rolar notas para a esquerda"
                        title="Notas anteriores"
                        onClick={() => document.getElementById('batch-invoice-tabs')?.scrollBy({ left: -260, behavior: 'smooth' })}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-black text-indigo-600 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50 active:scale-95"
                      >
                        ‹
                      </button>
                      <div id="batch-invoice-tabs" className="flex min-w-0 flex-1 gap-2 overflow-x-auto scroll-smooth pb-1">
                      {batchInvoices.map((item, index) => {''',
    'left scroll button'
)

replace_once(
    '''                      })}
                    </div>
                  </div>
                )}''',
    '''                      })}
                      </div>
                      <button
                        type="button"
                        aria-label="Rolar notas para a direita"
                        title="Próximas notas"
                        onClick={() => document.getElementById('batch-invoice-tabs')?.scrollBy({ left: 260, behavior: 'smooth' })}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-black text-indigo-600 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50 active:scale-95"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                )}''',
    'right scroll button'
)

replace_once(
    "    const concurrency = Math.min(3, itemsToProcess.length);",
    "    const concurrency = 1;",
    'sequential batch processing'
)

replace_once(
    "        results.push(await processBatchInvoice(itemsToProcess[currentIndex], false));",
    "        results.push(await processBatchInvoice(itemsToProcess[currentIndex], false));\n        if (currentIndex < itemsToProcess.length - 1) {\n          await new Promise(resolve => setTimeout(resolve, 13_000));\n        }",
    'batch rate spacing'
)

replace_once(
    'className="text-xs font-medium text-slate-500 mb-8 leading-relaxed italic"',
    'className="max-h-48 overflow-y-auto break-words text-xs font-medium text-slate-500 mb-8 leading-relaxed italic"',
    'notification overflow'
)

path.write_text(text, encoding='utf-8')
print('Bulk NF fixes applied successfully.')
