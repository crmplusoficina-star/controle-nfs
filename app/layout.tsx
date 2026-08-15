import type {Metadata} from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ExternalSignatureFixes } from '@/components/external-signature-fixes';
import { DeepLinkReturnManager } from '@/components/DeepLinkReturnManager';
import { Inter, Space_Grotesk } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Controle de NFs',
  description: 'Backoffice administrativo de notas fiscais, estoque, ferramentas, cautelas e auditoria.',
};

const preserveDeepLinkScript = `
(function () {
  try {
    var path = window.location.pathname || '';
    var isDashboard = path === '/dashboard' || path.indexOf('/dashboard/') === 0;
    if (isDashboard) {
      window.sessionStorage.setItem(
        'controle_nfs_return_to',
        path + window.location.search + window.location.hash
      );
    }
  } catch (_) {}
})();
`;

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased bg-slate-100 text-slate-800 font-sans">
        <script dangerouslySetInnerHTML={{ __html: preserveDeepLinkScript }} />
        <AuthProvider>
          <DeepLinkReturnManager />
          <ExternalSignatureFixes />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
