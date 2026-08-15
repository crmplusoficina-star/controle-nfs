const STOP_WORDS = new Set([
  'a','as','o','os','de','da','das','do','dos','e','em','no','na','nos','nas','para','por','com','sem','um','uma','uns','umas',
]);

const CATEGORY_TOKENS = new Set([
  'alicate','chave','soquete','torquimetro','furadeira','parafusadeira','esmerilhadeira','martelo','marreta','multimetro','paquimetro',
  'bateria','filtro','oleo','fluido','tanque','solenoide','valvula','vareta','compressor','mangueira','broca','serra','prensa','macaco',
]);

function normalize(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function canonicalToken(raw: string) {
  const token = normalize(raw);
  if (!token) return '';
  if (/^cort(ad(or|ora|ores|oras)?|e|es)$/.test(token) || token === 'cortar') return 'corte';
  if (token === 'fios') return 'fio';
  if (token === 'chaves') return 'chave';
  if (token === 'alicates') return 'alicate';
  if (token === 'soquetes') return 'soquete';
  if (token === 'baterias') return 'bateria';
  if (token === 'filtros') return 'filtro';
  if (token === 'oleos') return 'oleo';
  if (token === 'fluidos') return 'fluido';
  if (token === 'combinada' || token === 'combinadas' || token === 'combinados') return 'combinado';
  if (token === 'universais') return 'universal';
  if (token === 'diagonais') return 'diagonal';
  if (token === 'ajustaveis') return 'ajustavel';
  if (token.length > 5 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function meaningfulTokens(value: string) {
  const tokens = normalize(value)
    .split(' ')
    .map(canonicalToken)
    .filter(token => token && !STOP_WORDS.has(token));
  return Array.from(new Set(tokens));
}

function identityKey(item: { name: string; code?: string | null }) {
  const code = normalize(item.code).replace(/\s+/g, '');
  return code ? `c:${code}` : `n:${normalize(item.name)}`;
}

export function toolNameSimilarity(detectedName: string, catalogName: string) {
  const detected = normalize(detectedName);
  const catalog = normalize(catalogName);
  if (!detected || !catalog) return 0;
  if (detected === catalog) return 1;

  const detectedTokens = meaningfulTokens(detected);
  const catalogTokens = meaningfulTokens(catalog);
  if (!detectedTokens.length || !catalogTokens.length) return 0;

  const detectedCategories = detectedTokens.filter(token => CATEGORY_TOKENS.has(token));
  const catalogCategories = catalogTokens.filter(token => CATEGORY_TOKENS.has(token));
  if (detectedCategories.length && catalogCategories.length && !detectedCategories.some(token => catalogCategories.includes(token))) {
    return 0;
  }

  const common = detectedTokens.filter(token => catalogTokens.includes(token)).length;
  if (!common) return 0;

  const detectedCoverage = common / detectedTokens.length;
  const catalogCoverage = common / catalogTokens.length;
  const union = new Set([...detectedTokens, ...catalogTokens]).size;
  const jaccard = common / union;
  const substringBonus = catalog.includes(detected) || detected.includes(catalog) ? 0.08 : 0;

  return Math.min(1, (detectedCoverage * 0.62) + (catalogCoverage * 0.20) + (jaccard * 0.18) + substringBonus);
}

export function findSafeToolNameMatch<T extends { name: string; code?: string | null }>(detectedName: string, catalog: T[]): T | null {
  const detected = normalize(detectedName);
  if (!detected) return null;

  const exact = catalog.filter(item => normalize(item.name) === detected);
  const exactIdentities = new Set(exact.map(identityKey));
  if (exact.length && exactIdentities.size === 1) return exact[0];

  const byIdentity = new Map<string, { item: T; score: number }>();
  for (const item of catalog) {
    const score = toolNameSimilarity(detectedName, item.name);
    if (score <= 0) continue;
    const key = identityKey(item);
    const previous = byIdentity.get(key);
    if (!previous || score > previous.score) byIdentity.set(key, { item, score });
  }

  const ranked = Array.from(byIdentity.values()).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 0.72) return null;

  const second = ranked[1];
  if (second && best.score - second.score < 0.10) return null;
  return best.item;
}
