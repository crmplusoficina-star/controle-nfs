'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const RETURN_TO_KEY = 'controle_nfs_return_to';

export function DeepLinkReturnManager() {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    const isDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
    if (!isLoading && user && isDashboard) {
      window.sessionStorage.removeItem(RETURN_TO_KEY);
    }
  }, [isLoading, pathname, user]);

  return null;
}
