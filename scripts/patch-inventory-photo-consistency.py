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
old_primary = ": (uploadedUrls[0] || oldUrls[0] || null);"
new_primary = ": (uploadedUrls[uploadedUrls.length - 1] || oldUrls[0] || null);"
if old_primary not in source and new_primary not in source:
    raise SystemExit('primaryPhoto marker not found in adjustments')
source = source.replace(old_primary, new_primary, 1)

old_urls = ": Array.from(new Set([...oldUrls, ...uploadedUrls]));"
new_urls = ": Array.from(new Set([...uploadedUrls].reverse().concat(oldUrls)));"
if old_urls in source:
    source = source.replace(old_urls, new_urls, 1)
elif new_urls not in source:
    raise SystemExit('imageUrls marker not found in adjustments')

adjustments.write_text(source, encoding='utf-8')

print('inventory photo consistency patch applied')
