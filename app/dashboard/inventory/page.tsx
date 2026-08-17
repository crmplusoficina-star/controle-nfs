import PhotoInventoryRapid from '@/components/inventory/PhotoInventoryRapid';

export default function InventoryPage() {
  return (
    <>
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-5 flex justify-end">
        <a href="/dashboard/inventory/adjustments" className="px-4 py-3 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] transition-colors">
          Ver ferramentas / ajustes manuais
        </a>
      </div>
      <PhotoInventoryRapid />
    </>
  );
}
