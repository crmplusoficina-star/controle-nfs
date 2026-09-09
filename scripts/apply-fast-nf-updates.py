from pathlib import Path

path = Path('app/dashboard/nfs/page.tsx')
text = path.read_text(encoding='utf-8')
marker = 'FAST_NF_UPDATES_V1'

if marker in text:
    print('Fast NF updates already applied.')
    raise SystemExit(0)

# Separate form submission from the table's global loading state.
state_anchor = "  const [isSavingNext, setIsSavingNext] = useState(false);\n"
if state_anchor not in text:
    raise RuntimeError('Saving state anchor not found')
text = text.replace(
    state_anchor,
    state_anchor + "  // FAST_NF_UPDATES_V1\n  const [isSubmitting, setIsSubmitting] = useState(false);\n",
    1,
)

# Allow background refreshes without replacing the table with the loading row.
fetch_start = """  const fetchData = React.useCallback(async (isManual = false) => {\n    if (isManual) setIsSyncing(true);\n    else setIsLoading(true);\n"""
fetch_start_new = """  const fetchData = React.useCallback(async (isManual = false, silent = false) => {\n    if (isManual) setIsSyncing(true);\n    else if (!silent) setIsLoading(true);\n"""
if fetch_start not in text:
    raise RuntimeError('fetchData start anchor not found')
text = text.replace(fetch_start, fetch_start_new, 1)

fetch_finally = """    } finally {\n      setIsLoading(false);\n      setIsSyncing(false);\n    }\n  }, [user]);\n"""
fetch_finally_new = """    } finally {\n      if (!silent) setIsLoading(false);\n      setIsSyncing(false);\n    }\n  }, [user]);\n"""
if fetch_finally not in text:
    raise RuntimeError('fetchData finally anchor not found')
text = text.replace(fetch_finally, fetch_finally_new, 1)

# Batch-save reconciliation should also happen in the background.
if "    await fetchData();\n\n    const remainingItems = batchSnapshot.filter" in text:
    text = text.replace(
        "    await fetchData();\n\n    const remainingItems = batchSnapshot.filter",
        "    await fetchData(false, true);\n\n    const remainingItems = batchSnapshot.filter",
        1,
    )

# Saving a form should only lock the save button/modal, not blank the table.
submit_start = """  const handleSubmit = async (e: React.FormEvent) => {\n    e.preventDefault();\n    setIsLoading(true);\n"""
submit_start_new = """  const handleSubmit = async (e: React.FormEvent) => {\n    e.preventDefault();\n    setIsSubmitting(true);\n"""
if submit_start not in text:
    raise RuntimeError('handleSubmit start anchor not found')
text = text.replace(submit_start, submit_start_new, 1)

# The batch branch is injected by apply-bulk-nf-save-all.py before this patch.
batch_finally = """      } finally {\n        setIsLoading(false);\n      }\n      return;\n"""
if batch_finally in text:
    text = text.replace(
        batch_finally,
        """      } finally {\n        setIsSubmitting(false);\n      }\n      return;\n""",
        1,
    )

# Duplicate detection exits the submit flow without touching global loading.
duplicate_exit = """        setIsLoading(false);\n        return;\n"""
if duplicate_exit not in text:
    raise RuntimeError('Duplicate exit anchor not found')
text = text.replace(duplicate_exit, """        setIsSubmitting(false);\n        return;\n""", 1)

submit_finally = """    } finally {\n      setIsLoading(false);\n    }\n  };\n\n  const handleEdit = async (inv: any) => {\n"""
submit_finally_new = """    } finally {\n      setIsSubmitting(false);\n    }\n  };\n\n  const handleEdit = async (inv: any) => {\n"""
if submit_finally not in text:
    raise RuntimeError('handleSubmit finally anchor not found')
text = text.replace(submit_finally, submit_finally_new, 1)

# After a successful create/edit, reconcile in the background instead of flashing a loader.
success_refresh = """        fetchData();\n        \n        // Reset form on success\n"""
if success_refresh not in text:
    raise RuntimeError('Success refresh anchor not found')
text = text.replace(success_refresh, """        void fetchData(false, true);\n        \n        // Reset form on success\n""", 1)

# Replace inline editing with optimistic local updates. The row changes immediately,
# Supabase persists it in the background, and only failures trigger a silent reconcile.
quick_start = text.find("  const handleQuickUpdate = async (id: string, field: string, value: any) => {")
quick_end = text.find("\n\n  const filteredInvoices = invoices.filter", quick_start)
if quick_start == -1 or quick_end == -1:
    raise RuntimeError('handleQuickUpdate block not found')

quick_replacement = r'''  const handleQuickUpdate = async (id: string, field: string, value: any) => {
    setEditingCell(null);

    const invoice = invoices.find(inv => inv.id === id);
    if (!invoice) return;

    // Handle empty date strings - Postgres expects NULL not "".
    const finalValue = (field === 'payment_date' || field === 'date') && value === '' ? null : value;
    const updatedData = { ...invoice, [field]: finalValue };
    const updatePayload: any = { [field]: finalValue };

    if (field === 'status') {
      updatePayload.status = finalValue;
    } else {
      const oldCalculatedStatus = calculateAutoStatus(invoice);
      const newCalculatedStatus = calculateAutoStatus(updatedData);
      if (invoice.status === oldCalculatedStatus && newCalculatedStatus !== invoice.status) {
        updatePayload.status = newCalculatedStatus;
      }
    }

    const sharedFields = ['order_number', 'supplier', 'date', 'payment_date', 'status', 'branch_id', 'type', 'responsible_registration'];
    const shouldSyncGroup = !!invoice.group_id && sharedFields.includes(field);

    // Optimistic UI: reflect the change now, without waiting for Supabase or refetching the table.
    setInvoices(prev => prev.map(row => {
      const isTarget = row.id === id;
      const isSibling = shouldSyncGroup && row.group_id === invoice.group_id;
      return isTarget || isSibling ? { ...row, ...updatePayload } : row;
    }));

    try {
      const { error } = await supabase
        .from('nfs')
        .update(updatePayload)
        .eq('id', id);

      if (error) throw error;

      const updatedStatus = updatePayload.status || invoice.status;

      // Inventory synchronization no longer blocks inline editing.
      if (updatedStatus === 'paid' && invoice.status !== 'paid') {
        void syncToInventory({ ...updatedData, ...updatePayload, status: updatedStatus }).catch((syncError) => {
          console.error('Erro ao sincronizar inventário em segundo plano:', syncError);
        });
      }

      if (shouldSyncGroup) {
        const { error: syncError } = await supabase
          .from('nfs')
          .update(updatePayload)
          .eq('group_id', invoice.group_id)
          .neq('id', id);

        if (syncError) throw syncError;
      }
    } catch (error: any) {
      console.error('Erro no quick update:', error);
      // Reconcile only on failure, silently, so the table never enters the global loading state.
      void fetchData(false, true);
      setNotification({
        title: 'Erro ao Atualizar',
        message: 'Falha na atualização rápida: ' + (error.message || JSON.stringify(error)),
        type: 'error'
      });
    }
  };'''

text = text[:quick_start] + quick_replacement + text[quick_end:]

# The modal button uses its own submission state. Support both the normal form and
# the batch-save variant injected by the existing build patch.
batch_disabled = "disabled={isProcessing || isLoading || (isInvoiceBatch ? !batchInvoices.some(item => item.status === 'ready') : activeBatchInvoice?.status === 'saved')}"
normal_disabled = "disabled={isProcessing || isLoading}"
if batch_disabled in text:
    text = text.replace(
        batch_disabled,
        "disabled={isProcessing || isSubmitting || (isInvoiceBatch ? !batchInvoices.some(item => item.status === 'ready') : activeBatchInvoice?.status === 'saved')}",
        1,
    )
elif normal_disabled in text:
    text = text.replace(normal_disabled, "disabled={isProcessing || isSubmitting}", 1)
else:
    raise RuntimeError('Submit button disabled anchor not found')

batch_label = "{isLoading ? 'Salvando lote...' : isInvoiceBatch ? (batchInvoices.some(item => item.status === 'ready') ? `Salvar todas as NFs (${batchInvoices.filter(item => item.status === 'ready').length})` : 'Leia as NFs antes de salvar') : activeBatchInvoice?.status === 'saved' ? 'NF já salva' : `Salvar ${editingInvoice ? 'Alterações' : 'NF no Sistema'}`}"
normal_label = "{isLoading ? 'Salvando...' : `Salvar ${editingInvoice ? 'Alterações' : 'NF no Sistema'}`}"
if batch_label in text:
    text = text.replace(
        batch_label,
        "{isSubmitting ? 'Salvando lote...' : isInvoiceBatch ? (batchInvoices.some(item => item.status === 'ready') ? `Salvar todas as NFs (${batchInvoices.filter(item => item.status === 'ready').length})` : 'Leia as NFs antes de salvar') : activeBatchInvoice?.status === 'saved' ? 'NF já salva' : `Salvar ${editingInvoice ? 'Alterações' : 'NF no Sistema'}`}",
        1,
    )
elif normal_label in text:
    text = text.replace(
        normal_label,
        "{isSubmitting ? 'Salvando...' : `Salvar ${editingInvoice ? 'Alterações' : 'NF no Sistema'}`}",
        1,
    )
else:
    raise RuntimeError('Submit button label anchor not found')

path.write_text(text, encoding='utf-8')
print('Fast NF updates applied successfully.')
