export interface ExtractionResult {
  supplierName: string | null;
  date: string | null;
  amount: number | null;
  invoiceNumber: string | null;
  paymentDate: string | null;
  isTool: boolean;
  toolName: string | null;
  quantity: number | null;
  items: Array<{ name: string; quantity: number; amount?: number | null }> | null;
}

interface ExtractParams {
  text?: string;
  image?: string;
}

export async function extractInvoiceData({ text, image }: ExtractParams): Promise<ExtractionResult> {
  const response = await fetch('/api/ai/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      image,
      prompt: `
        Leia somente os dados existentes na Nota Fiscal.
        Use null para campos ausentes e [] quando não houver itens.
        Não invente fornecedor, número, datas, valores ou produtos.
      `,
    }),
  });

  const rawBody = await response.text();
  let data: any = {};

  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message = data?.details
      || data?.error
      || `Falha na extração (HTTP ${response.status})`;
    throw new Error(message);
  }

  return data as ExtractionResult;
}
