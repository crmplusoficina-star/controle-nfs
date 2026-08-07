from pathlib import Path

path = Path('app/dashboard/layout.tsx')
text = path.read_text(encoding='utf-8')
marker = '// OPERATIONAL_NOTIFICATION_CENTER_V1'

if marker in text:
    print('Operational notification center already applied.')
    raise SystemExit(0)

import_anchor = "import { AxelAssistant } from '@/components/AxelAssistant';\n"
if import_anchor not in text:
    raise RuntimeError('AxelAssistant import anchor not found')

text = text.replace(
    import_anchor,
    import_anchor + "import { OperationalNotificationCenter } from '@/components/operational-notification-center';\n\n" + marker + "\n",
    1,
)

old_bell = '''            <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-full relative transition-colors">\n              <Bell size={20} />\n              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />\n            </button>'''

if old_bell not in text:
    raise RuntimeError('Header bell anchor not found')

text = text.replace(old_bell, '            <OperationalNotificationCenter />', 1)
path.write_text(text, encoding='utf-8')
print('Operational notification center applied successfully.')
