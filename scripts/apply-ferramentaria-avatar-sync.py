from pathlib import Path
import sys

PEOPLE_PATH = Path('app/dashboard/pessoas/page.tsx')
HISTORY_PATH = Path('app/dashboard/historico/page.tsx')
MARKER = '// FERRAMENTARIA_AVATAR_SYNC_V1'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


people = PEOPLE_PATH.read_text(encoding='utf-8')
if MARKER not in people:
    people_helpers = r'''// FERRAMENTARIA_AVATAR_SYNC_V1
const FERRAMENTARIA_ORIGIN = (
  process.env.NEXT_PUBLIC_FERRAMENTARIA_URL || 'https://ferramentaria-gamma.vercel.app'
).replace(/\/$/, '');
const FERRAMENTARIA_AVATAR_VERSION = '20260806-hq2';
const FERRAMENTARIA_AVATAR_IDS = [
  'fox', 'gorilla', 'jaguar', 'panther', 'armadillo',
  'bison', 'bear', 'beaver', 'wolf', 'rhino',
] as const;

function defaultFerramentariaAvatar(key?: string | null) {
  const source = String(key || 'ferramentaria');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  const avatarId = FERRAMENTARIA_AVATAR_IDS[hash % FERRAMENTARIA_AVATAR_IDS.length];
  return `${FERRAMENTARIA_ORIGIN}/api/avatar/${avatarId}?v=${FERRAMENTARIA_AVATAR_VERSION}`;
}

function resolveFerramentariaAvatar(value?: string | null, key?: string | null) {
  const avatar = String(value || '').trim();
  if (/^https?:\/\//i.test(avatar)) return avatar;
  if (avatar.startsWith('/api/avatar/')) {
    return `${FERRAMENTARIA_ORIGIN}${avatar}`;
  }
  return defaultFerramentariaAvatar(key);
}

function FerramentariaAvatarImage({ user }: { user: Colaborador }) {
  const fallback = defaultFerramentariaAvatar(user.registration);
  const source = resolveFerramentariaAvatar(user.avatar_url, user.registration);

  return (
    <img
      src={source}
      alt={`Avatar de ${user.name}`}
      width={56}
      height={56}
      className="h-full w-full object-cover object-center"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={(event) => {
        if (event.currentTarget.dataset.fallbackApplied === '1') return;
        event.currentTarget.dataset.fallbackApplied = '1';
        event.currentTarget.src = fallback;
      }}
    />
  );
}
'''

    people = replace_once(
        people,
        "import Image from 'next/image';\n",
        "import Image from 'next/image';\n\n" + people_helpers,
        'people avatar helpers',
    )
    people = replace_once(
        people,
        '<Image src={u.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${u.name}`} alt={u.name} width={56} height={56} referrerPolicy="no-referrer" />',
        '<FerramentariaAvatarImage user={u} />',
        'people collaborator avatar',
    )
    PEOPLE_PATH.write_text(people, encoding='utf-8')
    print('People avatar synchronization applied.')
else:
    print('People avatar synchronization already applied.')

history = HISTORY_PATH.read_text(encoding='utf-8')
if MARKER not in history:
    history = replace_once(
        history,
        "const AVATAR_RENDER_VERSION = '20260806-hq2';\n",
        "const AVATAR_RENDER_VERSION = '20260806-hq2';\n" + MARKER + "\nconst FERRAMENTARIA_AVATAR_IDS = [\n  'fox', 'gorilla', 'jaguar', 'panther', 'armadillo',\n  'bison', 'bear', 'beaver', 'wolf', 'rhino',\n] as const;\n",
        'history avatar ids',
    )

    old_resolver = r'''function resolveAvatarUrl(value?: string | null) {
  const avatar = String(value || '').trim();
  if (!avatar) return '';
  if (/^(https?:|data:|blob:)/i.test(avatar)) return avatar;

  const resolved = `${FERRAMENTARIA_ORIGIN}/${avatar.replace(/^\/+/, '')}`;
  const separator = resolved.includes('?') ? '&' : '?';
  return `${resolved}${separator}v=${AVATAR_RENDER_VERSION}`;
}'''

    new_resolver = r'''function defaultAvatarUrl(key?: string | null) {
  const source = String(key || 'ferramentaria');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  const avatarId = FERRAMENTARIA_AVATAR_IDS[hash % FERRAMENTARIA_AVATAR_IDS.length];
  return `${FERRAMENTARIA_ORIGIN}/api/avatar/${avatarId}?v=${AVATAR_RENDER_VERSION}`;
}

function resolveAvatarUrl(value?: string | null, key?: string | null) {
  const avatar = String(value || '').trim();
  if (/^https?:\/\//i.test(avatar)) return avatar;
  if (avatar.startsWith('/api/avatar/')) return `${FERRAMENTARIA_ORIGIN}${avatar}`;
  return defaultAvatarUrl(key);
}'''

    history = replace_once(history, old_resolver, new_resolver, 'history avatar resolver')
    history = replace_once(
        history,
        'const avatarUrl = resolveAvatarUrl(user?.avatar_url);',
        'const avatarUrl = resolveAvatarUrl(user?.avatar_url, registration);',
        'history avatar key',
    )
    HISTORY_PATH.write_text(history, encoding='utf-8')
    print('History avatar synchronization applied.')
else:
    print('History avatar synchronization already applied.')

sys.exit(0)
