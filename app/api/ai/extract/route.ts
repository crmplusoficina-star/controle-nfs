import { NextRequest, NextResponse } from 'next/server';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'qwen/qwen3.6-27b';
const MAX_ATTEMPTS = 3;
const MAX_TEXT_CHARS = 50_000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const extractionSchemaPrompt = `
Extraia os dados da nota fiscal e responda com EXATAMENTE um objeto JSON.
Não escreva raciocínio, markdown, comentários ou texto fora do JSON.
Todas as chaves abaixo são obrigatórias. Quando um dado não existir, use null. Em items, use [] quando não houver itens.

Formato obrigatório:
{
  "supplierName": string | null,
  "date": string | null,
  "amount": number | null,
  "invoiceNumber": string | null,
  "paymentDate": string | null,
  "isTool": boolean,
  "toolName": string | null,
  "quantity": number | null,
  "items": [
    { "name": string, "quantity": number, "amount": number | null }
  ]
}

Regras:
- date e paymentDate no formato YYYY-MM-DD.
- invoiceNumber somente com os números relevantes da NF, sem pontuação.
- amount é o valor total da nota.
- isTool deve ser true somente para ferramentas, máquinas ou equipamentos duráveis.
- items deve conter os produtos encontrados, sem inventar dados.
- Valores monetários devem ser números decimais, sem R$ e sem separador de milhar.
`;

function parseRetryAfter(headers: Headers, message: string): number {
  const headerValue = headers.get('retry-after');
  if (headerValue) {
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds)) return Math.ceil(seconds * 1000);
  }

  const match = message.match(/try again in\s+([\d.]+)s/i);
  if (match) return Math.ceil(Number(match[1]) * 1000);

  return 5_000;
}

function extractJsonCandidate(value: unknown): unknown {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  const cleaned = value
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const candidate = start >= 0 && end > start
    ? cleaned.slice(start, end + 1)
    : cleaned;

  const attempts = [
    candidate,
    candidate.replace(/,\s*([}\]])/g, '$1'),
  ];

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // Try the next lightweight repair.
    }
  }

  return null;
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim() || null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const raw = String(value).replace(/R\$/gi, '').trim();
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/,/g, '');
  const parsed = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeExtraction(value: unknown) {
  const source = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};

  const itemsSource = Array.isArray(source.items) ? source.items : [];
  const items = itemsSource
    .map(item => {
      const row = item && typeof item === 'object'
        ? item as Record<string, unknown>
        : {};
      const name = toNullableString(row.name ?? row.description ?? row.descricao);
      if (!name) return null;

      return {
        name,
        quantity: toNullableNumber(row.quantity ?? row.quantidade) ?? 1,
        amount: toNullableNumber(row.amount ?? row.valor ?? row.total),
      };
    })
    .filter(Boolean);

  const quantity = toNullableNumber(source.quantity ?? source.quantidade)
    ?? (items[0] ? items[0].quantity : null);

  return {
    supplierName: toNullableString(source.supplierName ?? source.supplier ?? source.emitente ?? source.razaoSocial),
    date: toNullableString(source.date ?? source.issueDate ?? source.dataEmissao),
    amount: toNullableNumber(source.amount ?? source.totalAmount ?? source.valorTotal),
    invoiceNumber: toNullableString(source.invoiceNumber ?? source.number ?? source.numeroNF),
    paymentDate: toNullableString(source.paymentDate ?? source.dueDate ?? source.vencimento),
    isTool: Boolean(source.isTool ?? source.is_tool ?? false),
    toolName: toNullableString(source.toolName ?? source.productName ?? source.produtoPrincipal),
    quantity,
    items,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { text, image, prompt } = await req.json();
    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY não configurada' },
        { status: 500 }
      );
    }

    const safeText = typeof text === 'string'
      ? text.slice(0, MAX_TEXT_CHARS)
      : '';

    const instructions = `${extractionSchemaPrompt}\n${typeof prompt === 'string' ? prompt : ''}`;
    const userContent: Array<Record<string, unknown>> = [
      { type: 'text', text: instructions },
    ];

    if (safeText) {
      userContent.push({
        type: 'text',
        text: `TEXTO EXTRAÍDO DA NOTA:\n${safeText}`,
      });
    }

    if (typeof image === 'string' && image) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: image.startsWith('data:')
            ? image
            : `data:image/jpeg;base64,${image}`,
        },
      });
    }

    let lastStatus = 500;
    let lastMessage = 'Não foi possível processar a nota fiscal.';

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const useJsonMode = attempt < 2;
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          reasoning_effort: 'none',
          max_completion_tokens: 2048,
          ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            {
              role: 'system',
              content: 'Você é um extrator de notas fiscais. Entregue somente o objeto JSON final e nunca exponha raciocínio.',
            },
            {
              role: 'user',
              content: userContent,
            },
          ],
        }),
      });

      const data = await response.json().catch(() => ({}));
      const errorMessage = data?.error?.message || `Erro Groq (${response.status})`;
      const failedGeneration = data?.error?.failed_generation;

      if (failedGeneration) {
        const recovered = extractJsonCandidate(failedGeneration);
        if (recovered) {
          return NextResponse.json(normalizeExtraction(recovered));
        }
      }

      if (response.ok) {
        const responseText = data?.choices?.[0]?.message?.content ?? '{}';
        const parsed = extractJsonCandidate(responseText);

        if (parsed) {
          return NextResponse.json(normalizeExtraction(parsed));
        }

        lastStatus = 502;
        lastMessage = 'O AXEL retornou uma resposta incompleta. A leitura será tentada novamente.';
      } else {
        lastStatus = response.status;
        lastMessage = errorMessage;

        const retryable = response.status === 429
          || response.status >= 500
          || /json|validate|failed_generation/i.test(errorMessage);

        if (!retryable || attempt === MAX_ATTEMPTS - 1) break;

        const waitMs = response.status === 429
          ? parseRetryAfter(response.headers, errorMessage) + 500
          : 700 * (attempt + 1);
        await sleep(waitMs);
        continue;
      }

      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(600 * (attempt + 1));
      }
    }

    console.error('Groq extraction failed:', { status: lastStatus, message: lastMessage });

    return NextResponse.json(
      {
        error: lastStatus === 429 ? 'Limite temporário do AXEL atingido' : 'Erro na leitura da nota',
        details: lastStatus === 429
          ? 'O limite temporário do Groq foi atingido. Aguarde alguns segundos e tente novamente.'
          : lastMessage,
      },
      { status: lastStatus === 429 ? 429 : 502 }
    );
  } catch (error: any) {
    console.error('AI Extraction Error:', error);

    return NextResponse.json(
      {
        error: 'AI processing failed',
        details: error?.message || 'Erro inesperado na extração.',
      },
      { status: 500 }
    );
  }
}
