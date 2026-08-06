'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BriefcaseBusiness, Handshake, Layers3, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

type ItemKind = 'toolbox' | 'loan' | 'caution';
type ItemFilter = 'all' | ItemKind;
type Counts = Record<'all' | ItemKind, number>;

const EMPTY_COUNTS: Counts = { all: 0, toolbox: 0, loan: 0, caution: 0 };
const KIND_LABELS: Record<ItemKind, string> = {
  toolbox: 'CAIXA',
  loan: 'EMPRÉSTIMO',
  caution: 'CAUTELA',
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

function sameCounts(left: Counts, right: Counts) {
  return left.all === right.all
    && left.toolbox === right.toolbox
    && left.loan === right.loan
    && left.caution === right.caution;
}

export function CauteliaToolboxSeparation() {
  const { user } = useAuth();
  const isAdministrator = user?.role === 'Administrador';
  const [filter, setFilter] = useState<ItemFilter>('all');
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [selectedRegistration, setSelectedRegistration] = useState('');
  const filterRef = useRef<ItemFilter>('all');
  const registrationRef = useRef('');
  const kindsByNameRef = useRef<Map<string, ItemKind>>(new Map());
  const clearedManageSelectionRef = useRef('');
  const scanFrameRef = useRef<number | null>(null);

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
      badge.textContent = KIND_LABELS[kind];
      badge.style.backgroundColor = kind === 'toolbox' ? '#e0f2fe' : kind === 'loan' ? '#ede9fe' : '#fef3c7';
      badge.style.color = kind === 'toolbox' ? '#075985' : kind === 'loan' ? '#5b21b6' : '#92400e';
      badge.style.paddingInline = '0.45rem';

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
      if (!isAdministrator && button && isRestrictedStandardAction(button.textContent || '')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
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
      scheduleScan();
      return;
    }

    const loadKinds = async () => {
      const [reportsResponse, cautelasResponse] = await Promise.all([
        supabase
          .from('cautelia_reports')
          .select('tool_id, cautelia_standard_tools(name)')
          .eq('user_id', selectedRegistration),
        supabase
          .from('cautelas')
          .select('tool_id, type, tools(name)')
          .eq('user_id', selectedRegistration),
      ]);

      if (cancelled) return;
      const map = new Map<string, ItemKind>();
      (reportsResponse.data || []).forEach((row: any) => {
        const relation = Array.isArray(row.cautelia_standard_tools)
          ? row.cautelia_standard_tools[0]
          : row.cautelia_standard_tools;
        if (relation?.name) map.set(normalizeKey(relation.name), 'toolbox');
      });
      (cautelasResponse.data || []).forEach((row: any) => {
        const relation = Array.isArray(row.tools) ? row.tools[0] : row.tools;
        if (!relation?.name) return;
        map.set(normalizeKey(relation.name), normalizeKey(row.type) === 'loan' ? 'loan' : 'caution');
      });
      kindsByNameRef.current = map;
      scheduleScan();
    };

    void loadKinds();
    return () => { cancelled = true; };
  }, [scheduleScan, selectedRegistration]);

  if (!portalNode || counts.all === 0) return null;

  const options: Array<{ id: ItemFilter; label: string; count: number; icon: React.ReactNode }> = [
    { id: 'all', label: 'Todos', count: counts.all, icon: <Layers3 size={15}/> },
    { id: 'toolbox', label: 'Caixa de ferramentas', count: counts.toolbox, icon: <BriefcaseBusiness size={15}/> },
    { id: 'caution', label: 'Cautelas', count: counts.caution, icon: <ShieldCheck size={15}/> },
    { id: 'loan', label: 'Empréstimos', count: counts.loan, icon: <Handshake size={15}/> },
  ];

  return createPortal(
    <section className="mb-2 rounded-[2rem] border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Responsabilidades separadas</p>
          <p className="mt-1 text-[9px] font-bold text-slate-400">A lista padrão da caixa não é contabilizada como cautela.</p>
        </div>
        {!isAdministrator ? <span className="rounded-full bg-slate-100 px-3 py-1 text-[8px] font-black uppercase tracking-widest text-slate-500">Somente leitura</span> : null}
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
  );
}
