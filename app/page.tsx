'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { motion } from 'motion/react';
import { FileText, LogIn, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [matricula, setMatricula] = useState('');
  const [isError, setIsError] = useState(false);
  const { login, user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  if (isLoading || user) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsError(false);
    const registration = matricula.trim();
    if (registration.length < 4 || !(await login(registration))) {
      setIsError(true);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.22),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.14),transparent_38%)]" />
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl"
      >
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20">
            <FileText size={28} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] font-black text-blue-600">Backoffice</p>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Controle de NFs</h1>
          </div>
        </div>

        <p className="text-sm text-slate-500 mb-7">
          Acesso administrativo para notas fiscais, estoque, ferramentas, cautelas e auditoria.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="matricula" className="block text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">
              Matrícula
            </label>
            <input
              id="matricula"
              value={matricula}
              onChange={(event) => {
                setMatricula(event.target.value);
                setIsError(false);
              }}
              autoComplete="username"
              className={`w-full rounded-2xl border-2 bg-slate-50 px-5 py-4 text-center text-xl font-mono tracking-widest outline-none transition ${isError ? 'border-rose-400 ring-4 ring-rose-100' : 'border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'}`}
              placeholder="000000"
            />
            {isError && (
              <p className="mt-2 text-center text-[10px] uppercase tracking-widest font-black text-rose-600">
                Matrícula inválida ou sem acesso ao backoffice
              </p>
            )}
          </div>

          <button className="w-full rounded-2xl bg-blue-600 hover:bg-blue-500 text-white py-4 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition active:scale-[0.98]">
            <LogIn size={18} /> Entrar no controle
          </button>
        </form>

        <div className="mt-7 pt-5 border-t border-slate-100 flex items-center justify-center gap-2 text-[9px] uppercase tracking-widest font-black text-slate-400">
          <ShieldCheck size={14} className="text-emerald-500" /> Ambiente administrativo
        </div>
      </motion.section>
    </main>
  );
}
