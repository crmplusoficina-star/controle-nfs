from pathlib import Path
import re

# Este script é executado no predev/prebuild e precisa poder rodar mais de uma vez.
route_path = Path('app/api/ai/inventory-fast/route.ts')
route = route_path.read_text()

old_attach = '''function attachCatalogMatches(items: InventoryItem[], catalog: CatalogItem[]) {
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
'''

new_attach = '''function attachCatalogMatches(items: InventoryItem[], catalog: CatalogItem[]) {
  return items.map(item => {
    if (normalize(item.name).includes('ferramenta nao identificada')) return item;
    const match = uniqueCatalogMatch(item, catalog);
    if (!match) return item;

    // O catálogo é apenas uma sugestão. Nunca transforme um código inferido por
    // semelhança visual/nome em código fisicamente lido na ferramenta.
    return {
      ...item,
      brand: item.brand || match.brand || null,
      catalogCode: match.code,
    };
  });
}
'''

if old_attach in route:
    route = route.replace(old_attach, new_attach, 1)
elif new_attach not in route:
    raise SystemExit('attachCatalogMatches esperado não localizado')
route_path.write_text(route)

component_path = Path('components/inventory/PhotoInventoryRapid.tsx')
source = component_path.read_text()

catalog_pattern = re.compile(
    r"  const catalogMatch = \(ai: AiItem\) => \{.*?\n  \};\n\n  const candidateMatchesTool",
    re.S,
)
catalog_replacement = r'''  const catalogMatch = (ai: AiItem) => {
    const ordered = prioritizedCatalog();
    const visibleCode = normalizeCode(ai.code);

    // Apenas o código realmente lido da foto é identidade rígida.
    if (visibleCode) {
      const exactCode = ordered.filter(tool => normalizeCode(tool.code) === visibleCode);
      const identities = new Set(exactCode.map(tool => `${normalizeCode(tool.code)}|${normalize(tool.name)}`));
      if (exactCode.length && identities.size === 1) return exactCode[0];
      return null;
    }

    const detectedName = String(ai.name || '').trim();
    if (!detectedName || normalize(detectedName).includes('ferramenta nao identificada')) return null;

    // catalogCode veio do nosso catálogo e pode ter sido inferido por nome.
    // Ele ajuda a sugerir a descrição, mas nunca ganha o peso de código visível.
    const suggestedCode = normalizeCode(ai.catalogCode);
    if (suggestedCode) {
      const suggested = ordered.filter(tool => normalizeCode(tool.code) === suggestedCode);
      const identities = new Set(suggested.map(tool => `${normalizeCode(tool.code)}|${normalize(tool.name)}`));
      if (suggested.length && identities.size === 1) {
        const candidate = suggested[0];
        const sameName = normalize(candidate.name) === normalize(detectedName);
        const safeName = sameName || (
          compatibleNumbers(detectedName, candidate.name)
          && Boolean(findSafeToolNameMatch(detectedName, [candidate]))
        );
        if (safeName) return candidate;
      }
    }

    const exact = ordered.filter(tool => normalize(tool.name) === normalize(detectedName));
    const exactCodes = new Set(exact.map(tool => normalizeCode(tool.code)).filter(Boolean));
    if (exact.length && exactCodes.size === 1) return exact[0];

    const fuzzy = ordered.filter(tool => Boolean(findSafeToolNameMatch(detectedName, [tool])));
    const fuzzyCodes = new Set(fuzzy.map(tool => normalizeCode(tool.code)).filter(Boolean));
    if (fuzzy.length && fuzzyCodes.size === 1) return fuzzy[0];
    return null;
  };

  const candidateMatchesTool'''
source, count = catalog_pattern.subn(catalog_replacement, source, count=1)
if count != 1:
    raise SystemExit('catalogMatch não localizado')

old_candidate_code = "      const code = match?.code || String(ai.code || '').trim();"
new_candidate_code = "      // Código do candidato é somente o que foi realmente lido na foto.\n      const code = String(ai.code || '').trim();"
if old_candidate_code in source:
    source = source.replace(old_candidate_code, new_candidate_code, 1)
elif new_candidate_code not in source:
    raise SystemExit('atribuição de código do candidato não localizada')

resolve_pattern = re.compile(
    r"  const resolveIdentity = \(item: Candidate\) => \{.*?\n  \};\n\n  const expectedAtLocation",
    re.S,
)
resolve_replacement = r'''  const resolveIdentity = (item: Candidate) => {
    const typedName = item.name.trim();
    const visibleOrExplicitCode = item.code.trim();
    if (visibleOrExplicitCode) return { name: typedName, code: visibleOrExplicitCode };

    // Sem código lido (ou escolhido explicitamente em "Procurar no cadastro"),
    // cada ferramenta vira um registro independente. Nome parecido não pode
    // reaproveitar a identidade de um item já salvo.
    return { name: typedName, code: generatedCode() };
  };

  const expectedAtLocation'''
source, count = resolve_pattern.subn(resolve_replacement, source, count=1)
if count != 1:
    raise SystemExit('resolveIdentity não localizado')

component_path.write_text(source)

# Guardas para evitar regressão silenciosa neste patch.
patched_route = route_path.read_text()
patched_component = component_path.read_text()
assert 'name: match.name,\n      code: match.code,' not in patched_route
assert "const visibleCode = normalizeCode(ai.code);" in patched_component
assert "const code = String(ai.code || '').trim();" in patched_component
assert 'return { name: typedName, code: generatedCode() };' in patched_component
print('Correção de identidade aplicada com sucesso.')
