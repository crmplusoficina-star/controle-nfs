import type { ReactNode } from 'react';
import { HandoverHistoryPanel } from '@/components/handover-history-panel';

export default function HistoricoLayout({ children }: { children: ReactNode }) {
  return <>
    <HandoverHistoryPanel />
    {children}
  </>;
}
