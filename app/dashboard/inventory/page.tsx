import PhotoInventoryRapid from '@/components/inventory/PhotoInventoryRapid';

export default function InventoryPage() {
  return (
    <>
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-5 flex flex-col sm:flex-row justify-end gap-2">
        <a href="/dashboard/inventory/manual" title="Cadastro manual rápido sem esperar a fila da IA" className="px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-black uppercase tracking-widest text-[10px] transition-colors text-center">
          + Manual em massa • sem IA
        </a>
        <a href="/dashboard/inventory/adjustments" className="px-4 py-3 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] transition-colors text-center">
          Ver ferramentas / ajustes manuais
        </a>
      </div>
      <PhotoInventoryRapid />
    </>
  );
}
