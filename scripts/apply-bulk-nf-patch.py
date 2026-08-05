from pathlib import Path
import sys

path = Path('app/dashboard/nfs/page.tsx')
text = path.read_text(encoding='utf-8')

if "type BatchInvoiceStatus = 'pending'" in text:
    print('Bulk NF patch already applied.')
    sys.exit(0)


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    text = text.replace(old, new, 1)


def replace_between(start: str, end: str, new: str, label: str) -> None:
    global text
    start_pos = text.find(start)
    if start_pos < 0:
        raise RuntimeError(f'{label}: start marker not found')
    end_pos = text.find(end, start_pos)
    if end_pos < 0:
        raise RuntimeError(f'{label}: end marker not found')
    text = text[:start_pos] + new + text[end_pos:]


replace_once(
    "async function extractTextFromPdf(file: File): Promise<string> {",
    "type BatchInvoiceStatus = 'pending' | 'processing' | 'ready' | 'error' | 'saved';\n\ntype BatchInvoiceItem = {\n  id: string;\n  file: File;\n  index: number;\n  status: BatchInvoiceStatus;\n  formData: any;\n  error?: string;\n  uploadedUrl?: string;\n};\n\nasync function extractTextFromPdf(file: File): Promise<string> {",
    'batch types'
)

replace_once(
    "  const [pendingInvoiceFile, setPendingInvoiceFile] = useState<File | null>(null);\n  const [pendingBoletoFiles, setPendingBoletoFiles] = useState<File[]>([]);",
    "  const [pendingInvoiceFile, setPendingInvoiceFile] = useState<File | null>(null);\n  const [pendingBoletoFiles, setPendingBoletoFiles] = useState<File[]>([]);\n  const [batchInvoices, setBatchInvoices] = useState<BatchInvoiceItem[]>([]);\n  const [activeBatchInvoiceId, setActiveBatchInvoiceId] = useState<string | null>(null);\n  const [pendingBatchFiles, setPendingBatchFiles] = useState<File[] | null>(null);\n  const [isBatchConfirmOpen, setIsBatchConfirmOpen] = useState(false);\n\n  const activeBatchInvoice = batchInvoices.find(item => item.id === activeBatchInvoiceId) || null;\n  const isInvoiceBatch = batchInvoices.length > 0 && !editingInvoice;\n\n  const resetInvoiceBatch = () => {\n    setBatchInvoices([]);\n    setActiveBatchInvoiceId(null);\n    setPendingBatchFiles(null);\n    setIsBatchConfirmOpen(false);\n  };",
    'batch state'
)

extraction_block = r'''  const createBlankBatchForm = () => ({
    ...formData,
    supplier: '',
    date: '',
    amount: '',
    invoice_number: '',
    delivery_invoice_number: '',
    payment_date: '',
    status: 'rc_created',
    obs: '',
    type: 'consumo',
    tool_name: '',
    quantity: '1',
    responsible_registration: '',
    order_number: '',
    ticket_number: '',
    invoice_url: '',
    delivery_invoice_url: '',
    boleto_urls: [],
    tool_code: '',
    is_volvo: false,
    items: []
  });

  const confirmInvoiceBatch = () => {
    if (!pendingBatchFiles?.length) return;

    const baseForm = createBlankBatchForm();
    const nextBatch = pendingBatchFiles.map((file, index) => ({
      id: crypto.randomUUID(),
      file,
      index,
      status: 'pending' as BatchInvoiceStatus,
      formData: { ...baseForm, items: [] }
    }));

    setBatchInvoices(nextBatch);
    setActiveBatchInvoiceId(nextBatch[0].id);
    setPendingInvoiceFile(nextBatch[0].file);
    setFormData(nextBatch[0].formData);
    setPendingBatchFiles(null);
    setIsBatchConfirmOpen(false);
    setActiveUpload('invoice');
  };

  const rejectInvoiceBatch = () => {
    setPendingBatchFiles(null);
    setIsBatchConfirmOpen(false);
  };

  const selectBatchInvoice = (id: string) => {
    const target = batchInvoices.find(item => item.id === id);
    if (!target || target.id === activeBatchInvoiceId || isProcessing) return;

    if (activeBatchInvoiceId) {
      setBatchInvoices(prev => prev.map(item =>
        item.id === activeBatchInvoiceId && item.status !== 'saved'
          ? { ...item, formData: { ...formData } }
          : item
      ));
    }

    setActiveBatchInvoiceId(target.id);
    setPendingInvoiceFile(target.file);
    setFormData(target.formData);
    setActiveUpload('invoice');
  };

  const extractInvoiceFile = async (file: File, baseFormData: any) => {
    let extractionResult: ExtractionResult | null = null;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      const text = await extractTextFromPdf(file);
      extractionResult = await extractInvoiceData({ text });
    } else {
      extractionResult = await new Promise<ExtractionResult | null>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Não foi possível abrir o arquivo de imagem.'));
        reader.onload = async () => {
          try {
            const base64 = reader.result as string;
            resolve(await extractInvoiceData({ image: base64 }));
          } catch (error) {
            reject(error);
          }
        };
        reader.readAsDataURL(file);
      });
    }

    if (!extractionResult) {
      throw new Error('O AXEL não retornou dados válidos para este arquivo.');
    }

    const rawItems = extractionResult.items ? extractionResult.items.map((it: any, idx: number) => ({
      id: `extraction-${idx}-${Date.now()}`,
      name: it.name,
      quantity: it.quantity?.toString() || '1',
      checked: true,
      amount: formatCurrency(it.amount)
    })) : [];

    const enrichedItems = await checkStockForItems(rawItems, baseFormData.branch_id);

    return {
      ...baseFormData,
      supplier: extractionResult.supplierName || baseFormData.supplier,
      date: extractionResult.date || baseFormData.date,
      amount: extractionResult.amount !== null && extractionResult.amount !== undefined
        ? formatCurrency(extractionResult.amount)
        : baseFormData.amount,
      invoice_number: extractionResult.invoiceNumber || baseFormData.invoice_number,
      payment_date: extractionResult.paymentDate || baseFormData.payment_date,
      type: extractionResult.isTool ? 'ferramenta' : baseFormData.type,
      tool_name: extractionResult.toolName || (extractionResult.items?.[0]?.name ?? baseFormData.tool_name),
      quantity: extractionResult.quantity?.toString() || (extractionResult.items?.[0]?.quantity?.toString() ?? baseFormData.quantity),
      items: enrichedItems
    };
  };

  const processBatchInvoice = async (item: BatchInvoiceItem, showErrorNotification = true) => {
    setBatchInvoices(prev => prev.map(current =>
      current.id === item.id ? { ...current, status: 'processing', error: undefined } : current
    ));

    try {
      const nextFormData = await extractInvoiceFile(item.file, item.formData);
      setBatchInvoices(prev => prev.map(current =>
        current.id === item.id
          ? { ...current, status: 'ready', formData: nextFormData, error: undefined }
          : current
      ));

      if (item.id === activeBatchInvoiceId) {
        setFormData(nextFormData);
        setPendingInvoiceFile(item.file);
      }

      return { id: item.id, ok: true as const, formData: nextFormData };
    } catch (error: any) {
      const message = error?.message || 'Não foi possível ler este anexo.';
      setBatchInvoices(prev => prev.map(current =>
        current.id === item.id
          ? { ...current, status: 'error', error: message }
          : current
      ));

      if (showErrorNotification) {
        setNotification({
          title: 'Erro na leitura da NF',
          message: `${item.file.name}: ${message}`,
          type: 'error'
        });
      }

      return { id: item.id, ok: false as const, fileName: item.file.name, error: message };
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;

    if (activeUpload === 'invoice') {
      if (acceptedFiles.length > 1) {
        setPendingBatchFiles(acceptedFiles);
        setIsBatchConfirmOpen(true);
        return;
      }

      resetInvoiceBatch();
      setPendingInvoiceFile(acceptedFiles[0]);
      return;
    }

    const file = acceptedFiles[0];
    if (activeUpload === 'delivery') {
      setFormData(prev => ({ ...prev, delivery_invoice_url: URL.createObjectURL(file) }));
      const url = await uploadFile(file, 'nfs');
      if (url) setFormData(prev => ({ ...prev, delivery_invoice_url: url }));
    } else {
      setPendingBoletoFiles(prev => [...prev, ...acceptedFiles]);
    }
  };

  const handleManualExtraction = async () => {
    if (!pendingInvoiceFile) return;

    setIsProcessing(true);
    try {
      if (isInvoiceBatch && activeBatchInvoice) {
        const currentItem = {
          ...activeBatchInvoice,
          formData: { ...formData }
        };
        await processBatchInvoice(currentItem);
      } else {
        const nextFormData = await extractInvoiceFile(pendingInvoiceFile, formData);
        setFormData(nextFormData);
        setNotification({
          title: 'Extração Concluída',
          message: 'Os dados da nota foram importados com sucesso para o formulário.',
          type: 'success'
        });
      }
    } catch (error: any) {
      console.error('Erro na extração AXEL:', error);
      setNotification({
        title: 'Erro na Extração',
        message: `${pendingInvoiceFile.name}: ${error?.message || 'Não foi possível ler os dados da nota automaticamente.'}`,
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExtractAllInvoices = async () => {
    const itemsToProcess = batchInvoices
      .filter(item => item.status !== 'saved')
      .map(item => item.id === activeBatchInvoiceId ? { ...item, formData: { ...formData } } : item);

    if (!itemsToProcess.length) return;

    setIsProcessing(true);
    const results: Array<Awaited<ReturnType<typeof processBatchInvoice>>> = [];
    let cursor = 0;
    const concurrency = Math.min(3, itemsToProcess.length);

    const worker = async () => {
      while (true) {
        const currentIndex = cursor++;
        if (currentIndex >= itemsToProcess.length) return;
        results.push(await processBatchInvoice(itemsToProcess[currentIndex], false));
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      const activeResult = results.find(result => result.id === activeBatchInvoiceId && result.ok);
      if (activeResult?.ok) {
        setFormData(activeResult.formData);
      }

      const errors = results.filter(result => !result.ok);
      if (errors.length > 0) {
        const names = errors.slice(0, 8).map(error => !error.ok ? error.fileName : '').filter(Boolean);
        const remaining = errors.length - names.length;
        setNotification({
          title: 'Algumas NFs não foram lidas',
          message: `Falha nos anexos: ${names.join(', ')}${remaining > 0 ? ` e mais ${remaining}` : ''}. Clique na NF com erro para tentar novamente.`,
          type: 'warning'
        });
      } else {
        setNotification({
          title: 'Leitura do lote concluída',
          message: `${results.length} notas fiscais foram preenchidas. Revise e salve cada NF individualmente.`,
          type: 'success'
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

'''
replace_between(
    "  const onDrop = async (acceptedFiles: File[]) => {",
    "  const { getRootProps, getInputProps, isDragActive } = useDropzone({",
    extraction_block,
    'upload and extraction functions'
)

replace_once(
    "    multiple: activeUpload === 'boleto' ",
    "    multiple: activeUpload === 'boleto' || activeUpload === 'invoice' ",
    'dropzone multiple'
)

success_block = r'''        if (isInvoiceBatch && activeBatchInvoiceId && activeBatchInvoice) {
          const savedFileName = activeBatchInvoice.file.name;
          const nextBatchInvoice = batchInvoices.find(item =>
            item.id !== activeBatchInvoiceId && item.status !== 'saved'
          );

          setBatchInvoices(prev => prev.map(item =>
            item.id === activeBatchInvoiceId
              ? {
                  ...item,
                  status: 'saved',
                  formData: { ...formData, invoice_url: finalInvoiceUrl },
                  uploadedUrl: finalInvoiceUrl,
                  error: undefined
                }
              : item
          ));

          fetchData();
          setIsSavingNext(false);

          if (nextBatchInvoice) {
            setActiveBatchInvoiceId(nextBatchInvoice.id);
            setPendingInvoiceFile(nextBatchInvoice.file);
            setPendingBoletoFiles([]);
            setFormData(nextBatchInvoice.formData);
          } else {
            const totalSaved = batchInvoices.length;
            setIsModalOpen(false);
            resetInvoiceBatch();
            setPendingInvoiceFile(null);
            setPendingBoletoFiles([]);
            setFormData({
              supplier: '',
              date: '',
              amount: '',
              invoice_number: '',
              delivery_invoice_number: '',
              payment_date: '',
              status: 'rc_created',
              obs: '',
              type: 'consumo',
              tool_name: '',
              quantity: '1',
              responsible_registration: '',
              order_number: '',
              ticket_number: '',
              invoice_url: '',
              delivery_invoice_url: '',
              boleto_urls: [],
              tool_code: '',
              is_volvo: false,
              branch_id: user?.role === 'Operador' ? user.branch_id : (branches.length > 0 ? branches[0].id : ''),
              items: []
            });
            setNotification({
              title: 'Lote concluído',
              message: `${totalSaved} notas fiscais foram salvas em Pendências. Último anexo: ${savedFileName}.`,
              type: 'success'
            });
          }

          return;
        }

        if (isSavingNext) {
          setNotification({
            title: 'Itens Salvos!',
            message: `${itemsToProcess.length || 1} registros vinculados com sucesso.`,
            type: 'success'
          });
          
          setFormData(prev => ({
            ...prev,
            invoice_number: '',
            delivery_invoice_number: '',
            amount: '',
            invoice_url: '',
            delivery_invoice_url: '',
            ticket_number: '',
            tool_name: '',
            tool_code: '',
            items: []
          }));
          setPendingInvoiceFile(null);
          setPendingBoletoFiles([]);
          setIsSavingNext(false);
        } else {
          setIsModalOpen(false);
        }
        fetchData();
        
        // Reset form on success
        setFormData({
          supplier: '',
          date: '',
          amount: '',
          invoice_number: '',
          delivery_invoice_number: '',
          payment_date: '',
          status: 'rc_created',
          obs: '',
          type: 'consumo',
          tool_name: '',
          quantity: '1',
          responsible_registration: '',
          order_number: '',
          ticket_number: '',
          invoice_url: '',
          delivery_invoice_url: '',
          boleto_urls: [],
          tool_code: '',
          is_volvo: false,
          branch_id: user?.role === 'Operador' ? user.branch_id : (branches.length > 0 ? branches[0].id : ''),
          items: []
        });
        resetInvoiceBatch();
        setPendingInvoiceFile(null);
        setPendingBoletoFiles([]);
'''
replace_between(
    "        if (isSavingNext) {",
    "      } catch (error: any) {",
    success_block,
    'post-save batch flow'
)

replace_once(
    "    setPendingInvoiceFile(null);\n    setPendingBoletoFiles([]);\n    \n    // Base form data from the selected row",
    "    setPendingInvoiceFile(null);\n    setPendingBoletoFiles([]);\n    resetInvoiceBatch();\n    \n    // Base form data from the selected row",
    'edit clears batch'
)

replace_once(
    "    setEditingInvoice(null);\n    setPendingInvoiceFile(null);\n    setPendingBoletoFiles([]);\n    setFormData({",
    "    setEditingInvoice(null);\n    setPendingInvoiceFile(null);\n    setPendingBoletoFiles([]);\n    resetInvoiceBatch();\n    setFormData({",
    'duplicate clears batch'
)

replace_once(
    "            onClick={() => {\n              setFormData(prev => ({ \n                ...prev, \n                is_volvo: true,",
    "            onClick={() => {\n              resetInvoiceBatch();\n              setPendingInvoiceFile(null);\n              setPendingBoletoFiles([]);\n              setFormData(prev => ({ \n                ...prev, \n                is_volvo: true,",
    'open volvo clears batch'
)

replace_once(
    "            onClick={() => {\n              setFormData(prev => ({ ...prev, is_volvo: false, type: 'consumo' }));",
    "            onClick={() => {\n              resetInvoiceBatch();\n              setPendingInvoiceFile(null);\n              setPendingBoletoFiles([]);\n              setFormData(prev => ({ ...prev, is_volvo: false, type: 'consumo' }));",
    'open general clears batch'
)

replace_once(
    "              onClick={() => setIsModalOpen(false)}\n              className=\"fixed inset-0 bg-indigo-950/80 backdrop-blur-md\"",
    "              onClick={() => {\n                setIsModalOpen(false);\n                resetInvoiceBatch();\n                setPendingInvoiceFile(null);\n                setPendingBoletoFiles([]);\n              }}\n              className=\"fixed inset-0 bg-indigo-950/80 backdrop-blur-md\"",
    'backdrop clears batch'
)

batch_tabs = r'''                {isInvoiceBatch && (
                  <div className="mb-4 rounded-2xl border border-indigo-100 bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-600">
                        Lote: {batchInvoices.length} notas fiscais
                      </p>
                      <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                        {batchInvoices.filter(item => item.status === 'saved').length} salvas
                      </p>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {batchInvoices.map((item, index) => {
                        const isActive = item.id === activeBatchInvoiceId;
                        const statusClass = item.status === 'saved'
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : item.status === 'error'
                            ? 'border-rose-300 bg-rose-50 text-rose-700'
                            : item.status === 'ready'
                              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                              : item.status === 'processing'
                                ? 'border-amber-300 bg-amber-50 text-amber-700'
                                : 'border-slate-200 bg-slate-50 text-slate-500';

                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={isProcessing}
                            onClick={() => selectBatchInvoice(item.id)}
                            title={item.error ? `${item.file.name}: ${item.error}` : item.file.name}
                            className={`min-w-[92px] rounded-xl border px-3 py-2 text-left transition-all disabled:cursor-wait disabled:opacity-60 ${statusClass} ${isActive ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}
                          >
                            <span className="block text-[9px] font-black uppercase tracking-wider">NF {index + 1}</span>
                            <span className="mt-0.5 block max-w-[110px] truncate text-[8px] font-semibold normal-case" title={item.file.name}>
                              {item.file.name}
                            </span>
                            <span className="mt-1 block text-[7px] font-black uppercase tracking-wider">
                              {item.status === 'saved' ? 'Salva' : item.status === 'error' ? 'Erro' : item.status === 'ready' ? 'Lida' : item.status === 'processing' ? 'Lendo' : 'Aguardando'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

'''
replace_once(
    "                <div className=\"flex gap-2 p-1 bg-white border border-slate-200 rounded-2xl mb-6\">",
    batch_tabs + "                <div className=\"flex gap-2 p-1 bg-white border border-slate-200 rounded-2xl mb-6\">",
    'batch tabs UI'
)

replace_once(
    "                          {activeUpload === 'invoice' ? 'NF Compra' : activeUpload === 'delivery' ? 'NF Entrega' : `${pendingBoletoFiles.length + formData.boleto_urls.length} Boletos`} Anexados!",
    "                          {activeUpload === 'invoice' ? (isInvoiceBatch ? `${batchInvoices.length} NFs de Compra` : 'NF Compra') : activeUpload === 'delivery' ? 'NF Entrega' : `${pendingBoletoFiles.length + formData.boleto_urls.length} Boletos`} Anexados!",
    'upload success title'
)

old_extract_button = r'''                      {activeUpload === 'invoice' && pendingInvoiceFile && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleManualExtraction();
                          }}
                          className="bg-white hover:bg-indigo-50 text-indigo-600 border-2 border-indigo-100 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-sm"
                        >
                          <Zap size={14} fill="currentColor" className="text-amber-500" />
                          Ler Dados com AXEL
                        </button>
                      )}
'''
new_extract_button = r'''                      {activeUpload === 'invoice' && pendingInvoiceFile && activeBatchInvoice?.status !== 'saved' && (
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleManualExtraction();
                            }}
                            className="bg-white hover:bg-indigo-50 disabled:opacity-50 text-indigo-600 border-2 border-indigo-100 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
                          >
                            <Zap size={14} fill="currentColor" className="text-amber-500" />
                            {isInvoiceBatch ? 'Ler esta NF' : 'Ler Dados com AXEL'}
                          </button>

                          {isInvoiceBatch && batchInvoices.length > 1 && (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExtractAllInvoices();
                              }}
                              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
                            >
                              <Zap size={14} fill="currentColor" className="text-amber-300" />
                              Ler todas as NFs
                            </button>
                          )}
                        </div>
                      )}
'''
replace_once(old_extract_button, new_extract_button, 'batch extraction buttons')

replace_once(
    "                          if (activeUpload === 'invoice') {\n                            setPendingInvoiceFile(null);\n                            setFormData(prev => ({ ...prev, invoice_url: '' }));",
    "                          if (activeUpload === 'invoice') {\n                            resetInvoiceBatch();\n                            setPendingInvoiceFile(null);\n                            setFormData(prev => ({ ...prev, invoice_url: '' }));",
    'remove invoice batch'
)

replace_once(
    "                        Remover e trocar",
    "                        {activeUpload === 'invoice' && isInvoiceBatch ? 'Remover lote e trocar' : 'Remover e trocar'}",
    'remove label'
)

replace_once(
    "                           {editingInvoice ? `Editando ID #${editingInvoice.id.slice(0,8)}` : (formData.is_volvo ? 'Fluxo Dedicado: Logística Volvo' : 'Sincronizado com Processamento AXEL')}\n                        </p>",
    "                           {editingInvoice ? `Editando ID #${editingInvoice.id.slice(0,8)}` : (formData.is_volvo ? 'Fluxo Dedicado: Logística Volvo' : 'Sincronizado com Processamento AXEL')}\n                        </p>\n                        {isInvoiceBatch && activeBatchInvoice && (\n                          <p className=\"max-w-[280px] truncate text-[9px] font-bold text-indigo-500\" title={activeBatchInvoice.file.name}>\n                            {activeBatchInvoice.file.name}\n                          </p>\n                        )}",
    'active filename header'
)

replace_once(
    "                        setPendingInvoiceFile(null);\n                        setPendingBoletoFiles([]);\n                        setFormData({",
    "                        setPendingInvoiceFile(null);\n                        setPendingBoletoFiles([]);\n                        resetInvoiceBatch();\n                        setFormData({",
    'close button clears batch'
)

replace_once(
    "                      disabled={isProcessing || isLoading}",
    "                      disabled={isProcessing || isLoading || activeBatchInvoice?.status === 'saved'}",
    'save disabled for saved item'
)

replace_once(
    "                      {isLoading ? 'Salvando...' : `Salvar ${editingInvoice ? 'Alterações' : 'NF no Sistema'}`}",
    "                      {isLoading ? 'Salvando...' : activeBatchInvoice?.status === 'saved' ? 'NF já salva' : isInvoiceBatch ? 'Salvar dados da NF' : `Salvar ${editingInvoice ? 'Alterações' : 'NF no Sistema'}`}",
    'save label'
)

confirmation_modal = r'''      {/* Confirmação de lote de NFs */}
      <AnimatePresence>
        {isBatchConfirmOpen && pendingBatchFiles && (
          <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={rejectInvoiceBatch}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              className="relative w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl"
            >
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <FileText size={30} />
              </div>
              <h3 className="text-center text-xl font-black italic uppercase text-slate-900">
                Você inseriu {pendingBatchFiles.length} notas fiscais
              </h3>
              <p className="mt-3 text-center text-xs font-medium leading-relaxed text-slate-500">
                Confirme para criar o lote de NF Compra. Cada anexo terá seus próprios dados e deverá ser salvo individualmente.
              </p>

              <div className="mt-5 max-h-36 space-y-1 overflow-y-auto rounded-2xl bg-slate-50 p-3">
                {pendingBatchFiles.slice(0, 20).map((file, index) => (
                  <p key={`${file.name}-${index}`} className="truncate text-[9px] font-bold text-slate-500" title={file.name}>
                    NF {index + 1}: {file.name}
                  </p>
                ))}
                {pendingBatchFiles.length > 20 && (
                  <p className="text-[9px] font-black uppercase text-indigo-500">
                    + {pendingBatchFiles.length - 20} anexos
                  </p>
                )}
              </div>

              <div className="mt-7 flex gap-3">
                <button
                  type="button"
                  onClick={rejectInvoiceBatch}
                  className="flex-1 rounded-2xl bg-slate-100 py-4 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-slate-200"
                >
                  Reprovar
                </button>
                <button
                  type="button"
                  onClick={confirmInvoiceBatch}
                  className="flex-1 rounded-2xl bg-indigo-600 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-500"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

'''
replace_once(
    "      {/* Modal Confirmação de Exclusão */}",
    confirmation_modal + "      {/* Modal Confirmação de Exclusão */}",
    'batch confirmation modal'
)

path.write_text(text, encoding='utf-8')
print('Bulk NF patch applied successfully.')
