'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { exportAuditReceiptPDF } from '@/lib/audit-receipt-pdf';

const FERRAMENTARIA_ORIGIN =
  process.env.NEXT_PUBLIC_FERRAMENTARIA_URL ||
  'https://ferramentaria-gamma.vercel.app';

function resolveAvatarUrl(value?: string | null) {
  if (!value) return null;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  return `${FERRAMENTARIA_ORIGIN.replace(/\/$/, '')}/${value.replace(/^\//, '')}`;
}

async function fetchAudit(auditId: string) {
  const { data: auditData, error: auditError } = await supabase
    .from('cautelia_audits')
    .select(
      '*, cautelia_audit_items(*, cautelia_standard_tools(*), tools:stock_tool_id(id, name, code, image_url, image_urls))',
    )
    .eq('id', auditId)
    .maybeSingle();

  if (auditError) throw auditError;
  if (!auditData) throw new Error('Comprovante não encontrado.');

  if (auditData.user_id) {
    const { data: userData } = await supabase
      .from('users_access')
      .select('name, registration, avatar_url')
      .eq('registration', String(auditData.user_id).trim())
      .maybeSingle();

    if (userData) auditData.users_access = userData;
  }

  return auditData;
}

export function ExternalSignatureFixes() {
  const pathname = usePathname();

  useEffect(() => {
    const match = pathname.match(/^\/assinatura\/([^/]+)/);
    if (!match) return;

    const auditId = match[1];
    let disposed = false;
    let auditCache: any = null;

    const patchAvatar = () => {
      const avatarUrl = resolveAvatarUrl(auditCache?.users_access?.avatar_url);
      if (!avatarUrl) return;

      const avatar = document.querySelector<HTMLImageElement>('img[alt="User"]');
      if (!avatar) return;

      avatar.removeAttribute('srcset');
      avatar.src = avatarUrl;
      avatar.style.objectFit = 'cover';
    };

    const pdfHandler = async (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();

      const button = event.currentTarget as HTMLButtonElement;
      const previousText = button.textContent;
      button.disabled = true;
      button.textContent = 'GERANDO COMPROVANTE...';

      try {
        const currentAudit = await fetchAudit(auditId);
        const safeName = String(currentAudit.users_access?.name || 'assinatura')
          .trim()
          .replace(/\s+/g, '_')
          .replace(/[^a-zA-Z0-9_À-ÿ-]/g, '');
        await exportAuditReceiptPDF(
          currentAudit,
          `Comprovante_${safeName || 'assinatura'}.pdf`,
        );
      } catch (error) {
        console.error('Falha ao gerar comprovante assinado:', error);
        window.alert('Não foi possível gerar o comprovante. Tente novamente.');
      } finally {
        button.disabled = false;
        button.textContent = previousText || 'Gerar Comprovante (PDF)';
      }
    };

    const patchPdfButton = () => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (candidate) => candidate.textContent?.toLowerCase().includes('gerar comprovante'),
      );
      if (!button || button.dataset.receiptFix === 'true') return;
      button.dataset.receiptFix = 'true';
      button.addEventListener('click', pdfHandler, true);
    };

    const patchPage = () => {
      if (disposed) return;
      patchAvatar();
      patchPdfButton();
    };

    void fetchAudit(auditId)
      .then((audit) => {
        auditCache = audit;
        patchPage();
      })
      .catch((error) => console.error('Falha ao sincronizar comprovante externo:', error));

    const observer = new MutationObserver(patchPage);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
      const button = document.querySelector<HTMLButtonElement>('button[data-receipt-fix="true"]');
      button?.removeEventListener('click', pdfHandler, true);
    };
  }, [pathname]);

  return null;
}
