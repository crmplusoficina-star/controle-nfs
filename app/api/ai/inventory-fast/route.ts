import { NextRequest, NextResponse } from 'next/server';
import { findSafeToolNameMatch } from '@/lib/tool-name-match';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'qwen/qwen3.6-27b';
const MAX_CATALOG_ITEMS = 1500;
const MAX_COMPLETION_TOKENS = 700;

type CatalogItem = {
  name: string;
  code: string;
  brand?: string | null;
};

type BoundingBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type InventoryItem = {
  name: string;
  code: string | null;
  brand: string | null;
  quantity: number | null;
  confidence: number;
  catalogCode: string | null;
  imageIndex: 0;
  bbox: BoundingBox | null;
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

  const cleaned = value.replace(/```json/gi, '').replace(/```/g, '').trim();
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

function clampCoordinate(value: unknown) {
  const parsed = numberValue(value);
  if (parsed === null) return null;
  return Math.max(0, Math.min(1000, Math.round(parsed)));
}

function boundingBox(value: unknown): BoundingBox | null {
  let coordinates: unknown[] | null = null;
  if (Array.isArray(value) && value.length >= 4) {
    coordinates = value.slice(0, 4);
  } else if (value && typeof value === 'object') {
    const box = value as Record<string, unknown>;
    coordinates = [box.x1 ?? box.left, box.y1 ?? box.top, box.x2 ?? box.right, box.y2 ?? box.bottom];
  }
  if (!coordinates) return null;

  const [x1, y1, x2, y2] = coordinates.map(clampCoordinate);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
  if (x2 - x1 < 8 || y2 - y1 < 8) return null;
  return { x1, y1, x2, y2 };
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
        confidence: Math.max(0, Math.min(1, confidenceRaw)),
        catalogCode: text(item.catalogCode ?? item.catalog_code ?? item.codigoCatalogo),
        imageIndex: 0 as const,
        bbox: boundingBox(item.bbox ?? item.boundingBox ?? item.bounding_box ?? item.box),
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

function uniqueCatalogMatch(item: InventoryItem, catalog: CatalogItem[]) {
  const visibleCode = normalizeCode(item.code);
  if (visibleCode) {
    const byCode = catalog.find(entry => normalizeCode(entry.code) === visibleCode);
    if (byCode) return byCode;
  }

  const detectedName = normalize(item.name);
  if (!detectedName) return null;
  const exact = catalog.filter(entry => normalize(entry.name) === detectedName);
  const exactCodes = new Set(exact.map(entry => normalizeCode(entry.code)).filter(Boolean));
  if (exact.length && exactCodes.size === 1) return exact[0];

  return findSafeToolNameMatch(item.name, catalog);
}

function attachCatalogMatches(items: InventoryItem[], catalog: CatalogItem[]) {
  return items.map(item => {
    if (normalize(item.name).includes('ferramenta nao identificada')) return item;
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const image = typeof body?.image === 'string'
      ? body.image
      : Array.isArray(body?.images) && typeof body.images[0] === 'string'
        ? body.images[0]
        : '';
    const locationHint = text(body?.locationHint)?.toUpperCase() || null;
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

    if (!image) return NextResponse.json({ error: 'Envie uma foto.' }, { status: 400 });

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_VISION_MODEL || process.env.GROQ_MODEL || DEFAULT_MODEL;
    if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY não configurada.' }, { status: 500 });

    const prompt = `
Analise esta foto para inventário de oficina/manutenção.
Procure SISTEMATICAMENTE a imagem inteira, da esquerda para a direita e de cima para baixo.
Identifique TODOS os itens de estoque claramente visíveis: ferramentas, peças, filtros, baterias, óleos, lubrificantes, fluidos, consumíveis, instrumentos, máquinas e equipamentos.

IMPORTANTE SOBRE ITENS INCERTOS:
- Se um objeto for claramente uma ferramenta/equipamento/item de oficina, mas você não conseguir dizer exatamente qual é, NÃO o descarte. Retorne name="Ferramenta não identificada", confidence baixa e bbox do objeto.
- Se não houver item de estoque, retorne items: []. Isso é um resultado válido, não um erro.

NÃO INVENTAR OBJETOS:
- Ignore pessoas, mãos, braços, pernas, pés e outras partes do corpo.
- Ignore roupas, calçados, relógios, celulares, carteiras, chaves pessoais e objetos pessoais.
- Ignore piso, paredes, mesas, prateleiras, caixas vazias de ambiente e mobiliário quando não forem o item de estoque.

RÓTULOS E IDENTIFICAÇÃO:
- Leia rótulos, etiquetas, marcas, modelos e especificações quando visíveis.
- Não invente código, marca ou modelo. Use null quando não estiver visível ou seguro.
- PAG 46, 15W40, DOT 4, ISO 46, R134a etc. são especificações e podem fazer parte do nome; não são automaticamente códigos internos.
- Conte unidades iguais quando estiver claro; caso contrário use quantity=null.

RECORTE:
- Para cada item, retorne bbox=[x1,y1,x2,y2] de 0 a 1000, justo ao objeto.
- Não inclua grande área de fundo no bbox.
- Se não houver bbox seguro, use null.

A locação já foi informada pelo usuário como ${locationHint ? JSON.stringify(locationHint) : 'null'}. NÃO tente descobrir locação pela foto.

Retorne SOMENTE JSON válido:
{"items":[{"name":"nome em português","code":null,"brand":null,"quantity":1,"confidence":0.0,"catalogCode":null,"bbox":[100,100,800,900]}]}
`;

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
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image } },
          ],
        }],
      }),
    });

    const rateLimit = rateLimitFrom(response.headers);
    const data = await response.json().catch(() => ({}));

    if (response.status === 429) {
      return NextResponse.json({
        error: 'Capacidade por minuto do Groq atingida.',
        details: data?.error?.message || 'Aguarde a janela de tokens renovar.',
        rateLimit,
      }, { status: 429 });
    }

    if (!response.ok) {
      return NextResponse.json({
        error: 'Falha no reconhecimento desta foto.',
        details: data?.error?.message || `Erro Groq (${response.status})`,
        rateLimit,
      }, { status: response.status >= 400 && response.status < 600 ? response.status : 502 });
    }

    const parsed = parseJson(data?.choices?.[0]?.message?.content);
    const normalized = parsed ? normalizeItems(parsed) : [];
    const items = attachCatalogMatches(normalized, catalog);

    return NextResponse.json({
      items,
      noInventoryItems: items.length === 0,
      location: locationHint,
      rateLimit,
    });
  } catch (error) {
    console.error('Fast inventory vision error:', error);
    return NextResponse.json({
      error: 'Erro inesperado na análise da foto.',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
    }, { status: 500 });
  }
}
