from pathlib import Path
import sys

path = Path('app/dashboard/nfs/page.tsx')
text = path.read_text(encoding='utf-8')

MARKER = '// BULK_NF_SAVE_ALL_V1'

if MARKER in text:
    print('Bulk NF save-all patch already applied.')
    sys.exit(0)


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    text = text.replace(old, new, 1)


save_all_helpers = r'''  // BULK_NF_SAVE_ALL_V1
  const persistBatchInvoice = async (item: BatchInvoiceItem, batchFormData: any) => {
    if (!batchFormData.supplier?.trim()) {
      throw new Error('Fornecedor não preenchido. Revise os dados desta NF antes de salvar.');
    }

    if (batchFormData.invoice_number && batchFormData.supplier) {
      const { data: existingNF, error: duplicateError } = await supabase
        .from('nfs')
        .select('id')
        .eq('invoice_number', batchFormData.invoice_number)
        .eq('supplier', batchFormData.supplier);

      if (duplicateError) throw duplicateError;
      if (existingNF && existingNF.length > 0) {
        throw new Error(`Já existe a NF ${batchFormData.invoice_number} para ${batchFormData.supplier}.`);
      }
    }

    const uploadedUrl = item.uploadedUrl || await uploadFile(item.file, 'nfs');
    if (!uploadedUrl) {
      throw new Error('Não foi possível enviar o PDF para o armazenamento.');
    }

    const cleanAmount = parseCurrency(batchFormData.amount);
    const itemsToProcess = batchFormData.items && batchFormData.items.length > 0
      ? batchFormData.items.filter((it: any) => it.checked)
      : [];
    const groupId = crypto.randomUUID();

    const basePayloadTemplate = {
      supplier: batchFormData.supplier,
      date: batchFormData.date || null,
      amount: cleanAmount,
      invoice_number: batchFormData.invoice_number,
      delivery_invoice_number: batchFormData.delivery_invoice_number,
      payment_date: batchFormData.payment_date || null,
      status: batchFormData.status,
      ticket_number: batchFormData.ticket_number || null,
      obs: batchFormData.obs,
      type: batchFormData.type,
      is_tool: batchFormData.type === 'ferramenta' || batchFormData.type === 'cautela',
      file_url: uploadedUrl,
      delivery_invoice_url: batchFormData.delivery_invoice_url,
      boleto_url: batchFormData.boleto_urls?.length > 0 ? batchFormData.boleto_urls[0] : null,
      boleto_urls: batchFormData.boleto_urls || [],
      is_volvo: batchFormData.is_volvo,
      branch_id: batchFormData.branch_id,
      order_number: batchFormData.order_number,
      responsible_registration: batchFormData.responsible_registration,
      group_id: groupId
    };

    if (itemsToProcess.length > 0 && batchFormData.type === 'ferramenta' && !batchFormData.is_volvo) {
      const payloads = itemsToProcess.map((it: any) => {
        const itemAmount = it.amount;
        const cleanItemAmount = itemAmount && itemAmount !== '0,00' && itemAmount !== ''
          ? parseCurrency(itemAmount)
          : cleanAmount;
        const tempPayload = {
          ...basePayloadTemplate,
          tool_name: it.name,
          quantity: parseInt(it.quantity) || 1,
          tool_code: it.code || batchFormData.tool_code,
          amount: cleanItemAmount,
          ticket_number: it.ticket_number || batchFormData.ticket_number || null,
          invoice_number: it.invoice_number || batchFormData.invoice_number,
          delivery_invoice_number: it.delivery_invoice_number || batchFormData.delivery_invoice_number
        };
        tempPayload.status = calculateAutoStatus(tempPayload);
        return tempPayload;
      });

      const { data: insertedData, error: insertError } = await supabase
        .from('nfs')
        .insert(payloads)
        .select();
      if (insertError) throw insertError;

      if (insertedData) {
        for (const inv of insertedData) {
          if (inv.status === 'paid') await syncToInventory(inv);
        }
      }

      return { rowCount: insertedData?.length || payloads.length, uploadedUrl };
    }

    const singlePayload = {
      ...basePayloadTemplate,
      tool_name: batchFormData.tool_name,
      quantity: parseInt(batchFormData.quantity) || 1,
      tool_code: batchFormData.tool_code
    };
    singlePayload.status = calculateAutoStatus(singlePayload);

    const { data: insertedData, error: insertError } = await supabase
      .from('nfs')
      .insert([singlePayload])
      .select();
    if (insertError) throw insertError;

    if (insertedData?.[0]?.status === 'paid') {
      await syncToInventory(insertedData[0]);
    }

    return { rowCount: insertedData?.length || 1, uploadedUrl };
  };

  const handleSaveAllBatchInvoices = async () => {
    const batchSnapshot = batchInvoices.map(item =>
      item.id === activeBatchInvoiceId && item.status !== 'saved'
        ? { ...item, formData: { ...formData } }
        : item
    );
    const readyItems = batchSnapshot.filter(item => item.status === 'ready');

    if (readyItems.length === 0) {
      setNotification({
        title: 'Nenhuma NF pronta para salvar',
        message: 'Leia pelo menos uma NF com o AXEL antes de salvar. As NFs com erro ou aguardando leitura continuarão no lote.',
        type: 'warning'
      });
      return;
    }

    setBatchInvoices(batchSnapshot);

    const savedIds = new Set<string>();
    const failures: Array<{ fileName: string; message: string }> = [];
    let savedRows = 0;

    for (const item of readyItems) {
      setBatchInvoices(prev => prev.map(current =>
        current.id === item.id
          ? { ...current, status: 'processing', error: undefined }
          : current
      ));

      try {
        const result = await persistBatchInvoice(item, item.formData);
        savedRows += result.rowCount;
        savedIds.add(item.id);

        setBatchInvoices(prev => prev.map(current =>
          current.id === item.id
            ? {
                ...current,
                status: 'saved',
                uploadedUrl: result.uploadedUrl,
                formData: { ...item.formData, invoice_url: result.uploadedUrl },
                error: undefined
              }
            : current
        ));
      } catch (error: any) {
        const message = error?.message || 'Não foi possível salvar esta NF.';
        failures.push({ fileName: item.file.name, message });
        setBatchInvoices(prev => prev.map(current =>
          current.id === item.id
            ? { ...current, status: 'error', error: message }
            : current
        ));
      }
    }

    await fetchData();

    const remainingItems = batchSnapshot.filter(item =>
      item.status !== 'saved' && !savedIds.has(item.id)
    );
    const savedInvoices = savedIds.size;

    if (remainingItems.length === 0) {
      setIsModalOpen(false);
      resetInvoiceBatch();
      setPendingInvoiceFile(null);
      setPendingBoletoFiles([]);
      setNotification({
        title: 'Lote salvo com sucesso',
        message: `${savedInvoices} notas fiscais foram salvas em ${savedRows} linha${savedRows === 1 ? '' : 's'} de Pendências.`,
        type: 'success'
      });
      return;
    }

    const nextItem = remainingItems[0];
    setActiveBatchInvoiceId(nextItem.id);
    setPendingInvoiceFile(nextItem.file);
    setPendingBoletoFiles([]);
    setFormData(nextItem.formData);

    const unreadCount = remainingItems.filter(item => item.status === 'pending').length;
    const errorNames = failures.slice(0, 5).map(failure => failure.fileName);
    const extraErrors = failures.length - errorNames.length;
    const details = [
      unreadCount > 0 ? `${unreadCount} aguardando leitura` : '',
      failures.length > 0
        ? `falha ao salvar: ${errorNames.join(', ')}${extraErrors > 0 ? ` e mais ${extraErrors}` : ''}`
        : ''
    ].filter(Boolean).join('. ');

    setNotification({
      title: savedInvoices > 0 ? 'NFs prontas foram salvas' : 'Nenhuma NF foi salva',
      message: `${savedInvoices} NF${savedInvoices === 1 ? '' : 's'} salva${savedInvoices === 1 ? '' : 's'} em ${savedRows} linha${savedRows === 1 ? '' : 's'}. ${remainingItems.length} NF${remainingItems.length === 1 ? '' : 's'} permanece${remainingItems.length === 1 ? '' : 'm'} no lote${details ? `: ${details}` : ''}.`,
      type: failures.length > 0 ? 'warning' : 'success'
    });
  };

'''

replace_once(
    "  const handleSubmit = async (e: React.FormEvent) => {",
    save_all_helpers + "  const handleSubmit = async (e: React.FormEvent) => {",
    'batch save helpers'
)

replace_once(
    "    e.preventDefault();\n    setIsLoading(true);\n\n    // 0. Duplicate Check",
    "    e.preventDefault();\n    setIsLoading(true);\n\n    if (isInvoiceBatch) {\n      try {\n        await handleSaveAllBatchInvoices();\n      } catch (error: any) {\n        setNotification({\n          title: 'Erro ao salvar o lote',\n          message: error?.message || 'Não foi possível salvar as notas fiscais do lote.',\n          type: 'error'\n        });\n      } finally {\n        setIsLoading(false);\n      }\n      return;\n    }\n\n    // 0. Duplicate Check",
    'batch submit branch'
)

replace_once(
    '''                      type="submit"
                      onClick={() => setIsSavingNext(false)}
                      disabled={isProcessing || isLoading || activeBatchInvoice?.status === 'saved'}''',
    '''                      type="submit"
                      formNoValidate={isInvoiceBatch}
                      onClick={() => setIsSavingNext(false)}
                      disabled={isProcessing || isLoading || (isInvoiceBatch ? !batchInvoices.some(item => item.status === 'ready') : activeBatchInvoice?.status === 'saved')}''',
    'batch save button state'
)

replace_once(
    "                      {isLoading ? 'Salvando...' : activeBatchInvoice?.status === 'saved' ? 'NF já salva' : isInvoiceBatch ? 'Salvar dados da NF' : `Salvar ${editingInvoice ? 'Alterações' : 'NF no Sistema'}`}",
    "                      {isLoading ? 'Salvando lote...' : isInvoiceBatch ? (batchInvoices.some(item => item.status === 'ready') ? `Salvar todas as NFs (${batchInvoices.filter(item => item.status === 'ready').length})` : 'Leia as NFs antes de salvar') : activeBatchInvoice?.status === 'saved' ? 'NF já salva' : `Salvar ${editingInvoice ? 'Alterações' : 'NF no Sistema'}`}",
    'batch save button label'
)

path.write_text(text, encoding='utf-8')
print('Bulk NF save-all patch applied successfully.')
