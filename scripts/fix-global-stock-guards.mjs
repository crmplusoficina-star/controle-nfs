import fs from 'node:fs';

const file = 'app/dashboard/stock/page.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldValue, newValue, label) {
  if (!source.includes(oldValue)) throw new Error(`Trecho não encontrado: ${label}`);
  source = source.replace(oldValue, newValue);
  console.log(`OK: ${label}`);
}

replaceOnce(
  `                          <button \n                            onClick={() => {\n                              setSelectedTool(tool);\n                              setIsTransferModalOpen(true);\n                              setActiveMenuId(null);\n                            }}\n`,
  `                          <button \n                            onClick={(e) => {\n                              e.stopPropagation();\n                              setSelectedTool(tool);\n                              setIsTransferModalOpen(true);\n                              setActiveMenuId(null);\n                            }}\n`,
  'transferência do menu não abre ficha junto',
);

replaceOnce(
  `                                {holder.source === 'cautela' && (\n`,
  `                                {holder.source === 'cautela' && (!holder.possession_registration || holder.possession_registration === holder.registration) && (\n`,
  'não devolver cautela quando a posse está com outro colega',
);

fs.writeFileSync(file, source);
console.log('Guardas adicionais aplicadas.');
