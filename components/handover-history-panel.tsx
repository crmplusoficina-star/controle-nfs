'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowRightLeft, Handshake, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Handover = {
  id: string;
  tool_id: string;
  lender_registration: string;
  borrower_registration: string;
  handover_type: string;
  status: string;
  created_at: string;
  returned_at: string | null;
  tools?: {
    name?: string | null;
    code?: string | null;
    image_url?: string | null;
    branch?: string | null;
  } | null;
};

type Person = { registration: string; name: string | null };

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date);
}

function isPeerLoan(value: string) {
  return String(value || '').toLowerCase() === 'peer_loan';
}

export function HandoverHistoryPanel() {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tool_handovers')
        .select('id, tool_id, lender_registration, borrower_registration, handover_type, status, created_at, returned_at, tools:tool_id(name, code, image_url, branch)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      const rows = (data || []) as unknown as Handover[];
      setHandovers(rows);

      const registrations = Array.from(new Set(rows.flatMap((row) => [row.lender_registration, row.borrower_registration]).filter(Boolean)));
      if (!registrations.length) {
        setPeople({});
        return;
      }
      const { data: users, error: usersError } = await supabase
        .from('users_access')
        .select('registration, name')
        .in('registration', registrations);
      if (usersError) throw usersError;
      const map: Record<string, Person> = {};
      ((users || []) as Person[]).forEach((person) => { map[person.registration] = person; });
      setPeople(map);
    } catch (error) {
      console.error('Falha ao carregar repasses do histórico:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('controle-nfs-handover-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tool_handovers' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const rows = useMemo(() => handovers, [handovers]);
  if (!loading && rows.length === 0) return null;

  return (
    <section className="mx-auto mt-8 max-w-[1600px] px-4 font-sans lg:px-10">
      <div className="overflow-hidden rounded-[2rem] border border-indigo-100 bg-white shadow-lg">
        <header className="flex items-center justify-between gap-4 border-b border-indigo-100 bg-indigo-50/70 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-600 text-white"><ArrowRightLeft size={20} /></div>
            <div>
              <h2 className="text-sm font-black uppercase italic tracking-tight text-slate-900">Repasses entre colaboradores</h2>
              <p className="mt-1 text-[10px] font-bold text-slate-500">Empréstimos entre colegas e transferências de responsabilidade registrados no Supabase.</p>
            </div>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-[9px] font-black uppercase tracking-wider text-indigo-600 shadow-sm">{rows.length} registros</span>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead><tr className="border-b border-slate-100 bg-slate-50 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
              <th className="px-6 py-4">Ferramenta</th><th className="px-6 py-4">Tipo</th><th className="px-6 py-4">Origem</th><th className="px-6 py-4">Destino</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Data/Hora</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !rows.length ? <tr><td colSpan={6} className="px-6 py-10 text-center text-xs font-bold text-slate-400">Carregando repasses...</td></tr> : rows.map((row) => {
                const peer = isPeerLoan(row.handover_type);
                const lender = people[row.lender_registration];
                const borrower = people[row.borrower_registration];
                return <tr key={row.id} className="hover:bg-indigo-50/30">
                  <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">{row.tools?.image_url ? <img src={row.tools.image_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer"/> : <Package size={17}/>}</div><div><strong className="block text-[11px] uppercase italic text-slate-900">{row.tools?.name || 'Ferramenta'}</strong><span className="text-[9px] font-mono text-indigo-500">#{row.tools?.code || '---'}</span></div></div></td>
                  <td className="px-6 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[9px] font-black uppercase ${peer ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}>{peer ? <Handshake size={12}/> : <ArrowRightLeft size={12}/>} {peer ? 'Empréstimo colega' : 'Transferência'}</span></td>
                  <td className="px-6 py-4"><strong className="block text-[11px] text-slate-700">{lender?.name || 'Colaborador'}</strong><span className="text-[9px] font-mono text-slate-400">#{row.lender_registration}</span></td>
                  <td className="px-6 py-4"><div className="flex items-center gap-2"><ArrowRight size={14} className="text-indigo-400"/><div><strong className="block text-[11px] text-slate-700">{borrower?.name || 'Colaborador'}</strong><span className="text-[9px] font-mono text-slate-400">#{row.borrower_registration}</span></div></div></td>
                  <td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${row.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{row.status === 'active' ? 'Ativo' : row.status === 'returned' ? 'Devolvido' : row.status}</span></td>
                  <td className="px-6 py-4 text-right text-[10px] font-bold text-slate-500">{formatDate(row.created_at)}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
