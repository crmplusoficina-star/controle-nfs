from pathlib import Path
import re

path = Path('components/inventory/PhotoInventoryRapid.tsx')
source = path.read_text()

catalog_pattern = re.compile(r"  const catalogMatch = \(ai: AiItem\) => \{.*?\n  \};\n\n  const candidateMatchesTool", re.S)
catalog_replacement = r'''  const catalogMatch = (ai: AiItem) => {
    const ordered = prioritizedCatalog();
    const code = normalizeCode(ai.catalogCode || ai.code);

    // Código visível é identidade rígida. Se a IA leu um código, nunca usamos
    // semelhança de nome para trocar por outro cadastro.
    if (code) {
      const exactCode = ordered.filter(tool => normalizeCode(tool.code) === code);
      const identities = new Set(exactCode.map(tool => `${normalizeCode(tool.code)}|${normalize(tool.name)}`));
      if (exactCode.length && identities.size === 1) return exactCode[0];
      return null;
    }

    const detectedName = String(ai.name || '').trim();
    if (!detectedName || normalize(detectedName).includes('ferramenta nao identificada')) return null;

    const exact = ordered.filter(tool => normalize(tool.name) === normalize(detectedName));
    const exactCodes = new Set(exact.map(tool => normalizeCode(tool.code)).filter(Boolean));
    if (exact.length && exactCodes.size === 1) return exact[0];

    // Sem código só aceitamos fuzzy quando ele aponta para uma única identidade.
    const fuzzy = ordered.filter(tool => Boolean(findSafeToolNameMatch(detectedName, [tool])));
    const fuzzyCodes = new Set(fuzzy.map(tool => normalizeCode(tool.code)).filter(Boolean));
    if (fuzzy.length && fuzzyCodes.size === 1) return fuzzy[0];
    return null;
  };

  const candidateMatchesTool'''
source, count = catalog_pattern.subn(catalog_replacement, source, count=1)
if count != 1:
    raise SystemExit('catalogMatch não localizado')

merge_pattern = re.compile(r"  const mergeCandidates = \(current: Candidate\[], incoming: Candidate\[]\) => \{.*?\n  \};\n\n  const candidatesFromAi", re.S)
merge_replacement = r'''  const mergeCandidates = (current: Candidate[], incoming: Candidate[]) => {
    const next = [...current];

    for (const candidate of incoming) {
      // Uma nova foto da fila representa uma nova leitura. Nunca misturamos
      // ferramenta A com ferramenta B só porque os nomes são parecidos.
      // Dedupe só é permitido dentro da MESMA foto de origem.
      let index = next.findIndex(item => {
        if (!item.sourcePhotoId || !candidate.sourcePhotoId || item.sourcePhotoId !== candidate.sourcePhotoId) return false;

        const itemCode = normalizeCode(item.code);
        const candidateCode = normalizeCode(candidate.code);
        if (itemCode || candidateCode) return Boolean(itemCode && candidateCode && itemCode === candidateCode);

        // Para itens sem código, só eliminamos detecção duplicada quando as caixas
        // praticamente cobrem o mesmo objeto na mesma imagem.
        return boxIoU(item.bbox, candidate.bbox) >= 0.7;
      });

      if (index < 0) {
        next.push(candidate);
        continue;
      }

      const previous = next[index];
      const useIncomingCrop = Boolean(candidate.cropPreview) && (!previous.cropPreview || (candidate.confidence || 0) > (previous.confidence || 0));
      next[index] = {
        ...previous,
        // Depois que uma leitura cria o item, outra detecção da mesma foto não
        // pode trocar silenciosamente nome/código por outra ferramenta.
        name: previous.name || candidate.name,
        code: previous.code || candidate.code,
        brand: previous.brand || candidate.brand,
        quantity: Math.max(previous.quantity, candidate.quantity),
        confidence: Math.max(previous.confidence || 0, candidate.confidence || 0),
        matchedCatalog: previous.matchedCatalog || candidate.matchedCatalog,
        existsInBranch: previous.existsInBranch || candidate.existsInBranch,
        reviewState: previous.reviewState === 'manual' || candidate.reviewState === 'manual'
          ? 'manual'
          : previous.reviewState === 'review' || candidate.reviewState === 'review' ? 'review' : 'auto',
        sourcePhotoId: useIncomingCrop ? candidate.sourcePhotoId : previous.sourcePhotoId,
        bbox: useIncomingCrop ? candidate.bbox : previous.bbox,
        cropPreview: useIncomingCrop ? candidate.cropPreview : previous.cropPreview,
      };
    }

    return next;
  };

  const candidatesFromAi'''
source, count = merge_pattern.subn(merge_replacement, source, count=1)
if count != 1:
    raise SystemExit('mergeCandidates não localizado')

# A imagem completa deve aparecer inteira na prévia; object-cover cortava as bordas.
source = source.replace(
    '<Image src={photo.preview} alt={`Foto ${index + 1}`} fill unoptimized className="object-cover" />',
    '<Image src={photo.preview} alt={`Foto ${index + 1}`} fill unoptimized className="object-contain bg-slate-950" />',
)
source = source.replace(
    '<Image src={photo.preview} alt={`Foto complementar ${photoIndex + 1}`} fill unoptimized className="object-cover" />',
    '<Image src={photo.preview} alt={`Foto complementar ${photoIndex + 1}`} fill unoptimized className="object-contain bg-slate-950" />',
)

path.write_text(source)
