'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  Users, Search, Shield, Plus, X, ChevronDown,
  Building2, UserPlus, Briefcase, Hash, MapPin,
  Loader2, CheckCircle2, AlertTriangle, Pencil,
  UserCheck, UserX, Phone, Mail, ToggleLeft, ToggleRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'colaboradores' | 'clientes' | 'funcionarios_cliente';

interface Colaborador {
  id: string;
  name: string;
  registration: string;
  role: 'Administrador' | 'Operador';
  branch_id: string;
  active: boolean;
  avatar_url?: string | null;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
  document: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  active: boolean;
  created_at: string;
}

interface ClientEmployee {
  id: string;
  client_id: string;
  name: string;
  registration: string | null;
  role: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
  clients?: { name: string };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PessoasPage() {
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState<Tab>('colaboradores');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // data
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientEmployees, setClientEmployees] = useState<ClientEmployee[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  // modal
  const [modal, setModal] = useState<null | 'colaborador' | 'client' | 'client_employee'>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    const [colRes, brRes, clRes, ceRes] = await Promise.all([
      supabase.from('users_access').select('*').order('name'),
      supabase.from('branches').select('id, name'),
      supabase.from('clients').select('*').order('name'),
      supabase.from('client_employees').select('*, clients(name)').order('name'),
    ]);
    if (colRes.data) setColaboradores(colRes.data);
    if (brRes.data) setBranches(brRes.data);
    if (clRes.data) setClients(clRes.data);
    if (ceRes.data) setClientEmployees(ceRes.data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchAll]);

  // ─── Toast ────────────────────────────────────────────────────────────────

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // ─── Toggle active ────────────────────────────────────────────────────────

  const toggleColaborador = async (reg: string, cur: boolean) => {
    if (reg === currentUser?.registration) return;
    await supabase.from('users_access').update({ active: !cur }).eq('registration', reg);
    setColaboradores(prev => prev.map(u => u.registration === reg ? { ...u, active: !cur } : u));
  };

  const toggleClient = async (id: string, cur: boolean) => {
    await supabase.from('clients').update({ active: !cur }).eq('id', id);
    setClients(prev => prev.map(c => c.id === id ? { ...c, active: !cur } : c));
  };

  const toggleClientEmployee = async (id: string, cur: boolean) => {
    await supabase.from('client_employees').update({ active: !cur }).eq('id', id);
    setClientEmployees(prev => prev.map(e => e.id === id ? { ...e, active: !cur } : e));
  };

  // ─── Save handlers ────────────────────────────────────────────────────────

  const saveColaborador = async (data: any) => {
    setSaving(true);
    try {
      if (editItem) {
        const { error } = await supabase.from('users_access').update({
          name: data.name, role: data.role, branch_id: data.branch_id
        }).eq('registration', editItem.registration);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('users_access').insert({
          name: data.name, registration: data.registration,
          role: data.role, branch_id: data.branch_id, active: true
        });
        if (error) throw error;
      }
      showToast('ok', editItem ? 'Colaborador atualizado!' : 'Colaborador cadastrado!');
      setModal(null); setEditItem(null); fetchAll();
    } catch (e: any) {
      showToast('err', e.message || 'Erro ao salvar.');
    } finally { setSaving(false); }
  };

  const saveClient = async (data: any) => {
    setSaving(true);
    try {
      if (editItem) {
        const { error } = await supabase.from('clients').update({
          name: data.name, document: data.document || null,
          contact_name: data.contact_name || null,
          contact_phone: data.contact_phone || null,
          contact_email: data.contact_email || null,
        }).eq('id', editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').insert({
          name: data.name, document: data.document || null,
          contact_name: data.contact_name || null,
          contact_phone: data.contact_phone || null,
          contact_email: data.contact_email || null,
          active: true
        });
        if (error) throw error;
      }
      showToast('ok', editItem ? 'Cliente atualizado!' : 'Cliente cadastrado!');
      setModal(null); setEditItem(null); fetchAll();
    } catch (e: any) {
      showToast('err', e.message || 'Erro ao salvar.');
    } finally { setSaving(false); }
  };

  const saveClientEmployee = async (data: any) => {
    setSaving(true);
    try {
      if (editItem) {
        const { error } = await supabase.from('client_employees').update({
          name: data.name, client_id: data.client_id,
          registration: data.registration || null,
          role: data.role || null, phone: data.phone || null,
        }).eq('id', editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('client_employees').insert({
          name: data.name, client_id: data.client_id,
          registration: data.registration || null,
          role: data.role || null, phone: data.phone || null,
          active: true
        });
        if (error) throw error;
      }
      showToast('ok', editItem ? 'Funcionário atualizado!' : 'Funcionário cadastrado!');
      setModal(null); setEditItem(null); fetchAll();
    } catch (e: any) {
      showToast('err', e.message || 'Erro ao salvar.');
    } finally { setSaving(false); }
  };

  // ─── Guard ────────────────────────────────────────────────────────────────

  if (currentUser?.role !== 'Administrador') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8">
        <Shield size={64} className="text-slate-200 mb-4" />
        <h2 className="text-xl font-black italic uppercase text-slate-800">Acesso Restrito</h2>
        <p className="text-slate-500 max-w-sm mt-2 font-medium">Apenas administradores podem gerenciar pessoas.</p>
      </div>
    );
  }

  // ─── Filtered lists ───────────────────────────────────────────────────────

  const q = searchTerm.toLowerCase();
  const filteredColaboradores = colaboradores.filter(u =>
    u.name.toLowerCase().includes(q) || u.registration.includes(q)
  );
  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(q) || (c.document || '').includes(q)
  );
  const filteredEmployees = clientEmployees.filter(e =>
    e.name.toLowerCase().includes(q) || (e.clients?.name || '').toLowerCase().includes(q)
  );

  const counts: Record<Tab, number> = {
    colaboradores: filteredColaboradores.length,
    clientes: filteredClients.length,
    funcionarios_cliente: filteredEmployees.length,
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-bold ${
              toast.type === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          >
            {toast.type === 'ok' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight italic uppercase">Gestão de Pessoas</h1>
          <p className="text-slate-500 text-sm font-medium italic opacity-75">Colaboradores, clientes e seus funcionários.</p>
        </div>
        <button
          onClick={() => {
            setEditItem(null);
            setModal(tab === 'colaboradores' ? 'colaborador' : tab === 'clientes' ? 'client' : 'client_employee');
          }}
          className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 transition-colors shadow-lg"
        >
          <Plus size={16} />
          {tab === 'colaboradores' ? 'Novo Colaborador' : tab === 'clientes' ? 'Novo Cliente' : 'Novo Funcionário'}
        </button>
      </header>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-md w-full">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, matrícula ou cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
          {([
            { key: 'colaboradores', label: 'Colaboradores', icon: Users },
            { key: 'clientes', label: 'Clientes', icon: Building2 },
            { key: 'funcionarios_cliente', label: 'Func. Cliente', icon: Briefcase },
          ] as { key: Tab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                tab === key ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon size={12} />
              {label}
              <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-black ${
                tab === key ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-400'
              }`}>{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-3xl p-6 border border-slate-100 animate-pulse h-44" />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* ── Colaboradores ── */}
            {tab === 'colaboradores' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredColaboradores.length === 0 ? <EmptyState /> : filteredColaboradores.map(u => (
                  <ColaboradorCard
                    key={u.registration}
                    u={u}
                    isSelf={u.registration === currentUser?.registration}
                    branchName={branches.find(b => b.id === u.branch_id)?.name || 'N/A'}
                    onToggle={() => toggleColaborador(u.registration, u.active)}
                    onEdit={() => { setEditItem(u); setModal('colaborador'); }}
                  />
                ))}
              </div>
            )}

            {/* ── Clientes ── */}
            {tab === 'clientes' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredClients.length === 0 ? <EmptyState /> : filteredClients.map(c => (
                  <ClientCard
                    key={c.id}
                    c={c}
                    onToggle={() => toggleClient(c.id, c.active)}
                    onEdit={() => { setEditItem(c); setModal('client'); }}
                  />
                ))}
              </div>
            )}

            {/* ── Funcionários Cliente ── */}
            {tab === 'funcionarios_cliente' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEmployees.length === 0 ? <EmptyState /> : filteredEmployees.map(e => (
                  <ClientEmployeeCard
                    key={e.id}
                    e={e}
                    onToggle={() => toggleClientEmployee(e.id, e.active)}
                    onEdit={() => { setEditItem(e); setModal('client_employee'); }}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Modals */}
      <AnimatePresence>
        {modal === 'colaborador' && (
          <ColaboradorModal
            edit={editItem}
            branches={branches}
            saving={saving}
            onClose={() => { setModal(null); setEditItem(null); }}
            onSave={saveColaborador}
          />
        )}
        {modal === 'client' && (
          <ClientModal
            edit={editItem}
            saving={saving}
            onClose={() => { setModal(null); setEditItem(null); }}
            onSave={saveClient}
          />
        )}
        {modal === 'client_employee' && (
          <ClientEmployeeModal
            edit={editItem}
            clients={clients.filter(c => c.active)}
            saving={saving}
            onClose={() => { setModal(null); setEditItem(null); }}
            onSave={saveClientEmployee}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Empty ─────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="col-span-full py-20 text-center text-slate-400 font-bold italic uppercase tracking-widest text-xs">
      Nenhum registro encontrado.
    </div>
  );
}

// ─── Cards ─────────────────────────────────────────────────────────────────────

function ColaboradorCard({ u, isSelf, branchName, onToggle, onEdit }: any) {
  return (
    <motion.div layout className={`bg-white rounded-[2rem] p-6 border transition-all relative overflow-hidden ${u.active ? 'border-slate-200 shadow-xl' : 'border-slate-100 opacity-60 grayscale'}`}>
      {!u.active && <span className="absolute top-4 right-4 bg-rose-100 text-rose-600 text-[8px] font-black uppercase px-2 py-1 rounded-full">Inativo</span>}
      <div className="flex items-start gap-4 mb-6">
        <div className="relative shrink-0">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 border-2 border-white shadow-lg">
            <Image src={u.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${u.name}`} alt={u.name} width={56} height={56} referrerPolicy="no-referrer" />
          </div>
          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-slate-800 italic uppercase leading-none truncate">{u.name}</h3>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">{u.role}</p>
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1 text-slate-500"><Hash size={10} /><span className="text-[9px] font-mono">{u.registration}</span></div>
            <div className="flex items-center gap-1 text-slate-500"><MapPin size={10} /><span className="text-[9px] font-bold uppercase truncate max-w-[80px]">{branchName}</span></div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-4 border-t border-slate-50">
        <button onClick={onEdit} className="px-3 py-3 rounded-xl bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
          <Pencil size={14} />
        </button>
        <button onClick={onToggle} disabled={isSelf} className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${u.active ? 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'} disabled:opacity-40 disabled:cursor-not-allowed`}>
          {u.active ? <><UserX size={14} /> Desativar</> : <><UserCheck size={14} /> Ativar</>}
        </button>
      </div>
    </motion.div>
  );
}

function ClientCard({ c, onToggle, onEdit }: any) {
  return (
    <motion.div layout className={`bg-white rounded-[2rem] p-6 border transition-all relative overflow-hidden ${c.active ? 'border-slate-200 shadow-xl' : 'border-slate-100 opacity-60 grayscale'}`}>
      {!c.active && <span className="absolute top-4 right-4 bg-rose-100 text-rose-600 text-[8px] font-black uppercase px-2 py-1 rounded-full">Inativo</span>}
      <div className="flex items-start gap-4 mb-5">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0 shadow-inner">
          <Building2 size={26} className="text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-slate-800 italic uppercase leading-none truncate">{c.name}</h3>
          {c.document && <p className="text-[9px] font-mono text-slate-400 mt-1">{c.document}</p>}
          {c.contact_name && (
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mt-2">Contato: {c.contact_name}</p>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {c.contact_phone && <div className="flex items-center gap-1 text-slate-400"><Phone size={9} /><span className="text-[9px]">{c.contact_phone}</span></div>}
            {c.contact_email && <div className="flex items-center gap-1 text-slate-400"><Mail size={9} /><span className="text-[9px] truncate max-w-[120px]">{c.contact_email}</span></div>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-4 border-t border-slate-50">
        <button onClick={onEdit} className="px-3 py-3 rounded-xl bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
          <Pencil size={14} />
        </button>
        <button onClick={onToggle} className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${c.active ? 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'}`}>
          {c.active ? <><UserX size={14} /> Desativar</> : <><UserCheck size={14} /> Ativar</>}
        </button>
      </div>
    </motion.div>
  );
}

function ClientEmployeeCard({ e, onToggle, onEdit }: any) {
  return (
    <motion.div layout className={`bg-white rounded-[2rem] p-6 border transition-all relative overflow-hidden ${e.active ? 'border-slate-200 shadow-xl' : 'border-slate-100 opacity-60 grayscale'}`}>
      {!e.active && <span className="absolute top-4 right-4 bg-rose-100 text-rose-600 text-[8px] font-black uppercase px-2 py-1 rounded-full">Inativo</span>}
      <div className="flex items-start gap-4 mb-5">
        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 border-2 border-white shadow-lg shrink-0">
          <Image src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${e.name}`} alt={e.name} width={56} height={56} referrerPolicy="no-referrer" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-slate-800 italic uppercase leading-none truncate">{e.name}</h3>
          {e.role && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">{e.role}</p>}
          <div className="mt-2 flex items-center gap-1 text-indigo-500">
            <Building2 size={9} />
            <span className="text-[9px] font-black uppercase truncate max-w-[140px]">{e.clients?.name || '—'}</span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            {e.registration && <div className="flex items-center gap-1 text-slate-400"><Hash size={9} /><span className="text-[9px] font-mono">{e.registration}</span></div>}
            {e.phone && <div className="flex items-center gap-1 text-slate-400"><Phone size={9} /><span className="text-[9px]">{e.phone}</span></div>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-4 border-t border-slate-50">
        <button onClick={onEdit} className="px-3 py-3 rounded-xl bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
          <Pencil size={14} />
        </button>
        <button onClick={onToggle} className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${e.active ? 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'}`}>
          {e.active ? <><UserX size={14} /> Desativar</> : <><UserCheck size={14} /> Ativar</>}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Modals ─────────────────────────────────────────────────────────────────────

function ModalShell({ title, icon: Icon, color, onClose, children }: any) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
              <Icon size={20} className="text-white" />
            </div>
            <h2 className="font-black text-slate-800 uppercase italic text-sm">{title}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">{children}</div>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-300 transition-colors";
const selectCls = inputCls + " appearance-none cursor-pointer";

function ColaboradorModal({ edit, branches, saving, onClose, onSave }: any) {
  const [form, setForm] = useState({
    name: edit?.name || '',
    registration: edit?.registration || '',
    role: edit?.role || 'Operador',
    branch_id: edit?.branch_id || (branches[0]?.id || ''),
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <ModalShell title={edit ? 'Editar Colaborador' : 'Novo Colaborador'} icon={UserPlus} color="bg-slate-800" onClose={onClose}>
      <Field label="Nome completo">
        <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: João da Silva" />
      </Field>
      {!edit && (
        <Field label="Matrícula">
          <input className={inputCls} value={form.registration} onChange={e => set('registration', e.target.value)} placeholder="Ex: #0123" />
        </Field>
      )}
      <Field label="Perfil de acesso">
        <div className="relative">
          <select className={selectCls} value={form.role} onChange={e => set('role', e.target.value)}>
            <option value="Operador">Operador</option>
            <option value="Administrador">Administrador</option>
          </select>
          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </Field>
      <Field label="Filial">
        <div className="relative">
          <select className={selectCls} value={form.branch_id} onChange={e => set('branch_id', e.target.value)}>
            {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </Field>
      <button
        onClick={() => onSave(form)}
        disabled={saving || !form.name || (!edit && !form.registration)}
        className="w-full bg-slate-900 text-white font-black uppercase tracking-widest py-4 rounded-2xl flex items-center justify-center gap-2 text-xs hover:bg-indigo-600 transition-colors disabled:opacity-50 mt-2"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        {saving ? 'Salvando...' : edit ? 'Salvar Alterações' : 'Cadastrar Colaborador'}
      </button>
    </ModalShell>
  );
}

function ClientModal({ edit, saving, onClose, onSave }: any) {
  const [form, setForm] = useState({
    name: edit?.name || '',
    document: edit?.document || '',
    contact_name: edit?.contact_name || '',
    contact_phone: edit?.contact_phone || '',
    contact_email: edit?.contact_email || '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <ModalShell title={edit ? 'Editar Cliente' : 'Novo Cliente'} icon={Building2} color="bg-indigo-600" onClose={onClose}>
      <Field label="Razão Social / Nome">
        <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Empresa ABC Ltda" />
      </Field>
      <Field label="CNPJ / CPF (opcional)">
        <input className={inputCls} value={form.document} onChange={e => set('document', e.target.value)} placeholder="Ex: 00.000.000/0001-00" />
      </Field>
      <Field label="Nome do contato (opcional)">
        <input className={inputCls} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Ex: Maria Souza" />
      </Field>
      <Field label="Telefone de contato (opcional)">
        <input className={inputCls} value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="Ex: (91) 99999-9999" />
      </Field>
      <Field label="E-mail de contato (opcional)">
        <input className={inputCls} value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="Ex: contato@empresa.com" />
      </Field>
      <button
        onClick={() => onSave(form)}
        disabled={saving || !form.name}
        className="w-full bg-indigo-600 text-white font-black uppercase tracking-widest py-4 rounded-2xl flex items-center justify-center gap-2 text-xs hover:bg-indigo-700 transition-colors disabled:opacity-50 mt-2"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        {saving ? 'Salvando...' : edit ? 'Salvar Alterações' : 'Cadastrar Cliente'}
      </button>
    </ModalShell>
  );
}

function ClientEmployeeModal({ edit, clients, saving, onClose, onSave }: any) {
  const [form, setForm] = useState({
    name: edit?.name || '',
    client_id: edit?.client_id || (clients[0]?.id || ''),
    registration: edit?.registration || '',
    role: edit?.role || '',
    phone: edit?.phone || '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <ModalShell title={edit ? 'Editar Funcionário' : 'Novo Funcionário de Cliente'} icon={Briefcase} color="bg-amber-500" onClose={onClose}>
      <Field label="Nome completo">
        <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Carlos Pereira" />
      </Field>
      <Field label="Cliente">
        <div className="relative">
          <select className={selectCls} value={form.client_id} onChange={e => set('client_id', e.target.value)}>
            {clients.length === 0
              ? <option value="">Nenhum cliente ativo</option>
              : clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)
            }
          </select>
          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </Field>
      <Field label="Matrícula / Crachá (opcional)">
        <input className={inputCls} value={form.registration} onChange={e => set('registration', e.target.value)} placeholder="Ex: CLI-001" />
      </Field>
      <Field label="Cargo / Função (opcional)">
        <input className={inputCls} value={form.role} onChange={e => set('role', e.target.value)} placeholder="Ex: Operador de Máquinas" />
      </Field>
      <Field label="Telefone (opcional)">
        <input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Ex: (91) 98888-7777" />
      </Field>
      <button
        onClick={() => onSave(form)}
        disabled={saving || !form.name || !form.client_id}
        className="w-full bg-amber-500 text-white font-black uppercase tracking-widest py-4 rounded-2xl flex items-center justify-center gap-2 text-xs hover:bg-amber-600 transition-colors disabled:opacity-50 mt-2"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        {saving ? 'Salvando...' : edit ? 'Salvar Alterações' : 'Cadastrar Funcionário'}
      </button>
    </ModalShell>
  );
}
