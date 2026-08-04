import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4">
      <h1 className="text-4xl font-bold text-slate-800 mb-4">404 - Página Não Encontrada</h1>
      <p className="text-slate-600 mb-8">A página que você está procurando não existe.</p>
      <Link 
        href="/"
        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
      >
        Voltar para o Início
      </Link>
    </div>
  );
}
