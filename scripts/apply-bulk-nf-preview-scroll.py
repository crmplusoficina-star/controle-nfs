from pathlib import Path
import sys

path = Path('app/dashboard/nfs/page.tsx')
text = path.read_text(encoding='utf-8')

MARKER = '// BULK_NF_PREVIEW_SCROLL_V1'

if MARKER in text:
    print('Bulk NF preview/scroll patch already applied.')
    sys.exit(0)


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    '<div className="w-full md:w-1/3 bg-slate-50 p-8 border-r border-slate-200 flex flex-col">',
    '''{/* BULK_NF_PREVIEW_SCROLL_V1 */}
              <div className="w-full md:w-1/3 min-h-0 overflow-y-scroll overscroll-contain [scrollbar-gutter:stable] bg-slate-50 p-8 border-r border-slate-200 flex flex-col">''',
    'left panel vertical scroll'
)

preview_button = r'''                      {activeUpload === 'invoice' && pendingInvoiceFile && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const previewUrl = URL.createObjectURL(pendingInvoiceFile);
                            const previewWindow = window.open(previewUrl, '_blank');

                            if (!previewWindow) {
                              URL.revokeObjectURL(previewUrl);
                              setNotification({
                                title: 'Visualização bloqueada',
                                message: 'O navegador bloqueou a nova aba. Libere pop-ups para visualizar o PDF.',
                                type: 'warning'
                              });
                              return;
                            }

                            previewWindow.opener = null;
                            window.setTimeout(() => URL.revokeObjectURL(previewUrl), 300_000);
                          }}
                          className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
                        >
                          <FileText size={14} />
                          Visualizar PDF
                        </button>
                      )}

'''

replace_once(
    "                      {activeUpload === 'invoice' && pendingInvoiceFile && activeBatchInvoice?.status !== 'saved' && (",
    preview_button + "                      {activeUpload === 'invoice' && pendingInvoiceFile && activeBatchInvoice?.status !== 'saved' && (",
    'active invoice preview button'
)

path.write_text(text, encoding='utf-8')
print('Bulk NF preview/scroll patch applied successfully.')
