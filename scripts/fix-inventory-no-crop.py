from pathlib import Path
import re

rapid_path = Path('components/inventory/PhotoInventoryRapid.tsx')
source = rapid_path.read_text()

crop_function = re.compile(
    r"\nasync function cropItem\(file: File, box: BoundingBox\) \{.*?\n\}\n\nfunction dataUrlToFile",
    re.S,
)
source, removed = crop_function.subn('\nfunction dataUrlToFile', source, count=1)
if removed == 0 and 'async function cropItem(' in source:
    raise SystemExit('Não foi possível remover cropItem do Inventário Rápido.')

old_detection = '''      const bbox = safeBox(ai.bbox);
      let cropPreview: string | null = null;
      if (bbox) {
        try {
          cropPreview = await cropItem(photo.file, bbox);
        } catch (error) {
          console.warn('Falha ao recortar item:', error);
        }
      }
'''
new_detection = '''      const bbox = safeBox(ai.bbox);
      // Regra do inventário: uma foto representa um item e deve permanecer inteira.
      // Mantemos o nome legado cropPreview apenas para compatibilidade do estado,
      // mas o conteúdo agora é SEMPRE a foto original completa, nunca um recorte da IA.
      const cropPreview = await fileAsDataUrl(photo.file);
'''
if old_detection in source:
    source = source.replace(old_detection, new_detection, 1)
elif new_detection not in source:
    raise SystemExit('Bloco de geração de preview do item não localizado.')

# Nenhuma miniatura no modo inventário deve esconder bordas da foto.
source = source.replace('object-cover', 'object-contain')

rapid_path.write_text(source)

# Ajustes manuais fazem parte do mesmo módulo de inventário. As miniaturas também
# devem mostrar a imagem inteira, sem cover/crop visual.
adjustments_path = Path('app/dashboard/inventory/adjustments/page.tsx')
adjustments = adjustments_path.read_text()
adjustments = adjustments.replace('object-cover', 'object-contain')
adjustments_path.write_text(adjustments)

# Guardas contra regressão silenciosa.
patched = rapid_path.read_text()
assert 'async function cropItem(' not in patched
assert 'cropItem(photo.file' not in patched
assert "context.drawImage(image, sx, sy, sw, sh" not in patched
assert "const cropPreview = await fileAsDataUrl(photo.file);" in patched
assert 'object-cover' not in patched
assert 'object-cover' not in adjustments_path.read_text()
print('Inventário sem recorte: fotos completas preservadas.')
