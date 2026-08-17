'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { 
  Plus, 
  Search, 
  Filter, 
  Package, 
  MapPin, 
  QrCode, 
  ArrowUpRight, 
  ArrowLeftRight,
  ArrowRight,
  History,
  Zap,
  MoreHorizontal,
  LayoutGrid,
  List as ListIcon,
  ChevronRight,
  HardHat,
  Database,
  X,
  CheckCircle2,
  ClipboardCheck,
  RotateCcw,
  Camera,
  ImagePlus,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { uploadFile } from '@/lib/storage';

function getTimestamp() {
  return Date.now();
}

export default function StockPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [tools, setTools] = useState<any[]>([]);
  const [globalTools, setGlobalTools] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isFichaModalOpen, setIsFichaModalOpen] = useState(false);
  const [isQuickCheckoutModalOpen, setIsQuickCheckoutModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<any | null>(null);
  const [transferBranchId, setTransferBranchId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState(1);
  const [isTransferring, setIsTransferring] = useState(false);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [toolHolders, setToolHolders] = useState<any[]>([]);
  const [toolHistory, setToolHistory] = useState<any[]>([]);
  const [checkoutTechnician, setCheckoutTechnician] = useState<any | null>(null);
  const [checkoutType, setCheckoutType] = useState<'loan' | 'caution'>('caution');
  const [generatedCheckoutLink, setGeneratedCheckoutLink] = useState<string | null>(null);
  const [isGeneratingCheckout, setIsGeneratingCheckout] = useState(false);
  const [techSearchTerm, setTechSearchTerm] = useState('');
  const [editingTool, setEditingTool] = useState<any | null>(null);
  const [itemToDeleteId, setItemToDeleteId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [showBranchFilter, setShowBranchFilter] = useState(false);
  const [cart, setCart] = useState<any[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [pendingTools, setPendingTools] = useState<any[]>([]);

  // Foto e observação do operador — preenchidas antes de gerar o link
  const [checkoutObs, setCheckoutObs] = useState<string>('');
  const [checkoutPhoto, setCheckoutPhoto] = useState<string | null>(null);
  const [isCapturingCheckoutPhoto, setIsCapturingCheckoutPhoto] = useState(false);
  const [checkoutCameraStream, setCheckoutCameraStream] = useState<MediaStream | null>(null);
  const checkoutVideoRef = useRef<HTMLVideoElement>(null);
  const checkoutPhotoInputRef = useRef<HTMLInputElement>(null);
  const checkoutPhotoCaptureCanvasRef = useRef<HTMLCanvasElement>(null);

  const [adjustmentData, setAdjustmentData] = useState({
    type: 'gain' as 'gain' | 'loss',
    quantity: 1,
    reason: ''
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    branch: '', 
    branch_id: '',
    quantity_available: 0,
    status: 'disponivel',
    location: '',
    image_urls: [] as string[]
  });
  const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const generateCode = () => {
    const random = Math.floor(1000 + Math.random() * 9000);
    return `GEN-${random}`;
  };

  useEffect(() => {
    const fetchHoldersAndHistory = async () => {
      if (!selectedTool) {
        setToolHolders([]);
        setToolHistory([]);
        return;
      }

      try {
        const [{ data: cautelasData }, { data: historyData }, { data: handoversData }] = await Promise.all([
          supabase
            .from('cautelas')
            .select('id, user_id, type, status, created_at')
            .eq('tool_id', selectedTool.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('transactions')
            .select('*, tools(name)')
            .eq('tool_id', selectedTool.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('tool_handovers')
            .select('*')
            .eq('tool_id', selectedTool.id)
            .eq('status', 'active')
            .is('returned_at', null)
            .order('created_at', { ascending: false }),
        ]);

        setToolHistory(historyData || []);

        const normalizedRegistration = (value: any) => String(value || '').replace('#', '').trim();
        const registrations = new Set<string>();
        (cautelasData || []).forEach((row: any) => row.user_id && registrations.add(normalizedRegistration(row.user_id)));
        (historyData || []).forEach((row: any) => row.user_id && registrations.add(normalizedRegistration(row.user_id)));
        (handoversData || []).forEach((row: any) => {
          if (row.lender_registration) registrations.add(normalizedRegistration(row.lender_registration));
          if (row.borrower_registration) registrations.add(normalizedRegistration(row.borrower_registration));
          if (row.original_owner_registration) registrations.add(normalizedRegistration(row.original_owner_registration));
        });

        const userMap = new Map<string, string>();
        if (registrations.size > 0) {
          const queryIds = Array.from(registrations).flatMap(id => [id, `#${id}`]);
          const { data: people } = await supabase
            .from('users_access')
            .select('registration, name')
            .in('registration', queryIds);
          (people || []).forEach((person: any) => userMap.set(normalizedRegistration(person.registration), person.name));
        }
        const nameFor = (registration: string) => userMap.get(normalizedRegistration(registration)) || registration;
        const holders = new Map<string, any>();

        (cautelasData || [])
          .filter((row: any) => row.user_id && String(row.status || '').toLowerCase() !== 'missing')
          .forEach((row: any) => {
            const registration = normalizedRegistration(row.user_id);
            const isLoan = ['loan', 'borrow', 'emprestimo', 'empréstimo'].includes(String(row.type || '').toLowerCase());
            holders.set(registration, {
              source: 'cautela',
              user_id: row.user_id,
              registration,
              responsible_name: nameFor(registration),
              possession_name: nameFor(registration),
              raw_type: isLoan ? 'loan' : 'caution',
              type: isLoan ? 'Empréstimo' : 'Cautela',
              created_at: row.created_at,
            });
          });

        const latestByUser = new Map<string, any>();
        (historyData || []).forEach((row: any) => {
          if (!row.user_id || !['borrow', 'return'].includes(String(row.type || ''))) return;
          const registration = normalizedRegistration(row.user_id);
          if (!latestByUser.has(registration)) latestByUser.set(registration, row);
        });
        latestByUser.forEach((row: any, registration: string) => {
          if (row.type !== 'borrow' || ['cancelled', 'returned', 'pending', 'pending_signature'].includes(String(row.status || '').toLowerCase())) return;
          if (holders.has(registration)) return;
          const isCaution = String(row.obs || '').toLowerCase().includes('cautela');
          holders.set(registration, {
            source: 'transaction',
            user_id: row.user_id,
            registration,
            responsible_name: nameFor(registration),
            possession_name: nameFor(registration),
            raw_type: isCaution ? 'caution' : 'loan',
            type: isCaution ? 'Cautela' : 'Empréstimo',
            created_at: row.created_at,
          });
        });

        (handoversData || []).forEach((row: any) => {
          const borrower = normalizedRegistration(row.borrower_registration);
          const lender = normalizedRegistration(row.lender_registration);
          const owner = normalizedRegistration(row.original_owner_registration || row.lender_registration);
          const kind = String(row.handover_type || '').toLowerCase();
          if (!borrower) return;

          if (['transfer', 'loan_transfer'].includes(kind)) {
            if (lender) holders.delete(lender);
            if (owner) holders.delete(owner);
            holders.set(borrower, {
              source: 'handover',
              user_id: row.borrower_registration,
              registration: borrower,
              responsible_name: nameFor(borrower),
              possession_name: nameFor(borrower),
              raw_type: 'loan',
              type: 'Empréstimo',
              created_at: row.created_at,
              note: lender ? `Responsabilidade transferida por ${nameFor(lender)}.` : 'Responsabilidade transferida.',
            });
            return;
          }

          if (kind.includes('peer')) {
            const responsible = owner || lender;
            if (!responsible) return;
            const current = holders.get(responsible);
            holders.set(responsible, {
              source: current?.source || 'handover',
              user_id: current?.user_id || row.original_owner_registration || row.lender_registration,
              registration: responsible,
              responsible_name: nameFor(responsible),
              possession_name: nameFor(borrower),
              possession_registration: borrower,
              raw_type: 'caution',
              type: 'Cautela',
              created_at: current?.created_at || row.created_at,
              note: `Responsabilidade com ${nameFor(responsible)}; posse atual com ${nameFor(borrower)}.`,
            });
          }
        });

        setToolHolders(Array.from(holders.values()));
      } catch (err) {
        console.error('Erro ao buscar dados da ferramenta:', err);
        setToolHolders([]);
      }
    };

    if (isFichaModalOpen) {
      fetchHoldersAndHistory();
    }
  }, [selectedTool, isFichaModalOpen]);

  const handleReturnFromFicha = async (holder: any) => {
    if (!selectedTool || !user) return;
    
    if (!window.confirm(`Deseja confirmar o retorno deste item de ${holder.responsible_name}?`)) return;
    
    setIsSyncing(true);
    try {
      const { data: tool } = await supabase
        .from('tools')
        .select('quantity_available, cautela_quantity, borrowed_quantity, branch_id, branch')
        .eq('id', selectedTool.id)
        .single();
        
      if (tool) {
        const total_fisico = (tool.quantity_available || 0) + (tool.cautela_quantity || 0) + (tool.borrowed_quantity || 0);
        const isLoan = holder.raw_type === 'loan';
        const novo_cautela = isLoan ? tool.cautela_quantity : Math.max(0, (tool.cautela_quantity || 0) - 1);
        const novo_borrowed = isLoan ? Math.max(0, (tool.borrowed_quantity || 0) - 1) : tool.borrowed_quantity;
        const novo_disponivel = total_fisico - novo_cautela - novo_borrowed;

        if (novo_disponivel >= 0 && novo_disponivel <= total_fisico) {
          await supabase.from('tools').update({
            quantity_available: novo_disponivel,
            cautela_quantity: novo_cautela,
            borrowed_quantity: novo_borrowed
          }).eq('id', selectedTool.id);

          await supabase.from('cautelas').delete()
            .eq('user_id', holder.user_id)
            .eq('tool_id', selectedTool.id);

          await supabase.from('transactions').insert({
            tool_id: selectedTool.id,
            user_id: holder.user_id,
            type: 'return',
            status: 'completed',
            obs: `Devolução via estoque por ${user.name}`,
            branch_id: tool.branch_id,
            branch: tool.branch,
          });

          setSelectedTool({...selectedTool, ...tool, quantity_available: novo_disponivel, cautela_quantity: novo_cautela, borrowed_quantity: novo_borrowed});
          fetchData();
        }
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao processar devolução.");
    } finally {
      setIsSyncing(false);
    }
  }

  const fetchData = React.useCallback(async (isManual = false) => {
    if (!user) return;
    if (isManual) setIsSyncing(true);
    else setIsLoading(true);
    
    try {
      // Fetch Tools
      let toolsQuery = supabase
        .from('tools')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Se for operador, filtra apenas a filial dele
      if (user.role === 'Operador' && user.branch_id) {
        toolsQuery = toolsQuery.eq('branch_id', user.branch_id);
      }

      const { data: toolsData, error: toolsError } = await toolsQuery;
      if (toolsError) throw toolsError;
      if (toolsData) {
        console.log('DEBUG StockPage toolsData:', toolsData);
        setTools(toolsData);
        if (user.role !== 'Operador') setGlobalTools(toolsData);
      }

      // A operação normal do Operador continua limitada à sua filial, mas a busca
      // de disponibilidade precisa consultar o catálogo global, assim como o app
      // Ferramentaria. Nenhuma alteração de estoque é liberada por este carregamento.
      if (user.role === 'Operador') {
        const { data: globalToolsData, error: globalToolsError } = await supabase
          .from('tools')
          .select('*')
          .order('created_at', { ascending: false });
        if (globalToolsError) throw globalToolsError;
        setGlobalTools(globalToolsData || []);
      }

      // Fetch Branches
      const { data: branchesData, error: branchesError } = await supabase
        .from('branches')
        .select('*')
        .order('name');
      
      if (branchesError) throw branchesError;
      
      if (branchesData) {
        setBranches(branchesData);
        
        // Auto-set branch in form based on user or first branch
        if (!editingTool) {
          const defaultBranch = user.role === 'Operador' 
            ? branchesData.find(b => b.id === user.branch_id) 
            : branchesData[0];

          if (defaultBranch) {
            setFormData(prev => ({ 
              ...prev, 
              branch: defaultBranch.name,
              branch_id: defaultBranch.id 
            }));
          }
        }
      }

      // Fetch Technicians for quick checkout
      const [{ data: techData }, { data: clientEmpData }] = await Promise.all([
        supabase.from('users_access').select('*').order('name'),
        supabase.from('client_employees').select('*, clients(name)').eq('active', true).order('name'),
      ]);

      const collaborators = techData || [];
      // Normalize client employees to the same shape used by handleQuickCheckout
      const clientEmps = (clientEmpData || []).map((e: any) => ({
        ...e,
        // Use a prefixed registration so it's unique; fall back to id if blank
        registration: e.registration ? `CE-${e.registration}` : `CE-${e.id.substring(0, 8)}`,
        role: e.role || 'Funcionário Cliente',
        branch_id: null,
        _isClientEmployee: true,
        _clientName: e.clients?.name || '',
      }));

      setTechnicians([...collaborators, ...clientEmps]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [user, editingTool]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files);
    setPendingImageFiles(prev => [...prev, ...newFiles]);
    
    // Create local URLs for preview
    const newUrls = newFiles.map(f => URL.createObjectURL(f));
    setFormData(prev => ({ 
      ...prev, 
      image_urls: [...prev.image_urls, ...newUrls] 
    }));
  };

  const handleEdit = (tool: any) => {
    setEditingTool(tool);
    setFormData({
      code: tool.code,
      name: tool.name,
      branch: tool.branch,
      branch_id: tool.branch_id,
      quantity_available: tool.quantity_available,
      status: tool.status || 'disponivel',
      location: tool.location || '',
      image_urls: tool.image_urls || (tool.image_url ? [tool.image_url] : [])
    });
    setIsModalOpen(true);
    setActiveMenuId(null);
  };

  const handleDeleteClick = (id: string) => {
    setItemToDeleteId(id);
    setIsDeleteModalOpen(true);
    setActiveMenuId(null);
  };

  const confirmDelete = async () => {
    if (!itemToDeleteId) return;
    setIsLoading(true);
    
    try {
      const toolToDelete = tools.find(t => t.id === itemToDeleteId);
      
      const { error } = await supabase.from('tools').delete().eq('id', itemToDeleteId);
      
      if (error) {
        throw error;
      }

      if (toolToDelete?.image_url) {
        const { deleteFile } = await import('@/lib/storage');
        await deleteFile(toolToDelete.image_url);
      }
      setIsDeleteModalOpen(false);
      setItemToDeleteId(null);
      fetchData();
      alert('Ferramenta excluída com sucesso!');
    } catch (error: any) {
      console.error('Erro ao excluir:', error);
      alert(`Erro ao excluir: ${error.message || 'Verifique se existem movimentações vinculadas a esta ferramenta.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const addToQueue = () => {
    if (!formData.name) {
      alert("Nome da ferramenta é obrigatório.");
      return;
    }
    setPendingTools(prev => [...prev, { 
      ...formData, 
      id: Math.random().toString(36).substring(7), // Temp ID for list
      tempFiles: [...pendingImageFiles] 
    }]);
    
    // Reset but keep branch and location
    setFormData({
      ...formData,
      code: '',
      name: '',
      quantity_available: 1,
      image_urls: [],
      location: formData.location
    });
    setPendingImageFiles([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const toolsToSave = editingTool 
        ? [{ ...formData, id: editingTool.id, tempFiles: pendingImageFiles }] 
        : (pendingTools.length > 0 
            ? [...pendingTools, { ...formData, tempFiles: pendingImageFiles }] 
            : [{ ...formData, tempFiles: pendingImageFiles }]);

      for (const item of toolsToSave) {
        let finalImageUrls = (item.image_urls || []).filter((url: string) => !url.startsWith('blob:'));
        
        if (item.tempFiles && item.tempFiles.length > 0) {
          setIsUploading(true);
          const uploadPromises = item.tempFiles.map((file: File) => uploadFile(file, 'ferramentas'));
          const uploadedUrls = await Promise.all(uploadPromises);
          finalImageUrls = [...finalImageUrls, ...uploadedUrls.filter((url): url is string => url !== null)];
          setIsUploading(false);
        }
        
        const payload = {
          name: item.name,
          code: item.code || generateCode(),
          branch: item.branch,
          branch_id: item.branch_id,
          image_url: finalImageUrls[0] || null, // Fallback for existing apps
          image_urls: finalImageUrls,
          quantity_available: item.quantity_available || 1,
          status: item.status || 'disponivel',
          location: item.location || null
        };

        if (editingTool && item.id === editingTool.id) {
          const { error } = await supabase
            .from('tools')
            .update(payload)
            .eq('id', editingTool.id);
          if (error) throw error;
        } else {
          // Check if a tool with the same code and branch already exists
          const { data: existingTool, error: fetchError } = await supabase
            .from('tools')
            .select('*')
            .eq('code', payload.code)
            .eq('branch_id', payload.branch_id)
            .maybeSingle();

          if (fetchError) throw fetchError;

          if (existingTool) {
            // Tool exists in this branch, update its quantity
            const newQuantityAvailable = (existingTool.quantity_available || 0) + payload.quantity_available;

            const { error: updateError } = await supabase
              .from('tools')
              .update({
                quantity_available: newQuantityAvailable
              })
              .eq('id', existingTool.id);
            if (updateError) throw updateError;
          } else {
            const { error } = await supabase.from('tools').insert([{
              ...payload,
              cautela_quantity: 0,
              borrowed_quantity: 0
            }]);
            if (error) throw error;
          }
        }
      }
      
      setIsModalOpen(false);
      setEditingTool(null);
      setPendingTools([]);
      setPendingImageFiles([]);
      fetchData();
      alert(editingTool ? 'Ferramenta atualizada!' : 'Ferramenta(s) cadastrada(s) com sucesso!');

      // Reset form
      const defaultBranch = user?.role === 'Operador'
        ? branches.find(b => b.id === user.branch_id)
        : branches[0];

      setFormData({
        code: '',
        name: '',
        branch: defaultBranch?.name || '',
        branch_id: defaultBranch?.id || '',
        quantity_available: 1,
        status: 'disponivel',
        location: '',
        image_urls: []
      });

    } catch (error: any) {
      console.error('Erro no cadastro/edição:', error);
      alert(`Erro ao salvar: ${error.message}`);
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
  };

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTool || !user) return;

    const newQuantity = adjustmentData.type === 'gain' 
      ? selectedTool.quantity_available + adjustmentData.quantity
      : Math.max(0, selectedTool.quantity_available - adjustmentData.quantity);

    // Update tool stock
    const { error: updateError } = await supabase
      .from('tools')
      .update({ quantity_available: newQuantity })
      .eq('id', selectedTool.id);

    if (!updateError) {
      // Log transaction for audit
      await supabase.from('transactions').insert([{
        tool_id: selectedTool.id,
        user_id: user.registration,
        type: `adjustment_${adjustmentData.type}`,
        quantity: adjustmentData.quantity,
        obs: `Ajuste manual: ${adjustmentData.reason}`,
        branch: selectedTool.branch,
        branch_id: selectedTool.branch_id,
        status: 'pending_audit'
      }]);

      setIsAdjustmentModalOpen(false);
      setAdjustmentData({ type: 'gain', quantity: 1, reason: '' });
      fetchData();
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTool || !user || !transferBranchId) return;

    if (transferQuantity <= 0 || transferQuantity > selectedTool.quantity_available) {
      alert(`Quantidade inválida. Disponível: ${selectedTool.quantity_available}`);
      return;
    }

    setIsTransferring(true);
    try {
      const targetBranch = branches.find(b => b.id === transferBranchId);
      if (!targetBranch) throw new Error("Filial destino não encontrada");

      // 1. Check if tool exists in target branch
      const { data: targetTool, error: fetchError } = await supabase
        .from('tools')
        .select('*')
        .eq('code', selectedTool.code)
        .eq('branch_id', transferBranchId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (targetTool) {
        // Update existing tool in target branch
        await supabase
          .from('tools')
          .update({
            quantity_available: (targetTool.quantity_available || 0) + transferQuantity
          })
          .eq('id', targetTool.id);
      } else {
        // Create new tool in target branch
        const { error: insertError } = await supabase
          .from('tools')
          .insert([{
            ...selectedTool,
            id: undefined, // Let Supabase generate a new ID
            branch_id: transferBranchId,
            branch: targetBranch.name,
            quantity_available: transferQuantity,
            cautela_quantity: 0,
            borrowed_quantity: 0,
            created_at: undefined,
            updated_at: undefined
          }]);
        if (insertError) throw insertError;
      }

      // 2. Decrement from source tool
      await supabase
        .from('tools')
        .update({
          quantity_available: selectedTool.quantity_available - transferQuantity
        })
        .eq('id', selectedTool.id);

      // 3. Log transaction
      await supabase.from('transactions').insert([{
        tool_id: selectedTool.id,
        user_id: user.registration,
        type: 'transfer',
        quantity: transferQuantity,
        obs: `Empréstimo/Transferência para filial ${targetBranch.name}`,
        branch: selectedTool.branch,
        branch_id: selectedTool.branch_id,
        status: 'completed'
      }]);

      setIsTransferModalOpen(false);
      setTransferBranchId('');
      setTransferQuantity(1);
      fetchData();
      alert(`Transferência de ${transferQuantity} item(ns) realizada com sucesso!`);
    } catch (err: any) {
      console.error("Erro na transferência:", err);
      alert(`Erro ao transferir: ${err.message}`);
    } finally {
      setIsTransferring(false);
    }
  };

  const hasGlobalSearch = searchTerm.trim().length > 0;
  const searchSource = hasGlobalSearch ? (globalTools.length > 0 ? globalTools : tools) : tools;
  const searchLower = searchTerm.trim().toLowerCase();
  const searchCompact = searchLower.replace(/[^a-z0-9]/g, '');
  const filteredTools = searchSource.filter(tool => {
    const codeCompact = String(tool.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchesSearch = !hasGlobalSearch ||
                         tool.name?.toLowerCase().includes(searchLower) ||
                         tool.code?.toLowerCase().includes(searchLower) ||
                         (searchCompact && codeCompact.includes(searchCompact)) ||
                         tool.branch?.toLowerCase().includes(searchLower) ||
                         tool.location?.toLowerCase().includes(searchLower);

    // Quando existe termo de busca, a resposta é global por definição. O filtro
    // de filial continua valendo normalmente quando a busca está vazia.
    const matchesBranch = hasGlobalSearch || selectedBranchIds.length === 0 || selectedBranchIds.includes(tool.branch_id);

    return matchesSearch && matchesBranch;
  });

  const startCheckoutCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setCheckoutCameraStream(stream);
      setIsCapturingCheckoutPhoto(true);
      setTimeout(() => {
        if (checkoutVideoRef.current) {
          checkoutVideoRef.current.srcObject = stream;
          checkoutVideoRef.current.play();
        }
      }, 100);
    } catch {
      checkoutPhotoInputRef.current?.click();
    }
  };

  const captureCheckoutPhoto = () => {
    if (!checkoutVideoRef.current || !checkoutPhotoCaptureCanvasRef.current) return;
    const video = checkoutVideoRef.current;
    const canvas = checkoutPhotoCaptureCanvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setCheckoutPhoto(canvas.toDataURL('image/jpeg', 0.85));
    stopCheckoutCamera();
  };

  const stopCheckoutCamera = () => {
    if (checkoutCameraStream) {
      checkoutCameraStream.getTracks().forEach(t => t.stop());
      setCheckoutCameraStream(null);
    }
    setIsCapturingCheckoutPhoto(false);
  };

  const handleCheckoutPhotoFromGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCheckoutPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleQuickCheckout = async (techParam?: any) => {
    // If techParam is an event (from clicking the main button), ignore it and use checkoutTechnician
    const targetTech = (techParam && techParam.registration) ? techParam : checkoutTechnician;
    const itemsToCheckout = selectedTool ? [selectedTool] : cart;

    console.log('Starting Quick Checkout:', {
      targetTech: targetTech?.name,
      itemsCount: itemsToCheckout.length,
      checkoutType
    });

    if (itemsToCheckout.length === 0) {
      console.warn('No items to checkout');
      return;
    }
    if (!targetTech) {
      console.warn('No technician selected');
      return;
    }
    if (!user) {
      console.warn('No operator user found');
      return;
    }
    
    setIsGeneratingCheckout(true);
    if (techParam && techParam.registration) setCheckoutTechnician(techParam);

    try {
      // 0. Upload foto se houver
      let finalPhotoUrl: string | null = checkoutPhoto;
      if (checkoutPhoto) {
        try {
          const photoRes = await fetch('/api/upload-tool-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photo: checkoutPhoto, auditId: `stock-${getTimestamp()}` }),
          });
          if (photoRes.ok) {
            const { url } = await photoRes.json();
            if (url) finalPhotoUrl = url;
          }
        } catch { /* mantém base64 como fallback */ }
      }

      // 1. Create a PENDING audit header
      const auditPayload = {
        user_id: String(targetTech.registration || "").trim(),
        branch_id: itemsToCheckout[0].branch_id || user.branch_id || null, 
        status: 'pending',
        type: checkoutType,
        operator_id: user.registration,
        check_date: new Date().toISOString(),
        obs: checkoutObs.trim() || null,
        tool_photo_url: finalPhotoUrl || null,
      };

      console.log('Creating audit audit header...', auditPayload);

      const { data: audit, error: auditError } = await supabase
        .from('cautelia_audits')
        .insert(auditPayload)
        .select()
        .single();
      
      if (auditError) {
        console.error('Audit header creation error:', auditError);
        throw auditError;
      }

      // 2. Create Audit Items
      const auditItems = itemsToCheckout.map(item => ({
        audit_id: audit.id,
        stock_tool_id: item.id,
        status: 'ok',
        quantity: 1,
        obs: `Gerado via Estoque (${checkoutType === 'caution' ? 'Cautela' : 'Empréstimo'})`
      }));

      console.log('Creating audit items:', auditItems);

      const { error: itemsError } = await supabase
        .from('cautelia_audit_items')
        .insert(auditItems);
      
      if (itemsError) {
        console.error('Audit items creation error:', itemsError);
        throw itemsError;
      }

      const link = `${window.location.origin}/assinatura/${audit.id}`;
      
      // 3. Create Pending Transactions
      const transactions = itemsToCheckout.map(item => ({
        tool_id: item.id,
        user_id: String(targetTech.registration || "").trim(),
        type: checkoutType,
        quantity: 1,
        branch: item.branch || '',
        branch_id: item.branch_id || null,
        status: 'pending_signature',
        obs: `Retirada via Estoque - Aguardando assinatura (${checkoutType === 'caution' ? 'Cautela' : 'Empréstimo'})`
      }));

      await supabase.from('transactions').insert(transactions);

      console.log('Checkout link generated:', link);
      setGeneratedCheckoutLink(link);
      setCheckoutObs('');
      setCheckoutPhoto(null);
      
      // Clear cart on success if it was a cart checkout
      if (!selectedTool) {
        console.log('Clearing cart after successful checkout');
        setCart([]);
      }
    } catch (err: any) {
      console.error('Exception in handleQuickCheckout:', err);
      
      let errorMessage = "Erro desconhecido";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        errorMessage = err.message || err.details || err.hint || JSON.stringify(err);
      } else {
        errorMessage = String(err);
      }

      if (errorMessage === "{}" || errorMessage.includes("PGRST116")) {
        errorMessage = "Falha na resposta do banco de dados. Verifique se as tabelas e permissões RLS estão corretas.";
      }

      alert(`Erro ao gerar checkout: ${errorMessage}`);
    } finally {
      setIsGeneratingCheckout(false);
    }
  };

  const addToCart = (tool: any) => {
    if (cart.some(item => item.id === tool.id)) {
      setCart(cart.filter(item => item.id !== tool.id));
      return;
    }
    setCart([...cart, tool]);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 lg:px-10 py-8 space-y-8 font-sans pb-32">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight italic uppercase">Estoque de Ferramentas</h1>
          <p className="text-slate-500 text-sm font-medium italic opacity-75">Controle centralizado de patrimônio e disponibilidade estratégica.</p>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button 
            onClick={() => fetchData(true)}
            className={`p-3 rounded-2xl border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm active:scale-95 flex items-center justify-center`}
            title="Sincronizar Dados"
          >
            <Zap size={18} className={`${isSyncing ? 'animate-pulse text-amber-500' : ''}`} strokeWidth={3} />
          </button>
          {user?.role === 'Administrador' && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-indigo-100 transition-all active:scale-95"
            >
              <Plus size={18} strokeWidth={3} />
              Cadastrar Ferramenta
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-2.5 rounded-[1.5rem] border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-md group">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text"
            placeholder="Buscar ferramentas, códigos ou filiais..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white focus:ring-0 rounded-2xl text-[11px] transition-all font-black uppercase tracking-wider text-slate-700 placeholder:text-slate-300 placeholder:font-bold"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-lg text-slate-400"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 px-2 relative">
          {(searchTerm || selectedBranchIds.length > 0) && (
            <button 
              onClick={() => { setSearchTerm(''); setSelectedBranchIds([]); }}
              className="text-[10px] font-black text-rose-500 hover:text-rose-600 transition-colors uppercase tracking-widest bg-rose-50 px-3 py-2 rounded-lg"
            >
              Limpar
            </button>
          )}
          <div className="text-[10px] font-black text-slate-300 tracking-widest uppercase mr-4 hidden lg:block">
            {filteredTools.length} / {searchSource.length} itens
          </div>
          {hasGlobalSearch && (
            <div className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-lg uppercase tracking-widest whitespace-nowrap">
              Busca global · todas as filiais
            </div>
          )}
          {user?.role === 'Administrador' && (
            <button 
              onClick={async () => {
                // Note: Removed confirm() due to sandbox limitations
                
                // Get all caution transactions
                const { data: cautelasList } = await supabase.from('cautelas').select('tool_id');
                const toolIdsToFix = [...new Set(cautelasList?.map(c => c.tool_id))];

                for (const toolId of toolIdsToFix) {
                  const { data: tool } = await supabase.from('tools').select('id, borrowed_quantity, cautela_quantity, quantity_available').eq('id', toolId).maybeSingle();
                  if (!tool) continue;

                  // Get actual active caution transactions
                  const { data: activeCautelas, error: transError } = await supabase
                    .from('transactions')
                    .select('id, type, status')
                    .eq('tool_id', toolId);
                  
                  console.log('DEBUG: Transactions for tool:', toolId, activeCautelas, transError);
                  
                  const activeCautionList = activeCautelas?.filter(t => t.type === 'caution' && t.status === 'active') || [];
                  const actualCautionCount = activeCautionList.length;

                  // Update tool assuming borrowed_quantity was incorrect and should be lower or recalibrated
                  await supabase.from('tools').update({
                    cautela_quantity: actualCautionCount,
                    borrowed_quantity: Math.max(0, (tool.borrowed_quantity || 0) - actualCautionCount)
                  }).eq('id', toolId);
                }
                
                console.log('Saldos de cautela corrigidos!');
                fetchData();
              }}
              className="bg-rose-600 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest mr-4"
            >
              Corrigir Cautelas
            </button>
          )}
          <div className="flex p-1 bg-slate-100 rounded-lg mr-2">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm font-black' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm font-black' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <ListIcon size={18} />
            </button>
          </div>
          <div className="relative">
            <button 
              onClick={() => setShowBranchFilter(!showBranchFilter)}
              className={`p-2 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-wider transition-all ${selectedBranchIds.length > 0 ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <Filter size={16} strokeWidth={2.5} /> 
              {selectedBranchIds.length === 0 ? 'Filiais' : `${selectedBranchIds.length} selecionada(s)`}
            </button>

            <AnimatePresence>
              {showBranchFilter && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowBranchFilter(false)} />
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden"
                  >
                    <div className="p-2 max-h-60 overflow-y-auto custom-scrollbar">
                      <button 
                        onClick={() => { setSelectedBranchIds([]); setShowBranchFilter(false); }}
                        className={`w-full px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${selectedBranchIds.length === 0 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        Todas as Filiais
                      </button>
                      {branches.map(branch => (
                        <button 
                          key={branch.id}
                          onClick={() => {
                            setSelectedBranchIds(prev => {
                              if (prev.includes(branch.id)) {
                                return prev.filter(id => id !== branch.id);
                              }
                              return [...prev, branch.id];
                            });
                          }}
                          className={`w-full px-4 py-3 flex justify-between items-center text-left text-[10px] font-black uppercase tracking-widest rounded-xl transition-all mt-1 ${selectedBranchIds.includes(branch.id) ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                          {branch.name}
                          {selectedBranchIds.includes(branch.id) && (
                            <CheckCircle2 size={16} strokeWidth={3} className="text-indigo-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Tools List */}
      {isLoading ? (
         <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
               <Database size={40} className="text-emerald-500" />
            </motion.div>
            <p className="font-bold text-slate-400 italic">Sincronizando estoque...</p>
         </div>
      ) : selectedBranchIds.length === 0 && user?.role !== 'Operador' && !hasGlobalSearch ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-16 text-center">
           <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
             <MapPin size={32} />
           </div>
           <h3 className="font-black text-slate-900 text-lg uppercase italic">Selecione uma Filial</h3>
           <p className="text-slate-400 mt-2 font-medium">Selecione a filial acima para visualizar e gerenciar o estoque desta unidade.</p>
           <div className="flex flex-wrap justify-center gap-2 mt-8">
              {branches.map(b => (
                <button 
                  key={b.id}
                  onClick={() => setSelectedBranchIds([b.id])}
                  className="px-4 py-2 bg-slate-50 hover:bg-indigo-600 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-100"
                >
                  {b.name}
                </button>
              ))}
           </div>
        </div>
      ) : filteredTools.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-16 text-center">
           <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
             <Package size={32} />
           </div>
           <h3 className="font-bold text-slate-700 text-lg">Nenhuma ferramenta encontrada</h3>
           <p className="text-slate-400 mt-2">Tente ajustar sua busca ou cadastre um novo item.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredTools.map((tool, i) => (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -8 }}
              onClick={() => {
                setSelectedTool(tool);
                setIsFichaModalOpen(true);
              }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-xl group overflow-hidden cursor-pointer"
            >
              <div className="h-48 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                {(tool.image_urls && tool.image_urls.length > 0) || tool.image_url ? (
                   <Image 
                    src={tool.image_urls?.[0] || tool.image_url} 
                    alt={tool.name} 
                    fill 
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover group-hover:scale-110 transition-transform duration-500" 
                    referrerPolicy="no-referrer"
                    unoptimized
                   />
                ) : (
                   <Package size={48} className="text-slate-300 group-hover:scale-110 transition-transform duration-500" />
                )}
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-2.5 py-1.5 rounded-xl text-[9px] font-black text-slate-600 shadow-md flex items-center gap-1.5 uppercase tracking-widest z-10">
                  <QrCode size={12} className="text-indigo-500" /> {tool.code}
                </div>
                
                {tool.status && tool.status !== 'disponivel' && (
                  <div className="absolute top-4 left-24 bg-rose-500 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest z-10 shadow-lg italic">
                    {tool.status.replace('_', ' ')}
                  </div>
                )}

                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    addToCart(tool);
                  }}
                  className={`absolute top-4 right-4 w-8 h-8 rounded-xl flex items-center justify-center shadow-lg transition-all z-20 ${cart.some(item => item.id === tool.id) ? 'bg-indigo-600 text-white' : 'bg-white/90 text-slate-400 hover:text-indigo-600'}`}
                >
                  {cart.some(item => item.id === tool.id) ? <ClipboardCheck size={16} /> : <Plus size={16} />}
                </button>
              </div>
              <div className="p-8">
                <div className="flex items-start justify-between mb-6 relative">
                  <div>
                    <h3 className="font-black text-slate-900 text-lg leading-tight group-hover:text-indigo-600 transition-colors italic tracking-tight">{tool.name}</h3>
                    <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mt-2 font-bold uppercase tracking-wider">
                      <MapPin size={12} className="text-indigo-300" /> {tool.branch}
                      {tool.location && <span className="ml-2 bg-slate-100 px-1.5 py-0.5 rounded text-indigo-600">[{tool.location}]</span>}
                    </div>
                  </div>
                  <div className="relative">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === tool.id ? null : tool.id);
                      }}
                      className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg group-hover:text-slate-400 transition-all shadow-sm"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    
                    <AnimatePresence>
                      {activeMenuId === tool.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 10 }}
                          className="absolute right-0 top-full mt-2 w-40 bg-white rounded-2xl shadow-2xl border border-slate-100 z-30 overflow-hidden"
                        >
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleEdit(tool); }}
                            className="w-full px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center gap-2"
                          >
                            Editar
                          </button>
                          <button 
                            onClick={() => {
                              setSelectedTool(tool);
                              setIsTransferModalOpen(true);
                              setActiveMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-50 transition-all flex items-center gap-2"
                          >
                            Transferir Filial
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(tool.id); }}
                            className="w-full px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 transition-all flex items-center gap-2"
                          >
                            Excluir
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-6">
                  <div className="flex-1 bg-emerald-50/60 flex flex-col items-center py-2.5 rounded-2xl border border-emerald-100 min-w-0 transition-all hover:bg-emerald-100/50">
                    <span className="text-xl font-black text-emerald-700 leading-none">{tool.quantity_available}</span>
                    <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mt-1.5 px-1 truncate">Disp.</span>
                  </div>
                  <div className="flex-1 bg-amber-50/60 flex flex-col items-center py-2.5 rounded-2xl border border-amber-100 min-w-0 transition-all hover:bg-amber-100/50">
                    <span className="text-xl font-black text-amber-700 leading-none">{tool.cautela_quantity || 0}</span>
                    <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest mt-1.5 px-1 truncate">Caut.</span>
                  </div>
                  <div className="flex-1 bg-rose-50/60 flex flex-col items-center py-2.5 rounded-2xl border border-rose-100 min-w-0 transition-all hover:bg-rose-100/50">
                    <span className="text-xl font-black text-rose-700 leading-none">{tool.borrowed_quantity || 0}</span>
                    <span className="text-[8px] font-black text-rose-600 uppercase tracking-widest mt-1.5 px-1 truncate">Empr.</span>
                  </div>
                </div>

                <div className="flex gap-2">
                   {user?.role === 'Administrador' && (
                     <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTool(tool);
                        setIsAdjustmentModalOpen(true);
                      }}
                      className="flex-1 h-12 bg-white border-2 border-slate-100 hover:border-indigo-600 hover:text-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95"
                     >
                       <Zap size={14} className="text-indigo-400" /> Ajustar
                     </button>
                   )}
                   <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTool(tool);
                      setIsFichaModalOpen(true);
                    }}
                    className="flex-1 h-12 bg-indigo-950 hover:bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all group-hover:shadow-2xl group-hover:shadow-indigo-200 active:scale-95"
                   >
                      Ficha <ChevronRight size={16} />
                   </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[800px]">
             <thead>
               <tr className="bg-slate-50 text-[9px] uppercase tracking-[0.2em] font-black text-slate-400">
                 <th className="px-8 py-5">Identificação Operacional</th>
                 <th className="px-8 py-5 text-center">Disponível</th>
                 <th className="px-8 py-5">Localização</th>
                 <th className="px-8 py-5 text-center">Cautela</th>
                 <th className="px-8 py-5 text-center">Emprestado</th>
                 <th className="px-8 py-5">Unidade / Filial</th>
                 <th className="px-8 py-5 text-right">Ações</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100 font-sans">
                {filteredTools.map(tool => (
                  <tr key={tool.id} className="hover:bg-indigo-50/30 transition-colors text-sm group border-l-4 border-transparent hover:border-indigo-400">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 relative overflow-hidden shadow-inner">
                          {tool.image_url ? (
                           <Image 
                             src={tool.image_url} 
                             alt={tool.name} 
                             fill 
                             sizes="56px"
                             className="object-cover" 
                             referrerPolicy="no-referrer"
                             unoptimized
                           />
                          ) : <HardHat size={24} />}
                        </div>
                        <div className="flex items-center gap-3">
                           <button 
                             onClick={() => addToCart(tool)}
                             className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${cart.some(item => item.id === tool.id) ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-300 hover:bg-slate-100'}`}
                           >
                             <Plus size={14} strokeWidth={3} />
                           </button>
                           <div>
                             <p className="font-black text-slate-900 text-base italic tracking-tight">{tool.name}</p>
                             <p className="text-[10px] font-black font-mono text-indigo-600 uppercase tracking-widest mt-0.5">Ref: {tool.code}</p>
                           </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 font-black text-xs shadow-sm border border-emerald-100">
                         {tool.quantity_available}
                      </span>
                    </td>
                    <td className="px-8 py-6 uppercase font-mono text-[10px] font-black text-slate-500">
                      {tool.location || '---'}
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 font-black text-xs shadow-sm border border-indigo-100">
                         {tool.cautela_quantity}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-rose-50 text-rose-700 font-black text-xs shadow-sm border border-rose-100">
                         {tool.borrowed_quantity}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <span className="flex items-center gap-2 text-slate-500 font-black text-[10px] uppercase tracking-wider bg-slate-50 px-3 py-1.5 rounded-lg w-fit">
                        <MapPin size={14} className="text-indigo-400" /> {tool.branch}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                       <div className="flex items-center justify-end gap-2">
                         <button 
                           onClick={() => {
                             setSelectedTool(tool);
                             setIsAdjustmentModalOpen(true);
                           }}
                           className="p-3 text-slate-300 hover:text-amber-600 hover:bg-white rounded-xl transition-all shadow-sm"
                         >
                            <Zap size={20} strokeWidth={3} />
                         </button>
                         <button 
                           onClick={() => {
                             setSelectedTool(tool);
                             setIsTransferModalOpen(true);
                           }}
                           className="p-3 text-slate-300 hover:text-indigo-500 hover:bg-white rounded-xl transition-all shadow-sm"
                           title="Transferir Filial"
                         >
                            <ArrowLeftRight size={20} strokeWidth={3} />
                         </button>
                         <button 
                           onClick={() => handleEdit(tool)}
                           className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-white rounded-xl transition-all shadow-sm"
                         >
                            <ArrowUpRight size={20} strokeWidth={3} />
                         </button>
                         <button 
                           onClick={() => {
                             setSelectedTool(tool);
                             setIsFichaModalOpen(true);
                           }}
                           className="p-3 text-slate-300 hover:text-indigo-950 hover:bg-white rounded-xl transition-all shadow-sm"
                         >
                            <ListIcon size={20} strokeWidth={3} />
                         </button>
                         <button 
                           onClick={() => handleDeleteClick(tool.id)}
                           className="p-3 text-slate-300 hover:text-rose-500 hover:bg-white rounded-xl transition-all shadow-sm"
                         >
                            <X size={20} strokeWidth={3} />
                         </button>
                       </div>
                    </td>
                  </tr>
                ))}
             </tbody>
          </table>
        </div>
      )}
      
      {/* Modal Cadastro de Ferramenta */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
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
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 md:p-12 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between mb-10">
                  <div>
                    <h2 className="text-2xl font-black text-indigo-950 tracking-tight italic">{editingTool ? 'Editar Ferramenta' : 'Nova Ferramenta'}</h2>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-1">Cadastro de Patrimônio</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setEditingTool(null);
                      setPendingImageFiles([]);
                    }} 
                    className="p-2 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500 transition-colors"
                  >
                    <X />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  {pendingTools.length > 0 && (
                    <div className="md:col-span-2 mb-4">
                      <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <ListIcon size={14} /> Fila de Cadastro ({pendingTools.length})
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {pendingTools.map((tool, idx) => (
                          <div key={tool.id} className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl">
                            <span className="text-[10px] font-bold text-slate-600 italic tracking-tight">{tool.name}</span>
                            <button 
                              type="button"
                              onClick={() => setPendingTools(prev => prev.filter((_, i) => i !== idx))}
                              className="text-rose-400 hover:text-rose-600"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl p-6 bg-slate-50 hover:bg-white transition-colors group relative cursor-pointer overflow-hidden min-h-[140px]">
                      {user?.role === 'Administrador' ? (
                        <>
                          <input 
                            type="file" 
                            onChange={handleImageUpload}
                            multiple
                            accept="image/*"
                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                          />
                          {isUploading ? (
                            <div className="animate-pulse text-indigo-600 font-black text-xs uppercase tracking-widest italic text-center">
                              Sincronizando Imagens...
                            </div>
                          ) : formData.image_urls.length > 0 ? (
                            <div className="flex flex-wrap gap-2 justify-center">
                               {formData.image_urls.map((url, idx) => (
                                 <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                                   <Image src={url} alt={`Preview ${idx}`} fill className="object-cover" unoptimized />
                                   <button 
                                     type="button"
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       setFormData(prev => ({
                                         ...prev,
                                         image_urls: prev.image_urls.filter((_, i) => i !== idx)
                                       }));
                                     }}
                                     className="absolute top-0 right-0 p-1 bg-black/50 text-white hover:bg-rose-500 rounded-bl-lg"
                                   >
                                     <X size={10} />
                                   </button>
                                 </div>
                               ))}
                               <div className="w-16 h-16 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-lg text-slate-300">
                                 <Plus size={16} />
                               </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center">
                              <Plus className="text-slate-300 mb-2 group-hover:scale-110 transition-transform" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                 Anexar Fotos de Reconhecimento
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col items-center text-center px-4">
                          <Package size={32} className="text-slate-300 mb-3" />
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Somente administradores podem alterar fotos no estoque central.</p>
                          <p className="text-[8px] font-bold text-indigo-500 mt-2 italic uppercase">As fotos devem ser tiradas no ato da cautela/empréstimo.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Nome da Ferramenta</label>
                    <input 
                      required
                      type="text" 
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      className="w-full px-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-black italic tracking-tight"
                      placeholder="Ex: Martelete Perfurador 20V"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Código (Opcional)</label>
                    <input 
                      type="text" 
                      value={formData.code}
                      onChange={e => setFormData({...formData, code: e.target.value})}
                      className="w-full px-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-mono tracking-widest"
                      placeholder="AUTOGERADO"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Localização (Gaveta, Prateleira...)</label>
                    <input 
                      type="text" 
                      value={formData.location}
                      onChange={e => setFormData({...formData, location: e.target.value})}
                      className="w-full px-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-black italic"
                      placeholder="Ex: A1, P2B3"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Status Operacional</label>
                    <select 
                      value={formData.status}
                      onChange={e => setFormData({...formData, status: e.target.value})}
                      className="w-full px-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-black italic"
                    >
                      <option value="disponivel">Disponível no Estoque</option>
                      <option value="locação_cliente">Locação em Cliente</option>
                      <option value="oficina">Manutenção / Oficina</option>
                      <option value="perda">Sinistro / Perda</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Quantidade em Estoque</label>
                    <input 
                      required
                      type="number" 
                      value={formData.quantity_available || ''}
                      onChange={e => setFormData({...formData, quantity_available: parseInt(e.target.value) || 0})}
                      className="w-full px-6 py-4 bg-indigo-50/30 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-black text-indigo-700"
                      placeholder="Qtd inicial"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Unidade / Filial</label>
                    <select 
                      required
                      disabled={user?.role === 'Operador'}
                      value={formData.branch_id}
                      onChange={e => {
                        const b = branches.find(br => br.id === e.target.value);
                        setFormData({...formData, branch_id: e.target.value, branch: b?.name || ''});
                      }}
                      className="w-full px-6 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-sm font-bold appearance-none cursor-pointer disabled:opacity-50"
                    >
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 pt-8 flex gap-4">
                    {!editingTool && (
                      <button 
                        type="button"
                        onClick={addToQueue}
                        disabled={isLoading || !formData.name}
                        className="flex-1 bg-white border-2 border-indigo-100 text-indigo-600 hover:border-indigo-600 font-black py-5 rounded-[1.5rem] flex items-center justify-center gap-3 transition-all active:scale-[0.98] uppercase text-[10px] tracking-widest disabled:opacity-50"
                      >
                        <Plus size={20} strokeWidth={3} />
                        Adicionar à Lista
                      </button>
                    )}
                    <button 
                      type="submit"
                      disabled={isLoading}
                      className={`${editingTool ? 'w-full' : 'flex-1'} bg-indigo-600 hover:bg-indigo-500 text-white font-black py-5 rounded-[1.5rem] shadow-2xl shadow-indigo-200 flex items-center justify-center gap-3 transition-all active:scale-[0.98] uppercase text-xs tracking-[0.2em] disabled:opacity-50`}
                    >
                      {isLoading ? (
                        <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 size={24} strokeWidth={3} />
                          {editingTool ? 'Atualizar Dados' : pendingTools.length > 0 ? `Finalizar (${pendingTools.length + 1})` : 'Confirmar Cadastro'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Modal Ajuste Manual */}
      <AnimatePresence>
        {isAdjustmentModalOpen && selectedTool && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setIsAdjustmentModalOpen(false)}
               className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
             >
                <div className="flex items-center justify-between mb-6">
                   <div>
                      <h2 className="text-xl font-black text-slate-900 tracking-tight italic uppercase">Ajuste de Saldo</h2>
                      <p className="text-[9px] font-black uppercase text-slate-400 mt-1">{selectedTool.name} • #{selectedTool.code}</p>
                   </div>
                   <button onClick={() => setIsAdjustmentModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400">
                     <X size={20} />
                   </button>
                </div>

                <form onSubmit={handleAdjustmentSubmit} className="space-y-6">
                   <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                      <button 
                        type="button"
                        onClick={() => setAdjustmentData({...adjustmentData, type: 'gain'})}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${adjustmentData.type === 'gain' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                         Ganho / Entrada
                      </button>
                      <button 
                        type="button"
                        onClick={() => setAdjustmentData({...adjustmentData, type: 'loss'})}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${adjustmentData.type === 'loss' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                         Perda / Saída
                      </button>
                   </div>

                   <div className="space-y-4">
                      <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Quantidade</label>
                         <input 
                           type="number"
                           required
                           min="1"
                           value={adjustmentData.quantity}
                           onChange={e => setAdjustmentData({...adjustmentData, quantity: parseInt(e.target.value) || 0})}
                           className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-black text-lg text-slate-800 focus:ring-4 focus:ring-indigo-100 transition-all"
                         />
                      </div>
                      <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Motivo / Justificativa</label>
                         <textarea 
                           required
                           rows={3}
                           value={adjustmentData.reason}
                           onChange={e => setAdjustmentData({...adjustmentData, reason: e.target.value})}
                           className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-medium text-sm text-slate-800 focus:ring-4 focus:ring-indigo-100 transition-all resize-none"
                           placeholder="Descreva o motivo do ajuste..."
                         />
                      </div>
                   </div>

                   <button 
                     type="submit"
                     className={`w-full py-5 rounded-[1.5rem] font-black text-white uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${adjustmentData.type === 'gain' ? 'bg-emerald-600 shadow-emerald-100' : 'bg-rose-600 shadow-rose-100'}`}
                   >
                      <CheckCircle2 size={24} /> Confirmar Ajuste
                   </button>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Ficha Técnica */}
      <AnimatePresence>
        {isFichaModalOpen && selectedTool && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFichaModalOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="h-72 bg-slate-100 relative group overflow-hidden">
                {selectedTool.image_urls && selectedTool.image_urls.length > 0 ? (
                  <div className="flex h-full overflow-x-auto snap-x snap-mandatory custom-scrollbar">
                    {selectedTool.image_urls.map((url: string, idx: number) => (
                      <div key={idx} className="relative min-w-full h-full snap-center">
                        <Image 
                          src={url} 
                          alt={`${selectedTool.name} ${idx + 1}`} 
                          fill 
                          sizes="800px"
                          className="object-cover" 
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ))}
                  </div>
                ) : selectedTool.image_url ? (
                  <Image 
                    src={selectedTool.image_url} 
                    alt={selectedTool.name} 
                    fill 
                    sizes="(max-width: 768px) 100vw, 800px"
                    className="object-cover" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <Package size={80} />
                  </div>
                )}
                {selectedTool.image_urls && selectedTool.image_urls.length > 1 && (
                  <div className="absolute bottom-4 right-8 bg-black/50 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black text-white uppercase tracking-widest z-20">
                    {selectedTool.image_urls.length} Fotos
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                <div className="absolute bottom-8 left-8">
                   <div className="flex items-center gap-2 mb-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">Patrimônio Identificado</p>
                      {selectedTool.status && selectedTool.status !== 'disponivel' && (
                        <span className="bg-rose-500 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest italic animate-pulse">
                          {selectedTool.status.replace('_', ' ')}
                        </span>
                      )}
                   </div>
                   <h2 className="text-3xl font-black text-white italic tracking-tight uppercase">{selectedTool.name}</h2>
                </div>
                <button 
                  onClick={() => setIsFichaModalOpen(false)}
                  className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl text-white transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-10 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-10">
                   <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cód. Sistema</p>
                      <p className="text-sm font-black text-slate-900 font-mono tracking-widest">{selectedTool.code}</p>
                   </div>
                   <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Unidade</p>
                      <p className="text-sm font-black text-indigo-900 italic">{selectedTool.branch || '---'}</p>
                   </div>
                   <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Locação</p>
                      <p className="text-sm font-black text-slate-900 font-mono">{selectedTool.location || '---'}</p>
                   </div>
                   <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                      <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Disponível</p>
                      <p className="text-sm font-black text-emerald-900">{selectedTool.quantity_available || 0}</p>
                   </div>
                   <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                      <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Cautelada</p>
                      <p className="text-sm font-black text-amber-900">{selectedTool.cautela_quantity || 0}</p>
                   </div>
                   <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                      <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1">Emprestada</p>
                      <p className="text-sm font-black text-rose-900">{selectedTool.borrowed_quantity || 0}</p>
                   </div>
                </div>

                <div className="space-y-6">
                   <div>
                      <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <ListIcon size={16} /> Detalhes Técnicos
                      </h4>
                      <div className="p-6 bg-slate-50 rounded-3xl space-y-4 text-xs">
                         <div className="flex justify-between border-b border-slate-200 pb-2">
                            <span className="font-bold text-slate-400 uppercase tracking-widest">ID Únido</span>
                            <span className="font-mono text-slate-600">{selectedTool.id.substring(0, 8)}...</span>
                         </div>
                         <div className="flex justify-between border-b border-slate-200 pb-2">
                            <span className="font-bold text-slate-400 uppercase tracking-widest">Cadastrado em</span>
                            <span className="font-bold text-slate-600">{new Date(selectedTool.created_at).toLocaleDateString('pt-BR')}</span>
                         </div>
                         <div className="flex justify-between">
                            <span className="font-bold text-slate-400 uppercase tracking-widest">Responsabilidade</span>
                            <span className="font-bold text-indigo-600 italic">LOGÍSTICA / FILIAL</span>
                         </div>
                      </div>
                    </div>

                    {toolHolders.length > 0 && (
                      <div className="mt-8">
                        <h4 className="text-[11px] font-black text-rose-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                          <Package size={16} /> Quem está com este item?
                        </h4>
                        <div className="space-y-3">
                          {toolHolders.map((holder, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-rose-50/50 rounded-2xl border border-rose-100/50">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-rose-500 shadow-sm border border-rose-50">
                                  <HardHat size={18} />
                                </div>
                                <div>
                                  <p className="text-[10px] font-black uppercase text-slate-800 leading-none">{holder.possession_name || holder.responsible_name}</p>
                                  <p className="text-[9px] font-bold text-rose-400 uppercase mt-1">{holder.raw_type === 'caution' ? 'Cautela' : 'Empréstimo'}</p>
                                  {holder.possession_name && holder.possession_name !== holder.responsible_name && (
                                    <p className="text-[8px] font-bold text-slate-400 mt-1">Responsável: {holder.responsible_name}</p>
                                  )}
                                  {holder.note && <p className="text-[8px] font-bold text-indigo-500 mt-1">{holder.note}</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Retirado em</p>
                                  <p className="text-[9px] font-bold text-slate-600">{new Date(holder.created_at).toLocaleDateString('pt-BR')}</p>
                                </div>
                                {holder.source === 'cautela' && (
                                  <button
                                    onClick={() => handleReturnFromFicha(holder)}
                                    disabled={isSyncing}
                                    className="ml-2 p-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-all shadow-sm flex items-center justify-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-3"
                                  >
                                    {isSyncing ? '...' : <><RotateCcw size={12} /> Devolver</>}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-8 border-t border-slate-100 pt-6">
                        <button 
                          onClick={() => {
                            setIsFichaModalOpen(false);
                            router.push(`/dashboard/historico?tool_id=${selectedTool.id}`);
                          }}
                          className="w-full py-4 bg-slate-50 hover:bg-slate-100 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase text-indigo-600 tracking-widest transition-all group/btn border border-slate-100"
                        >
                          <History size={18} />
                          Ver Histórico Completo Movimentações
                          <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                        </button>
                    </div>
                 </div>
              </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button 
                            onClick={() => {
                              setCheckoutType('caution');
                              setIsFichaModalOpen(false);
                              setIsQuickCheckoutModalOpen(true);
                            }}
                            className="bg-amber-500 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-600 transition-all flex items-center justify-center gap-2 border border-amber-400"
                          >
                             <ClipboardCheck size={16} /> Fazer Cautela
                          </button>
                          <button 
                            onClick={() => {
                              setCheckoutType('loan');
                              setIsFichaModalOpen(false);
                              setIsQuickCheckoutModalOpen(true);
                            }}
                            className="bg-indigo-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 border border-indigo-500"
                          >
                             <Zap size={16} /> Fazer Empréstimo
                          </button>
                          {user?.role === 'Administrador' && (
                            <button 
                              onClick={() => {
                                setIsFichaModalOpen(false);
                                setSelectedTool(selectedTool);
                                setIsAdjustmentModalOpen(true);
                              }}
                              className="sm:col-span-2 bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                            >
                               <ArrowUpRight size={16} /> Abrir Ajuste de Saldo
                            </button>
                          )}
                        </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Exclusão */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsDeleteModalOpen(false)} className="fixed inset-0 bg-rose-950/40 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-8 text-center shadow-2xl">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <X size={32} strokeWidth={3} />
              </div>
              <h3 className="text-xl font-black text-slate-900 italic tracking-tight mb-2 uppercase">Excluir Item?</h3>
              <p className="text-xs font-medium text-slate-500 mb-8 leading-relaxed italic">Esta ação removerá permanentemente a ferramenta e sua imagem do sistema. O saldo será perdido.</p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={confirmDelete}
                  className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest shadow-xl shadow-rose-100 transition-all active:scale-95"
                >
                  Sim, Excluir Patrimônio
                </button>
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Checkout Modal */}
      <AnimatePresence>
        {isQuickCheckoutModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isGeneratingCheckout) {
                   setIsQuickCheckoutModalOpen(false);
                   setCheckoutTechnician(null);
                   setGeneratedCheckoutLink(null);
                   setTechSearchTerm('');
                   setCheckoutObs('');
                   setCheckoutPhoto(null);
                   stopCheckoutCamera();
                }
              }}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className={`p-8 ${checkoutType === 'caution' ? 'bg-amber-500' : 'bg-indigo-600'} text-white relative`}>
                <button 
                   onClick={() => {
                      setIsQuickCheckoutModalOpen(false);
                      setCheckoutTechnician(null);
                      setGeneratedCheckoutLink(null);
                      setTechSearchTerm('');
                      setCheckoutObs('');
                      setCheckoutPhoto(null);
                      stopCheckoutCamera();
                   }}
                   className="absolute top-6 right-6 text-white/40 hover:text-white"
                >
                  <X size={24} />
                </button>
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                      {checkoutType === 'caution' ? <ClipboardCheck size={24} /> : <Zap size={24} />}
                   </div>
                   <div>
                      <h3 className="text-xl font-black italic uppercase tracking-tighter leading-none">
                        Finalizar {checkoutType === 'caution' ? 'Cautela' : 'Empréstimo'}
                      </h3>
                      <p className="text-white/70 text-[10px] font-black uppercase tracking-widest mt-1">
                        {selectedTool ? `${selectedTool.name} • #${selectedTool.code}` : `${cart.length} itens do carrinho`}
                      </p>
                   </div>
                </div>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                {!generatedCheckoutLink ? (
                  <>
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6">
                      <button 
                        onClick={() => setCheckoutType('caution')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${checkoutType === 'caution' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                        disabled={isGeneratingCheckout}
                      >
                        <ClipboardCheck size={14} /> Cautela
                      </button>
                      <button 
                        onClick={() => setCheckoutType('loan')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${checkoutType === 'loan' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                        disabled={isGeneratingCheckout}
                      >
                        <Zap size={14} /> Empréstimo
                      </button>
                    </div>

                    <div className="space-y-4">
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Quem vai retirar?</label>
                       <div className="relative group">
                          <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                          <input 
                            type="text" 
                            placeholder="Buscar técnico por nome ou matrícula..."
                            value={techSearchTerm}
                            onChange={(e) => setTechSearchTerm(e.target.value)}
                            className="w-full pl-14 pr-5 py-4 bg-slate-50 border-none focus:ring-4 focus:ring-indigo-100 focus:bg-white rounded-[1.25rem] transition-all text-xs font-black uppercase tracking-widest"
                          />
                       </div>

                       <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                          {technicians
                            .filter(t => {
                               const matchesSearch = !techSearchTerm || 
                                          t.name.toLowerCase().includes(techSearchTerm.toLowerCase()) || 
                                          t.registration.toLowerCase().includes(techSearchTerm.toLowerCase());
                               if (user?.role === 'Operador') {
                                 return matchesSearch && (t.branch_id === user.branch_id || t.registration === user.registration);
                               }
                               return matchesSearch;
                            })
                            .map((tech) => (
                               <button 
                                 key={tech.registration}
                                 onClick={() => handleQuickCheckout(tech)}
                                 disabled={isGeneratingCheckout}
                                 className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${checkoutTechnician?.registration === tech.registration ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-50 bg-white hover:border-slate-200'} ${isGeneratingCheckout ? 'opacity-50 cursor-not-allowed' : ''}`}
                               >
                                  <div className="w-10 h-10 bg-slate-100 rounded-xl overflow-hidden relative shrink-0">
                                     {tech.avatar_url ? <Image src={tech.avatar_url} alt="A" fill sizes="40px" className="object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300 font-black text-xs uppercase">{tech.name[0]}</div>}
                                  </div>
                                  <div className="flex-1 text-left">
                                     <p className="text-[11px] font-black uppercase text-slate-800 leading-none">{tech.name}</p>
                                     <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">
                                       {tech._isClientEmployee
                                         ? <span className="text-indigo-400">🏢 {tech._clientName || 'Cliente'}</span>
                                         : <>{tech.branch ? `${tech.branch} • ` : ''}Mat: {tech.registration}</>
                                       }
                                     </p>
                                  </div>
                                  {checkoutTechnician?.registration === tech.registration && (
                                     <CheckCircle2 size={20} className="text-emerald-500" />
                                  )}
                               </button>
                            ))}
                       </div>
                    </div>

                    <div className="pt-4 space-y-4">

                      {/* Foto e observação — registradas pelo operador antes de gerar o link */}
                      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-4">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Registrar antes de gerar o link</p>

                        {/* Foto */}
                        <div>
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                            Foto das Ferramentas <span className="text-slate-300 font-normal normal-case">(opcional)</span>
                          </label>

                          <input
                            ref={checkoutPhotoInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handleCheckoutPhotoFromGallery}
                          />
                          <canvas ref={checkoutPhotoCaptureCanvasRef} className="hidden" />

                          {isCapturingCheckoutPhoto && (
                            <div className="rounded-xl overflow-hidden border-2 border-indigo-200 bg-black relative mb-2">
                              <video
                                ref={checkoutVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-40 object-cover"
                              />
                              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3 px-4">
                                <button onClick={stopCheckoutCamera} className="flex items-center gap-1 bg-white/20 backdrop-blur text-white font-black text-[9px] uppercase tracking-widest px-3 py-2 rounded-xl border border-white/30">
                                  <X size={10} /> Cancelar
                                </button>
                                <button onClick={captureCheckoutPhoto} className="flex items-center gap-1 bg-indigo-600 text-white font-black text-[9px] uppercase tracking-widest px-4 py-2 rounded-xl shadow-xl">
                                  <Camera size={12} /> Tirar Foto
                                </button>
                              </div>
                            </div>
                          )}

                          {checkoutPhoto && !isCapturingCheckoutPhoto && (
                            <div className="relative rounded-xl overflow-hidden border-2 border-emerald-200 mb-2">
                              <img src={checkoutPhoto} alt="Foto" className="w-full h-36 object-cover" />
                              <button onClick={() => setCheckoutPhoto(null)} className="absolute top-2 right-2 w-7 h-7 bg-rose-500 text-white rounded-full flex items-center justify-center shadow">
                                <Trash2 size={11} />
                              </button>
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                <p className="text-[8px] font-black text-white uppercase tracking-widest">Foto registrada ✓</p>
                              </div>
                            </div>
                          )}

                          {!checkoutPhoto && !isCapturingCheckoutPhoto && (
                            <div className="grid grid-cols-2 gap-2">
                              <button onClick={startCheckoutCamera} className="flex flex-col items-center justify-center gap-1.5 bg-white border-2 border-dashed border-slate-200 rounded-xl py-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group">
                                <div className="w-7 h-7 bg-indigo-100 text-indigo-500 rounded-lg flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                  <Camera size={14} />
                                </div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Câmera</p>
                              </button>
                              <button onClick={() => checkoutPhotoInputRef.current?.click()} className="flex flex-col items-center justify-center gap-1.5 bg-white border-2 border-dashed border-slate-200 rounded-xl py-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group">
                                <div className="w-7 h-7 bg-indigo-100 text-indigo-500 rounded-lg flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                  <ImagePlus size={14} />
                                </div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Galeria</p>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Observação */}
                        <div>
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                            Observação <span className="text-slate-300 font-normal normal-case">(opcional)</span>
                          </label>
                          <textarea
                            value={checkoutObs}
                            onChange={(e) => setCheckoutObs(e.target.value)}
                            placeholder="Informe qualquer observação relevante..."
                            rows={2}
                            className="w-full bg-white border-2 border-slate-100 rounded-xl px-3 py-2.5 text-[11px] font-bold text-slate-700 placeholder:text-slate-300 resize-none focus:outline-none focus:border-indigo-300 transition-colors"
                          />
                        </div>
                      </div>

                      <button 
                        onClick={handleQuickCheckout}
                        disabled={!checkoutTechnician || isGeneratingCheckout}
                        className={`w-full py-5 rounded-[2rem] font-black italic text-white uppercase text-sm tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 ${checkoutType === 'caution' ? 'bg-amber-500 shadow-amber-100' : 'bg-indigo-600 shadow-indigo-100'}`}
                      >
                         {isGeneratingCheckout ? (
                            <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                         ) : (
                            <>GERAR LINK DE ASSINATURA <ChevronRight size={18} /></>
                         )}
                      </button>
                    </div>
                  </>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center space-y-6 py-4"
                  >
                     <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner">
                        <CheckCircle2 size={40} />
                     </div>
                     <div className="space-y-2">
                        <h4 className="text-xl font-black italic uppercase text-slate-900">Sucesso!</h4>
                        <p className="text-xs text-slate-500 font-medium">Link de assinatura gerado para <b>{checkoutTechnician?.name}</b></p>
                     </div>
                     
                     <div className="bg-slate-50 p-4 rounded-3xl border-2 border-dashed border-slate-200 break-all text-[10px] font-mono font-bold text-indigo-600 select-all p-6">
                        {generatedCheckoutLink}
                     </div>

                     <div className="flex flex-col gap-3">
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(generatedCheckoutLink!);
                            alert('Link copiado!');
                          }}
                          className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all"
                        >
                           Copiar Link
                        </button>
                        <button 
                          onClick={() => {
                            setIsQuickCheckoutModalOpen(false);
                            setGeneratedCheckoutLink(null);
                            setCheckoutTechnician(null);
                            setTechSearchTerm('');
                          }}
                          className="text-[10px] font-black uppercase text-slate-300 hover:text-slate-500"
                        >
                           Fechar
                        </button>
                     </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Transferência de Filial */}
      <AnimatePresence>
        {isTransferModalOpen && selectedTool && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setIsTransferModalOpen(false)}
               className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-8"
             >
                <div className="flex items-center justify-between mb-6">
                   <div>
                      <h2 className="text-xl font-black text-slate-900 tracking-tight italic uppercase">Transferir para Filial</h2>
                      <p className="text-[9px] font-black uppercase text-slate-400 mt-1">{selectedTool.name} • #{selectedTool.code}</p>
                   </div>
                   <button onClick={() => setIsTransferModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400">
                     <X size={20} />
                   </button>
                </div>

                <form onSubmit={handleTransferSubmit} className="space-y-6">
                   <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Filial Destino</label>
                        <select 
                          required
                          value={transferBranchId}
                          onChange={e => setTransferBranchId(e.target.value)}
                          className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-800 focus:ring-4 focus:ring-indigo-100 transition-all cursor-pointer appearance-none"
                        >
                          <option value="">Selecione uma filial...</option>
                          {branches.filter(b => b.id !== selectedTool.branch_id).map(branch => (
                            <option key={branch.id} value={branch.id}>{branch.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Quantidade a Transferir</label>
                         <input 
                           type="number"
                           required
                           min="1"
                           max={selectedTool.quantity_available}
                           value={transferQuantity}
                           onChange={e => setTransferQuantity(parseInt(e.target.value) || 0)}
                           className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-black text-lg text-slate-800 focus:ring-4 focus:ring-indigo-100 transition-all"
                         />
                         <p className="text-[9px] font-bold text-slate-400 mt-2 ml-1 uppercase">Disponível em {selectedTool.branch}: {selectedTool.quantity_available}</p>
                      </div>
                   </div>

                   <button 
                     type="submit"
                     disabled={isTransferring || !transferBranchId}
                     className="w-full py-5 rounded-[1.5rem] bg-indigo-600 font-black text-white uppercase text-xs tracking-widest shadow-xl shadow-indigo-100 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                   >
                      {isTransferring ? (
                        <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <ArrowLeftRight size={20} />
                      )}
                      {isTransferring ? 'Processando...' : 'Confirmar Transferência'}
                   </button>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Stock Cart */}
      <AnimatePresence>
        {cart.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[90] w-full max-w-lg px-4"
          >
            <div className="bg-slate-900 shadow-2xl shadow-indigo-200 rounded-[2.5rem] p-4 flex items-center justify-between gap-4 border border-slate-800/50 backdrop-blur-xl">
               <div className="flex items-center gap-4 pl-4">
                  <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                    <ClipboardCheck size={24} />
                  </div>
                  <div>
                    <h4 className="text-white font-black italic uppercase text-xs tracking-widest">Separação de Itens</h4>
                    <p className="text-indigo-300 font-black text-[10px] uppercase tracking-tighter">{cart.length} {cart.length === 1 ? 'item selecionado' : 'itens selecionados'}</p>
                  </div>
               </div>

               <div className="flex items-center gap-2">
                 <button 
                  onClick={() => {
                    setSelectedTool(null);
                    setCheckoutType('caution');
                    setIsQuickCheckoutModalOpen(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 h-12 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95"
                 >
                   Checkout
                 </button>
                 <button 
                  onClick={() => setCart([])}
                  className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-2xl transition-all"
                 >
                   <X size={20} />
                 </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
