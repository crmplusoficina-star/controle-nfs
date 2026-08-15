import { NextRequest, NextResponse } from 'next/server';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'qwen/qwen3.6-27b';
const MAX_IMAGES = 5;
const MAX_CATALOG_ITEMS = 200;
const MAX_ATTEMPTS = 2;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type CatalogItem = {
  name: string;
  code: string;
  brand?: string | null;
};

type InventoryItem = {
  name: string;
  code: string | null;
  brand: string | null;
  quantity: number | null;
  location: string | null;
  confidence: number;
  catalogCode: string | null;
};

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJson(value: unknown): unknown {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  const cleaned = value
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  for (const attempt of [candidate, candidate.replace(/,\s*([}\]])/g, '$1')]) {
    try {
      return JSON.parse(attempt);
    } catch {
      // tenta a correção seguinte
    }
  }
  return null;
}

function normalizeItems(value: unknown): InventoryItem[] {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const source = Array.isArray(root.items) ? root.items : [];

  return source
    .map(raw => {
      const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const name = text(item.name ?? item.toolName ?? item.ferramenta);
      if (!name) return null;

      const confidenceRaw = numberValue(item.confidence ?? item.confianca) ?? 0.5;
      return {
        name,
        code: text(item.code ?? item.codigo),
        brand: text(item.brand ?? item.marca),
        quantity: numberValue(item.quantity ?? item.quantidade),
        location: text(item.location ?? item.locacao ?? item.localizacao),
        confidence: Math.max(0, Math.min(1, confidenceRaw)),
        catalogCode: text(item.catalogCode ?? item.catalog_code ?? item.codigoCatalogo),
      } satisfies InventoryItem;
    })
    .filter((item): item is InventoryItem => item !== null);
}

function rateLimitFrom(headers: Headers) {
  return {
    remainingRequests: headers.get('x-ratelimit-remaining-requests'),
    resetRequests: headers.get('x-ratelimit-reset-requests'),
    remainingTokens: headers.get('x-ratelimit-remaining-tokens'),
    resetTokens: headers.get('x-ratelimit-reset-tokens'),
    retryAfter: headers.get('retry-after'),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const images = Array.isArray(body?.images)
      ? body.images.filter((value: unknown) => typeof value === 'string' && value).slice(0, MAX_IMAGES)
      : [];
    const locationHint = text(body?.locationHint);
    const catalog = (Array.isArray(body?.catalog) ? body.catalog : [])
      .slice(0, MAX_CATALOG_ITEMS)
      .map((raw: unknown) => {
        const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
        return {
          name: text(item.name) || '',
          code: text(item.code) || '',
          brand: text(item.brand),
        } satisfies CatalogItem;
      })
      .filter((item: CatalogItem) => item.name && item.code);

    if (images.length === 0) {
      return NextResponse.json({ error: 'Envie pelo menos uma foto.' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_VISION_MODEL || process.env.GROQ_MODEL || DEFAULT_MODEL;
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY não configurada.' }, { status: 500 });
    }

    const catalogText = catalog.length > 0
      ? catalog.map(item => `- ${item.name} | código: ${item.code}${item.brand ? ` | marca: ${item.brand}` : ''}`).join('\n')
      : 'Nenhum item existente foi fornecido.';

    const prompt = `
Analise as fotos de uma ferramentaria e identifique APENAS ferramentas, instrumentos, máquinas ou equipamentos duráveis visíveis.
Responda com EXATAMENTE um objeto JSON, sem markdown e sem raciocínio exposto.

Formato obrigatório:
{
  "items": [
    {
      "name": "nome objetivo da ferramenta",
      "code": "código ou referência visível na própria ferramenta, ou null",
      "brand": "marca visível, ou null",
      "quantity": 1,
      "location": ${locationHint ? JSON.stringify(locationHint) : 'null'},
      "confidence": 0.0,
      "catalogCode": "código do catálogo existente quando houver correspondência segura, ou null"
    }
  ]
}

Regras:
- Não invente código, marca ou modelo.
- Conte unidades visíveis quando for possível; se não for possível, use null.
- Se a mesma ferramenta aparecer em fotos diferentes, devolva apenas uma entrada para ela.
- Se houver correspondência segura com o catálogo existente abaixo, use EXATAMENTE o nome e o código do catálogo e preencha catalogCode.
- Se houver mais de um item do catálogo com nome semelhante e não der para distinguir, não force correspondência.
- Ignore caixas, prateleiras, móveis, EPIs e consumíveis, a menos que sejam claramente parte de um equipamento inventariável.
- confidence deve ficar entre 0 e 1.

CATÁLOGO EXISTENTE EM OUTRAS FILIAIS E NA FILIAL ATUAL:
${catalogText}
`;

    const userContent: Array<Record<string, unknown>> = [
      { type: 'text', text: prompt },
      ...images.map((image: string) => ({
        type: 'image_url',
        image_url: { url: image },
      })),
    ];

    let lastStatus = 502;
    let lastMessage = 'Não foi possível identificar as ferramentas.';
    let lastRateLimit: ReturnType<typeof rateLimitFrom> | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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
          max_completion_tokens: 1536,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'Você identifica ferramentas por imagem para inventário. Seja conservador e entregue somente JSON válido.',
            },
            { role: 'user', content: userContent },
          ],
        }),
      });

      lastRateLimit = rateLimitFrom(response.headers);
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const parsed = parseJson(data?.choices?.[0]?.message?.content ?? '{}');
        if (parsed) {
          return NextResponse.json({
            items: normalizeItems(parsed),
            rateLimit: lastRateLimit,
          });
        }
        lastStatus = 502;
        lastMessage = 'Resposta de visão incompleta.';
      } else {
        lastStatus = response.status;
        lastMessage = data?.error?.message || `Erro Groq (${response.status})`;

        if (response.status === 429) {
          return NextResponse.json({
            error: 'Limite temporário do Groq atingido.',
            details: lastMessage,
            rateLimit: lastRateLimit,
          }, { status: 429 });
        }

        if (response.status < 500 || attempt === MAX_ATTEMPTS - 1) break;
      }

      if (attempt < MAX_ATTEMPTS - 1) await sleep(700);
    }

    return NextResponse.json({
      error: 'Não foi possível analisar as fotos.',
      details: lastMessage,
      rateLimit: lastRateLimit,
    }, { status: lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502 });
  } catch (error) {
    console.error('Inventory vision error:', error);
    return NextResponse.json({
      error: 'Erro inesperado na análise das fotos.',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
    }, { status: 500 });
  }
}
