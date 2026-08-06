'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  BellRing,
  BriefcaseBusiness,
  CheckCircle2,
  Handshake,
  Layers3,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

type ItemKind = 'toolbox' | 'loan' | 'caution';
type ItemFilter = 'all' | ItemKind;
type Counts = Record<'all' | ItemKind, number>;
type ToolboxStatus = 'ok' | 'missing' | 'damaged';
type ToolboxStatusInfo = {
  reportId: string;
  toolId: string;
  status: ToolboxStatus;
  lastCheck: string | null;
};
type ToolboxNotification = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

const EMPTY_COUNTS: Counts = { all: 0, toolbox: 0, loan: 0, caution: 0 };
const KIND_LABELS: Record<ItemKind, string> = {
  toolbox: 'CAIXA',
  loan: 'EMPRÉSTIMO',
  caution: 'CAUTELA',
};
const STATUS_LABELS: Record<ToolboxStatus, string> = {
  ok: 'OK',
  missing: 'NÃO RECEBI',
  damaged: 'DANIFICADO',
};
const STATUS_COLORS: Record<ToolboxStatus, { background: string; color: string; border: string }> = {
  ok: { background: '#dcfce7', color: '#047857', border: '#86efac' },
  missing: { background: '#fee2e2', color: '#be123c', border: '#fda4af' },
  damaged: { background: '#ffedd5', color: '#c2410c', border: '#fdba74' },
};

function normalizeKey(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseRegistration(element: Element | null) {
  let current = element as HTMLElement | null;
  while (current && current !== document.body) {
    const text = current.textContent || '';
    const match = text.match(/MAT:\s*([A-Z0-9-]+)/i);
    if (match && text.length < 700) return match[1].trim();
    current = current.parentElement;
  }
  return '';
}

function isRestrictedStandardAction(text: string) {
  const normalized = normalizeKey(text);
  return normalized === 'vincular lista padrao'
    || normalized.includes('vincular tudo')
    || normalized.startsWith('lista padrao');
}

function isQuickStatusButton(button: HTMLButtonElement) {
  const title = normalizeKey(button.getAttribute('title'));
  return ['ok', 'nao recebido', 'danificado'].includes(title);
}

function sameCounts(left: Counts, right: Counts) {
  return left.all === right.all
    && left.toolbox === right.toolbox
    && left.loan === right.loan
    && left.caution === right.caution;
}

function relationValue<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function formatStatusDate(value: string | null) {
  if (!value) return 'sem conferência';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'sem conferência';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function restoreStatusButtons(card: HTMLElement) {
  card.querySelectorAll<HTMLButtonElement>('button[data-toolbox-status-hidden="true"]').forEach((button) => {
    const previous = button.dataset.toolboxPreviousDisplay;
    button.style.display = previous === '__empty__' ? '' : previous || '';
    button.disabled = false;
    delete button.dataset.toolboxStatusHidden;
    delete button.dataset.toolboxPreviousDisplay;
  });
}

function applyToolboxStatus(card: HTMLElement, info: ToolboxStatusInfo | undefined) {
  const status = info?.status || 'ok';
  const visual = STATUS_COLORS[status];
  const quickButtons = Array.from(card.querySelectorAll<HTMLButtonElement>('button')).filter(isQuickStatusButton);
  quickButtons.forEach((button) => {
    if (!button.dataset.toolboxPreviousDisplay) {
      button.dataset.toolboxPreviousDisplay = button.style.display || '__empty__';
    }
    button.dataset.toolboxStatusHidden = 'true';
    button.style.display = 'none';
    button.disabled = true;
  });

  let indicator = card.querySelector<HTMLElement>('[data-toolbox-latest-status="true"]');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.dataset.toolboxLatestStatus = 'true';
    indicator.style.display = 'flex';
    indicator.style.alignItems = 'center';
    indicator.style.justifyContent = 'space-between';
    indicator.style.gap = '0.75rem';
    indicator.style.flexWrap = 'wrap';
    indicator.style.marginTop = '0.75rem';
    indicator.style.padding = '0.65rem 0.8rem';
    indicator.style.borderRadius = '0.85rem';
    indicator.style.fontSize = '0.67rem';
    indicator.style.fontWeight = '900';
    indicator.style.letterSpacing = '0.035em';
    const actionsContainer = quickButtons[0]?.parentElement;
    if (actionsContainer?.parentElement) actionsContainer.parentElement.insertBefore(indicator, actionsContainer);
    else card.appendChild(indicator);
  }

  indicator.style.background = visual.background;
  indicator.style.color = visual.color;
  indicator.style.border = `1px solid ${visual.border}`;
  indicator.replaceChildren();

  const statusText = document.createElement('span');
  statusText.textContent = `ÚLTIMO STATUS: ${STATUS_LABELS[status]} · ${formatStatusDate(info?.lastCheck || null)}`;
  const signatureText = document.createElement('span');
  signatureText.textContent = 'ALTERAÇÃO SOMENTE COM ASSINATURA';
  signatureText.style.opacity = '0.72';
  signatureText.style.fontSize = '0.58rem';
  indicator.append(statusText, signatureText);

  const nativeStatus = Array.from(card.querySelectorAll<HTMLElement>('span, div')).find((element) => {
    if (element.closest('[data-toolbox-latest-status="true"]')) return false;
    if (element.children.length > 0) return false;
    return ['ok', 'nao recebido', 'danificado'].includes(normalizeKey(element.textContent));
  });
  if (nativeStatus) {
    nativeStatus.textContent = STATUS_LABELS[status];
    nativeStatus.style.background = visual.background;
    nativeStatus.style.color = visual.color;
    nativeStatus.style.borderColor = visual.border;
  }
}

export function CauteliaToolboxSeparation() {
  const { user } = useAuth();
  const isAdministrator = user?.role === 'Administrador';
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<ItemFilter>('all');
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [selectedRegistration, setSelectedRegistration] = useState('');
  const [notifications, setNotifications] = useState<ToolboxNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const filterRef = useRef<ItemFilter>('all');
  const registrationRef = useRef('');
  const kindsByNameRef = useRef<Map<string, ItemKind>>(new Map());
  const toolboxStatusByNameRef = useRef<Map<string, ToolboxStatusInfo>>(new Map());
  const clearedManageSelectionRef = useRef('');
  const scanFrameRef = useRef<number | null>(null);
  const bellButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setMounted(true), []);

  const setRegistration = useCallback((registration: string) => {
    if (!registration || registrationRef.current === registration) return;
    registrationRef.current = registration;
    clearedManageSelectionRef.current = '';
    setSelectedRegistration(registration);
  }, []);

  const scanPage = useCallback(() => {
    const activeTechnician = document.querySelector<HTMLElement>('.border-r-4.border-indigo-500');
    const activeRegistration = parseRegistration(activeTechnician);
    if (activeRegistration) setRegistration(activeRegistration);

    document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      const restricted = isRestrictedStandardAction(button.textContent || '');
      if (!restricted) return;

      if (!isAdministrator) {
        if (!button.dataset.standardPreviousDisplay) {
          button.dataset.standardPreviousDisplay = button.style.display || '__empty__';
        }
        button.dataset.standardRestricted = 'true';
        button.disabled = true;
        button.style.display = 'none';
      } else if (button.dataset.standardRestricted === 'true') {
        const previous = button.dataset.standardPreviousDisplay;
        button.style.display = previous === '__empty__' ? '' : previous || '';
        button.disabled = false;
        delete button.dataset.standardRestricted;
        delete button.dataset.standardPreviousDisplay;
      }
    });

    if (!isAdministrator && registrationRef.current) {
      const clearButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => normalizeKey(button.textContent) === 'limpar tudo' && button.offsetParent !== null,
      );
      const standardSummary = Array.from(document.querySelectorAll<HTMLElement>('p, span')).find(
        (element) => /\d+\s+itens\s+padr[aã]o/i.test(element.textContent || ''),
      );
      const standardCount = Number(standardSummary?.textContent?.match(/(\d+)\s+itens\s+padr[aã]o/i)?.[1] || 0);
      const clearKey = `${registrationRef.current}:manage`;
      if (clearButton && standardCount > 0 && clearedManageSelectionRef.current !== clearKey) {
        clearedManageSelectionRef.current = clearKey;
        clearButton.click();
      }
    }

    const cards: HTMLElement[] = [];
    const nextCounts: Counts = { ...EMPTY_COUNTS };
    const badgeCandidates = Array.from(document.querySelectorAll<HTMLElement>('div')).filter((element) => {
      if (element.children.length > 0) return false;
      const text = normalizeKey(element.textContent).toUpperCase();
      return ['PADRAO', 'GRANDE', 'CAIXA', 'CAUTELA', 'EMPRESTIMO'].includes(text);
    });

    badgeCandidates.forEach((badge) => {
      const card = badge.closest<HTMLElement>('div.group');
      const nameElement = card?.querySelector<HTMLElement>('h4');
      if (!card || !nameElement) return;

      const rawBadge = normalizeKey(badge.textContent);
      const nameKey = normalizeKey(nameElement.textContent);
      let kind: ItemKind;
      if (rawBadge === 'padrao' || rawBadge === 'caixa') {
        kind = 'toolbox';
      } else {
        kind = kindsByNameRef.current.get(nameKey) || 'caution';
      }

      card.dataset.cauteliaItemKind = kind;
      const nextLabel = KIND_LABELS[kind];
      if ((badge.textContent || '').trim() !== nextLabel) badge.textContent = nextLabel;
      badge.style.backgroundColor = kind === 'toolbox' ? '#e0f2fe' : kind === 'loan' ? '#ede9fe' : '#fef3c7';
      badge.style.color = kind === 'toolbox' ? '#075985' : kind === 'loan' ? '#5b21b6' : '#92400e';
      badge.style.paddingInline = '0.45rem';

      if (kind === 'toolbox') {
        applyToolboxStatus(card, toolboxStatusByNameRef.current.get(nameKey));
      } else {
        card.querySelector('[data-toolbox-latest-status="true"]')?.remove();
        restoreStatusButtons(card);
      }

      const visible = filterRef.current === 'all' || filterRef.current === kind;
      card.style.display = visible ? '' : 'none';
      cards.push(card);
      nextCounts[kind] += 1;
      nextCounts.all += 1;
    });

    setCounts((previous) => sameCounts(previous, nextCounts) ? previous : nextCounts);

    const firstCard = cards[0];
    if (firstCard?.parentElement) {
      let mount = document.getElementById('cautelia-toolbox-filter-root');
      if (!mount) {
        mount = document.createElement('div');
        mount.id = 'cautelia-toolbox-filter-root';
        firstCard.parentElement.insertBefore(mount, firstCard);
      }
      setPortalNode((previous) => previous === mount ? previous : mount);
    } else {
      const mount = document.getElementById('cautelia-toolbox-filter-root');
      if (mount) mount.remove();
      setPortalNode((previous) => previous ? null : previous);
    }
  }, [isAdministrator, setRegistration]);

  const scheduleScan = useCallback(() => {
    if (scanFrameRef.current !== null) return;
    scanFrameRef.current = window.requestAnimationFrame(() => {
      scanFrameRef.current = null;
      scanPage();
    });
  }, [scanPage]);

  useEffect(() => {
    filterRef.current = filter;
    scheduleScan();
  }, [filter, scheduleScan]);

  useEffect(() => {
    const clickHandler = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>('button');
      if (!button) {
        const registration = parseRegistration(target);
        if (registration) setRegistration(registration);
        return;
      }

      if (!isAdministrator && isRestrictedStandardAction(button.textContent || '')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      const card = button.closest<HTMLElement>('div.group');
      if (card?.dataset.cauteliaItemKind === 'toolbox' && isQuickStatusButton(button)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.alert('O status da caixa deve ser alterado pelo colaborador na Ferramentaria e confirmado com assinatura.');
        return;
      }

      const registration = parseRegistration(target);
      if (registration) setRegistration(registration);
    };

    document.addEventListener('click', clickHandler, true);
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scheduleScan();

    return () => {
      document.removeEventListener('click', clickHandler, true);
      observer.disconnect();
      if (scanFrameRef.current !== null) window.cancelAnimationFrame(scanFrameRef.current);
      document.getElementById('cautelia-toolbox-filter-root')?.remove();
    };
  }, [isAdministrator, scheduleScan, setRegistration]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedRegistration) {
      kindsByNameRef.current = new Map();
      toolboxStatusByNameRef.current = new Map();
      scheduleScan();
      return;
    }

    const loadKindsAndStatuses = async () => {
      const [reportsResponse, cautelasResponse] = await Promise.all([
        supabase
          .from('cautelia_reports')
          .select('id, tool_id, status, last_check, cautelia_standard_tools(id, name)')
          .eq('user_id', selectedRegistration),
        supabase
          .from('cautelas')
          .select('tool_id, type, tools(name)')
          .eq('user_id', selectedRegistration),
      ]);

      if (cancelled) return;
      const kindMap = new Map<string, ItemKind>();
      const statusMap = new Map<string, ToolboxStatusInfo>();
      (reportsResponse.data || []).forEach((row: any) => {
        const relation = relationValue(row.cautelia_standard_tools);
        if (!relation?.name) return;
        const nameKey = normalizeKey(relation.name);
        kindMap.set(nameKey, 'toolbox');
        statusMap.set(nameKey, {
          reportId: row.id,
          toolId: row.tool_id,
          status: (['ok', 'missing', 'damaged'].includes(row.status) ? row.status : 'ok') as ToolboxStatus,
          lastCheck: row.last_check || null,
        });
      });
      (cautelasResponse.data || []).forEach((row: any) => {
        const relation = relationValue(row.tools);
        if (!relation?.name) return;
        kindMap.set(normalizeKey(relation.name), normalizeKey(row.type) === 'loan' ? 'loan' : 'caution');
      });
      kindsByNameRef.current = kindMap;
      toolboxStatusByNameRef.current = statusMap;
      scheduleScan();
    };

    void loadKindsAndStatuses();
    const channel = supabase
      .channel(`controle-nfs-toolbox-status-${selectedRegistration}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cautelia_reports',
        filter: `user_id=eq.${selectedRegistration}`,
      }, () => void loadKindsAndStatuses())
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [scheduleScan, selectedRegistration]);

  const loadNotifications = useCallback(async () => {
    if (!user?.registration || !isAdministrator) {
      setNotifications([]);
      return;
    }
    const { data, error } = await supabase
      .from('app_notifications')
      .select('id, title, message, is_read, created_at')
      .eq('user_registration', user.registration)
      .eq('type', 'toolbox_status')
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(30);
    if (!error) setNotifications((data || []) as ToolboxNotification[]);
  }, [isAdministrator, user?.registration]);

  useEffect(() => {
    void loadNotifications();
    if (!user?.registration || !isAdministrator) return;
    const channel = supabase
      .channel(`controle-nfs-toolbox-notifications-${user.registration}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'app_notifications',
        filter: `user_registration=eq.${user.registration}`,
      }, () => void loadNotifications())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isAdministrator, loadNotifications, user?.registration]);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const openNotifications = useCallback((event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    setNotificationsOpen((open) => !open);
  }, []);

  const patchBell = useCallback(() => {
    if (!isAdministrator) return;
    const bell = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.querySelector('svg.lucide-bell')) || null;
    if (!bell) return;
    if (bellButtonRef.current !== bell) {
      bellButtonRef.current?.removeEventListener('click', openNotifications, true);
      bellButtonRef.current = bell;
      bell.addEventListener('click', openNotifications, true);
    }
    bell.setAttribute('aria-label', 'Notificações da caixa de ferramentas');
    let badge = bell.querySelector<HTMLElement>('[data-toolbox-notification-count="true"]');
    if (!badge) {
      badge = document.createElement('span');
      badge.dataset.toolboxNotificationCount = 'true';
      badge.style.position = 'absolute';
      badge.style.top = '-0.2rem';
      badge.style.right = '-0.2rem';
      badge.style.minWidth = '1.15rem';
      badge.style.height = '1.15rem';
      badge.style.padding = '0 0.25rem';
      badge.style.display = 'grid';
      badge.style.placeItems = 'center';
      badge.style.borderRadius = '999px';
      badge.style.background = '#e11d48';
      badge.style.color = '#fff';
      badge.style.border = '2px solid #fff';
      badge.style.fontSize = '0.6rem';
      badge.style.fontWeight = '900';
      bell.appendChild(badge);
    }
    badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    badge.style.visibility = unreadCount ? 'visible' : 'hidden';
    Array.from(bell.children).forEach((child) => {
      if (child !== badge && child instanceof HTMLElement && child.tagName === 'SPAN' && child.className.includes('bg-rose-500')) {
        child.style.display = 'none';
      }
    });
  }, [isAdministrator, openNotifications, unreadCount]);

  useEffect(() => {
    if (!mounted) return;
    patchBell();
    const observer = new MutationObserver(patchBell);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      bellButtonRef.current?.removeEventListener('click', openNotifications, true);
      bellButtonRef.current = null;
    };
  }, [mounted, openNotifications, patchBell]);

  const markNotificationRead = async (notification: ToolboxNotification) => {
    if (notification.is_read) return;
    await supabase.from('app_notifications').update({ is_read: true }).eq('id', notification.id);
    setNotifications((rows) => rows.map((row) => row.id === notification.id ? { ...row, is_read: true } : row));
  };

  const dismissNotifications = async () => {
    if (!user?.registration) return;
    await supabase
      .from('app_notifications')
      .update({ dismissed_at: new Date().toISOString(), is_read: true })
      .eq('user_registration', user.registration)
      .eq('type', 'toolbox_status')
      .is('dismissed_at', null);
    setNotifications([]);
    setNotificationsOpen(false);
  };

  const options: Array<{ id: ItemFilter; label: string; count: number; icon: ReactNode }> = [
    { id: 'all', label: 'Todos', count: counts.all, icon: <Layers3 size={15}/> },
    { id: 'toolbox', label: 'Caixa de ferramentas', count: counts.toolbox, icon: <BriefcaseBusiness size={15}/> },
    { id: 'caution', label: 'Cautelas', count: counts.caution, icon: <ShieldCheck size={15}/> },
    { id: 'loan', label: 'Empréstimos', count: counts.loan, icon: <Handshake size={15}/> },
  ];

  const filterPortal = portalNode && counts.all > 0 ? createPortal(
    <section className="mb-2 rounded-[2rem] border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Responsabilidades separadas</p>
          <p className="mt-1 text-[9px] font-bold text-slate-400">A caixa mostra sempre o último status assinado pelo colaborador.</p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-[8px] font-black uppercase tracking-widest text-amber-700">Status com assinatura</span>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {options.map((option) => (
          <button
            type="button"
            key={option.id}
            onClick={() => setFilter(option.id)}
            className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-all ${filter === option.id ? 'border-slate-900 bg-slate-900 text-white shadow-lg' : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200 hover:bg-white'}`}
          >
            <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wide">{option.icon}{option.label}</span>
            <strong className={`rounded-full px-2 py-0.5 text-[9px] ${filter === option.id ? 'bg-white/15 text-white' : 'bg-white text-slate-500'}`}>{option.count}</strong>
          </button>
        ))}
      </div>
    </section>,
    portalNode,
  ) : null;

  const notificationPortal = mounted && notificationsOpen && isAdministrator ? createPortal(
    <div className="fixed inset-0 z-[160] bg-slate-950/45 backdrop-blur-sm" onClick={() => setNotificationsOpen(false)}>
      <section className="absolute right-4 top-20 w-[min(92vw,430px)] overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 bg-slate-950 px-5 py-4 text-white">
          <div className="flex items-center gap-3"><BellRing size={20} className="text-amber-400"/><div><strong className="block text-sm">Alertas da caixa</strong><span className="text-[10px] text-slate-300">Status enviados e assinados pelos colaboradores</span></div></div>
          <button type="button" onClick={() => setNotificationsOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10"><X size={17}/></button>
        </header>
        <div className="max-h-[65vh] overflow-y-auto p-3">
          {!notifications.length ? <div className="grid place-items-center gap-2 px-6 py-12 text-center text-slate-400"><CheckCircle2 size={30}/><strong className="text-sm text-slate-600">Nenhum alerta pendente</strong><span className="text-[11px]">Novos status aparecerão aqui automaticamente.</span></div> : notifications.map((notification) => (
            <button type="button" key={notification.id} onClick={() => void markNotificationRead(notification)} className={`mb-2 block w-full rounded-2xl border p-4 text-left transition ${notification.is_read ? 'border-slate-100 bg-white' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${notification.title.toLowerCase().includes('danificado') || notification.title.toLowerCase().includes('não') ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>{notification.title.toLowerCase().includes('danificado') || notification.title.toLowerCase().includes('não') ? <TriangleAlert size={17}/> : <CheckCircle2 size={17}/>}</div>
                <div className="min-w-0 flex-1"><strong className="block text-xs text-slate-900">{notification.title}</strong><p className="mt-1 text-[11px] leading-relaxed text-slate-600">{notification.message}</p><span className="mt-2 block text-[9px] font-bold uppercase tracking-wider text-slate-400">{formatStatusDate(notification.created_at)}</span></div>
                {!notification.is_read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500"/> : null}
              </div>
            </button>
          ))}
        </div>
        {notifications.length ? <footer className="border-t border-slate-100 bg-slate-50 p-3"><button type="button" onClick={() => void dismissNotifications()} className="w-full rounded-xl bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white">Arquivar alertas</button></footer> : null}
      </section>
    </div>,
    document.body,
  ) : null;

  return <>{filterPortal}{notificationPortal}</>;
}
