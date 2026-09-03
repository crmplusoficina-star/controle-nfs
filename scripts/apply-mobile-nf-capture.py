from pathlib import Path

path = Path('app/dashboard/layout.tsx')
text = path.read_text(encoding='utf-8')
marker = '// MOBILE_NF_CAPTURE_LINK_V1'

if marker in text:
    print('Mobile NF capture link already applied.')
    raise SystemExit(0)

import_anchor = "  User,\n  Users\n} from 'lucide-react';"
if import_anchor not in text:
    raise RuntimeError('Lucide import anchor not found')

text = text.replace(
    import_anchor,
    "  User,\n  Users,\n  Camera\n} from 'lucide-react';",
    1,
)

module_anchor = "const modules = [\n  { id: 'nfs', name: 'Controle NF\\'s', icon: FileText, color: 'bg-blue-500', path: '/dashboard/nfs' },"
if module_anchor not in text:
    raise RuntimeError('Modules anchor not found')

text = text.replace(
    module_anchor,
    "const modules = [\n  " + marker + "\n  { id: 'nfs', name: 'Controle NF\\'s', icon: FileText, color: 'bg-blue-500', path: '/dashboard/nfs' },\n  { id: 'capturar-nf', name: 'Capturar NF (Celular)', icon: Camera, color: 'bg-cyan-500', path: '/dashboard/capturar-nf' },",
    1,
)

path.write_text(text, encoding='utf-8')
print('Mobile NF capture link applied successfully.')
