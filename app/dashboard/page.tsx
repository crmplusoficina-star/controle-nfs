'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useAuth } from '@/lib/auth-context';
import {
  BarChart3,
  FileText,
  History,
  Package,
  Settings2,
  ShieldCheck,
  Signature,
  Users,
} from 'lucide-react';

const modules = [
  { title: 'Notas fiscais', description: 'Lançamentos, documentos, RC, pedido e pagamento.', href: '/dashboard/nfs', icon: FileText },
  { title: 'Estoque e ferramentas', description: 'Cadastro, quantidades, entradas e ajustes.', href: '/dashboard/stock', icon: Package },
  { title: 'Cautelas e devoluções', description: 'Responsabilidades, empréstimos e retornos.', href: '/dashboard/cautelia', icon: ShieldCheck },
  { title: 'Inventários', description: 'Conferências físicas e divergências de estoque.', href: '/dashboard/inventory', icon: BarChart3 },
  { title: 'Pessoas e usuários', description: 'Colaboradores, perfis, filiais e acessos.', href: '/dashboard/pessoas', icon: Users },
  { title: 'Assinaturas', description: 'Documentos e confirmações assinadas.', href: '/dashboard/signatures', icon: Signature },
  { title: 'Auditoria', description: 'Rastreamento das ações e movimentações.', href: '/dashboard/audit', icon: History },
  { title: 'Configuração de acessos', description: 'Perfis administrativos e operacionais.', href: '/dashboard/users', icon: Settings2 },
];

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <header className="rounded-[2rem] bg-slate-950 text-white p-8 lg:p-10 overflow-hidden relative">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.28em] font-black text-blue-400">Controle central</p>
          <h1 className="mt-3 text-3xl lg:text-4xl font-black tracking-tight">Olá, {user?.name?.split(' ')[0] || 'responsável'}.</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">
            Todo o cadastro, estoque, histórico e auditoria permanecem neste aplicativo. A Ferramentaria apenas consome e registra ações autorizadas nesta mesma base.
          </p>
        </div>
      </header>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Módulos administrativos</h2>
            <p className="text-sm text-slate-500">Escolha uma área para continuar.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {modules.map((module, index) => (
            <Link key={module.href} href={module.href}>
              <motion.article
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                whileHover={{ y: -4 }}
                className="h-full min-h-48 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-xl transition-shadow"
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
                  <module.icon size={24} />
                </div>
                <h3 className="font-black text-slate-900">{module.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">{module.description}</p>
              </motion.article>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
