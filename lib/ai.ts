export interface ExtractionResult {
  supplierName: string | null;
  date: string | null;
  amount: number | null;
  invoiceNumber: string | null;
  paymentDate: string | null;
  isTool: boolean;
  toolName: string | null;
  quantity: number | null;
  items: Array<{ name: string; quantity: number; amount?: number }> | null;
}

interface ExtractParams {
  text?: string;
  image?: string;
}

export async function extractInvoiceData({ text, image }: ExtractParams): Promise<ExtractionResult | null> {
  try {
    const response = await fetch('/api/ai/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        image,
        prompt: `
          Analise esta Nota Fiscal e extraia os seguintes dados em formato JSON estrito:
          - supplierName: Nome da empresa emitente (razão social)
          - date: Data de emissão (formato YYYY-MM-DD)
          - amount: Valor total da nota (extrair como número decimal, ex: 1250.50)
          - invoiceNumber: Número da NF (apenas números)
          - paymentDate: Data programada de pagamento ou vencimento de boleto (YYYY-MM-DD)
          - isTool: Boolean (true se a nota contiver ferramentas, máquinas ou equipamentos duráveis)
          - toolName: Descrição completa do produto principal encontrado (String). Use o nome do produto no campo de descrição da NF.
          - items: Lista detalhada de TODOS os produtos encontrados no formato [{"name": string, "quantity": number, "amount": number}]

          Observação sobre 'toolName': Se houver ferramentas, identifique o nome técnico/comercial exato na nota.
          Observação sobre 'amount' e 'items[].amount': Remova símbolos de moeda (R$) e converta vírgula decimal para ponto.
          Retorne APENAS o JSON válido, sem explicações.
        `
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || errorData.error || 'Falha na extração');
    }

    const data = await response.json();
    return data as ExtractionResult;
  } catch (error) {
    console.error("Error extracting invoice data with API:", error);
    return null;
  }
}
