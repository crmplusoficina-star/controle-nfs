import type { ReactNode } from 'react';
import { CauteliaToolboxSeparation } from '@/components/cautelia-toolbox-separation';

export default function CauteliaLayout({ children }: { children: ReactNode }) {
  return <>
    <CauteliaToolboxSeparation />
    {children}
  </>;
}
