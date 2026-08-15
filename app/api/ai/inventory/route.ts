import { NextRequest, NextResponse } from 'next/server';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'qwen/qwen3.6-27b';
const MAX_CLIENT_IMAGES = 5;
// A página específica do Qwen 3.6 informa até 3 imagens por requisição.
const GROQ_IMAGES_PER_REQUEST = 3;
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

type RateLimitInfo = ReturnType<typeof rateLimitFrom>;

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

function normalize(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeCode(value: string | null | undefined) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, '');
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

function canRetry(rateLimit: RateLimitInfo | null) {
  const raw = rateLimit?.remainingRequests;
  if (!raw) return true;
  const remaining = Number.parseInt(raw, 10);
  return !Number.isFinite(remaining) || remaining > 1;
}

function mergeInventoryItems(target: Map<string, InventoryItem>, incoming: InventoryItem[]) {
  for (const item of incoming) {
    const code = normalizeCode(item.catalogCode || item.code);
    const key = code ? `code:${code}` : `name:${normalize(item.name)}`;
    const previous = target.get(key);

    if (!previous) {
      target.set(key, item);
      continue;
    }

    target.set(key, {
      ...previous,
      brand: previous.brand || item.brand,
      quantity: Math.max(previous.quantity || 1, item.quantity || 1),
      location: previous.location || item.location,
      confidence: Math.max(previous.confidence, item.confidence),
      catalogCode: previous.catalogCode || item.catalogCode,
      code: previous.code || item.code,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const images = Array.isArray(body?.images)
      ? body.images
          .filter((value: unknown) => typeof value === 'string' && value)
          .slice(0, MAX_CLIENT_IMAGES)
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
      ? catalog
          .map(item => `- ${item.name} | código: ${item.code}${item.brand ? ` | marca: ${item.brand}` : ''}`)
          .join('\n')
      : 'Nenhum item existente foi fornecido.';

    const prompt = `
Analise as fotos de uma ferramentaria e identifique ferramentas, instrumentos, máquinas ou equipamentos duráveis visíveis.
O objetivo principal é reconhecer o TIPO DA FERRAMENTA. Não é necessário enxergar marca, modelo ou código para preencher o nome.
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
- Priorize preencher name quando o tipo do objeto puder ser reconhecido visualmente.
- Se reconhecer a categoria, mas não o modelo exato, use o nome genérico correto em português, por exemplo: chave combinada, chave de impacto, alicate, soquete, torquímetro, furadeira, esmerilhadeira.
- Não invente código, marca ou modelo. Quando não estiver visível, use null nesses campos.
- Só devolva "items": [] quando realmente não houver nenhuma ferramenta, instrumento, máquina ou equipamento inventariável visível.
- Se a mesma ferramenta aparecer em fotos diferentes, devolva apenas uma entrada para ela.
- Conte unidades visíveis quando for possível; se não for possível, use null.
- Se houver correspondência segura com o catálogo existente abaixo, use EXATAMENTE o nome e o código do catálogo e preencha catalogCode.
- Se houver mais de um item do catálogo com nome semelhante e não der para distinguir, não force correspondência.
- Ignore caixas, prateleiras, móveis, EPIs e consumíveis, a menos que sejam claramente parte de um equipamento inventariável.
- confidence deve ficar entre 0 e 1.

CATÁLOGO EXISTENTE EM OUTRAS FILIAIS E NA FILIAL ATUAL:
${catalogText}
`;

    const mergedItems = new Map<string, InventoryItem>();
    let lastRateLimit: RateLimitInfo | null = null;
    let lastStatus = 502;
    let lastMessage = 'Não foi possível identificar as ferramentas.';

    for (let batchStart = 0; batchStart < images.length; batchStart += GROQ_IMAGES_PER_REQUEST) {
      const batch = images.slice(batchStart, batchStart + GROQ_IMAGES_PER_REQUEST);
      let batchCompleted = false;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const attemptPrompt = attempt === 0
          ? prompt
          : `${prompt}\n\nREANÁLISE: a tentativa anterior não retornou uma ferramenta identificada. Observe novamente os objetos principais da imagem e, se o tipo da ferramenta estiver reconhecível, preencha name mesmo que marca, modelo e código permaneçam null.`;

        const userContent: Array<Record<string, unknown>> = [
          { type: 'text', text: attemptPrompt },
          ...batch.map((image: string) => ({
            type: 'image_url',
            image_url: { url: image },
          })),
        ];

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
                content: 'Você identifica ferramentas por imagem para inventário. Priorize reconhecer o tipo da ferramenta; nunca invente marca, modelo ou código. Entregue somente JSON válido.',
              },
              { role: 'user', content: userContent },
            ],
          }),
        });

        lastRateLimit = rateLimitFrom(response.headers);
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          const rawContent = data?.choices?.[0]?.message?.content;
          const parsed = parseJson(rawContent);
          const normalized = parsed ? normalizeItems(parsed) : [];

          if (normalized.length > 0) {
            mergeInventoryItems(mergedItems, normalized);
            batchCompleted = true;
            break;
          }

          lastStatus = 422;
          lastMessage = parsed
            ? 'A IA não identificou nenhuma ferramenta nesta tentativa.'
            : 'Resposta de visão incompleta.';

          if (attempt < MAX_ATTEMPTS - 1 && canRetry(lastRateLimit)) {
            await sleep(350);
            continue;
          }
          break;
        }

        lastStatus = response.status;
        lastMessage = data?.error?.message || `Erro Groq (${response.status})`;

        if (response.status === 429) {
          if (mergedItems.size > 0) {
            return NextResponse.json({
              items: Array.from(mergedItems.values()),
              partial: true,
              warning: 'Limite temporário do Groq atingido; retornando o que já foi identificado.',
              rateLimit: lastRateLimit,
            });
          }
          return NextResponse.json({
            error: 'Limite temporário do Groq atingido.',
            details: lastMessage,
            rateLimit: lastRateLimit,
          }, { status: 429 });
        }

        if (response.status < 500 || attempt === MAX_ATTEMPTS - 1) break;
        if (!canRetry(lastRateLimit)) break;
        await sleep(700);
      }

      if (!batchCompleted) {
        if (mergedItems.size > 0) {
          return NextResponse.json({
            items: Array.from(mergedItems.values()),
            partial: true,
            warning: lastMessage,
            rateLimit: lastRateLimit,
          });
        }
        return NextResponse.json({
          error: 'Não foi possível identificar uma ferramenta na foto.',
          details: lastMessage,
          rateLimit: lastRateLimit,
        }, { status: lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502 });
      }

      if (batchStart + GROQ_IMAGES_PER_REQUEST < images.length) {
        await sleep(700);
      }
    }

    return NextResponse.json({
      items: Array.from(mergedItems.values()),
      rateLimit: lastRateLimit,
    });
  } catch (error) {
    console.error('Inventory vision error:', error);
    return NextResponse.json({
      error: 'Erro inesperado na análise das fotos.',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
    }, { status: 500 });
  }
}
