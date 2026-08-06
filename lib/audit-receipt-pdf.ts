import { jsPDF } from 'jspdf';

type AuditItem = {
  status?: string | null;
  quantity?: number | null;
  cautelia_standard_tools?: { name?: string | null } | null;
  tools?: {
    name?: string | null;
    code?: string | null;
  } | null;
};

type AuditReceipt = {
  id?: string | null;
  user_id?: string | null;
  type?: string | null;
  check_date?: string | null;
  created_at?: string | null;
  obs?: string | null;
  signature_url?: string | null;
  tool_photo_url?: string | null;
  users_access?: {
    name?: string | null;
    registration?: string | null;
  } | null;
  cautelia_audit_items?: AuditItem[] | null;
};

const TYPE_LABELS: Record<string, string> = {
  caution: 'Cautela',
  loan: 'Empréstimo',
  borrow: 'Empréstimo',
  return: 'Devolução',
};

function formatDate(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusLabel(value?: string | null) {
  if (value === 'missing') return 'Ausente';
  if (value === 'damaged') return 'Avariado';
  return 'OK';
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem.'));
    reader.readAsDataURL(blob);
  });
}

async function loadRemoteImage(url?: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;

  try {
    const response = await fetch(
      `/api/download?url=${encodeURIComponent(url)}&filename=comprovante-imagem`,
      { cache: 'no-store' },
    );
    if (!response.ok) return null;
    return await blobToDataUrl(await response.blob());
  } catch {
    return null;
  }
}

export async function exportAuditReceiptPDF(
  audit: AuditReceipt,
  fileName = 'comprovante.pdf',
) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (required: number) => {
    if (y + required <= pageHeight - 16) return;
    pdf.addPage();
    y = 18;
  };

  const type = TYPE_LABELS[String(audit.type || '').toLowerCase()] || 'Movimentação';
  const collaborator = audit.users_access?.name || 'Colaborador não identificado';
  const registration = audit.users_access?.registration || audit.user_id || '-';
  const protocol = String(audit.id || '').slice(0, 8).toUpperCase() || '-';

  pdf.setFillColor(15, 23, 42);
  pdf.roundedRect(margin, y, contentWidth, 30, 4, 4, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('TRACBEL', margin + 8, y + 12);
  pdf.setFillColor(250, 204, 21);
  pdf.rect(margin + 38, y + 6, 5, 5, 'F');
  pdf.setFontSize(10);
  pdf.text('COMPROVANTE DIGITAL', margin + 8, y + 22);
  pdf.setFontSize(9);
  pdf.text(type.toUpperCase(), pageWidth - margin - 8, y + 12, { align: 'right' });
  pdf.text(`#${protocol}`, pageWidth - margin - 8, y + 22, { align: 'right' });
  y += 40;

  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('RESPONSÁVEL', margin, y);
  pdf.text('DATA E HORA', margin + contentWidth / 2, y);
  y += 6;
  pdf.setFontSize(13);
  pdf.text(collaborator.toUpperCase(), margin, y, { maxWidth: contentWidth / 2 - 5 });
  pdf.text(formatDate(audit.check_date || audit.created_at), margin + contentWidth / 2, y);
  y += 7;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Matrícula: ${registration}`, margin, y);
  pdf.text(`Tipo: ${type}`, margin + contentWidth / 2, y);
  y += 10;

  pdf.setDrawColor(226, 232, 240);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 9;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('ITENS RELACIONADOS', margin, y);
  y += 7;

  const items = audit.cautelia_audit_items || [];
  if (!items.length) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text('Nenhum item relacionado.', margin, y);
    y += 8;
  } else {
    items.forEach((item, index) => {
      ensureSpace(14);
      const name = item.cautelia_standard_tools?.name || item.tools?.name || 'Ferramenta';
      const code = item.tools?.code || '-';
      const quantity = item.quantity || 1;
      const lines = pdf.splitTextToSize(`${index + 1}. ${name}`, contentWidth - 52);
      const rowHeight = Math.max(12, lines.length * 4.5 + 4);

      pdf.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 252 : 255);
      pdf.roundedRect(margin, y - 4, contentWidth, rowHeight, 2, 2, 'F');
      pdf.setTextColor(15, 23, 42);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(lines, margin + 4, y + 1);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(`Cód: ${code}`, margin + contentWidth - 48, y + 1);
      pdf.text(`Qtd: ${quantity}`, margin + contentWidth - 27, y + 1);
      pdf.text(statusLabel(item.status), margin + contentWidth - 4, y + 1, { align: 'right' });
      y += rowHeight + 2;
    });
  }

  ensureSpace(42);
  y += 3;
  pdf.setFillColor(248, 250, 252);
  const term = 'Pelo presente termo, declaro que recebi os equipamentos e ferramentas acima relacionados em perfeitas condições de conservação e funcionamento. Assumo total responsabilidade pela guarda, zelo e uso exclusivo em atividades profissionais da empresa. Comprometo-me a comunicar imediatamente qualquer ocorrência, dano ou extravio, sob pena de responsabilidade administrativa e civil.';
  const termLines = pdf.splitTextToSize(term, contentWidth - 10);
  const termHeight = termLines.length * 4.2 + 16;
  pdf.roundedRect(margin, y, contentWidth, termHeight, 3, 3, 'F');
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('TERMO DE RESPONSABILIDADE', margin + 5, y + 7);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.text(termLines, margin + 5, y + 14);
  y += termHeight + 7;

  if (audit.obs) {
    const obsLines = pdf.splitTextToSize(`Observação: ${audit.obs}`, contentWidth);
    ensureSpace(obsLines.length * 4.5 + 6);
    pdf.setFontSize(8.5);
    pdf.text(obsLines, margin, y);
    y += obsLines.length * 4.5 + 5;
  }

  const [toolPhoto, signature] = await Promise.all([
    loadRemoteImage(audit.tool_photo_url),
    loadRemoteImage(audit.signature_url),
  ]);

  if (toolPhoto) {
    ensureSpace(67);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('REGISTRO FOTOGRÁFICO', margin, y);
    y += 5;
    try {
      pdf.addImage(toolPhoto, imageFormat(toolPhoto), margin, y, contentWidth, 55, undefined, 'FAST');
      y += 61;
    } catch {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text('A foto registrada não pôde ser incorporada ao PDF.', margin, y + 5);
      y += 12;
    }
  }

  ensureSpace(40);
  pdf.setDrawColor(15, 23, 42);
  pdf.line(margin + 35, y + 28, pageWidth - margin - 35, y + 28);
  if (signature) {
    try {
      pdf.addImage(signature, imageFormat(signature), margin + 48, y, contentWidth - 96, 25, undefined, 'FAST');
    } catch {
      // A linha de assinatura ainda será exibida.
    }
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text(collaborator.toUpperCase(), pageWidth / 2, y + 34, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.text('Assinatura certificada digitalmente', pageWidth / 2, y + 39, { align: 'center' });

  const blob = pdf.output('blob');
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
}
