from pathlib import Path
import re

LAYOUT = Path('app/dashboard/layout.tsx')
EXTERNAL = Path('components/external-signature-fixes.tsx')
MARKER = '// FERRAMENTARIA_AVATAR_PICKER_V3'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, new: str, label: str) -> str:
    updated, count = re.subn(pattern, new, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, found {count}')
    return updated


layout = LAYOUT.read_text(encoding='utf-8')
if MARKER not in layout:
    helpers = r'''// FERRAMENTARIA_AVATAR_PICKER_V3
const FERRAMENTARIA_PICKER_ORIGIN = (
  process.env.NEXT_PUBLIC_FERRAMENTARIA_URL || 'https://ferramentaria-gamma.vercel.app'
).replace(/\/$/, '');
const FERRAMENTARIA_PICKER_VERSION = '20260806-hq3';
const FERRAMENTARIA_AVATARS = [
  { id: 'fox', name: 'Raposa', path: '/api/avatar/fox' },
  { id: 'gorilla', name: 'Gorila', path: '/api/avatar/gorilla' },
  { id: 'jaguar', name: 'Onça', path: '/api/avatar/jaguar' },
  { id: 'panther', name: 'Pantera', path: '/api/avatar/panther' },
  { id: 'armadillo', name: 'Tatu', path: '/api/avatar/armadillo' },
  { id: 'bison', name: 'Bisão', path: '/api/avatar/bison' },
  { id: 'bear', name: 'Urso', path: '/api/avatar/bear' },
  { id: 'beaver', name: 'Castor', path: '/api/avatar/beaver' },
  { id: 'wolf', name: 'Lobo', path: '/api/avatar/wolf' },
  { id: 'rhino', name: 'Rinoceronte', path: '/api/avatar/rhino' },
] as const;

function avatarHash(key?: string | null) {
  const source = String(key || 'ferramentaria');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function defaultFerramentariaAvatarPath(key?: string | null) {
  return FERRAMENTARIA_AVATARS[avatarHash(key) % FERRAMENTARIA_AVATARS.length].path;
}

function defaultFerramentariaAvatarUrl(key?: string | null) {
  return `${FERRAMENTARIA_PICKER_ORIGIN}${defaultFerramentariaAvatarPath(key)}?v=${FERRAMENTARIA_PICKER_VERSION}`;
}

function resolveFerramentariaAvatarUrl(value?: string | null, key?: string | null) {
  const avatar = String(value || '').trim();
  if (avatar.startsWith('/api/avatar/')) {
    return `${FERRAMENTARIA_PICKER_ORIGIN}${avatar.split('?')[0]}?v=${FERRAMENTARIA_PICKER_VERSION}`;
  }
  if (/^https?:\/\//i.test(avatar)) {
    const legacy = avatar.toLowerCase();
    if (!legacy.includes('api.dicebear.com') && !legacy.includes('/avatars/')) return avatar;
  }
  return defaultFerramentariaAvatarUrl(key);
}

function normalizeFerramentariaAvatarValue(value?: string | null, key?: string | null) {
  const avatar = String(value || '').trim();
  if (avatar.startsWith('/api/avatar/')) return avatar.split('?')[0];
  if (/^https?:\/\//i.test(avatar)) {
    const legacy = avatar.toLowerCase();
    if (!legacy.includes('api.dicebear.com') && !legacy.includes('/avatars/')) {
      try {
        const parsed = new URL(avatar);
        if (parsed.origin === FERRAMENTARIA_PICKER_ORIGIN && parsed.pathname.startsWith('/api/avatar/')) return parsed.pathname;
      } catch {}
      return avatar;
    }
  }
  return defaultFerramentariaAvatarPath(key);
}
'''
    layout = replace_once(
        layout,
        "import { AxelAssistant } from '@/components/AxelAssistant';\n",
        "import { AxelAssistant } from '@/components/AxelAssistant';\n\n" + helpers + "\n",
        'helper insertion',
    )
    layout = replace_once(
        layout,
        "  const [avatarsList, setAvatarsList] = useState<any[]>([]);\n",
        "  const avatarsList = FERRAMENTARIA_AVATARS;\n",
        'catalog state',
    )
    layout = regex_once(
        layout,
        r"  useEffect\(\(\) => \{\n    async function fetchAvatars\(\) \{.*?\n  \}, \[isAvatarModalOpen, user\]\);",
        """  useEffect(() => {\n    if (!isAvatarModalOpen || !user) return;\n    setSelectedAvatar(normalizeFerramentariaAvatarValue(user.avatar, user.registration));\n  }, [isAvatarModalOpen, user?.avatar, user?.registration]);""",
        'catalog effect',
    )
    layout = regex_once(
        layout,
        r"  const updateAvatarFromSidebar = async \(newUrl: string\) => \{.*?\n  \};\n\n  if \(isLoading \|\| !user\) return null;",
        """  const updateAvatarFromSidebar = async (newUrl: string) => {\n    if (!user || !newUrl) return;\n    const storedAvatar = normalizeFerramentariaAvatarValue(newUrl, user.registration);\n    setIsUpdatingAvatar(true);\n    try {\n      const { error } = await supabase\n        .from('users_access')\n        .update({ avatar_url: storedAvatar })\n        .eq('registration', user.registration);\n      if (error) throw error;\n      updateUser?.({ avatar: storedAvatar });\n      setSelectedAvatar(storedAvatar);\n      setIsAvatarModalOpen(false);\n    } catch (error) {\n      console.error('Erro ao atualizar avatar:', error);\n      alert('Não foi possível atualizar o avatar.');\n    } finally {\n      setIsUpdatingAvatar(false);\n    }\n  };\n\n  if (isLoading || !user) return null;""",
        'avatar save',
    )
    layout = regex_once(
        layout,
        r'''                  <Image \n                    src=\{user\.avatar \|\| `https://api\.dicebear\.com/.*?\n                  />''',
        r'''                  <Image
                    src={resolveFerramentariaAvatarUrl(user.avatar, user.registration)}
                    alt={user.name}
                    fill
                    sizes="32px"
                    unoptimized
                    className="object-cover group-hover:scale-110 transition-transform"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      const target = event.currentTarget;
                      if (target.dataset.fallbackApplied === '1') return;
                      target.dataset.fallbackApplied = '1';
                      target.src = defaultFerramentariaAvatarUrl(user.registration);
                    }}
                  />''',
        'sidebar image',
    )
    picker_start = layout.index('                    {avatarsList.map((avatar: any) => {')
    picker_end = layout.index('                    })}', picker_start) + len('                    })}')
    picker = r'''                    {avatarsList.map((avatar) => {
                      const avatarUrl = resolveFerramentariaAvatarUrl(avatar.path, user.registration);
                      const currentAvatarUrl = resolveFerramentariaAvatarUrl(
                        selectedAvatar || user.avatar,
                        user.registration,
                      );
                      const isSelected = currentAvatarUrl === avatarUrl;
                      return (
                        <button
                          key={avatar.id}
                          type="button"
                          onClick={() => setSelectedAvatar(avatar.path)}
                          className={`relative aspect-square rounded-2xl overflow-hidden border-4 transition-all bg-slate-950 ${
                            isSelected
                              ? 'border-amber-400 shadow-xl shadow-amber-100 scale-105'
                              : 'border-slate-200 hover:border-blue-300 hover:scale-105'
                          }`}
                          title={avatar.name}
                        >
                          <Image
                            src={avatarUrl}
                            alt={avatar.name}
                            fill
                            sizes="120px"
                            unoptimized
                            className="object-cover"
                            referrerPolicy="no-referrer"
                            onError={(event) => {
                              const target = event.currentTarget;
                              if (target.dataset.fallbackApplied === '1') return;
                              target.dataset.fallbackApplied = '1';
                              target.src = defaultFerramentariaAvatarUrl(user.registration);
                            }}
                          />
                          <span className="absolute inset-x-0 bottom-0 bg-slate-950/85 px-1.5 py-1.5 text-center text-[8px] font-black uppercase tracking-wide text-white">
                            {avatar.name}
                          </span>
                          {isSelected && (
                            <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-400 px-2 py-1 text-[7px] font-black uppercase text-slate-950 shadow-lg">
                              Selecionado
                            </span>
                          )}
                        </button>
                      );
                    })}'''
    layout = layout[:picker_start] + picker + layout[picker_end:]
    LAYOUT.write_text(layout, encoding='utf-8')
    print('Avatar picker synchronized with Ferramentaria.')
else:
    print('Avatar picker already synchronized.')

external = EXTERNAL.read_text(encoding='utf-8')
if MARKER not in external:
    external_helpers = r'''// FERRAMENTARIA_AVATAR_PICKER_V3
const FERRAMENTARIA_ORIGIN = (
  process.env.NEXT_PUBLIC_FERRAMENTARIA_URL || 'https://ferramentaria-gamma.vercel.app'
).replace(/\/$/, '');
const FERRAMENTARIA_AVATAR_IDS = [
  'fox', 'gorilla', 'jaguar', 'panther', 'armadillo',
  'bison', 'bear', 'beaver', 'wolf', 'rhino',
] as const;

function defaultExternalAvatar(key?: string | null) {
  const source = String(key || 'ferramentaria');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  return `${FERRAMENTARIA_ORIGIN}/api/avatar/${FERRAMENTARIA_AVATAR_IDS[hash % FERRAMENTARIA_AVATAR_IDS.length]}?v=20260806-hq3`;
}

function resolveExternalAvatar(value?: string | null, key?: string | null) {
  const avatar = String(value || '').trim();
  if (avatar.startsWith('/api/avatar/')) return `${FERRAMENTARIA_ORIGIN}${avatar}`;
  if (/^https?:\/\//i.test(avatar)) {
    const legacy = avatar.toLowerCase();
    if (!legacy.includes('api.dicebear.com') && !legacy.includes('/avatars/')) return avatar;
  }
  return defaultExternalAvatar(key);
}
'''
    external = regex_once(
        external,
        r"const FERRAMENTARIA_ORIGIN =.*?\n}\n\nasync function fetchAudit",
        external_helpers + "\nasync function fetchAudit",
        'external helpers',
    )
    external = replace_once(
        external,
        "      const avatarUrl = resolveAvatarUrl(auditCache?.users_access?.avatar_url);\n      if (!avatarUrl) return;\n",
        "      const registration = auditCache?.users_access?.registration || auditCache?.user_id;\n      const avatarUrl = resolveExternalAvatar(auditCache?.users_access?.avatar_url, registration);\n",
        'external resolution',
    )
    external = replace_once(
        external,
        "      avatar.src = avatarUrl;\n      avatar.style.objectFit = 'cover';\n",
        "      avatar.src = avatarUrl;\n      avatar.style.objectFit = 'cover';\n      avatar.onerror = () => {\n        avatar.onerror = null;\n        avatar.src = defaultExternalAvatar(registration);\n      };\n",
        'external fallback',
    )
    EXTERNAL.write_text(external, encoding='utf-8')
    print('External signature avatar synchronized.')
else:
    print('External signature avatar already synchronized.')
