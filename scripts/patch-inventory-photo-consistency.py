from pathlib import Path

rapid = Path('components/inventory/PhotoInventoryRapid.tsx')
source = rapid.read_text(encoding='utf-8')
source = source.replace(
    'A foto ampla é só para análise. Apenas o recorte individual é salvo.',
    'A foto completa é preservada. Se você adicionar outra foto ao item, a última vira a principal.'
)
rapid.write_text(source, encoding='utf-8')

adjustments = Path('app/dashboard/inventory/adjustments/page.tsx')
source = adjustments.read_text(encoding='utf-8')
old = ": (uploadedUrls[0] || oldUrls[0] || null);"
new = ": (uploadedUrls[uploadedUrls.length - 1] || oldUrls[0] || null);"
if old not in source and new not in source:
    raise SystemExit('primaryPhoto marker not found in adjustments')
source = source.replace(old, new, 1)
adjustments.write_text(source, encoding='utf-8')

print('inventory photo consistency patch applied')
