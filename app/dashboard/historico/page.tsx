'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowRight,
  Calendar,
  Filter,
  History,
  Loader2,
  MapPin,
  Package,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

const TYPE_TRANSLATIONS: Record<string, { label: string; color: string }> = {
  caution: { label: 'Cautela', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  cautela: { label: 'Cautela', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  loan: { label: 'Empréstimo', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  borrow: { label: 'Empréstimo', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  return: { label: 'Devolução', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  adjustment_gain: { label: 'Ajuste (+)', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  adjustment_loss: { label: 'Ajuste (-)', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  adjustment: { label: 'Ajuste', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  loss: { label: 'Perda', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  transfer: { label: 'Transferência', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
};

const FERRAMENTARIA_ORIGIN = (
  process.env.NEXT_PUBLIC_FERRAMENTARIA_URL || 'https://ferramentaria-gamma.vercel.app'
).replace(/\/$/, '');
const AVATAR_RENDER_VERSION = '20260806-hq2';
const PAGE_SIZE = 100;

type ToolSummary = {
  name: string | null;
  code: string | null;
  image_url: string | null;
};

type BranchSummary = {
  name: string | null;
};

type HistoryTransaction = {
  id: string;
  tool_id: string | null;
  user_id: string | null;
  type: string | null;
  obs: string | null;
  branch: string | null;
  branch_id: string | null;
  created_at: string;
  tools: ToolSummary | null;
  branches: BranchSummary | null;
};

type HistoryUser = {
  registration: string;
  name: string | null;
  avatar_url: string | null;
};

type Branch = {
  id: string;
  name: string;
};

function effectiveTransactionType(transaction: HistoryTransaction) {
  const rawType = String(transaction.type || '').toLowerCase();
  const observation = String(transaction.obs || '').toLowerCase();
  if (rawType === 'borrow') return observation.includes('cautela') ? 'caution' : 'loan';
  return rawType;
}

function resolveAvatarUrl(value?: string | null) {
  const avatar = String(value || '').trim();
  if (!avatar) return '';
  if (/^(https?:|data:|blob:)/i.test(avatar)) return avatar;

  const resolved = `${FERRAMENTARIA_ORIGIN}/${avatar.replace(/^\/+/, '')}`;
  const separator = resolved.includes('?') ? '&' : '?';
  return `${resolved}${separator}v=${AVATAR_RENDER_VERSION}`;
}

function initials(name?: string | null, registration?: string | null) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length) return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return String(registration || '?').slice(0, 2).toUpperCase();
}

function CollaboratorAvatar({ user, registration }: { user?: HistoryUser; registration?: string | null }) {
  const avatarUrl = resolveAvatarUrl(user?.avatar_url);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [avatarUrl]);

  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
      {avatarUrl && !failed ? (
        <img
          src={avatarUrl}
          alt={`Avatar de ${user?.name || registration || 'colaborador'}`}
          className="h-full w-full object-cover object-center"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-indigo-50 text-[10px] font-black uppercase text-indigo-600">
          {initials(user?.name, registration)}
        </div>
      )}
    </div>
  );
}

export default function HistoricoPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const toolIdParam = searchParams.get('tool_id');

  const [transactions, setTransactions] = useState<HistoryTransaction[]>([]);
  const [usersByRegistration, setUsersByRegistration] = useState<Record<string, HistoryUser>>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchBranches = useCallback(async () => {
    const { data, error } = await supabase.from('branches').select('id,name').order('name');
    if (error) {
      console.error('Error fetching branches:', error);
      return;
    }
    setBranches((data || []) as Branch[]);
  }, []);

  const fetchTransactionUsers = useCallback(async (rows: HistoryTransaction[]) => {
    const registrations = Array.from(
      new Set(rows.map((row) => String(row.user_id || '').trim()).filter(Boolean)),
    );
    if (!registrations.length) return;

    const { data, error } = await supabase
      .from('users_access')
      .select('registration,name,avatar_url')
      .in('registration', registrations);

    if (error) {
      console.error('Error fetching transaction users:', error);
      return;
    }

    setUsersByRegistration((current) => {
      const next = { ...current };
      ((data || []) as HistoryUser[]).forEach((person) => {
        next[String(person.registration).trim()] = person;
      });
      return next;
    });
  }, []);

  const fetchTransactions = useCallback(async (isLoadMore = false) => {
    if (!user) return;
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    const currentPage = isLoadMore ? pageRef.current + 1 : 0;
    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      let query = supabase
        .from('transactions')
        .select(`
          *,
          tools:tool_id (name, code, image_url),
          branches:branch_id (name)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (selectedType !== 'all') {
        if (selectedType === 'adjustment') {
          query = query.ilike('type', 'adjustment%');
        } else if (selectedType === 'loan') {
          query = query.eq('type', 'borrow').not('obs', 'ilike', '%cautela%');
        } else if (selectedType === 'caution') {
          query = query.eq('type', 'borrow').ilike('obs', '%cautela%');
        } else {
          query = query.eq('type', selectedType);
        }
      }

      if (selectedBranch !== 'all') query = query.eq('branch_id', selectedBranch);
      if (startDate) query = query.gte('created_at', new Date(startDate).toISOString());
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte('created_at', end.toISOString());
      }
      if (toolIdParam) query = query.eq('tool_id', toolIdParam);

      if (searchTerm) {
        const { data: tools, error: toolsError } = await supabase
          .from('tools')
          .select('id')
          .or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
        if (toolsError) throw toolsError;

        const toolIds = (tools || []).map((tool) => tool.id);
        if (!toolIds.length) {
          setTransactions([]);
          setHasMore(false);
          return;
        }
        query = query.in('tool_id', toolIds);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      const rows = (data || []) as unknown as HistoryTransaction[];
      await fetchTransactionUsers(rows);

      if (isLoadMore) {
        setTransactions((current) => [...current, ...rows]);
        setPage(currentPage);
      } else {
        setTransactions(rows);
        setPage(0);
      }
      setHasMore(Boolean(count && (currentPage + 1) * PAGE_SIZE < count));
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [endDate, fetchTransactionUsers, searchTerm, selectedBranch, selectedType, startDate, toolIdParam, user]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    void fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedType('all');
    setSelectedBranch('all');
    setStartDate('');
    setEndDate('');
    setPage(0);
    pageRef.current = 0;
    setHasMore(true);
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 px-4 py-8 pb-32 font-sans lg:px-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-black uppercase italic tracking-tight text-slate-900">
            <History className="text-indigo-600" size={28} />
            Histórico de Movimentações
          </h1>
          <p className="text-sm font-medium italic text-slate-500 opacity-75">
            Visualização completa de todas as transações de ferramentas do sistema.
          </p>
        </div>
      </div>

      {toolIdParam && transactions.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between rounded-[1.5rem] border border-indigo-100 bg-indigo-50 p-5 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-white p-3 text-indigo-600 shadow-sm"><Filter size={18} /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-900">Filtrando por ferramenta específica:</p>
              <p className="mt-0.5 text-sm font-black uppercase italic text-indigo-600">
                {transactions[0]?.tools?.name} <span className="ml-1 text-indigo-300">#{transactions[0]?.tools?.code}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard/historico')}
            className="rounded-xl border border-indigo-200 bg-white px-6 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600 shadow-sm transition-all hover:bg-indigo-600 hover:text-white active:scale-95"
          >
            Ver Histórico Global
          </button>
        </motion.div>
      ) : null}

      <div className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="group relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
            <input
              type="text"
              placeholder="Ferramenta ou código..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-2xl border-2 border-transparent bg-slate-50 py-3 pl-12 pr-4 text-[11px] font-black uppercase tracking-wider text-slate-700 transition-all focus:border-indigo-100 focus:bg-white focus:ring-0"
            />
          </div>

          <div className="group relative">
            <Filter size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              className="w-full cursor-pointer appearance-none rounded-2xl border-2 border-transparent bg-slate-50 py-3 pl-12 pr-4 text-[11px] font-black uppercase tracking-wider text-slate-700 transition-all focus:border-indigo-100 focus:bg-white focus:ring-0"
            >
              <option value="all">Todos os Tipos</option>
              <option value="caution">Cautela</option>
              <option value="loan">Empréstimo</option>
              <option value="return">Devolução</option>
              <option value="adjustment">Ajuste</option>
              <option value="loss">Perda</option>
            </select>
          </div>

          <div className="group relative">
            <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
            <select
              value={selectedBranch}
              onChange={(event) => setSelectedBranch(event.target.value)}
              className="w-full cursor-pointer appearance-none rounded-2xl border-2 border-transparent bg-slate-50 py-3 pl-12 pr-4 text-[11px] font-black uppercase tracking-wider text-slate-700 transition-all focus:border-indigo-100 focus:bg-white focus:ring-0"
            >
              <option value="all">Todas as Filiais</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </div>

          <div className="group relative">
            <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-2xl border-2 border-transparent bg-slate-50 py-3 pl-12 pr-4 text-[11px] font-black uppercase tracking-wider text-slate-700 transition-all focus:border-indigo-100 focus:bg-white focus:ring-0"
            />
          </div>

          <div className="group relative">
            <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-2xl border-2 border-transparent bg-slate-50 py-3 pl-12 pr-4 text-[11px] font-black uppercase tracking-wider text-slate-700 transition-all focus:border-indigo-100 focus:bg-white focus:ring-0"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={clearFilters}
            className="flex items-center gap-2 rounded-xl bg-slate-100 px-6 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-slate-200 active:scale-95"
          >
            <RotateCcw size={14} /> Limpar Filtros
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl">
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                <th className="px-8 py-5">Ferramenta</th>
                <th className="px-8 py-5">Tipo</th>
                <th className="px-8 py-5">Responsável</th>
                <th className="px-8 py-5">Unidade / Filial</th>
                <th className="px-8 py-5">Observação</th>
                <th className="px-8 py-5 text-right">Data/Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && transactions.length === 0 ? (
                <tr><td colSpan={6} className="py-20 text-center"><Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-indigo-500" /><p className="text-xs font-bold uppercase italic tracking-widest text-slate-400">Carregando movimentações...</p></td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={6} className="py-20 text-center"><History className="mx-auto mb-4 h-12 w-12 text-slate-200" /><p className="text-sm font-black uppercase tracking-widest text-slate-300">Nenhum registro encontrado</p></td></tr>
              ) : transactions.map((transaction, index) => {
                const effectiveType = effectiveTransactionType(transaction);
                const type = TYPE_TRANSLATIONS[effectiveType]
                  || TYPE_TRANSLATIONS[effectiveType.split('_')[0]]
                  || { label: effectiveType || 'Registro', color: 'bg-slate-100 text-slate-700' };
                const registration = String(transaction.user_id || '').trim();
                const responsible = usersByRegistration[registration];

                return (
                  <motion.tr
                    key={transaction.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (index % 10) * 0.05 }}
                    className="group transition-colors hover:bg-slate-50/50"
                  >
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-300">
                          {transaction.tools?.image_url ? (
                            <Image src={transaction.tools.image_url} alt={transaction.tools.name || 'Ferramenta'} fill sizes="48px" className="object-cover" unoptimized referrerPolicy="no-referrer" />
                          ) : <Package size={20} />}
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase italic leading-none text-slate-900">{transaction.tools?.name || 'Desconhecido'}</p>
                          <p className="mt-1 text-[10px] font-mono uppercase tracking-tighter text-indigo-500">#{transaction.tools?.code || '---'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5"><span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase italic ${type.color}`}>{type.label}</span></td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <CollaboratorAvatar user={responsible} registration={registration} />
                        <div>
                          <p className="text-[11px] font-bold leading-none text-slate-700">{responsible?.name || (registration ? 'Colaborador' : 'Sistema')}</p>
                          <p className="mt-1 text-[9px] font-mono tracking-wider text-slate-400">{registration ? `#${registration}` : 'Sem matrícula'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5"><div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500"><MapPin size={12} className="text-slate-300" />{transaction.branches?.name || transaction.branch || 'Sede Central'}</div></td>
                    <td className="px-8 py-5"><p className="max-w-xs truncate text-[11px] italic text-slate-500" title={transaction.obs || ''}>{transaction.obs || 'Sem observações'}</p></td>
                    <td className="px-8 py-5 text-right"><div className="flex flex-col items-end"><p className="text-[11px] font-black uppercase italic text-slate-700">{format(new Date(transaction.created_at), "dd 'de' MMM", { locale: ptBR })}</p><p className="mt-0.5 text-[9px] font-mono text-slate-400">{format(new Date(transaction.created_at), 'HH:mm:ss')}</p></div></td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {hasMore ? (
          <div className="flex justify-center border-t border-slate-100 bg-slate-50 p-8">
            <button
              onClick={() => void fetchTransactions(true)}
              disabled={loadingMore}
              className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-8 py-4 text-[11px] font-black uppercase tracking-widest shadow-sm transition-all hover:border-indigo-600 hover:text-indigo-600 active:scale-95"
            >
              {loadingMore ? <><Loader2 size={16} className="animate-spin" /> Carregando...</> : <>Carregar Mais Registros <ArrowRight size={16} /></>}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
