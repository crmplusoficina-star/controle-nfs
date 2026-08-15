import { NextRequest, NextResponse } from 'next/server';
import { findSafeToolNameMatch } from '@/lib/tool-name-match';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'qwen/qwen3.6-27b';
const MAX_CLIENT_IMAGES = 5;
const GROQ_IMAGES_PER_REQUEST = 2;
const MAX_CATALOG_ITEMS = 1500;
const MAX_COMPLETION_TOKENS = 768;

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
      const name = text(item.name ?? item.toolName ?? item.ferramenta ?? item.material ?? item.produto);
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
    limitRequests: headers.get('x-ratelimit-limit-requests'),
    remainingRequests: headers.get('x-ratelimit-remaining-requests'),
    resetRequests: headers.get('x-ratelimit-reset-requests'),
    limitTokens: headers.get('x-ratelimit-limit-tokens'),
    remainingTokens: headers.get('x-ratelimit-remaining-tokens'),
    resetTokens: headers.get('x-ratelimit-reset-tokens'),
    retryAfter: headers.get('retry-after'),
  };
}

function durationToMs(value: string | null | undefined) {
  if (!value) return 0;
  let total = 0;
  const regex = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    if (match[2] === 'h') total += amount * 3_600_000;
    else if (match[2] === 'm') total += amount * 60_000;
    else if (match[2] === 's') total += amount * 1_000;
    else total += amount;
  }
  return Math.round(total);
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

function uniqueCatalogMatch(item: InventoryItem, catalog: CatalogItem[]) {
  const visibleCode = normalizeCode(item.code);
  if (visibleCode) {
    const byCode = catalog.filter(entry => normalizeCode(entry.code) === visibleCode);
    const canonical = byCode[0];
    if (canonical) return canonical;
  }

  const name = normalize(item.name);
  if (!name) return null;

  const exact = catalog.filter(entry => normalize(entry.name) === name);
  const exactCodes = Array.from(new Set(exact.map(entry => normalizeCode(entry.code)).filter(Boolean)));
  if (exact.length > 0 && exactCodes.length === 1) return exact[0];

  // Reconhecimento visual costuma usar nomes equivalentes, mas não idênticos.
  // Ex.: "alicate de corte" e "alicate cortador de fios". Só reutiliza quando
  // há um melhor candidato claro; empate entre ferramentas parecidas fica manual.
  return findSafeToolNameMatch(item.name, catalog);
}

function attachCatalogMatches(items: InventoryItem[], catalog: CatalogItem[]) {
  return items.map(item => {
    const match = uniqueCatalogMatch(item, catalog);
    if (!match) return item;
    return {
      ...item,
      name: match.name,
      code: match.code,
      brand: item.brand || match.brand || null,
      catalogCode: match.code,
    };
  });
}

async function waitForTokenWindowIfNeeded(rateLimit: RateLimitInfo | null) {
  const remaining = Number.parseInt(rateLimit?.remainingTokens || '', 10);
  if (!Number.isFinite(remaining) || remaining >= 1800) {
    await sleep(700);
    return;
  }

  const resetMs = durationToMs(rateLimit?.resetTokens);
  if (resetMs <= 0) {
    await sleep(1200);
    return;
  }

  await sleep(Math.min(resetMs + 300, 60_000));
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

    const prompt = `
Faça um inventário visual de TODOS os itens de estoque claramente visíveis nas fotos.
O inventário inclui ferramentas, peças, filtros, baterias, óleos, lubrificantes, fluidos, produtos químicos de oficina, consumíveis, instrumentos, máquinas e equipamentos.

LEIA O RÓTULO quando houver embalagem, frasco, caixa ou etiqueta. Use marca, linha, especificação e texto legível para sugerir um nome útil e específico do produto.
Se o rótulo permitir reconhecer com segurança a finalidade conhecida do produto, inclua essa finalidade no nome. Exemplo: um frasco identificado como "PAG 46" pode ser nomeado como "Óleo PAG 46 para compressor de ar-condicionado automotivo" quando o contexto/rótulo sustentar isso.

Retorne SOMENTE JSON válido neste formato:
{"items":[{"name":"nome objetivo e útil em português","code":null,"brand":null,"quantity":1,"location":${locationHint ? JSON.stringify(locationHint) : 'null'},"confidence":0.0,"catalogCode":null}]}

Regras:
- NÃO descarte um item só porque ele é consumível, óleo, fluido, filtro, bateria ou material de oficina.
- Para produtos embalados, priorize primeiro a leitura do rótulo; depois a forma visual da embalagem.
- Preencha brand quando a marca estiver legível no rótulo.
- Em name, combine tipo do produto + especificação/modelo quando isso estiver legível e fizer sentido.
- Não invente código de peça, código interno, marca ou modelo. Se não estiver visível ou não for seguro, use null.
- Um texto como PAG 46, 15W40, DOT 4, ISO 46, R134a, 10W30 etc. é especificação do produto e pode fazer parte do name; não trate automaticamente como código interno.
- Para ferramentas sem rótulo, reconheça o tipo visualmente: chave combinada, chave de impacto, alicate, soquete, torquímetro, furadeira, esmerilhadeira etc.
- Conte unidades apenas quando estiver claro; caso contrário use null.
- Se o mesmo item aparecer repetido nas fotos, não duplique.
- Ignore somente o que claramente NÃO é item de estoque: prateleiras, paredes, piso, mesas e mobiliário.
- Só use "items":[] quando realmente não houver nenhum item de estoque reconhecível na foto.
- confidence deve ficar entre 0 e 1.
`;

    const mergedItems = new Map<string, InventoryItem>();
    let lastRateLimit: RateLimitInfo | null = null;

    for (let batchStart = 0; batchStart < images.length; batchStart += GROQ_IMAGES_PER_REQUEST) {
      const batch = images.slice(batchStart, batchStart + GROQ_IMAGES_PER_REQUEST);
      const userContent: Array<Record<string, unknown>> = [
        { type: 'text', text: prompt },
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
          reasoning_format: 'hidden',
          max_completion_tokens: MAX_COMPLETION_TOKENS,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'user', content: userContent },
          ],
        }),
      });

      lastRateLimit = rateLimitFrom(response.headers);
      const data = await response.json().catch(() => ({}));

      if (response.status === 429) {
        const details = data?.error?.message || 'Limite por minuto do Groq atingido.';
        if (mergedItems.size > 0) {
          return NextResponse.json({
            items: Array.from(mergedItems.values()),
            partial: true,
            warning: 'A capacidade por minuto do Groq foi atingida; retornando o que já foi identificado.',
            rateLimit: lastRateLimit,
          });
        }
        return NextResponse.json({
          error: 'Capacidade por minuto do Groq atingida.',
          details,
          rateLimit: lastRateLimit,
        }, { status: 429 });
      }

      if (!response.ok) {
        return NextResponse.json({
          error: 'Não foi possível identificar um item na foto.',
          details: data?.error?.message || `Erro Groq (${response.status})`,
          rateLimit: lastRateLimit,
        }, { status: response.status >= 400 && response.status < 600 ? response.status : 502 });
      }

      const rawContent = data?.choices?.[0]?.message?.content;
      const parsed = parseJson(rawContent);
      const normalized = parsed ? normalizeItems(parsed) : [];
      const matched = attachCatalogMatches(normalized, catalog);

      if (matched.length === 0) {
        return NextResponse.json({
          error: 'A IA não identificou nenhum item de estoque nesta foto.',
          details: parsed ? 'Nenhum item reconhecido.' : 'Resposta de visão incompleta.',
          rateLimit: lastRateLimit,
        }, { status: 422 });
      }

      mergeInventoryItems(mergedItems, matched);

      if (batchStart + GROQ_IMAGES_PER_REQUEST < images.length) {
        await waitForTokenWindowIfNeeded(lastRateLimit);
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
