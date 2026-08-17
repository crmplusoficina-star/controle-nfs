'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';

export default function InventoryAdjustmentsLayout({ children }: { children: ReactNode }) {
  const [nearBottom, setNearBottom] = useState(false);

  useEffect(() => {
    const updatePosition = () => {
      const viewportBottom = window.scrollY + window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      setNearBottom(viewportBottom >= documentHeight - 160);
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, []);

  const handleScroll = () => {
    if (nearBottom) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    window.scrollBy({
      top: Math.max(420, window.innerHeight * 0.78),
      behavior: 'smooth',
    });
  };

  return (
    <>
      {children}
      <button
        type="button"
        onClick={handleScroll}
        className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-2xl transition hover:bg-indigo-600 active:scale-95 md:bottom-7 md:right-7"
        aria-label={nearBottom ? 'Voltar ao topo da página' : 'Rolar a página para baixo'}
        title={nearBottom ? 'Voltar ao topo' : 'Rolar para baixo'}
      >
        {nearBottom ? <ArrowUp size={17} /> : <ArrowDown size={17} />}
        <span>{nearBottom ? 'Topo' : 'Rolar'}</span>
      </button>
    </>
  );
}
