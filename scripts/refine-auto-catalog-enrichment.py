from pathlib import Path

path = Path('app/dashboard/inventory/adjustments/page.tsx')
source = path.read_text()

old_update = '''  const updateDraft = (toolId: string, patch: Partial<Draft>) => {
    setDrafts(current => ({
      ...current,
      [toolId]: { ...(current[toolId] || makeDraft(tools.find(item => item.id === toolId)!)), ...patch },
    }));
    setSuccessId('');
  };'''
new_update = '''  const updateDraft = (toolId: string, patch: Partial<Draft>) => {
    setDrafts(current => {
      const next = {
        ...current,
        [toolId]: { ...(current[toolId] || makeDraft(tools.find(item => item.id === toolId)!)), ...patch },
      };
      draftsRef.current = next;
      return next;
    });
    setSuccessId('');
  };'''
if old_update not in source:
    raise SystemExit('updateDraft block not found')
source = source.replace(old_update, new_update)

old_template = '''    const currentDraft = draftsRef.current[tool.id] || makeDraft(tool);
    const currentName = currentDraft.name.trim();
    const pendingName = !currentName || normalize(currentName).includes('ferramenta nao identificada');
    const nextName = pendingName ? String(template.name || '').trim() : currentDraft.name;
    const nextBrand = currentDraft.brand.trim() || String(template.brand || '').trim();
    const localPhotos = toolPhotos(tool);
    const referencePhotos = toolPhotos(template);
    const imageUrls = Array.from(new Set([...localPhotos, ...referencePhotos]));
    const primaryPhoto = tool.image_url || imageUrls[0] || null;
    const sameBranchConflict = catalogRef.current.some(item =>
      item.id !== tool.id && item.branch_id === tool.branch_id && normalizeCode(item.code) === normalizeCode(template.code)
    );
    const canAdoptCode = adoptCode && !sameBranchConflict && Boolean(template.code) && ('''
new_template = '''    const currentDraft = draftsRef.current[tool.id] || makeDraft(tool);
    const sameBranchConflict = catalogRef.current.some(item =>
      item.id !== tool.id && item.branch_id === tool.branch_id && normalizeCode(item.code) === normalizeCode(template.code)
    );
    if (adoptCode && sameBranchConflict) return;

    const currentName = currentDraft.name.trim();
    const pendingName = !currentName || normalize(currentName).includes('ferramenta nao identificada');
    const nameEditedManually = currentDraft.name !== (tool.name || '');
    const brandEditedManually = currentDraft.brand !== (tool.brand || '');
    const templateName = String(template.name || '').trim();
    const templateBrand = String(template.brand || '').trim();
    const nextName = !nameEditedManually && templateName && (adoptCode || pendingName)
      ? templateName
      : currentDraft.name;
    const nextBrand = !brandEditedManually && templateBrand
      ? templateBrand
      : currentDraft.brand;
    const localPhotos = toolPhotos(tool);
    const referencePhotos = toolPhotos(template);
    const imageUrls = Array.from(new Set([...localPhotos, ...referencePhotos]));
    const primaryPhoto = tool.image_url || imageUrls[0] || null;
    const canAdoptCode = adoptCode && Boolean(template.code) && ('''
if old_template not in source:
    raise SystemExit('template block not found')
source = source.replace(old_template, new_template)

path.write_text(source)
print('Automatic catalog enrichment safety refined.')
