'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  FileText, 
  Download, 
  MoreHorizontal, 
  AlertCircle,
  CheckCircle2,
  Clock,
  ScanLine,
  X,
  Trash2,
  CreditCard,
  Building2,
  Calendar,
  Zap,
  History,
  ChevronDown,
  ArrowUpDown,
  Copy,
  MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import * as pdfjsLib from 'pdfjs-dist';
import { extractInvoiceData, ExtractionResult } from '@/lib/ai';

import { useDropzone } from 'react-dropzone';
import { uploadFile } from '@/lib/storage';
import { useAuth } from '@/lib/auth-context';
import { useSearchParams } from 'next/navigation';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.7.284/build/pdf.worker.min.mjs`;
}

async function extractTextFromPdf(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ');
      fullText += pageText + '\n';
    }
    
    return fullText;
  } catch (error: any) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(error.message || 'Estrutura do PDF inválida ou corrompida.');
  }
}



export default function NFControlPage() {
  const searchParams = useSearchParams();
  const formatCurrency = (value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') {
      return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    const numberValue = parseInt(digits) / 100;
    return numberValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const parseCurrency = (val: string | number | null | undefined): number => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    const sanitized = val.replace(/\./g, '').replace(',', '.');
    return parseFloat(sanitized) || 0;
  };

  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'pending' | 'volvo' | 'history'>(
    (searchParams.get('tab') as any) || 'pending'
  );
  const [filterNoTicket, setFilterNoTicket] = useState(
    searchParams.get('filter') === 'no-ticket'
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDeleteId, setItemToDeleteId] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null);
  const [notification, setNotification] = useState<{ title: string; message: string; type: 'error' | 'success' | 'warning' } | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [sortBy, setSortBy] = useState<'recent' | 'old' | 'value' | 'status'>('recent');
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingNext, setIsSavingNext] = useState(false);
  
  // New NF Form State
  const [activeUpload, setActiveUpload] = useState<'invoice' | 'delivery' | 'boleto'>('invoice');
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({
    supplier: '',
    date: '',
    amount: '',
    invoice_number: '',
    delivery_invoice_number: '',
    payment_date: '',
    status: 'rc_created', // Default flow start
    obs: '',
    type: 'consumo', // 'consumo' | 'ferramenta' | 'cautela'
    tool_name: '',
    quantity: '1',
    responsible_registration: '',
    order_number: '',
    ticket_number: '',
    invoice_url: '',
    delivery_invoice_url: '',
    boleto_urls: [] as string[],
    tool_code: '',
    is_volvo: false,
    branch_id: '',
    items: [] as { id: string; name: string; quantity: string; checked: boolean; existing_id?: string; in_stock?: boolean; stock_info?: string | null; code?: string }[]
  });
  const [pendingInvoiceFile, setPendingInvoiceFile] = useState<File | null>(null);
  const [pendingBoletoFiles, setPendingBoletoFiles] = useState<File[]>([]);

  const checkStockForItems = async (items: any[], branchId: string) => {
    if (!branchId) return items;
    
    const enrichedItems = await Promise.all(items.map(async (it) => {
      const { data: existingData } = await supabase
        .from('tools')
        .select('id, name, quantity_available, cautela_quantity')
        .eq('branch_id', branchId)
        .ilike('name', `%${it.name}%`)
        .limit(1);
      
      const existing = existingData?.[0];
      
      return {
        ...it,
        existing_id: existing?.id,
        in_stock: !!existing,
        stock_info: existing ? `Inv: ${existing.quantity_available + existing.cautela_quantity}` : null
      };
    }));
    
    return enrichedItems;
  };

  type NFStatus = 'rc_created' | 'waiting_order' | 'waiting_docs' | 'waiting_schedule' | 'paid';

  const calculateAutoStatus = (currentData: any): NFStatus => {
    const { order_number, invoice_number, payment_date, status, ticket_number } = currentData;

    const hasTicket = ticket_number && ticket_number.trim() !== '';
    const hasInvoice = invoice_number && invoice_number.trim() !== '';
    const hasPaymentDate = payment_date && payment_date.trim() !== '';

    // o Numero do chamado é o ultimo se tiver tá pago.
    if (hasTicket) return 'paid';

    // Jamais deve entrar como pago sem ter o chamado.
    if (status === 'paid' && !hasTicket) {
      // Se estava como 'paid' mas não tem chamado, forçamos recalculo.
    } else {
      // Se o usuário marcou com outro status manualmente no DB, ou se por algum motivo forçarmos,
      // manteremos (mas não temos field para checar isManual, então calculamos o auto status sempre que os campos-chave mudarem)
    }

    if (!order_number || order_number.trim() === '') return 'rc_created';

    const order = order_number.trim();
    // Verifica se começa com '7' (pode ser '7', '70', '700000', etc)
    const isSpecialFlow = order.startsWith('7');

    if (isSpecialFlow) {
      if (!hasInvoice) {
        // Se não tiver numero da NF então é aguardando NF e boleto (waiting_docs)
        return 'waiting_docs';
      }
      // Tem NF, mas não tem Ticket (pois hasTicket foi checado acima)
      // Se tiver data de pagamento (ou mesmo se não tiver, e já passou da NF), o status é aguardando programar
      return 'waiting_schedule';
    }

    return 'waiting_order';
  };

  const fetchData = React.useCallback(async (isManual = false) => {
    if (isManual) setIsSyncing(true);
    else setIsLoading(true);
    
    try {
      // Fetch Invoices with branch filtering for operators
      let invQuery = supabase
        .from('nfs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (user?.role === 'Operador' && user.branch_id) {
        invQuery = invQuery.eq('branch_id', user.branch_id);
      }

      const { data: invData } = await invQuery;
      if (invData) {
        // Map file_url to invoice_url for compatibility with frontend state
        const mappedData = invData.map((inv: any) => ({
          ...inv,
          invoice_url: inv.invoice_url || inv.file_url,
          boleto_urls: Array.isArray(inv.boleto_urls)
            ? inv.boleto_urls
            : inv.boleto_url
              ? [inv.boleto_url]
              : []
        }));
        setInvoices(mappedData);
      }

      // Fetch Branches
      const { data: branchesData } = await supabase
        .from('branches')
        .select('*')
        .order('name');
      
      if (branchesData) {
        setBranches(branchesData);
        // Pre-select branch
        if (user?.role === 'Operador') {
          setFormData(prev => ({ ...prev, branch_id: user.branch_id }));
        } else if (branchesData.length > 0) {
          setFormData(prev => ({ ...prev, branch_id: branchesData[0].id }));
        }
      }

      if (isManual) {
        setNotification({
          title: 'Sincronização Concluída',
          message: 'Os dados foram atualizados com sucesso.',
          type: 'success'
        });
      }
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        fetchData();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [user, fetchData]);

  const onDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const file = acceptedFiles[0];

    // Store pending file
    if (activeUpload === 'invoice') {
      setPendingInvoiceFile(file);
    } else if (activeUpload === 'delivery') {
      // For Volvo flow - usually only one remessa per line
      setFormData(prev => ({ ...prev, delivery_invoice_url: URL.createObjectURL(file) })); // Local preview only
      const url = await uploadFile(file, 'nfs');
      if (url) setFormData(prev => ({ ...prev, delivery_invoice_url: url }));
    } else {
      setPendingBoletoFiles(prev => [...prev, ...acceptedFiles]);
    }
  };

  const handleManualExtraction = async () => {
    if (!pendingInvoiceFile) return;

    setIsProcessing(true);
    const file = pendingInvoiceFile;
    const isPdf = file.type === 'application/pdf';
    
    try {
      let extractionResult: ExtractionResult | null = null;
      
      if (isPdf) {
        const text = await extractTextFromPdf(file);
        extractionResult = await extractInvoiceData({ text });
      } else {
        const reader = new FileReader();
        extractionResult = await new Promise((resolve) => {
          reader.onload = async () => {
            const base64 = reader.result as string;
            const result = await extractInvoiceData({ image: base64 });
            resolve(result);
          };
          reader.readAsDataURL(file);
        });
      }
      
      if (extractionResult) {
        const rawItems = extractionResult.items ? extractionResult.items.map((it: any, idx: number) => ({
          id: `extraction-${idx}-${Date.now()}`,
          name: it.name,
          quantity: it.quantity?.toString() || '1',
          checked: true,
          amount: formatCurrency(it.amount)
        })) : [];

        const enrichedItems = await checkStockForItems(rawItems, formData.branch_id);

        setFormData(prev => ({
          ...prev,
          supplier: extractionResult.supplierName || prev.supplier,
          date: extractionResult.date || prev.date,
          amount: (extractionResult.amount !== null && extractionResult.amount !== undefined) 
            ? formatCurrency(extractionResult.amount) 
            : prev.amount,
          invoice_number: extractionResult.invoiceNumber || prev.invoice_number,
          payment_date: extractionResult.paymentDate || prev.payment_date,
          type: extractionResult.isTool ? 'ferramenta' : prev.type,
          tool_name: extractionResult.toolName || (extractionResult.items && extractionResult.items.length > 0 ? extractionResult.items[0].name : prev.tool_name),
          quantity: extractionResult.quantity?.toString() || (extractionResult.items && extractionResult.items.length > 0 ? extractionResult.items[0].quantity?.toString() : prev.quantity),
          items: enrichedItems
        }));

        setNotification({
          title: 'Extração Concluída',
          message: 'Os dados da nota foram importados com sucesso para o formulário.',
          type: 'success'
        });
      }
    } catch (error: any) {
      console.error("Erro na extração AXEL:", error);
      setNotification({
        title: 'Erro na Extração',
        message: error.message || 'Não foi possível ler os dados da nota automaticamente.',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'image/*': ['.jpeg', '.jpg', '.png'], 'application/pdf': ['.pdf'] },
    multiple: activeUpload === 'boleto' 
  });

  const syncToInventory = async (invoiceData: any) => {
    if ((invoiceData.type === 'ferramenta' || invoiceData.type === 'cautela') && invoiceData.status === 'paid' && !invoiceData.inventory_synced) {
      const branch = branches.find(b => b.id === invoiceData.branch_id);
      
      const qty = parseInt(invoiceData.quantity) || 1;
      
      // Check if tool already exists by code and branch
      const { data: existingTool } = await supabase
        .from('tools')
        .select('id, quantity_available, cautela_quantity')
        .eq('code', invoiceData.tool_code)
        .eq('branch_id', invoiceData.branch_id)
        .single();
      
      if (existingTool) {
        const updatePayload: any = {};
        if (invoiceData.type === 'ferramenta') {
          updatePayload.quantity_available = (existingTool.quantity_available || 0) + qty;
        } else if (invoiceData.type === 'cautela') {
          updatePayload.cautela_quantity = (existingTool.cautela_quantity || 0) + qty;
        }
        
        await supabase
          .from('tools')
          .update(updatePayload)
          .eq('id', existingTool.id);
      } else {
        const stableSuffix = invoiceData.id ? invoiceData.id.split('-').pop()?.slice(0, 4) : Math.floor(1000 + 5555); // fallback if no ID
        const toolCode = invoiceData.tool_code || (invoiceData.is_volvo ? `VOL-${stableSuffix}` : `GEN-${stableSuffix}`);
        const newTool = {
          name: invoiceData.tool_name || `${invoiceData.supplier} - NF ${invoiceData.invoice_number}`,
          code: toolCode,
          branch: branch?.name || '',
          branch_id: invoiceData.branch_id,
          quantity_available: invoiceData.type === 'ferramenta' ? qty : 0,
          cautela_quantity: invoiceData.type === 'cautela' ? qty : 0,
          image_url: invoiceData.invoice_url?.toLowerCase().endsWith('.pdf') ? null : invoiceData.invoice_url
        };
        await supabase.from('tools').insert([newTool]);
      }

      // Mark as synced
      await supabase.from('nfs').update({ inventory_synced: true }).eq('id', invoiceData.id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // 0. Duplicate Check
    if (formData.invoice_number && formData.supplier) {
      let query = supabase
        .from('nfs')
        .select('id')
        .eq('invoice_number', formData.invoice_number)
        .eq('supplier', formData.supplier);
      
      if (editingInvoice) {
        query = query.neq('id', editingInvoice.id);
      }
      
      const { data: existingNF } = await query;
      if (existingNF && existingNF.length > 0) {
        setNotification({
          title: 'Duplicidade Detectada',
          message: `Atenção: Já existe uma Nota Fiscal com o número ${formData.invoice_number} para o fornecedor ${formData.supplier}.`,
          type: 'warning'
        });
        setIsLoading(false);
        return;
      }
    }

    // 1. Upload Pending Files
    let finalInvoiceUrl = formData.invoice_url;
    let finalBoletoUrls = [...formData.boleto_urls];

    try {
      if (pendingInvoiceFile) {
        const url = await uploadFile(pendingInvoiceFile, 'nfs');
        if (url) finalInvoiceUrl = url;
      }

      if (pendingBoletoFiles.length > 0) {
        const uploadPromises = pendingBoletoFiles.map(file => uploadFile(file, 'nfs'));
        const urls = await Promise.all(uploadPromises);
        finalBoletoUrls = [...finalBoletoUrls, ...urls.filter(Boolean) as string[]];
      }

      const cleanAmount = parseCurrency(formData.amount);

      // 2. Prepare Payloads
      const itemsToProcess = formData.items && formData.items.length > 0 
        ? formData.items.filter(it => it.checked) 
        : [];

      const groupId = editingInvoice?.group_id || crypto.randomUUID();
      const basePayloadTemplate = {
        supplier: formData.supplier,
        date: formData.date || null,
        amount: cleanAmount,
        invoice_number: formData.invoice_number,
        delivery_invoice_number: formData.delivery_invoice_number,
        payment_date: formData.payment_date || null,
        status: formData.status,
        ticket_number: formData.ticket_number || null,
        obs: formData.obs,
        type: formData.type,
        is_tool: formData.type === 'ferramenta' || formData.type === 'cautela',
        file_url: finalInvoiceUrl,
        delivery_invoice_url: formData.delivery_invoice_url,
        boleto_url: finalBoletoUrls.length > 0 ? finalBoletoUrls[0] : null,
        boleto_urls: finalBoletoUrls,
        is_volvo: formData.is_volvo,
        branch_id: formData.branch_id,
        order_number: formData.order_number,
        responsible_registration: formData.responsible_registration,
        group_id: groupId
      };

      if (editingInvoice) {
        // 1. Update the specific record being edited
        const { error: updateError } = await supabase
          .from('nfs')
          .update({
            ...basePayloadTemplate,
            tool_name: formData.tool_name,
            quantity: parseInt(formData.quantity) || 1,
            tool_code: formData.tool_code
          })
          .eq('id', editingInvoice.id);
        
        if (updateError) throw updateError;

        // 2. Update other rows in the grid if they were modified
        const itemsWithIds = formData.items.filter(it => it.id && !it.id.toString().startsWith('extraction-') && !it.id.toString().startsWith('new-'));
        if (itemsWithIds.length > 0) {
          for (const it of itemsWithIds) {
            if (it.id === editingInvoice.id) continue;

            const itAmount = (it as any).amount;
            const cleanItAmount = parseCurrency(itAmount);

            await supabase.from('nfs').update({
              amount: cleanItAmount,
              tool_name: it.name,
              quantity: parseInt(it.quantity) || 1,
              tool_code: (it as any).code || ''
            }).eq('id', it.id);
          }
        }

        // 3. Insert NEW rows added to the grid during editing
        const newItemsInGrid = formData.items.filter(it => it.checked && (!it.id || it.id.toString().startsWith('extraction-') || it.id.toString().startsWith('new-')));
        if (newItemsInGrid.length > 0) {
          const newPayloads = newItemsInGrid.map(it => {
            const itAmount = (it as any).amount;
            const cleanItAmount = itAmount && itAmount !== '' && itAmount !== '0,00' ? parseCurrency(itAmount) : cleanAmount;
            return {
              ...basePayloadTemplate,
              tool_name: it.name,
              quantity: parseInt(it.quantity) || 1,
              tool_code: (it as any).code || formData.tool_code,
              amount: cleanItAmount
            };
          });
          await supabase.from('nfs').insert(newPayloads);
        }

        // 4. If it's part of a group, sync shared fields to siblings
        if (editingInvoice.group_id) {
          const sharedFields = {
            supplier: formData.supplier,
            date: formData.date || null,
            order_number: formData.order_number,
            branch_id: formData.branch_id,
            type: formData.type,
            status: formData.status,
            payment_date: formData.payment_date || null,
            obs: formData.obs,
            is_volvo: formData.is_volvo,
            responsible_registration: formData.responsible_registration,
            file_url: finalInvoiceUrl,
            delivery_invoice_url: formData.delivery_invoice_url,
            boleto_urls: finalBoletoUrls,
            boleto_url: finalBoletoUrls.length > 0 ? finalBoletoUrls[0] : null
          };

          const { error: syncError } = await supabase
            .from('nfs')
            .update(sharedFields)
            .eq('group_id', editingInvoice.group_id)
            .neq('id', editingInvoice.id);
          
          if (syncError) console.error("Error syncing group fields:", syncError);
        }

        // 3. Update other rows in the grid if they were modified?
        // This would require iterating through formData.items and checking if they differ from DB.
        // For now, the user requested that the order_number syncs, which the above handles.

        setIsModalOpen(false);
        setEditingInvoice(null);
      } else {
        // CREATE FLOW
        if (itemsToProcess.length > 0 && formData.type === 'ferramenta' && !formData.is_volvo) {
          const payloads = itemsToProcess.map((it) => {
            const itemAmount = (it as any).amount;
            const cleanItemAmount = (itemAmount && itemAmount !== '0,00' && itemAmount !== '') ? parseCurrency(itemAmount) : cleanAmount;

            const itemTicketNumber = (it as any).ticket_number || formData.ticket_number || null;
            const itemInvoiceNumber = (it as any).invoice_number || formData.invoice_number;

            const tempPayload = {
              ...basePayloadTemplate,
              tool_name: it.name,
              quantity: parseInt(it.quantity) || 1,
              tool_code: (it as any).code || formData.tool_code,
              amount: cleanItemAmount,
              ticket_number: itemTicketNumber,
              invoice_number: itemInvoiceNumber,
              delivery_invoice_number: (it as any).delivery_invoice_number || formData.delivery_invoice_number
            };
            
            // Recalculate status specifically for this item
            tempPayload.status = calculateAutoStatus(tempPayload);
            
            return tempPayload;
          });

          const { data: insertedData, error: insertError } = await supabase.from('nfs').insert(payloads).select();
          if (insertError) throw insertError;

          // Sync if created as paid
          if (insertedData) {
            for (const inv of insertedData) {
              if (inv.status === 'paid') {
                await syncToInventory(inv);
              }
            }
          }
        } else {
          // Single insertion
          const singlePayload = {
            ...basePayloadTemplate,
            tool_name: formData.tool_name,
            quantity: parseInt(formData.quantity) || 1,
            tool_code: formData.tool_code
          };
          singlePayload.status = calculateAutoStatus(singlePayload);

          const { data: insertedData, error: nfInsertError } = await supabase.from('nfs').insert([singlePayload]).select();
          if (nfInsertError) throw nfInsertError;

          // Sync if created as paid
          if (insertedData?.[0]?.status === 'paid') {
            await syncToInventory(insertedData[0]);
          }
        }
      }

      // Integrate with Tools Inventory if applicable - ONLY IF PAID (Editing)
      if (formData.status === 'paid' && editingInvoice) {
          await syncToInventory({
            ...basePayloadTemplate,
            id: editingInvoice.id,
            tool_name: formData.tool_name,
            quantity: formData.quantity,
            tool_code: formData.tool_code,
            inventory_synced: editingInvoice.inventory_synced
          });
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
        setPendingInvoiceFile(null);
        setPendingBoletoFiles([]);
      } catch (error: any) {
      console.error("Erro total ao salvar:", error);
      let errorMessage = error?.message || (typeof error === 'object' ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : String(error));
      
      // Better error message for common R2 configuration issues
      if (errorMessage.includes('•') || errorMessage.includes('mask') || errorMessage.includes('ícone de olho')) {
        errorMessage = "Suas chaves do Cloudflare R2 estão incorretas (contêm pontos • ou asteriscos). Vá em 'Settings' -> 'Environment Variables' e cole os valores REAIS (clique no ícone de olho em cada segredo para ver o valor real antes de copiar).";
      }

      setNotification({
        title: 'Erro ao Salvar',
        message: errorMessage,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = async (inv: any) => {
    setEditingInvoice(inv);
    setPendingInvoiceFile(null);
    setPendingBoletoFiles([]);
    
    // Base form data from the selected row
    const baseFormData = {
      ...inv,
      supplier: inv.supplier || '',
      date: inv.date || '',
      amount: inv.amount ? formatCurrency(inv.amount) : '',
      invoice_number: inv.invoice_number || '',
      delivery_invoice_number: inv.delivery_invoice_number || '',
      payment_date: inv.payment_date || '',
      status: inv.status || 'rc_created',
      obs: inv.obs || '',
      type: inv.type || 'consumo',
      tool_name: inv.tool_name || '',
      quantity: inv.quantity?.toString() || '1',
      responsible_registration: inv.responsible_registration || '',
      order_number: inv.order_number || '',
      ticket_number: inv.ticket_number || '',
      invoice_url: inv.invoice_url || inv.file_url || '',
      delivery_invoice_url: inv.delivery_invoice_url || '',
      boleto_urls: inv.boleto_urls || (inv.boleto_url ? [inv.boleto_url] : []),
      tool_code: inv.tool_code || '',
      is_volvo: inv.is_volvo || false,
      branch_id: inv.branch_id || '',
      items: [] as any[]
    };

    setFormData(baseFormData);
    setIsModalOpen(true);

    // If it has a group_id, fetch all related lines to show in the grid
    if (inv.group_id) {
      try {
        const { data: related } = await supabase
          .from('nfs')
          .select('*')
          .eq('group_id', inv.group_id)
          .order('created_at', { ascending: true });
        
        if (related && related.length > 0) {
          setFormData(prev => ({
            ...prev,
            items: related.map(it => ({
              id: it.id, 
              name: it.tool_name || '',
              quantity: it.quantity?.toString() || '1',
              checked: true,
              code: it.tool_code || '',
              amount: it.amount ? formatCurrency(it.amount) : '',
              existing_db_id: it.id,
              ticket_number: it.ticket_number || '',
              invoice_number: it.invoice_number || '',
              delivery_invoice_number: it.delivery_invoice_number || ''
            }))
          }));
        }
      } catch (err) {
        console.error("Error fetching related items:", err);
      }
    }
  };

  const handleDuplicate = (inv: any) => {
    setEditingInvoice(null);
    setPendingInvoiceFile(null);
    setPendingBoletoFiles([]);
    setFormData({
      supplier: inv.supplier || '',
      date: inv.date || '',
      amount: inv.amount ? formatCurrency(inv.amount) : '',
      invoice_number: '',
      delivery_invoice_number: '',
      payment_date: inv.payment_date || '',
      status: 'rc_created',
      obs: inv.obs || '',
      type: inv.type || 'consumo',
      tool_name: inv.tool_name || '',
      quantity: inv.quantity?.toString() || '1',
      responsible_registration: inv.responsible_registration || '',
      order_number: inv.order_number || '',
      ticket_number: '',
      invoice_url: '',
      delivery_invoice_url: '',
      boleto_urls: [],
      tool_code: '',
      is_volvo: inv.is_volvo || false,
      branch_id: inv.branch_id || '',
      items: []
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setItemToDeleteId(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDeleteId) return;
    
    setIsLoading(true);
    const { error } = await supabase.from('nfs').delete().eq('id', itemToDeleteId);
    if (error) {
      setNotification({
        title: 'Erro na Exclusão',
        message: 'Não foi possível excluir o registro: ' + error.message,
        type: 'error'
      });
    } else {
      await fetchData();
    }
    setIsDeleteModalOpen(false);
    setItemToDeleteId(null);
    setIsLoading(false);
  };

  const handleQuickUpdate = async (id: string, field: string, value: any) => {
    setEditingCell(null);
    
    try {
      const invoice = invoices.find(inv => inv.id === id);
      if (!invoice) return;

      // Handle empty date strings - Postgres expects NULL not ""
      const finalValue = (field === 'payment_date' || field === 'date') && value === '' ? null : value;

      const updatedData = { ...invoice, [field]: finalValue };
      const updatePayload: any = { [field]: finalValue };
      
      if (field === 'status') {
         updatePayload.status = finalValue;
      } else {
         const oldCalculatedStatus = calculateAutoStatus(invoice);
         const newCalculatedStatus = calculateAutoStatus(updatedData);
         
         // Only automatically recalculate and apply if the user hadn't manually overridden the status previously
         if (invoice.status === oldCalculatedStatus && newCalculatedStatus !== invoice.status) {
             updatePayload.status = newCalculatedStatus;
         }
      }
      
      const { error } = await supabase
        .from('nfs')
        .update(updatePayload)
        .eq('id', id);
      
      if (error) throw error;

      const updatedStatus = updatePayload.status || invoice.status;

      // If status changed to paid, sync to inventory
      if (updatedStatus === 'paid' && invoice.status !== 'paid') {
        await syncToInventory({ ...updatedData, status: updatedStatus });
      }
      
      // If the field being updated is shared and the record belongs to a group, sync it
      if (invoice.group_id && ['order_number', 'supplier', 'date', 'payment_date', 'status', 'branch_id', 'type', 'responsible_registration'].includes(field)) {
        const { error: syncError } = await supabase
          .from('nfs')
          .update(updatePayload)
          .eq('group_id', invoice.group_id)
          .neq('id', id);
        
        if (syncError) console.error("Error syncing quick update to group:", syncError);
      }
      
      // Refetch to ensure all sibling records reflect the change locally
      fetchData();
    } catch (error: any) {
      console.error("Erro no quick update:", error);
      setNotification({
        title: 'Erro ao Atualizar',
        message: 'Falha na atualização rápida: ' + (error.message || JSON.stringify(error)),
        type: 'error'
      });
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    let matchesTab = true;
    if (activeTab === 'pending') {
      matchesTab = inv.status !== 'paid' && !inv.is_volvo;
    } else if (activeTab === 'volvo') {
      matchesTab = !!inv.is_volvo;
    } else if (activeTab === 'history') {
      matchesTab = inv.status === 'paid';
    }
    const matchesSearch = inv.supplier?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          inv.invoice_number?.includes(searchTerm);
    const matchesBranch = selectedBranches.length === 0 || selectedBranches.includes(inv.branch_id);
    const matchesNoTicket = filterNoTicket ? (!inv.ticket_number || inv.ticket_number.trim() === '') : true;
    return matchesTab && matchesSearch && matchesBranch && matchesNoTicket;
  }).sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';

    if (sortBy === 'recent') return dateB.localeCompare(dateA);
    if (sortBy === 'old') return dateA.localeCompare(dateB);

    if (sortBy === 'value') {
      const valA = typeof a.amount === 'number' ? a.amount : parseCurrency(a.amount);
      const valB = typeof b.amount === 'number' ? b.amount : parseCurrency(b.amount);
      return valB - valA;
    }

    if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');

    return 0;
  });

  const getStatusBadge = (status: string) => {
    const styles: any = {
      rc_created: 'bg-slate-100 text-slate-600',
      waiting_order: 'bg-blue-100 text-blue-700',
      waiting_docs: 'bg-purple-100 text-purple-700',
      waiting_schedule: 'bg-indigo-100 text-indigo-700',
      paid: 'bg-emerald-100 text-emerald-700'
    };
    const labels: any = {
      rc_created: 'Criar RC',
      waiting_order: 'Aguard. Pedido',
      waiting_docs: 'Aguard. NF/Boleto',
      waiting_schedule: 'Programar Pag.',
      paid: 'Pago'
    };
    return <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider ${styles[status]}`}>{labels[status]}</span>;
  };

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight italic uppercase">Controle Financeiro & Logístico</h1>
          <p className="text-slate-500 text-sm font-medium italic opacity-75">Gestão centralizada de NF&apos;s, Boletos e Pedidos Volvo.</p>
        </div>
        <div className="flex items-center gap-2">
            <button 
              onClick={() => fetchData(true)}
              className={`p-3 rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-indigo-600 transition-all shadow-sm active:scale-95`}
              title="Sincronizar"
            >
              <Zap size={18} className={`${isSyncing ? 'animate-pulse text-amber-500' : ''}`} strokeWidth={3} />
            </button>
        </div>
      </div>

      {/* QUICK ACTION HUB */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <motion.button 
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setFormData(prev => ({ 
                ...prev, 
                is_volvo: true,
                type: 'ferramenta',
                supplier: 'VOLVO DO BRASIL VEICULOS LTDA'
              }));
              setIsModalOpen(true);
            }}
            className="group relative overflow-hidden bg-white p-6 rounded-[2.5rem] border-2 border-amber-100 hover:border-amber-400 text-left transition-all shadow-lg shadow-amber-50"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-4">
                <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl w-fit group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <Building2 size={24} strokeWidth={3} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Logística Volvo</h3>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Lançar Pedidos e Remessas</p>
                </div>
              </div>
              <div className="p-2 bg-slate-50 rounded-full group-hover:bg-amber-50 transition-colors">
                <Plus className="text-amber-500" strokeWidth={4} />
              </div>
            </div>
            <div className="absolute right-[-20px] bottom-[-20px] opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
              <Building2 size={160} />
            </div>
          </motion.button>

          <motion.button 
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setFormData(prev => ({ ...prev, is_volvo: false, type: 'consumo' }));
              setIsModalOpen(true);
            }}
            className="group relative overflow-hidden bg-slate-900 p-6 rounded-[2.5rem] border-2 border-slate-800 text-left transition-all shadow-xl shadow-slate-200"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-4">
                <div className="p-3 bg-indigo-500 text-white rounded-2xl w-fit group-hover:bg-white group-hover:text-indigo-600 transition-colors">
                  <FileText size={24} strokeWidth={3} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tight">Geral & Consumo</h3>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Extrair NF com AXEL</p>
                </div>
              </div>
              <div className="p-2 bg-white/10 rounded-full group-hover:bg-white/20 transition-colors">
                <Plus className="text-white" strokeWidth={4} />
              </div>
            </div>
            <div className="absolute right-[-20px] bottom-[-20px] opacity-[0.05] group-hover:opacity-[0.1] transition-opacity">
              <FileText size={160} className="text-white" />
            </div>
          </motion.button>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-2.5 rounded-[1.5rem] border border-slate-200 shadow-sm">
        <div className="flex p-1 bg-slate-100 rounded-xl">
          <button 
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'pending' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Clock size={14} />
            Pendências
          </button>
          <button 
            onClick={() => setActiveTab('volvo')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'volvo' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Building2 size={14} />
            Volvo
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <History size={14} />
            Histórico
          </button>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por fornecedor ou NF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 rounded-xl text-xs transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 px-2">
          {/* Branch Filter Dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all">
              <Filter size={14} className="text-slate-400" />
              Filial {selectedBranches.length > 0 && `(${selectedBranches.length})`}
            </button>
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all max-h-60 overflow-y-auto">
               <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 p-2 mb-1 border-b border-slate-50">Filiais ({branches.length})</p>
               <div className="space-y-1">
                 {branches.map(branch => (
                   <label key={branch.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all hover:bg-slate-50 cursor-pointer text-slate-600">
                     <input 
                       type="checkbox" 
                       checked={selectedBranches.includes(branch.id)}
                       onChange={(e) => {
                         if (e.target.checked) {
                           setSelectedBranches(prev => [...prev, branch.id]);
                         } else {
                           setSelectedBranches(prev => prev.filter(id => id !== branch.id));
                         }
                       }}
                       className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                     />
                     <span className="truncate flex-1" title={branch.name}>{branch.name}</span>
                   </label>
                 ))}
                 {branches.length === 0 && (
                   <p className="text-[9px] text-slate-400 p-2 italic text-center uppercase tracking-wider font-bold">Nenhuma filial</p>
                 )}
               </div>
            </div>
          </div>

          {/* Sorting Dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all">
              <ChevronDown size={14} className="group-hover:rotate-180 transition-transform" />
              {sortBy === 'recent' ? 'Mais Recentes' : 
               sortBy === 'old' ? 'Mais Antigos' : 
               sortBy === 'value' ? 'Maior Valor' : 'Por Status'}
            </button>
            
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
               <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 p-2 mb-1 border-b border-slate-50">Ordenar por</p>
               <div className="space-y-1">
                 <button onClick={() => setSortBy('recent')} className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${sortBy === 'recent' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>Mais Recentes</button>
                 <button onClick={() => setSortBy('old')} className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${sortBy === 'old' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>Mais Antigos</button>
                 <button onClick={() => setSortBy('value')} className={`w-full text-left px-6 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${sortBy === 'value' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>Maior Valor</button>
                 <button onClick={() => setSortBy('status')} className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${sortBy === 'status' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>Status</button>
               </div>
            </div>
          </div>

          <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"><Download size={18} /></button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden w-full">
        <table className="w-full text-left border-collapse table-auto">
          <thead>
            <tr className="bg-slate-50/50 text-slate-400 text-[9px] uppercase tracking-[0.2em] font-black">
              <th className="px-3 py-3 w-[140px]">Status</th>
              <th className="px-3 py-3">Fornecedor</th>
              <th className="px-3 py-3">Data/NF</th>
              <th className="px-3 py-3">Valor</th>
              <th className="px-3 py-3">Prog. Pagamento</th>
              <th className="px-3 py-3">Pedido</th>
              <th className="px-3 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-sans">
            {isLoading ? (
               <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-black uppercase tracking-widest text-[10px] animate-pulse italic">Sincronizando Banco de Dados...</td></tr>
            ) : filteredInvoices.length === 0 ? (
               <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic font-medium">Nenhum registro encontrado.</td></tr>
            ) : filteredInvoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-indigo-50/30 transition-colors group text-xs md:text-sm border-l-4 border-transparent hover:border-indigo-400">
                <td className="px-3 py-3 w-[140px]">
                  <div className="flex flex-col gap-1">
                    {editingCell?.id === inv.id && editingCell?.field === 'status' ? (
                      <select
                        autoFocus
                        defaultValue={inv.status}
                        onBlur={(e) => handleQuickUpdate(inv.id, 'status', e.target.value)}
                        onChange={(e) => handleQuickUpdate(inv.id, 'status', e.target.value)}
                        className="text-[10px] p-1 bg-white border border-slate-200 rounded font-bold uppercase"
                      >
                        <option value="rc_created">Criar RC</option>
                        <option value="waiting_order">Aguard. Pedido</option>
                        <option value="waiting_docs">Aguard. NF/Boleto</option>
                        <option value="waiting_schedule">Programar Pag.</option>
                        <option value="paid">Pago</option>
                      </select>
                    ) : (
                      <div onClick={() => setEditingCell({ id: inv.id, field: 'status' })} className="cursor-pointer">
                        {getStatusBadge(inv.status)}
                      </div>
                    )}
                    {editingCell?.id === inv.id && editingCell?.field === 'ticket_number' ? (
                      <input
                        autoFocus
                        type="text"
                        defaultValue={inv.ticket_number || ''}
                        placeholder="Chamado"
                        onBlur={(e) => handleQuickUpdate(inv.id, 'ticket_number', e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleQuickUpdate(inv.id, 'ticket_number', (e.target as HTMLInputElement).value)}
                        className="text-[10px] font-mono p-1 border border-indigo-200 rounded w-full max-w-[100px]"
                      />
                    ) : (
                      <p onClick={() => setEditingCell({ id: inv.id, field: 'ticket_number' })} className="text-[10px] font-mono text-emerald-500 font-bold hover:text-emerald-700 cursor-pointer">
                        {inv.ticket_number ? `CH: ${inv.ticket_number}` : '+ Chamado'}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {inv.branch_id && (
                      <span className="text-[8px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full flex items-center gap-1 border border-slate-200">
                        <MapPin size={10} className="text-slate-400" /> {branches.find(b => b.id === inv.branch_id)?.name || 'Filial'}
                      </span>
                    )}
                  </div>
                  <p className="font-black text-slate-800 italic uppercase">{inv.supplier}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase truncate max-w-[200px]">{inv.obs || ''}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="text-slate-500 font-bold text-xs">{inv.date ? new Date(inv.date).toLocaleDateString('pt-BR') : '-'}</p>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {editingCell?.id === inv.id && editingCell?.field === 'invoice_numbers' ? (
                      <div className="flex flex-col gap-1">
                        <input
                          autoFocus
                          type="text"
                          defaultValue={inv.invoice_number || ''}
                          onBlur={(e) => handleQuickUpdate(inv.id, 'invoice_number', e.target.value)}
                          className="text-[10px] font-mono p-1 border border-indigo-200 rounded w-full max-w-[120px]"
                          placeholder="NF Compra"
                        />
                        <input
                          type="text"
                          defaultValue={inv.delivery_invoice_number || ''}
                          onBlur={(e) => handleQuickUpdate(inv.id, 'delivery_invoice_number', e.target.value)}
                          className="text-[10px] font-mono p-1 border border-indigo-100 rounded w-full max-w-[120px]"
                          placeholder="NF Entrega"
                        />
                      </div>
                    ) : (
                      <div onClick={() => setEditingCell({ id: inv.id, field: 'invoice_numbers' })} className="cursor-pointer">
                        <p className="text-[10px] font-mono text-slate-300 hover:text-indigo-400">
                          COM: {inv.invoice_number || '-'}
                        </p>
                        <p className="text-[10px] font-mono text-slate-300 hover:text-amber-400">
                          REM: {inv.delivery_invoice_number || '-'}
                        </p>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 font-black text-slate-900">R$ {inv.amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-3">
                  {editingCell?.id === inv.id && editingCell?.field === 'payment_date' ? (
                    <input
                      autoFocus
                      type="date"
                      defaultValue={inv.payment_date || ''}
                      onBlur={(e) => handleQuickUpdate(inv.id, 'payment_date', e.target.value)}
                      className="text-xs p-1 border border-indigo-200 rounded"
                    />
                  ) : (
                    <div onClick={() => setEditingCell({ id: inv.id, field: 'payment_date' })} className="flex items-center gap-2 text-slate-500 hover:text-indigo-500 cursor-pointer">
                      <Calendar size={14} className="text-indigo-300" />
                      <span className="text-xs font-bold text-slate-600">
                        {inv.payment_date ? new Date(inv.payment_date).toLocaleDateString('pt-BR') : '-'}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  {editingCell?.id === inv.id && editingCell?.field === 'order_number' ? (
                    <div className="flex flex-col gap-1">
                      <input
                        autoFocus
                        type="text"
                        defaultValue={inv.order_number || ''}
                        onBlur={(e) => handleQuickUpdate(inv.id, 'order_number', e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleQuickUpdate(inv.id, 'order_number', (e.target as HTMLInputElement).value)}
                        className="text-xs p-1 border border-indigo-200 rounded w-full max-w-[100px] font-mono"
                        placeholder="Pedido"
                      />
                    </div>
                  ) : (
                    <div onClick={() => setEditingCell({ id: inv.id, field: 'order_number' })} className="cursor-pointer">
                      <p className="text-xs font-mono font-bold text-indigo-400 hover:text-indigo-600">
                        {inv.order_number || '-'}
                      </p>
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {inv.invoice_url && (
                      <a 
                        href={`/api/download?url=${encodeURIComponent(inv.invoice_url)}&filename=NF_Compra_${inv.invoice_number || inv.id}.pdf`}
                        download={`NF_Compra_${inv.invoice_number || inv.id}.pdf`}
                        className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all shadow-sm flex items-center gap-1"
                        title="NF Compra"
                      >
                        <Download size={18} />
                        <span className="text-[8px] font-black">COM</span>
                      </a>
                    )}
                    {inv.delivery_invoice_url && (
                      <a 
                        href={`/api/download?url=${encodeURIComponent(inv.delivery_invoice_url)}&filename=NF_Entrega_${inv.delivery_invoice_number || inv.id}.pdf`}
                        download={`NF_Entrega_${inv.delivery_invoice_number || inv.id}.pdf`}
                        className="p-2 text-amber-500 hover:text-amber-600 hover:bg-white rounded-lg transition-all shadow-sm flex items-center gap-1"
                        title="NF Entrega"
                      >
                        <Download size={18} />
                        <span className="text-[8px] font-black">REM</span>
                      </a>
                    )}
                    {inv.boleto_urls?.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {inv.boleto_urls.map((url: string, bIdx: number) => (
                          <a
                            key={bIdx}
                            href={`/api/download?url=${encodeURIComponent(url)}&filename=Boleto_${bIdx + 1}_${inv.invoice_number || inv.id}.pdf`}
                            download={`Boleto_${bIdx + 1}_${inv.invoice_number || inv.id}.pdf`}
                            className="p-2 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all shadow-sm border border-emerald-100 flex items-center gap-1"
                            title={`Baixar Boleto ${bIdx + 1}`}
                          >
                            <Download size={16} />
                            <span className="text-[8px] font-black">B{bIdx + 1}</span>
                          </a>
                        ))}
                      </div>
                    ) : inv.boleto_url ? (
                      <a
                        href={`/api/download?url=${encodeURIComponent(inv.boleto_url)}&filename=Boleto_${inv.invoice_number || inv.id}.pdf`}
                        download={`Boleto_${inv.invoice_number || inv.id}.pdf`}
                        className="p-2 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all shadow-sm border border-emerald-100 flex items-center gap-1"
                        title="Baixar Boleto 1"
                      >
                        <Download size={16} />
                        <span className="text-[8px] font-black">B1</span>
                      </a>
                    ) : null}
                    <button 
                      onClick={() => handleDuplicate(inv)}
                      className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-white rounded-lg transition-all shadow-sm"
                      title="Duplicar para outra Linha/NF"
                    >
                      <Copy size={18} />
                    </button>
                    <button 
                      onClick={() => handleEdit(inv)}
                      className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-white rounded-lg transition-all shadow-sm"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    <button 
                      onClick={() => handleDelete(inv.id)}
                      className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all shadow-sm border border-transparent hover:border-rose-100"
                      title="Excluir Registro"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Nova NF */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-indigo-950/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row h-full max-h-[90vh]"
            >
              {/* Sidebar do Modal - Upload Area */}
              <div className="w-full md:w-1/3 bg-slate-50 p-8 border-r border-slate-200 flex flex-col">
                <div className="flex items-center gap-3 mb-8 text-indigo-600">
                  <div className="p-2 bg-indigo-100 rounded-xl">
                    <ScanLine size={24} />
                  </div>
                  <h2 className="font-black text-lg tracking-tight uppercase italic text-indigo-950">AXEL Doc Scanner</h2>
                </div>

                <div className="flex gap-2 p-1 bg-white border border-slate-200 rounded-2xl mb-6">
                   <button 
                    onClick={() => setActiveUpload('invoice')}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${activeUpload === 'invoice' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                   >
                     NF Compra
                   </button>
                   <button 
                    onClick={() => setActiveUpload('delivery')}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${activeUpload === 'delivery' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                   >
                     NF Entrega
                   </button>
                   {!formData.is_volvo && (
                     <button 
                      onClick={() => setActiveUpload('boleto')}
                      className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${activeUpload === 'boleto' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                     >
                       Boleto
                     </button>
                   )}
                </div>
                
                <div 
                  {...getRootProps()} 
                  className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all flex-1 min-h-[300px] flex flex-col items-center justify-center gap-6 ${isDragActive ? 'border-indigo-600 bg-indigo-50/50 shadow-inner' : 'border-slate-200 hover:border-indigo-400 bg-white shadow-xl hover:shadow-2xl'}`}
                >
                  <input {...getInputProps()} />
                  {isProcessing ? (
                     <div className="flex flex-col items-center gap-6">
                       <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                        className="p-6 bg-indigo-600 text-white rounded-full shadow-lg shadow-indigo-200"
                       >
                         <Zap size={32} fill="currentColor" />
                       </motion.div>
                       <p className="text-[10px] uppercase font-black text-indigo-600 animate-pulse tracking-[0.2em]">AXEL analisando registro...</p>
                     </div>
                  ) : (activeUpload === 'invoice' ? (pendingInvoiceFile || formData.invoice_url) : activeUpload === 'delivery' ? formData.delivery_invoice_url : (pendingBoletoFiles.length > 0 || formData.boleto_urls.length > 0)) ? (
                    <div className="flex flex-col items-center gap-6 text-center">
                      <div className="p-6 bg-emerald-100 text-emerald-600 rounded-full shadow-lg shadow-emerald-100">
                        <CheckCircle2 size={40} strokeWidth={3} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-emerald-800 italic tracking-tight">
                          {activeUpload === 'invoice' ? 'NF Compra' : activeUpload === 'delivery' ? 'NF Entrega' : `${pendingBoletoFiles.length + formData.boleto_urls.length} Boletos`} Anexados!
                        </p>
                        <p className="text-[9px] text-emerald-400 mt-2 uppercase font-black tracking-widest leading-loose">Aguardando Confirmação</p>
                      </div>

                      {activeUpload === 'invoice' && pendingInvoiceFile && (
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

                      <button 
                        type="button" 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          if (activeUpload === 'invoice') {
                            setPendingInvoiceFile(null);
                            setFormData(prev => ({ ...prev, invoice_url: '' }));
                          } else {
                            setPendingBoletoFiles([]);
                            setFormData(prev => ({ ...prev, boleto_urls: [] }));
                          }
                        }}
                        className="text-[9px] text-rose-500 font-black uppercase tracking-widest hover:underline"
                      >
                        Remover e trocar
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="p-6 bg-indigo-50 text-indigo-600 rounded-3xl transition-transform shadow-sm">
                        <Plus size={40} strokeWidth={3} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800 italic tracking-tight">Anexar {activeUpload === 'invoice' ? 'NF de Compra' : activeUpload === 'delivery' ? 'NF de Entrega' : 'Boleto'}</p>
                        <p className="text-[9px] text-slate-400 mt-2 uppercase font-black tracking-widest leading-loose">Arraste ou clique<br/>para selecionar o arquivo</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-8 space-y-3">
                  <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm text-[10px] font-bold">
                    <Zap size={16} className="text-amber-500 shrink-0" />
                    <span className="text-slate-500 uppercase tracking-tight leading-4">Notas fiscais são processadas via AXEL para preenchimento automático.</span>
                  </div>
                </div>
              </div>

              {/* Form Area */}
              <div className="flex-1 p-8 md:p-12 overflow-y-auto bg-white">
                <div className="flex items-center justify-between mb-10">
                   <div>
                     <h2 className="text-2xl font-black text-indigo-950 tracking-tight italic">
                        {editingInvoice ? 'Editar Registro' : 'Detalhes do Registro'}
                     </h2>
                      <div className="flex items-center gap-4 mt-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                           {editingInvoice ? `Editando ID #${editingInvoice.id.slice(0,8)}` : (formData.is_volvo ? 'Fluxo Dedicado: Logística Volvo' : 'Sincronizado com Processamento AXEL')}
                        </p>
                        {editingInvoice?.invoice_url && (
                          <a 
                            href={`/api/download?url=${encodeURIComponent(editingInvoice.invoice_url)}&filename=NF_${editingInvoice.invoice_number || editingInvoice.id.slice(0,8)}.pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[9px] font-black uppercase text-indigo-600 hover:text-indigo-800 transition-colors"
                          >
                            <Download size={10} /> NF
                          </a>
                        )}
                        {editingInvoice?.boleto_urls && editingInvoice.boleto_urls.length > 0 && editingInvoice.boleto_urls.map((url: string, bIdx: number) => (
                          <a 
                            key={bIdx}
                            href={`/api/download?url=${encodeURIComponent(url)}&filename=Boleto_${bIdx + 1}_${editingInvoice.id.slice(0,8)}.pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[9px] font-black uppercase text-rose-600 hover:text-rose-800 transition-colors"
                          >
                            <Download size={10} /> Boleto {bIdx + 1}
                          </a>
                        ))}
                      </div>
                   </div>
                   <button 
                     type="button"
                     onClick={() => {
                        setIsModalOpen(false);
                        setEditingInvoice(null);
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
                          items: [] as { id: string; name: string; quantity: string; checked: boolean }[]
                        });
                     }} 
                     className="p-2 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500 transition-colors"
                   >
                     <X size={20} />
                   </button>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Fornecedor / Razão Social</label>
                    <div className="relative">
                      <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" />
                      <input 
                        required
                        type="text" 
                        value={formData.supplier}
                        onChange={e => setFormData({...formData, supplier: e.target.value})}
                        className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-black italic tracking-tight"
                        placeholder="Nome da Empresa"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Data de Emissão</label>
                    <input 
                      type="date" 
                      value={formData.date}
                      onChange={e => setFormData({...formData, date: e.target.value})}
                      className="w-full px-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Nº do Chamado (Pagamento)</label>
                    <div className="relative">
                      <CreditCard size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" />
                      <input 
                        type="text" 
                        value={formData.ticket_number}
                        onChange={e => {
                          const val = e.target.value;
                          const nextData = {...formData, ticket_number: val};
                          const autoStatus = calculateAutoStatus(nextData);
                          setFormData({...nextData, status: autoStatus});
                        }}
                        className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-black italic tracking-tight"
                        placeholder="Ex: 55432"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                      {formData.is_volvo ? 'Nº NF de Fatura (Compra)' : 'Número da NF'}
                    </label>
                    <input 
                      type="text" 
                      value={formData.invoice_number}
                      onChange={e => {
                        const val = e.target.value;
                        const nextData = {...formData, invoice_number: val};
                        const autoStatus = calculateAutoStatus(nextData);
                        setFormData({...nextData, status: autoStatus});
                      }}
                      className="w-full px-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-mono tracking-widest"
                      placeholder="000.000.000"
                    />
                  </div>

                  {formData.is_volvo && (
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Nº NF de Entrega (Remessa)</label>
                      <input 
                        type="text" 
                        value={formData.delivery_invoice_number}
                        onChange={e => setFormData({...formData, delivery_invoice_number: e.target.value})}
                        className="w-full px-6 py-4 bg-indigo-50/30 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-mono tracking-widest"
                        placeholder="000.000.000"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Valor Total</label>
                    <div className="relative">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-indigo-300 font-black text-sm">R$</span>
                      <input 
                        type="text"
                        value={formData.amount}
                        onChange={e => {
                          const val = formatCurrency(e.target.value);
                          setFormData({...formData, amount: val});
                        }}
                        className="w-full pl-14 pr-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-base font-black text-indigo-600"
                        placeholder="0,00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Vencimento / Programação</label>
                    <input 
                      type="date" 
                      value={formData.payment_date}
                      onChange={e => {
                        const val = e.target.value;
                        const nextData = {...formData, payment_date: val};
                        const autoStatus = calculateAutoStatus(nextData);
                        setFormData({...nextData, status: autoStatus});
                      }}
                      className="w-full px-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-bold text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                      {formData.is_volvo ? 'Número do Pedido Volvo' : 'Nº do Pedido de Compra'}
                    </label>
                    <input 
                      type="text" 
                      value={formData.order_number}
                      onChange={e => {
                        const val = e.target.value;
                        const nextData = {...formData, order_number: val};
                        const autoStatus = calculateAutoStatus(nextData);
                        setFormData({...nextData, status: autoStatus});
                      }}
                      className="w-full px-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-mono"
                      placeholder={formData.is_volvo ? "Ex: 12345" : "PO-00000"}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Fluxo do Pedido</label>
                    <div className="flex gap-2">
                       <button
                        type="button"
                        onClick={() => setFormData({...formData, is_volvo: true})}
                        className={`flex-1 py-4 rounded-[1.25rem] border-2 text-[10px] font-black uppercase transition-all ${formData.is_volvo ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-md ring-2 ring-indigo-100' : 'border-slate-100 text-slate-400'}`}
                      >
                        Volvo (Logística)
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, is_volvo: false})}
                        className={`flex-1 py-4 rounded-[1.25rem] border-2 text-[10px] font-black uppercase transition-all ${!formData.is_volvo ? 'border-slate-800 bg-slate-800 text-white shadow-md' : 'border-slate-100 text-slate-400'}`}
                      >
                        Padrão (Consumo)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Filial Responsável</label>
                    <select 
                      disabled={user?.role === 'Operador'}
                      value={formData.branch_id}
                      onChange={e => setFormData({...formData, branch_id: e.target.value})}
                      className="w-full px-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-bold appearance-none cursor-pointer disabled:opacity-50"
                    >
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Status Financeiro</label>
                    <select 
                      value={formData.status}
                      onChange={e => setFormData({...formData, status: e.target.value})}
                      className="w-full px-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-bold appearance-none cursor-pointer"
                    >
                      <option value="rc_created">Criar RC</option>
                      <option value="waiting_order">Aguardando Pedido</option>
                      <option value="waiting_docs">Aguardando NF e Boleto</option>
                      <option value="waiting_schedule">Aguardando Programar</option>
                      <option value="paid">Pago</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Classificação do Item</label>
                    <div className="grid grid-cols-3 gap-3">
                       {['consumo', 'ferramenta', 'cautela'].map((t) => (
                         <button
                          key={t}
                          type="button"
                          onClick={() => setFormData({...formData, type: t})}
                          className={`py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${formData.type === t ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-md ring-4 ring-indigo-50' : 'border-slate-100 text-slate-400 hover:border-slate-200'} ${formData.is_volvo && t !== 'ferramenta' ? 'opacity-30' : ''}`}
                         >
                           {t}
                         </button>
                       ))}
                    </div>
                  </div>

                  {formData.is_volvo && (
                    <div className="md:col-span-2 space-y-4 bg-amber-50/20 p-8 rounded-[2.5rem] border border-amber-100">
                      <div className="flex items-center justify-between">
                         <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em] flex items-center gap-2">
                           <Zap size={14} fill="currentColor" /> Itens do Pedido (Linhas Volvo)
                         </p>
                         <button 
                          type="button"
                          onClick={() => setFormData(prev => ({ 
                            ...prev, 
                            items: [...prev.items, { id: `manual-${Date.now()}`, name: '', quantity: '1', checked: true, code: '' }] 
                          }))}
                          className="text-[10px] font-black text-amber-600 uppercase tracking-widest bg-white hover:bg-amber-100 px-4 py-2 rounded-xl transition-all border border-amber-200 shadow-sm"
                         >
                           + Add Linha
                         </button>
                      </div>

                      <div className="space-y-3 mt-4">
                        {formData.items.length === 0 ? (
                           <div className="flex flex-col items-center gap-4 py-10 bg-white/50 rounded-3xl border-2 border-dashed border-amber-100">
                             <Building2 size={32} className="text-amber-200" />
                             <div className="text-center">
                               <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Nenhum item adicionado</p>
                               <button 
                                type="button"
                                onClick={() => setFormData(prev => ({ 
                                  ...prev, 
                                  items: [{ id: `initial-${Date.now()}`, name: '', quantity: '1', checked: true, code: '' }] 
                                }))}
                                className="text-[9px] font-bold text-slate-400 hover:text-amber-600 uppercase mt-2 transition-colors underline underline-offset-4"
                               >
                                Clique para iniciar o pedido
                               </button>
                             </div>
                           </div>
                        ) : (
                          <div className="bg-white rounded-2xl overflow-x-auto border border-amber-100 shadow-sm">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-amber-50/50 text-[8px] font-black text-amber-400 uppercase tracking-widest">
                                  <th className="px-4 py-2 w-10 text-center">Linha</th>
                                  <th className="px-2 py-2 w-10 text-center">OK</th>
                                  <th className="px-4 py-2">Código</th>
                                  <th className="px-4 py-2">Ferramenta</th>
                                  <th className="px-4 py-2 w-16 text-center">Qtd</th>
                                  <th className="px-4 py-2">Chamado</th>
                                  <th className="px-4 py-2">NF Compra</th>
                                  <th className="px-4 py-2">NF Entrega</th>
                                  <th className="px-4 py-2 w-32">Valor (R$)</th>
                                  <th className="px-4 py-2 w-10"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-amber-50">
                                {formData.items.map((item, idx) => (
                                  <tr key={item.id} className={`transition-all ${item.checked ? 'bg-white' : 'bg-slate-50 opacity-40'}`}>
                                    <td className="px-4 py-3 text-center text-[10px] font-black text-amber-600">
                                      {idx + 1}
                                    </td>
                                    <td className="px-2 py-3 text-center">
                                      <input 
                                        type="checkbox"
                                        checked={item.checked}
                                        onChange={() => setFormData(prev => ({
                                          ...prev,
                                          items: prev.items.map(it => it.id === item.id ? { ...it, checked: !it.checked } : it)
                                        }))}
                                        className="w-4 h-4 rounded border-amber-200 text-amber-600 focus:ring-amber-500"
                                      />
                                    </td>
                                    <td className="px-2 py-3">
                                      <input 
                                        type="text" 
                                        value={(item as any).code || ''}
                                        placeholder="Cód."
                                        onChange={e => setFormData(prev => ({
                                          ...prev,
                                          items: prev.items.map(it => it.id === item.id ? { ...it, code: e.target.value } : it)
                                        }))}
                                        className="w-full bg-slate-50 border-none text-[10px] font-mono p-2 rounded-lg focus:ring-1 focus:ring-amber-500"
                                      />
                                    </td>
                                    <td className="px-2 py-3">
                                       <input 
                                        type="text" 
                                        value={item.name}
                                        placeholder="Nome da Ferramenta"
                                        onChange={e => setFormData(prev => ({
                                          ...prev,
                                          items: prev.items.map(it => it.id === item.id ? { ...it, name: e.target.value } : it)
                                        }))}
                                        className="w-full bg-slate-50 border-none text-[10px] p-2 rounded-lg focus:ring-1 focus:ring-amber-500 font-bold uppercase"
                                      />
                                    </td>
                                    <td className="px-2 py-3">
                                      <input 
                                        type="number" 
                                        value={item.quantity}
                                        onChange={e => setFormData(prev => ({
                                          ...prev,
                                          items: prev.items.map(it => it.id === item.id ? { ...it, quantity: e.target.value } : it)
                                        }))}
                                        className="w-full bg-slate-50 border-none text-[10px] font-black text-center p-2 rounded-lg focus:ring-1 focus:ring-amber-500"
                                      />
                                    </td>
                                    <td className="px-2 py-3">
                                      <input 
                                        type="text" 
                                        value={(item as any).ticket_number || ''}
                                        placeholder="Chamado"
                                        onChange={e => setFormData(prev => ({
                                          ...prev,
                                          items: prev.items.map(it => it.id === item.id ? { ...it, ticket_number: e.target.value } : it)
                                        }))}
                                        className="w-full bg-slate-50 border-none text-[10px] p-2 rounded-lg focus:ring-1 focus:ring-amber-500 font-bold"
                                      />
                                    </td>
                                    <td className="px-2 py-3">
                                      <input 
                                        type="text" 
                                        value={(item as any).invoice_number || ''}
                                        placeholder="NF Compra"
                                        onChange={e => setFormData(prev => ({
                                          ...prev,
                                          items: prev.items.map(it => it.id === item.id ? { ...it, invoice_number: e.target.value } : it)
                                        }))}
                                        className="w-full bg-slate-50 border-none text-[10px] p-2 rounded-lg focus:ring-1 focus:ring-amber-500 font-mono"
                                      />
                                    </td>
                                    <td className="px-2 py-3">
                                      <input 
                                        type="text" 
                                        value={(item as any).delivery_invoice_number || ''}
                                        placeholder="NF Entrega"
                                        onChange={e => setFormData(prev => ({
                                          ...prev,
                                          items: prev.items.map(it => it.id === item.id ? { ...it, delivery_invoice_number: e.target.value } : it)
                                        }))}
                                        className="w-full bg-slate-50 border-none text-[10px] p-2 rounded-lg focus:ring-1 focus:ring-amber-500 font-mono"
                                      />
                                    </td>
                                    <td className="px-2 py-3">
                                      <input 
                                        type="text" 
                                        value={(item as any).amount || ''}
                                        placeholder="0,00"
                                        onChange={e => {
                                          const val = formatCurrency(e.target.value);
                                          setFormData(prev => ({
                                          ...prev,
                                          items: prev.items.map(it => it.id === item.id ? { ...it, amount: val } : it)
                                        }))}}
                                        className="w-full bg-slate-50 border-none text-[10px] font-black text-amber-600 p-2 rounded-lg focus:ring-1 focus:ring-amber-500"
                                      />
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <button 
                                        type="button"
                                        onClick={() => setFormData(prev => ({
                                          ...prev,
                                          items: prev.items.filter(it => it.id !== item.id)
                                        }))}
                                        className="text-slate-300 hover:text-rose-500 transition-colors"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(formData.type === 'ferramenta' || formData.type === 'cautela') && !formData.is_volvo && (
                    <div className="md:col-span-2 space-y-4 animate-in slide-in-from-top-2 duration-300 bg-slate-50 p-6 rounded-[2rem] border border-slate-200">
                      <div className="flex items-center justify-between">
                         <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest ml-1">Linhas de Ferramentas / Itens da NF</label>
                         <button 
                          type="button"
                          onClick={() => setFormData(prev => ({ 
                            ...prev, 
                            items: [...prev.items, { id: `manual-${Date.now()}`, name: '', quantity: '1', checked: true }] 
                          }))}
                          className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:bg-white px-3 py-1.5 rounded-lg transition-all border border-transparent hover:border-indigo-100"
                         >
                           + Add Linha
                         </button>
                      </div>

                      <div className="space-y-3">
                        {formData.items.length === 0 ? (
                           <div className="flex flex-col items-center gap-4 py-6">
                             <Zap size={18} className="text-indigo-300" />
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nenhuma ferramenta detectada automaticamente</p>
                           </div>
                        ) : formData.items.map((item, idx) => (
                           <div key={item.id} className={`flex items-center gap-3 p-3 rounded-2xl bg-white border transition-all ${item.checked ? 'border-indigo-200 shadow-sm' : 'border-slate-100 opacity-50'}`}>
                             <input 
                               type="checkbox"
                               checked={item.checked}
                               onChange={() => setFormData(prev => ({
                                 ...prev,
                                 items: prev.items.map(it => it.id === item.id ? { ...it, checked: !it.checked } : it)
                               }))}
                               className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                             />
                             <div className="flex-1 flex flex-col">
                               <input 
                                 type="text" 
                                 value={item.name}
                                 placeholder="Nome da Ferramenta"
                                 onChange={e => setFormData(prev => ({
                                   ...prev,
                                   items: prev.items.map(it => it.id === item.id ? { ...it, name: e.target.value } : it)
                                 }))}
                                 className="w-full bg-transparent border-none text-[10px] font-black uppercase italic tracking-tight focus:ring-0 p-0 text-slate-700"
                               />
                               {item.in_stock && (
                                 <span className="text-[8px] font-black text-emerald-600 uppercase tracking-tighter mt-0.5">
                                   ✓ Reconhecido no Estoque {item.stock_info ? `(${item.stock_info})` : ''}
                                 </span>
                               )}
                             </div>
                             <div className="w-16">
                               <input 
                                 type="number" 
                                 value={item.quantity}
                                 onChange={e => setFormData(prev => ({
                                   ...prev,
                                   items: prev.items.map(it => it.id === item.id ? { ...it, quantity: e.target.value } : it)
                                 }))}
                                 className="w-full bg-slate-50 border-none text-[10px] font-black text-center p-1.5 rounded-lg focus:ring-1 focus:ring-indigo-500"
                               />
                             </div>
                             <button 
                               type="button"
                               onClick={() => setFormData(prev => ({
                                 ...prev,
                                 items: prev.items.filter(it => it.id !== item.id)
                               }))}
                               className="text-slate-300 hover:text-rose-500 transition-colors"
                             >
                               <Trash2 size={14} />
                             </button>
                           </div>
                        ))}
                      </div>

                      {formData.items.length === 0 && (
                        <div className="pt-2">
                          <div className="relative">
                            <Zap size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400" />
                            <input 
                              type="text" 
                              value={formData.tool_name}
                              onChange={e => setFormData({...formData, tool_name: e.target.value})}
                              className="w-full pl-12 pr-6 py-4 bg-white border-none focus:ring-4 focus:ring-indigo-100 rounded-2xl transition-all text-xs font-black italic tracking-tight"
                              placeholder="NOME DA FERRAMENTA (BACKUP)"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fallback items info HIDDEN if items list exists and has checked items */}
                  {/* (We already handled this by showing/hiding Tool Name field in original code, I will remove the old Tool Name section) */}

                  {formData.type === 'cautela' && (
                    <div className="md:col-span-2 animate-in slide-in-from-top-2 duration-300">
                      <label className="block text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2 ml-1">Matrícula do Responsável (Cautela)</label>
                      <div className="relative">
                        <CreditCard size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-400" />
                        <input 
                          required
                          type="text" 
                          value={formData.responsible_registration}
                          onChange={e => setFormData({...formData, responsible_registration: e.target.value})}
                          className="w-full pl-12 pr-6 py-4 bg-amber-50/30 border-none focus:ring-4 focus:ring-amber-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-black tracking-widest text-amber-800 placeholder:text-amber-200"
                          placeholder="DIGITE A MATRÍCULA"
                        />
                      </div>
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Observações Internas (Opcional)</label>
                    <textarea 
                      value={formData.obs}
                      onChange={e => setFormData({...formData, obs: e.target.value})}
                      className="w-full px-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-medium h-24 resize-none"
                      placeholder="Descreva detalhes ou pendências da nota..."
                    />
                  </div>

                  <div className="md:col-span-2 pt-4 flex flex-col sm:flex-row gap-3">
                    <button 
                      type="submit"
                      onClick={() => setIsSavingNext(false)}
                      disabled={isProcessing || isLoading}
                      className={`flex-1 bg-slate-900 hover:bg-indigo-600 disabled:opacity-50 text-white font-black py-5 rounded-[1.5rem] shadow-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] uppercase text-xs tracking-[0.2em] w-full`}
                    >
                      <CheckCircle2 size={24} strokeWidth={3} />
                      {isLoading ? 'Salvando...' : `Salvar ${editingInvoice ? 'Alterações' : 'NF no Sistema'}`}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Confirmação de Exclusão */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle size={32} />
              </div>
              <h2 className="text-xl font-black text-slate-900 italic uppercase mb-2">Confirmar Exclusão</h2>
              <p className="text-sm text-slate-500 font-medium mb-8">Esta ação é irreversível. Deseja realmente excluir este registro de Nota Fiscal?</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmDelete}
                  disabled={isLoading}
                  className="flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-rose-200"
                >
                  {isLoading ? 'Excluindo...' : 'Sim, Excluir'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Notification Modal */}
      <AnimatePresence>
        {notification && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNotification(null)}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl text-center"
            >
              <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6 ${
                notification.type === 'error' ? 'bg-rose-100 text-rose-600' : 
                notification.type === 'warning' ? 'bg-amber-100 text-amber-600' : 
                'bg-emerald-100 text-emerald-600'
              }`}>
                {notification.type === 'error' ? <X size={32} strokeWidth={3} /> : 
                 notification.type === 'warning' ? <AlertCircle size={32} strokeWidth={3} /> : 
                 <CheckCircle2 size={32} strokeWidth={3} />}
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight italic mb-2 uppercase">{notification.title}</h3>
              <p className="text-xs font-medium text-slate-500 mb-8 leading-relaxed italic">{notification.message}</p>
              
              <button 
                onClick={() => setNotification(null)}
                className={`w-full font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg ${
                  notification.type === 'error' ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-100' : 
                  notification.type === 'warning' ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-amber-100' : 
                  'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-100'
                }`}
              >
                Entendido
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
