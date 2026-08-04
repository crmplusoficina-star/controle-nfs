"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import * as XLSX from "xlsx";
import { exportToPDF } from "@/lib/pdf-export";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  UserCheck,
  Search,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Eye,
  Camera,
  ImagePlus,
  Trash2,
  Signature as SignatureIcon,
  Calendar,
  ArrowLeftRight,
  ChevronRight,
  Filter,
  X,
  History,
  Zap,
  Package,
  ClipboardCheck,
  ArrowRight,
  Link as LinkIcon,
  Share2,
  FileDown,
  Download,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import confetti from "canvas-confetti";

export default function CauteliaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: currentUser } = useAuth();
  const [cautelas, setCautelas] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<
    "current" | "history" | "compare" | "report" | "manage"
  >("current");
  const [isDemissaoModalOpen, setIsDemissaoModalOpen] = useState(false);
  const [demissaoItems, setDemissaoItems] = useState<any[]>([]);
  const [availableStandardTools, setAvailableStandardTools] = useState<any[]>(
    [],
  );
  const [availableStockTools, setAvailableStockTools] = useState<any[]>([]);
  const [linkedUsers, setLinkedUsers] = useState<Set<string>>(new Set());
  const [selectedToolsToManage, setSelectedToolsToManage] = useState<string[]>(
    [],
  );
  const [showGlobalManager, setShowGlobalManager] = useState(false);
  const [showStandardInManage, setShowStandardInManage] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [compareDates, setCompareDates] = useState<{
    audit1: string;
    audit2: string;
  }>({ audit1: "", audit2: "" });
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [stagedAuditItems, setStagedAuditItems] = useState<any[]>([]);
  const [selectedAuditBranch, setSelectedAuditBranch] = useState<string>("");
  const [manageSearchTerm, setManageSearchTerm] = useState("");
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);
  const [borrowType, setBorrowType] = useState<"loan" | "caution">("caution");
  const [signingAudit, setSigningAudit] = useState<any | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });

  const [signedAuditForPDF, setSignedAuditForPDF] = useState<any | null>(null);

  // Foto e observação do operador (preenchidos antes de gerar o link)
  const [auditObs, setAuditObs] = useState<string>("");
  const [auditToolPhoto, setAuditToolPhoto] = useState<string | null>(null);
  const [isCapturingAuditPhoto, setIsCapturingAuditPhoto] = useState(false);
  const [auditCameraStream, setAuditCameraStream] = useState<MediaStream | null>(null);
  const auditVideoRef = useRef<HTMLVideoElement>(null);
  const auditPhotoInputRef = useRef<HTMLInputElement>(null);
  const auditPhotoCaptureCanvasRef = useRef<HTMLCanvasElement>(null);

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast({ message: "", visible: false }), 2000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("Link de assinatura copiado com sucesso!");
  };

  // For Reporting (Technician View)
  const [reportingItems, setReportingItems] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Defined as functions to avoid "Cannot access variable before it is declared"
  async function fetchStandardTools() {
    const { data, error } = await supabase
      .from("cautelia_standard_tools")
      .select("*")
      .order("name");
    if (error) {
      console.error("Erro ao buscar lista padrão:", error);
      return;
    }
    setAvailableStandardTools(data || []);
  }

  async function fetchStockTools(branchId: string) {
    if (!branchId) return;
    const { data, error } = await supabase
      .from("tools")
      .select("*")
      .eq("branch_id", branchId)
      .order("name");

    if (error) {
      console.error("Erro ao buscar estoque:", error);
      return;
    }
    setAvailableStockTools(data || []);
  }

  const exportToExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  const exportCurrentComparison = () => {
    const data = getComparisonData();
    const exportData = data.map((item) => ({
      Ferramenta: item.tool?.name,
      Patrimônio: item.tool?.code || "N/A",
      "Status Anterior": statusMap[item.status1]?.label || "AUSENTE",
      "Status Recente": statusMap[item.status2]?.label || "AUSENTE",
      Divergência: item.status1 !== item.status2 ? "SIM" : "NÃO",
    }));
    exportToExcel(
      exportData,
      `comparativo-${selectedUser?.name?.toLowerCase().replace(/\s+/g, "-")}`,
    );
  };

  const exportAllTechniciansReport = async () => {
    setIsLoading(true);
    try {
      const { data: allReports } = await supabase
        .from("cautelia_reports")
        .select("*, cautelia_standard_tools(*), users_access(name, registration)");
      
      const { data: allCautelas } = await supabase
        .from("cautelas")
        .select("*, tools(id, name, code, image_url), users_access(name, registration)");

      const combinedData: any[] = [];

      allReports?.forEach((r) => {
        combinedData.push({
          Técnico: r.users_access?.name,
          Matrícula: r.user_id,
          Ferramenta: r.cautelia_standard_tools?.name,
          Tipo: "PADRÃO",
          Status: statusMap[r.status]?.label || r.status,
          "Último Check": r.last_check ? new Date(r.last_check).toLocaleString() : "-",
        });
      });

      allCautelas?.forEach((c) => {
        combinedData.push({
          Técnico: c.users_access?.name,
          Matrícula: c.user_id,
          Ferramenta: c.tools?.name,
          Tipo: "GRANDE/PATRIMÔNIO",
          Status: statusMap[c.status]?.label || c.status,
          "Último Check": c.last_check ? new Date(c.last_check).toLocaleString() : "-",
        });
      });

      exportToExcel(combinedData, "relatorio-consolidado-ferramentaria");
    } catch (err) {
      console.error(err);
      alert("Erro ao exportar relatório geral.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserData = React.useCallback(async (user: any) => {
    if (!user) return;

    const reg = String(user.registration || "").trim();

    // We fetch EVERYTHING for this user: standard tools (from reports) and big tools (from cautelas)
    const [reportsResp, cautelasResp] = await Promise.all([
      supabase
        .from("cautelia_reports")
        .select("*, cautelia_standard_tools(*)")
        .eq('user_id', reg),
      supabase
        .from("cautelas")
        .select("*, tools(id, name, code, image_url)")
        .eq('user_id', reg),
    ]);

    const reports = reportsResp.data || [];
    const bigCautelas = cautelasResp.data || [];

    const toolMap = new Map();

    reports.forEach((report) => {
      if (report.cautelia_standard_tools) {
        toolMap.set(report.tool_id, {
          id: report.tool_id,
          tool_id: report.tool_id,
          name: report.cautelia_standard_tools?.name,
          category: report.cautelia_standard_tools?.category || "PADRÃO",
          status: report.status || "ok",
          last_check: report.last_check,
          type: "standard",
        });
      }
    });

    bigCautelas.forEach((c) => {
      if (c.tools) {
        toolMap.set(c.tool_id, {
          id: c.tool_id,
          tool_id: c.tool_id,
          name: c.tools?.name || "Ferramenta de Estoque",
          category: c.tools?.category || "GRANDE PORTE",
          status: c.status || "ok",
          last_check: c.last_check,
          type: "big",
          subType: c.type || "caution",
        });
      }
    });

    const mergedItems = Array.from(toolMap.values());

    setCautelas(mergedItems);
    setReportingItems(mergedItems);
    // Initialize staged items with current linked tools
    setStagedAuditItems(
      mergedItems.map((m) => ({
        tool_id: m.tool_id,
        name: m.name,
        category: m.category,
        status: m.status || "ok",
        type: m.type,
      })),
    );
    setSelectedAuditBranch(user.branch_id || "");
    fetchStockTools(user.branch_id || "");
    setSelectedToolsToManage(
      mergedItems.filter((i) => i.type === "standard").map((m) => m.tool_id),
    );
    setSignature(null); // Reset signature when changing user
    setViewMode("current"); // Default to current view when changing user

    // Historical Audits
    const { data: auditData } = await supabase
      .from("cautelia_audits")
      .select("*, cautelia_audit_items(*, cautelia_standard_tools(*), tools:stock_tool_id(id, name, code, image_url))")
      .eq("user_id", reg)
      .in("status", ["signed", "confirmed", "pending", "active"])
      .order("created_at", { ascending: false });

    if (auditData) setHistory(auditData);
  }, []);

  // Real-time listener for audit completion
  useEffect(() => {
    if (!activeAuditId || !selectedUser) return;

    const channel = supabase
      .channel(`audit-${activeAuditId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "cautelia_audits",
          filter: `id=eq.${activeAuditId}`,
        },
        (payload) => {
          if (payload.new.status === "signed") {
            confetti();
            fetchUserData(selectedUser);
            setActiveAuditId(null);
            setGeneratedLink(null);
            setViewMode("current");
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeAuditId, selectedUser, fetchUserData]);

  const fetchData = React.useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);

    try {
      await fetchStandardTools();

      // Fetch branches for display names
      const { data: bData } = await supabase
        .from("branches")
        .select("*")
        .order("name");
      if (bData) setBranches(bData);

      // Fetch ALL technicians
      const [{ data: techData, error: techError }, { data: clientEmpData }] = await Promise.all([
        supabase.from('users_access').select('*').order('name'),
        supabase.from('client_employees').select('*, clients(name)').eq('active', true).order('name'),
      ]);

      if (techError) throw techError;

      const clientEmps = (clientEmpData || []).map((e: any) => ({
        ...e,
        registration: e.registration ? `CE-${e.registration}` : `CE-${e.id.substring(0, 8)}`,
        role: e.role || 'Funcionário Cliente',
        branch_id: null,
        _isClientEmployee: true,
        _clientName: e.clients?.name || '',
      }));

      setTechnicians([...(techData || []), ...clientEmps]);

      // Fetch who already has the standard list linked
      const { data: reportsData } = await supabase
        .from("cautelia_reports")
        .select("user_id");
      
      const linked = new Set((reportsData || []).map(r => r.user_id));
      setLinkedUsers(linked);

      // If Tech or specific user selected, load their data
      if (currentUser.role === "Técnico" && !selectedUser) {
        const myProfile =
          techData?.find((t) => t.registration === currentUser.registration) ||
          currentUser;
        setSelectedUser(myProfile);
        await fetchUserData(myProfile);
      } else if (selectedUser) {
        await fetchUserData(selectedUser);
      }
    } catch (error) {
      console.error("Erro ao carregar dados da CautelIA:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, selectedUser, fetchUserData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const initSignaturePad = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      let drawing = false;

      const start = (e: any) => {
        drawing = true;
        draw(e);
      };
      const stop = () => {
        drawing = false;
        ctx?.beginPath();
        setSignature(canvas.toDataURL());
      };
      const draw = (e: any) => {
        if (!drawing || !ctx) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#000";
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
      };

      canvas.addEventListener("mousedown", start);
      canvas.addEventListener("mouseup", stop);
      canvas.addEventListener("mousemove", draw);
      canvas.addEventListener("touchstart", start);
      canvas.addEventListener("touchend", stop);
      canvas.addEventListener("touchmove", draw);
    }
  };

  useEffect(() => {
    if (viewMode === "report") {
      setTimeout(initSignaturePad, 500);
    }
  }, [viewMode]);

  const startAuditCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setAuditCameraStream(stream);
      setIsCapturingAuditPhoto(true);
      setTimeout(() => {
        if (auditVideoRef.current) {
          auditVideoRef.current.srcObject = stream;
          auditVideoRef.current.play();
        }
      }, 100);
    } catch {
      auditPhotoInputRef.current?.click();
    }
  };

  const captureAuditPhoto = () => {
    if (!auditVideoRef.current || !auditPhotoCaptureCanvasRef.current) return;
    const video = auditVideoRef.current;
    const canvas = auditPhotoCaptureCanvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setAuditToolPhoto(dataUrl);
    stopAuditCamera();
  };

  const stopAuditCamera = () => {
    if (auditCameraStream) {
      auditCameraStream.getTracks().forEach((t) => t.stop());
      setAuditCameraStream(null);
    }
    setIsCapturingAuditPhoto(false);
  };

  const handleAuditPhotoFromGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setAuditToolPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const generateSignatureLink = async () => {
    if (!selectedUser || stagedAuditItems.length === 0) {
      alert("Selecione pelo menos uma ferramenta para cautelar.");
      return;
    }
    setIsGeneratingLink(true);

    try {
      // 0. Upload foto da ferramenta se houver
      let finalToolPhotoUrl: string | null = auditToolPhoto;
      if (auditToolPhoto) {
        try {
          const photoRes = await fetch("/api/upload-tool-photo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photo: auditToolPhoto, auditId: `pre-${Date.now()}` }),
          });
          if (photoRes.ok) {
            const { url } = await photoRes.json();
            if (url) finalToolPhotoUrl = url;
          }
        } catch {
          // mantém base64 como fallback
        }
      }

      // 1. Create a PENDING audit header
      const { data: audit, error: auditError } = await supabase
        .from("cautelia_audits")
        .insert({
          user_id: selectedUser.registration,
          branch_id: selectedAuditBranch || selectedUser.branch_id || null,
          status: "pending",
          type: borrowType,
          operator_id: currentUser?.registration,
          obs: auditObs.trim() || null,
          tool_photo_url: finalToolPhotoUrl || null,
        })
        .select()
        .single();

      if (auditError) {
        console.error("Supabase Insert Error:", auditError);
        throw auditError;
      }
      
      if (!audit) throw new Error("Falha ao criar registro de auditoria (retorno vazio).");

      // 2. Create Audit Items based on STAGED state
      const auditItems = stagedAuditItems.map((item) => ({
        audit_id: audit.id,
        tool_id: item.type === "standard" ? item.tool_id : null,
        stock_tool_id: item.type === "big" ? item.tool_id : null,
        status: item.status || "ok",
        obs: item.obs || "",
      }));

      const { error: itemsError } = await supabase
        .from("cautelia_audit_items")
        .insert(auditItems);

      if (itemsError) throw itemsError;

      // 3. Generate the link
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/assinatura/${audit.id}`;
      setGeneratedLink(link);
      setActiveAuditId(audit.id);
      // Limpar campos após gerar
      setAuditObs("");
      setAuditToolPhoto(null);
    } catch (err: any) {
      console.error("Erro completo ao gerar link:", err);
      // Detailed error message extraction
      let errorMessage = "Erro desconhecido";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        errorMessage = err.message || err.details || err.hint || JSON.stringify(err);
      } else {
        errorMessage = String(err);
      }
      
      if (errorMessage === "{}" || errorMessage === "Erro de banco de dados (verifique RLS ou colunas)") {
        errorMessage = "Erro de banco de dados: Uma ou mais colunas (status, type) podem estar faltando na tabela 'cautelia_audits'. Por favor, execute o script SQL de atualização no SQL Editor do Supabase.";
      }
      alert(`Erro ao gerar link de assinatura: ${errorMessage}`);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const submitReport = async () => {
    if (!selectedUser || reportingItems.length === 0) return;
    if (!signature) {
      alert("Por favor, forneça sua assinatura digital.");
      return;
    }
    setIsSubmitting(true);

    try {
      // 1. Create Audit Header
      const { data: audit, error: auditError } = await supabase
        .from("cautelia_audits")
        .insert({
          user_id: selectedUser.registration,
          branch_id: selectedUser.branch_id,
          signature_url: signature,
          status: "signed",
          type: "checkout",
          operator_id: currentUser?.registration,
          check_date: new Date().toISOString(),
        })
        .select()
        .maybeSingle();

      if (auditError) throw auditError;

      // 2. Create Audit Items
      const auditItems = reportingItems.map((item) => ({
        audit_id: audit.id,
        tool_id: item.type === 'standard' ? item.tool_id : null,
        stock_tool_id: item.type === 'big' ? item.tool_id : null,
        status: item.status,
        obs: item.obs || "",
      }));

      const { error: itemsError } = await supabase
        .from("cautelia_audit_items")
        .insert(auditItems);

      if (itemsError) throw itemsError;

      // 3. Upsert into cautelia_reports (Standard Tools)
      const standardSync = reportingItems
        .filter(item => item.type === 'standard')
        .map((item) => ({
          user_id: selectedUser.registration,
          tool_id: item.tool_id,
          status: item.status,
          last_check: new Date().toISOString(),
        }));

      if (standardSync.length > 0) {
        await supabase
          .from("cautelia_reports")
          .upsert(standardSync, { onConflict: "user_id, tool_id" });
      }

      // 4. Upsert into cautelas (Big/Stock Tools)
      const bigSync = reportingItems
        .filter(item => item.type === 'big')
        .map((item) => ({
          user_id: selectedUser.registration,
          tool_id: item.tool_id,
          status: item.status,
          last_update: new Date().toISOString(),
        }));

      if (bigSync.length > 0) {
        await supabase
          .from("cautelas")
          .upsert(bigSync, { onConflict: "user_id, tool_id" });
      }

      confetti();
      alert("Checklist finalizado com sucesso!");
      setViewMode("current");
      fetchUserData(selectedUser);
      setSignature(null);
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar relatório.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitSignedAudit = async (auditToSign: any) => {
    if (!signature) {
      alert("Por favor, assine para confirmar.");
      return;
    }
    setIsSubmitting(true);
    try {
      // 1. Update the audit
      const { error: updateErr } = await supabase
        .from("cautelia_audits")
        .update({
          status: "signed",
          signature_url: signature,
          check_date: new Date().toISOString(),
        })
        .eq("id", auditToSign.id);

      if (updateErr) throw updateErr;

      // 2. Sync history items to current states
      const auditItems = auditToSign.cautelia_audit_items || [];
      
      const standardSync = auditItems
        .filter((i: any) => i.tool_id)
        .map((i: any) => ({
          user_id: auditToSign.user_id,
          tool_id: i.tool_id,
          status: i.status || 'ok',
          last_check: new Date().toISOString(),
        }));

      if (standardSync.length > 0 && auditToSign.type !== 'return') {
        await supabase
          .from("cautelia_reports")
          .upsert(standardSync, { onConflict: "user_id, tool_id" });
      }

      const stockSync = auditItems
        .filter((i: any) => i.stock_tool_id)
        .map((i: any) => ({
          user_id: auditToSign.user_id,
          tool_id: i.stock_tool_id,
          status: i.status || 'ok',
          type: auditToSign.type === 'loan' ? 'loan' : 'caution',
          last_update: new Date().toISOString(),
        }));

      if (stockSync.length > 0 && auditToSign.type !== 'return') {
        await supabase
          .from("cautelas")
          .upsert(stockSync, { onConflict: "user_id, tool_id" });

        // Update tool stock quantities
        if (auditToSign.type === 'caution' || auditToSign.type === 'loan') {
          for (const item of stockSync) {
             const { data: currentTool } = await supabase.from('tools')
               .select('id, borrowed_quantity, cautela_quantity, quantity_available')
               .eq('id', item.tool_id)
               .maybeSingle();
             
             if (currentTool) {
               const qty = auditItems.find((i: any) => i.stock_tool_id === item.tool_id)?.quantity || 1;
               const updateFields: any = {
                 quantity_available: Math.max(0, (currentTool.quantity_available || 0) - qty)
               };
               if (auditToSign.type === 'loan') {
                 updateFields.borrowed_quantity = (currentTool.borrowed_quantity || 0) + qty;
               } else {
                 updateFields.cautela_quantity = (currentTool.cautela_quantity || 0) + qty;
               }
               await supabase.from('tools').update(updateFields).eq('id', item.tool_id);
             }
          }
        }
      }

      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
      });

      alert("Assinatura confirmada!");
      setSignedAuditForPDF({ ...auditToSign, signature_url: signature, check_date: new Date().toISOString() });
      setSigningAudit(null);
      setSignature(null);
      fetchUserData(selectedUser);
    } catch (err) {
      console.error(err);
      alert("Erro ao confirmar assinatura.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToolLinkToggle = useCallback((tool: any) => {
    if (!selectedUser) return;
    const isStaged = stagedAuditItems.some((i) => i.tool_id === tool.id);

    if (isStaged) {
      setStagedAuditItems((prev) => prev.filter((i) => i.tool_id !== tool.id));
    } else {
      setStagedAuditItems((prev) => [
        ...prev,
        {
          tool_id: tool.id,
          name: tool.name,
          category: tool.category || "PADRÃO",
          status: "ok",
          type: tool.type,
        },
      ]);
    }
  }, [selectedUser, stagedAuditItems]);

  // Handle Tool Deep Link
  const lastProcessedToolIdRef = useRef<string | null>(null);
  useEffect(() => {
    const toolId = searchParams.get("toolId");
    const type = searchParams.get("type") as "loan" | "caution";

    if (toolId && (type === "loan" || type === "caution")) {
      if (borrowType !== type) {
        setTimeout(() => setBorrowType(type), 0);
      }
      
      if (selectedUser && viewMode !== "manage" && lastProcessedToolIdRef.current !== toolId) {
        setTimeout(() => setViewMode("manage"), 0);
        
        // Auto-stage the tool if it exists in availableStockTools
        const toolToStage = availableStockTools.find(t => t.id === toolId);
        if (toolToStage) {
          const alreadyStaged = stagedAuditItems.find(i => i.tool_id === toolId);
          if (!alreadyStaged) {
            setTimeout(() => handleToolLinkToggle({ ...toolToStage, type: 'big' }), 0);
          }
        }
        lastProcessedToolIdRef.current = toolId;
      }
    }
  }, [searchParams, selectedUser, viewMode, availableStockTools, stagedAuditItems, borrowType, handleToolLinkToggle]);

  const updateStagedStatus = (toolId: string, newStatus: string) => {
    setStagedAuditItems((prev) =>
      prev.map((i) => (i.tool_id === toolId ? { ...i, status: newStatus } : i)),
    );
  };

  const handleQuickUpdate = async (item: any, newStatus: string) => {
    if (!selectedUser) return;

    try {
      if (item.type === "standard") {
        await supabase.from("cautelia_reports").upsert(
          {
            user_id: selectedUser.registration,
            tool_id: item.tool_id,
            status: newStatus,
            last_check: new Date().toISOString(),
          },
          { onConflict: "user_id, tool_id" },
        );
      } else {
        await supabase
          .from("cautelas")
          .update({
            status: newStatus,
            last_check: new Date().toISOString(),
          })
          .eq("user_id", selectedUser.registration)
          .eq("tool_id", item.tool_id);
      }

      // Update local state for immediate feedback
      setCautelas((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, status: newStatus } : c)),
      );
      console.log("Status atualizado!");
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
    }
  };

  const [isMassReturnModalOpen, setIsMassReturnModalOpen] = useState(false);
  const [selectedReturnItems, setSelectedReturnItems] = useState<string[]>([]);
  
  // Return Photo Camera state
  const [returnPhoto, setReturnPhoto] = useState<string | null>(null);
  const [isCapturingReturnPhoto, setIsCapturingReturnPhoto] = useState(false);
  const [returnObs, setReturnObs] = useState('');
  const returnPhotoInputRef = useRef<HTMLInputElement>(null);
  const returnPhotoCaptureCanvasRef = useRef<HTMLCanvasElement>(null);
  const returnVideoRef = useRef<HTMLVideoElement>(null);

  const startReturnCamera = async () => {
    try {
      if (typeof window !== "undefined" && navigator.mediaDevices) {
        setIsCapturingReturnPhoto(true);
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (returnVideoRef.current) returnVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access denied or failed", err);
      alert("Não foi possível acessar a câmera do dispositivo.");
      setIsCapturingReturnPhoto(false);
      returnPhotoInputRef.current?.click();
    }
  };

  const captureReturnPhoto = () => {
    if (!returnVideoRef.current || !returnPhotoCaptureCanvasRef.current) return;
    const canvas = returnPhotoCaptureCanvasRef.current;
    const video = returnVideoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setReturnPhoto(canvas.toDataURL("image/jpeg", 0.85));
    setIsCapturingReturnPhoto(false);
    
    // Stop stream
    const stream = video.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
  };

  const handleReturnPhotoFromGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setReturnPhoto(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleDemissaoConfirm = async () => {
    if (!selectedUser) return;

    const devolvidosCount = demissaoItems.filter(i => i.devolveu === true).length;
    const naoDevolvidosCount = demissaoItems.filter(i => i.devolveu === false).length;

    const confirmed = window.confirm(
      `${devolvidosCount} ferramentas devolvidas, ${naoDevolvidosCount} ferramentas não devolvidas (registradas como perda). Confirmar?`
    );

    if (!confirmed) return;

    setIsLoading(true);
    const reg = selectedUser.registration;
    
    try {
      for (const item of demissaoItems) {
        const isReturned = item.devolveu === true;
        
        if (isReturned) {
          if (item.type === 'big') {
            const { data: tool } = await supabase
              .from("tools")
              .select("quantity_available, cautela_quantity, branch_id, branch, borrowed_quantity")
              .eq("id", item.tool_id)
              .single();
            
            if (tool) {
              const total_fisico = (tool.quantity_available || 0) + (tool.cautela_quantity || 0) + (tool.borrowed_quantity || 0);
              
              const isLoan = item.subType === 'loan';
              const novo_cautela = isLoan ? tool.cautela_quantity : Math.max(0, (tool.cautela_quantity || 0) - 1);
              const novo_borrowed = isLoan ? Math.max(0, (tool.borrowed_quantity || 0) - 1) : tool.borrowed_quantity;
              const novo_disponivel = total_fisico - novo_cautela - novo_borrowed;

              if (novo_disponivel >= 0 && novo_disponivel <= total_fisico) {
                await supabase.from("tools").update({
                  quantity_available: novo_disponivel,
                  cautela_quantity: novo_cautela,
                  borrowed_quantity: novo_borrowed
                }).eq("id", item.tool_id);
                
                await supabase.from("transactions").insert({
                  tool_id: item.tool_id,
                  user_id: reg,
                  type: "return",
                  quantity: 1,
                  branch_id: tool.branch_id,
                  branch: tool.branch,
                  status: "completed",
                  obs: "Devolução por demissão"
                });
              }
            }
            await supabase.from("cautelas").delete().eq("user_id", reg).eq("tool_id", item.tool_id);
          } else {
            await supabase.from("cautelia_reports").delete().eq("user_id", reg).eq("tool_id", item.tool_id);
            await supabase.from("transactions").insert({
               tool_id: item.tool_id,
               user_id: reg,
               type: "return",
               quantity: 1,
               status: "completed",
               obs: "Devolução de item padrão por demissão"
            });
          }
        } else {
          await supabase.from("transactions").insert({
            tool_id: item.tool_id,
            user_id: reg,
            type: "loss",
            quantity: 1,
            status: "completed",
            obs: "Não devolvido na demissão"
          });
          
          if (item.type === 'big') {
            await supabase.from("cautelas").delete().eq("user_id", reg).eq("tool_id", item.tool_id);
          } else {
            await supabase.from("cautelia_reports").delete().eq("user_id", reg).eq("tool_id", item.tool_id);
          }
        }
      }
      
      showToast("Processo de demissão concluído com sucesso.");
      setIsDemissaoModalOpen(false);
      fetchUserData(selectedUser);
    } catch (err) {
      console.error(err);
      alert("Erro ao processar devoluções.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMassReturn = async () => {
    if (!selectedUser || selectedReturnItems.length === 0) return;

    if (!window.confirm(`Confirmar a devolução de ${selectedReturnItems.length} item(ns)?`)) return;

    setIsLoading(true);
    const reg = selectedUser.registration;
    
    try {
      let finalReturnPhotoUrl: string | null = null;
      if (returnPhoto) {
        try {
          const photoRes = await fetch("/api/upload-tool-photo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photo: returnPhoto, auditId: `return-${Date.now()}` }),
          });
          if (photoRes.ok) {
            const { url } = await photoRes.json();
            if (url) finalReturnPhotoUrl = url;
          }
        } catch (e) {
          console.error("Failed to upload return photo", e);
        }
      }

      // Create an audit for this mass return
      const { data: auditData, error: auditError } = await supabase
        .from("cautelia_audits")
        .insert({
          user_id: reg,
          operator_id: localOperator.registration,
          type: "return",
          status: "pending_signature",
          branch_id: selectedUser.branch_id || localOperator.branch_id || null,
          tool_photo_url: finalReturnPhotoUrl,
          obs: returnObs || 'Devolução em Massa'
        })
        .select()
        .single();
        
      if (auditError) throw auditError;
      
      const newAuditItems = [];

      for (const itemId of selectedReturnItems) {
        const item = cautelas.find(i => i.id === itemId);
        if (!item) continue;
        
        newAuditItems.push({
          audit_id: auditData.id,
          stock_tool_id: item.tool_id,
          status: 'ok',
          quantity: 1,
        });

        if (item.type === "standard") {
          await supabase.from("cautelia_reports").delete().eq("user_id", reg).eq("tool_id", item.tool_id);
          await supabase.from("transactions").insert({
            tool_id: item.tool_id,
            user_id: reg,
            type: "return",
            quantity: 1,
            status: "completed",
            obs: "Devolução em massa (item padrão)",
            photos: finalReturnPhotoUrl ? [finalReturnPhotoUrl] : [],
          });
        } else {
          const { data: tool } = await supabase
            .from("tools")
            .select("quantity_available, cautela_quantity, borrowed_quantity, branch_id, branch")
            .eq("id", item.tool_id)
            .single();
          
          if (tool) {
            const total_fisico = (tool.quantity_available || 0) + (tool.cautela_quantity || 0) + (tool.borrowed_quantity || 0);
            const isLoan = item.type === 'loan' || item.subType === 'loan';
            
            const novo_cautela = isLoan ? tool.cautela_quantity : Math.max(0, (tool.cautela_quantity || 0) - 1);
            const novo_borrowed = isLoan ? Math.max(0, (tool.borrowed_quantity || 0) - 1) : tool.borrowed_quantity;
            const novo_disponivel = total_fisico - novo_cautela - novo_borrowed;

            if (novo_disponivel >= 0 && novo_disponivel <= total_fisico) {
              await supabase.from("tools").update({
                quantity_available: novo_disponivel,
                cautela_quantity: novo_cautela,
                borrowed_quantity: novo_borrowed
              }).eq("id", item.tool_id);

              await supabase.from("transactions").insert({
                tool_id: item.tool_id,
                user_id: reg,
                type: "return",
                quantity: 1,
                branch_id: tool.branch_id,
                branch: tool.branch,
                status: "completed",
                obs: "Devolução em massa pelo administrador",
                photos: finalReturnPhotoUrl ? [finalReturnPhotoUrl] : [],
              });
            }
          }
          await supabase.from("cautelas").delete().eq("user_id", reg).eq("tool_id", item.tool_id);
        }
      }
      
      if (newAuditItems.length > 0) {
        await supabase.from("cautelia_audit_items").insert(newAuditItems);
      }
      
      showToast(`${selectedReturnItems.length} itens devolvidos com sucesso.`);
      setIsMassReturnModalOpen(false);
      setSelectedReturnItems([]);
      setReturnPhoto(null);
      setReturnObs('');
      fetchUserData(selectedUser);
      
      // Trigger signature flow for this return receipt
      const generatedFullAudit = {
        ...auditData,
        cautelia_audit_items: newAuditItems.map(ai => ({
          ...ai,
          tools: cautelas.find(c => c.tool_id === ai.stock_tool_id)
        })),
        users_access: selectedUser,
        operator: localOperator
      };
      setSigningAudit(generatedFullAudit);
      
    } catch (err) {
      console.error(err);
      alert("Erro ao processar devoluções em massa.");
    } finally {
      setIsLoading(false);
    }
  };

  const statusMap: any = {
    ok: {
      label: "OK",
      color: "text-emerald-600",
      bg: "bg-emerald-100",
      icon: CheckCircle2,
    },
    missing: {
      label: "Não Recebi / Extraviado",
      color: "text-red-600",
      bg: "bg-red-100",
      icon: AlertCircle,
    },
    damaged: {
      label: "Danificado",
      color: "text-amber-600",
      bg: "bg-amber-100",
      icon: AlertCircle,
    },
  };

  const getComparisonData = () => {
    const audit1 = history.find((a) => a.id === compareDates.audit1);
    const audit2 = history.find((a) => a.id === compareDates.audit2);

    if (!audit1 || !audit2) return [];

    const items1 = audit1.cautelia_audit_items || [];
    const items2 = audit2.cautelia_audit_items || [];

    const toolIds = Array.from(
      new Set([
        ...items1.map((i: any) => i.tool_id || i.stock_tool_id),
        ...items2.map((i: any) => i.tool_id || i.stock_tool_id),
      ]),
    );

    return toolIds.map((tid) => {
      const toolInfo =
        items1.find((i: any) => i.tool_id === tid || i.stock_tool_id === tid)?.cautelia_standard_tools ||
        items2.find((i: any) => i.tool_id === tid || i.stock_tool_id === tid)?.cautelia_standard_tools ||
        items1.find((i: any) => i.tool_id === tid || i.stock_tool_id === tid)?.tools ||
        items2.find((i: any) => i.tool_id === tid || i.stock_tool_id === tid)?.tools;
      
      return {
        tool: toolInfo,
        status1:
          items1.find((i: any) => i.tool_id === tid || i.stock_tool_id === tid)?.status || "AUSENTE",
        status2:
          items2.find((i: any) => i.tool_id === tid || i.stock_tool_id === tid)?.status || "AUSENTE",
      };
    });
  };

  const filteredTechs = technicians.filter((t) => {
    return (
      (t.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.registration || "").includes(searchTerm)
    );
  });

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-6 space-y-6 font-sans">
      {/* Global Manager Modal */}
      <AnimatePresence>
        {showGlobalManager && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-800 leading-none">
                    Gerenciar Lista Padrão
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                    Ferramentas base para todos os técnicos
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      setIsLoading(true);
                      try {
                        const defaultTools = [
                          "Chave de fenda 1/8x4 pequena",
                          "Chave de fenda 3/16x6 media",
                          "Chave de fenda 3/6x10 grande",
                          "chave de fenda 1/4 x 1.1/2 toco",
                          "Chave de fenda 3/8x8",
                          "Chave Philips 1/8x4 pequena",
                          "Chave Philips 3/16x6 media",
                          "Chave Philips 3/8x10 grande",
                          "Philips 1/4x6",
                          "Chave Philips 1/4 x 1.1/2",
                          "Martelo bola 200g",
                          "Marreta 2000g",
                          "trena",
                          "Calibre folgas 20 lâminas",
                          "Chave Allen Jogo mm",
                          "Chave allen Jogo pol",
                          "Caixa de ferramenta sanfonada 5 gavetas",
                          "Jogo de saca pino",
                          "Talhadeira",
                          "Arco de serra 12''",
                          "Alicate de pressão",
                          "Alicate universal",
                          "Alicate de corte",
                          "Alicate de bico",
                          "Jogo de alicates de trava para aneis",
                          "Cinta de poliester p/ filtro",
                          "Chave ajustavel de 18''",
                          "Kit manometro",
                          "Adaptador de 3/4 para 1/2",
                          "Soquete allen 1/2 Jogo",
                          "Soquete torks Jogo",
                          "Jogo soquete 1/2 Jogo mm",
                          'Chave "L" Jogo mm',
                          "Chave meia lua Jogo",
                          "Chave combinada Jogo mm",
                          "Chave fixa Jogo",
                          "Espatula",
                          "Chave canhão Jogo",
                          "Multimetro digital",
                          "Chave allen torks E10",
                          "Removedor de selo de óleo",
                          "Infrared",
                          "Gorniômetro",
                          "Torquímetro",
                        ];

                        const { data: existing } = await supabase
                          .from("cautelia_standard_tools")
                          .select("name");
                        const existingNames = new Set(
                          (existing || []).map((e) => e.name),
                        );

                        const toolsToInsert = defaultTools
                          .filter((name) => !existingNames.has(name))
                          .map((name) => ({ name }));

                        if (toolsToInsert.length > 0) {
                          const { error } = await supabase
                            .from("cautelia_standard_tools")
                            .insert(toolsToInsert);
                          if (error) throw error;
                        }

                        await fetchStandardTools();
                      } catch (err: any) {
                        console.error(err);
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-white px-4 py-2 rounded-xl shadow-sm border border-indigo-100 hover:bg-indigo-50 transition-all font-sans"
                  >
                    Importar Padrão
                  </button>
                  <button
                    onClick={() => setShowGlobalManager(false)}
                    className="p-3 bg-white text-slate-400 hover:text-rose-500 rounded-2xl shadow-sm transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="NOVA FERRAMENTA (EX: CHAVE DE FENDA...)"
                    value={newToolName}
                    onChange={(e) => setNewToolName(e.target.value)}
                    className="flex-1 bg-slate-50 border-transparent rounded-2xl px-6 py-4 text-xs font-black uppercase tracking-widest transition-all outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={async () => {
                      if (!newToolName) return;
                      const { error } = await supabase
                        .from("cautelia_standard_tools")
                        .insert({ name: newToolName });
                      if (!error) {
                        setNewToolName("");
                        fetchStandardTools();
                      }
                    }}
                    className="bg-indigo-500 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase italic active:scale-95 transition-all shadow-lg shadow-indigo-100"
                  >
                    Adicionar
                  </button>
                </div>

                <div className="space-y-2 min-h-[100px]">
                  {availableStandardTools.length === 0 ? (
                    <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-[2rem]">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">
                        Nenhuma ferramenta na lista padrão
                      </p>
                      <p className="text-[8px] text-slate-400 font-bold uppercase mt-2">
                        Clique em &quot;Importar Padrão&quot; para começar
                      </p>
                    </div>
                  ) : (
                    availableStandardTools.map((tool) => (
                      <div
                        key={tool.id}
                        className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between group animate-in fade-in slide-in-from-top-1"
                      >
                        <div className="flex items-center gap-3">
                          <Zap size={16} className="text-indigo-400" />
                          <span className="text-[10px] font-black uppercase italic tracking-tight text-slate-700">
                            {tool.name}
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            await supabase
                              .from("cautelia_standard_tools")
                              .delete()
                              .eq("id", tool.id);
                            fetchStandardTools();
                          }}
                          className="p-2 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter italic uppercase leading-none">
            Minha CautelIA
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1 italic opacity-75">
            Gestão centralizada de responsabilidade técnica
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Ocultado conforme solicitação do usuário */}
          {/* {(currentUser?.role === "Administrador" ||
            currentUser?.role === "Operador") && (
            <button
              onClick={() => setShowGlobalManager(true)}
              className="bg-indigo-50 text-indigo-600 px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all shadow-sm border border-indigo-100 flex items-center gap-2"
            >
              <ClipboardCheck size={14} /> Lista Padrão
            </button>
          )} */}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar for Admins */}
        {(currentUser?.role === "Administrador" ||
          currentUser?.role === "Operador") && (
          <aside className="lg:col-span-4 space-y-4">
            <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="BUSCAR TÉCNICO..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border-transparent rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                <h3 className="font-black text-slate-400 text-[10px] uppercase tracking-widest">
                  Painel Tecnico
                </h3>
                {technicians.length > 0 && (
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter bg-white px-2 py-0.5 rounded-full border border-slate-100 shadow-sm">
                    {technicians.length} usuários
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto custom-scrollbar">
                {filteredTechs.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">
                      Nenhum técnico encontrado
                    </p>
                  </div>
                ) : (
                  filteredTechs.map((tech) => (
                    <div
                      key={tech.id}
                      onClick={() =>
                        fetchUserData(tech).then(() => setSelectedUser(tech))
                      }
                      className={`w-full p-5 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer group/tech ${selectedUser?.id === tech.id ? "bg-indigo-50/50 border-r-4 border-indigo-500" : ""}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-slate-400 font-black text-xs uppercase overflow-hidden">
                          {tech.avatar ? (
                            <Image
                              src={tech.avatar}
                              alt="Avatar"
                              width={48}
                              height={48}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            (tech.name || "").substring(0, 2)
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-black text-slate-800 uppercase italic leading-none">
                            {tech.name}
                          </p>
                          <p className="text-[9px] text-slate-400 font-mono mt-1 tracking-wider uppercase font-bold">
                            {(tech as any)._isClientEmployee
                              ? <span className="text-indigo-400">🏢 {(tech as any)._clientName || 'Cliente'}</span>
                              : <>MAT: {tech.registration}</>
                            }
                          </p>

                          {/* Quick Association Button for Admins */}
                          {(currentUser?.role === "Administrador" ||
                            currentUser?.role === "Operador") && !linkedUsers.has(tech.registration) && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                setIsLoading(true);
                                try {
                                  const toInsert = availableStandardTools.map(
                                    (tool) => ({
                                      user_id: tech.registration,
                                      tool_id: tool.id,
                                      status: "ok",
                                      last_check: new Date().toISOString(),
                                    }),
                                  );
                                  await supabase
                                    .from("cautelia_reports")
                                    .upsert(toInsert, {
                                      onConflict: "user_id, tool_id",
                                    });
                                  
                                  // Update local set of linked users
                                  setLinkedUsers(prev => {
                                    const next = new Set(prev);
                                    next.add(tech.registration);
                                    return next;
                                  });

                                  await fetchUserData(tech);
                                  setSelectedUser(tech);
                                } catch (err) {
                                  console.error(err);
                                } finally {
                                  setIsLoading(false);
                                }
                              }}
                              className="mt-2 text-[8px] font-black uppercase text-indigo-500 hover:text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded transition-colors"
                            >
                              Vincular Lista Padrão
                            </button>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        )}

        {/* Main Content Area */}
        <main
          className={`${currentUser?.role === "Administrador" || currentUser?.role === "Operador" ? "lg:col-span-8" : "lg:col-span-12"}`}
        >
          <AnimatePresence mode="wait">
            {selectedUser ? (
              <motion.div
                key="user-view"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-slate-900 rounded-[3rem] p-8 text-white relative overflow-hidden shadow-2xl">
                  <div className="relative z-10 flex flex-col gap-6 sm:gap-8 2xl:flex-row 2xl:items-center 2xl:justify-between">
                    <div className="flex items-center gap-4 sm:gap-6 min-w-0">
                      <div className="w-24 h-24 rounded-[2rem] bg-indigo-500/20 border border-white/10 backdrop-blur-xl flex items-center justify-center font-black text-3xl uppercase overflow-hidden shadow-inner">
                        {selectedUser.avatar ? (
                          <Image
                            src={selectedUser.avatar}
                            alt="Avatar"
                            width={96}
                            height={96}
                          />
                        ) : (
                          selectedUser.name.substring(0, 2)
                        )}
                      </div>
                      <div>
                        <h2 className="text-xl sm:text-2xl md:text-3xl font-black italic uppercase tracking-tighter leading-tight break-words line-clamp-2">
                          {selectedUser.name}
                        </h2>
                        <p className="text-indigo-400 font-black text-[9px] sm:text-[10px] uppercase tracking-[0.2em] mt-2 sm:mt-3 flex items-center gap-2">
                          <MapPin size={12} className="opacity-50" />{" "}
                          {
                            branches.find(
                              (b) => b.id === selectedUser.branch_id,
                            )?.name
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex bg-white/5 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 items-center shrink-0 overflow-x-auto max-w-full custom-scrollbar mt-4 2xl:mt-0">
                    {[
                      { id: "current", label: "Atual" },
                      { id: "history", label: "Histórico" },
                      { id: "compare", label: "Comparar" },
                      // { id: "report", label: "Novo Report", techOnly: true },
                      { id: "manage", label: "Gerenciar", adminOnly: true },
                    ]
                      .filter((m: any) => {
                        if (m.techOnly)
                          return (
                            currentUser?.role === "Técnico" ||
                            currentUser?.registration ===
                              selectedUser.registration
                          );
                        if (m.adminOnly)
                          return (
                            currentUser?.role === "Administrador" ||
                            currentUser?.role === "Operador"
                          );
                        return true;
                      })
                      .map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setViewMode(m.id as any)}
                          className={`px-3 sm:px-6 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${viewMode === m.id ? "bg-white text-slate-900 shadow-xl" : "text-white/40 hover:text-white"}`}
                        >
                          {m.label}
                        </button>
                      ))}
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 blur-[100px] rounded-full -mr-32 -mt-32" />

                {/* Views */}
                <div className="font-sans">
                  {viewMode === "current" && (
                    <div className="grid gap-4">
                      {/* Section for Pending Audits */}
                      {history?.filter(a => a.status === 'pending').length > 0 && (
                        <div className="space-y-4 mb-6">
                           <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] italic ml-4 mb-2 flex items-center gap-2">
                             <AlertCircle size={14} /> Cautelas Aguardando Assinatura
                           </h3>
                           {history.filter(a => a.status === 'pending').map(audit => (
                             <div key={audit.id} className="bg-rose-50 border border-rose-100 rounded-[2rem] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 animate-pulse hover:animate-none group">
                               <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-rose-500 shadow-sm">
                                   <SignatureIcon size={24} />
                                 </div>
                                 <div>
                                   <p className="text-xs font-black text-rose-900 uppercase italic">
                                     Pendente: {new Date(audit.created_at).toLocaleDateString('pt-BR')}
                                   </p>
                                   <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest mt-0.5">
                                     {audit.cautelia_audit_items?.length || 0} Itens Vinculados por {branches.find(b => b.id === audit.branch_id)?.name || 'Administração'}
                                   </p>
                                 </div>
                               </div>
                               <div className="flex gap-3">
                                 {currentUser?.registration === selectedUser.registration && (
                                   <button 
                                     onClick={() => {
                                       setSigningAudit(audit);
                                       // Scroll to signature pad or open modal? 
                                       // Let's use a modal approach by checking signingAudit later
                                     }}
                                     className="px-6 py-3 bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-100 hover:shadow-xl transition-all"
                                   >
                                     Assinar Agora
                                   </button>
                                 )}
                                 <button 
                                   onClick={() => {
                                     const link = `${window.location.origin}/assinatura/${audit.id}`;
                                     copyToClipboard(link);
                                   }}
                                   className="p-3 bg-white text-rose-500 rounded-xl border border-rose-100 shadow-sm hover:scale-105 transition-all"
                                   title="Copiar Link"
                                 >
                                   <Share2 size={16} />
                                 </button>
                               </div>
                             </div>
                           ))}
                        </div>
                      )}

                      {(currentUser?.role === "Administrador" ||
                        currentUser?.role === "Operador") &&
                        cautelas.length > 0 && (
                          <div className="flex flex-col gap-4">

                            {/* Campos: Foto e Observação — preenchidos pelo operador antes de gerar o link */}
                            <div className="rounded-[2rem] bg-white border border-slate-100 shadow-sm p-6 flex flex-col gap-4">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                Registrar antes de cautelar
                              </p>

                              {/* Foto */}
                              <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                                  Foto das Ferramentas <span className="text-slate-300 font-normal normal-case">(opcional)</span>
                                </label>

                                <input
                                  ref={auditPhotoInputRef}
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={handleAuditPhotoFromGallery}
                                />
                                <canvas ref={auditPhotoCaptureCanvasRef} className="hidden" />

                                {isCapturingAuditPhoto && (
                                  <div className="rounded-2xl overflow-hidden border-2 border-indigo-200 bg-black relative mb-2">
                                    <video
                                      ref={auditVideoRef}
                                      autoPlay
                                      playsInline
                                      muted
                                      className="w-full h-48 object-cover"
                                    />
                                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3 px-4">
                                      <button
                                        onClick={stopAuditCamera}
                                        className="flex items-center gap-2 bg-white/20 backdrop-blur text-white font-black text-[9px] uppercase tracking-widest px-4 py-2 rounded-xl border border-white/30"
                                      >
                                        <X size={12} /> Cancelar
                                      </button>
                                      <button
                                        onClick={captureAuditPhoto}
                                        className="flex items-center gap-2 bg-indigo-600 text-white font-black text-[9px] uppercase tracking-widest px-5 py-2 rounded-xl shadow-xl"
                                      >
                                        <Camera size={14} /> Tirar Foto
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {auditToolPhoto && !isCapturingAuditPhoto && (
                                  <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-200 mb-2">
                                    <img
                                      src={auditToolPhoto}
                                      alt="Foto das ferramentas"
                                      className="w-full h-40 object-cover"
                                    />
                                    <button
                                      onClick={() => setAuditToolPhoto(null)}
                                      className="absolute top-2 right-2 w-7 h-7 bg-rose-500 text-white rounded-full flex items-center justify-center shadow"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                                      <p className="text-[9px] font-black text-white uppercase tracking-widest">Foto registrada ✓</p>
                                    </div>
                                  </div>
                                )}

                                {!auditToolPhoto && !isCapturingAuditPhoto && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      onClick={startAuditCamera}
                                      className="flex flex-col items-center justify-center gap-2 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl py-4 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group"
                                    >
                                      <div className="w-8 h-8 bg-indigo-100 text-indigo-500 rounded-xl flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                        <Camera size={16} />
                                      </div>
                                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Câmera</p>
                                    </button>
                                    <button
                                      onClick={() => auditPhotoInputRef.current?.click()}
                                      className="flex flex-col items-center justify-center gap-2 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl py-4 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group"
                                    >
                                      <div className="w-8 h-8 bg-indigo-100 text-indigo-500 rounded-xl flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                        <ImagePlus size={16} />
                                      </div>
                                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Galeria</p>
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Observação */}
                              <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                                  Observação <span className="text-slate-300 font-normal normal-case">(opcional)</span>
                                </label>
                                <textarea
                                  value={auditObs}
                                  onChange={(e) => setAuditObs(e.target.value)}
                                  placeholder="Informe qualquer observação relevante..."
                                  rows={2}
                                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-[11px] font-bold text-slate-700 placeholder:text-slate-300 resize-none focus:outline-none focus:border-indigo-300 transition-colors"
                                />
                              </div>
                            </div>

                            <div className="flex flex-col items-center justify-between gap-6 rounded-[2.5rem] bg-emerald-500 p-8 text-white shadow-[0_20px_50px_rgba(16,185,129,0.2)] md:flex-row">
                              <div className="flex items-center gap-6">
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xl">
                                  <Share2 size={32} />
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-xl font-black uppercase italic leading-none">
                                    Cautelar Agora
                                  </h4>
                                  <p className="mt-2 text-[9px] font-black uppercase tracking-widest text-emerald-100 opacity-80">
                                    Gere o link de assinatura para o técnico
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => generateSignatureLink()}
                                disabled={isGeneratingLink}
                                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-[11px] font-black uppercase tracking-[0.1em] text-emerald-600 shadow-xl transition-all hover:scale-105 active:scale-95 md:w-auto"
                              >
                                {isGeneratingLink
                                  ? "GERANDO..."
                                  : "OBTER LINK DE ASSINATURA"}
                                <ArrowRight size={16} />
                              </button>
                            </div>
                            
                            <div className="flex justify-end gap-2">
                              {(currentUser?.role === "Administrador" || currentUser?.role === "Operador") && (
                                <button
                                  onClick={() => {
                                    setSelectedReturnItems([]);
                                    setIsMassReturnModalOpen(true);
                                  }}
                                  className="flex items-center gap-2 px-6 py-3 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100 hover:bg-indigo-100 transition-all font-sans"
                                >
                                  <RotateCcw size={14} />
                                  Devolver Itens
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setDemissaoItems(cautelas.map(item => ({ ...item, devolveu: null })));
                                  setIsDemissaoModalOpen(true);
                                }}
                                className="flex items-center gap-2 px-6 py-3 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-all"
                              >
                                <AlertCircle size={14} />
                                Devolver Tudo (Demissão)
                              </button>
                            </div>
                          </div>
                        )}
                      {cautelas.length === 0 ? (
                        <div className="p-20 text-center bg-white rounded-[3rem] border border-dashed border-slate-200">
                          <Package
                            size={64}
                            className="text-slate-100 mx-auto mb-6"
                          />
                          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest italic">
                            Nenhuma ferramenta vinculada
                          </h3>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 max-w-[200px] mx-auto opacity-60">
                            Use a aba de gerenciamento para preparar uma nova cautela.
                          </p>
                          {(currentUser?.role === "Administrador" ||
                            currentUser?.role === "Operador") && (
                            <button
                              onClick={() => {
                                setStagedAuditItems([]); // Clear standard items to start from stock
                                setViewMode("manage");
                              }}
                              className="mt-8 px-6 py-3 bg-indigo-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-100 hover:scale-105 transition-all"
                            >
                              Preparar Cautela Agora
                            </button>
                          )}
                        </div>
                      ) : (
                        cautelas.map((item) => (
                          <div
                            key={item.id}
                            className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between hover:scale-[1.02] transition-all group"
                          >
                            <div className="flex items-center gap-5">
                              <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 group-hover:text-indigo-500 transition-colors overflow-hidden border border-slate-100 relative">
                                {item.type === "big" ? (
                                  <Package size={24} />
                                ) : (
                                  <Zap size={24} />
                                )}
                                <div
                                  className={`absolute top-0 right-0 px-1.5 py-0.5 text-[6px] font-black uppercase tracking-tighter ${item.type === "big" ? "bg-amber-500 text-white" : "bg-indigo-500 text-white"}`}
                                >
                                  {item.type === "big" ? "GRANDE" : "PADRÃO"}
                                </div>
                              </div>
                              <div>
                                <h4 className="font-black text-slate-800 uppercase italic leading-tight">
                                  {item.name}
                                </h4>
                                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">
                                  {item.category || "FERRAMENTA PADRÃO"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {/* Interactive status toggle for authorized users */}
                              {currentUser?.role === "Administrador" ||
                              currentUser?.role === "Operador" ||
                              currentUser?.registration ===
                                selectedUser.registration ? (
                                <div className="flex items-center gap-2">
                                  <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
                                    {["ok", "missing", "damaged"].map((st) => (
                                      <button
                                        key={st}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleQuickUpdate(item, st);
                                        }}
                                        title={statusMap[st].label}
                                        className={`p-2 rounded-xl transition-all ${item.status === st ? statusMap[st].bg + " " + statusMap[st].color + " shadow-sm" : "text-slate-400 hover:bg-white"}`}
                                      >
                                        {React.createElement(
                                          statusMap[st].icon,
                                          { size: 14 },
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                  {(currentUser?.role === "Administrador" ||
                                    currentUser?.role === "Operador") && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedReturnItems([item.id]);
                                        setIsMassReturnModalOpen(true);
                                      }}
                                      className="p-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                      title={item.type === "big" ? "Devolver ao Estoque" : "Remover da Cautela"}
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div
                                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${statusMap[item.status || "ok"]?.bg} ${statusMap[item.status || "ok"]?.color}`}
                                >
                                  {statusMap[item.status || "ok"]?.label}
                                </div>
                              )}
                            </div>
                          </div>
                        )))}
                    {/* Mass Return Modal */}
                    <AnimatePresence>
                    {isMassReturnModalOpen && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
                      >
                        <motion.div
                          initial={{ scale: 0.9, opacity: 0, y: 20 }}
                          animate={{ scale: 1, opacity: 1, y: 0 }}
                          exit={{ scale: 0.9, opacity: 0, y: 20 }}
                          className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                          <div className="bg-indigo-50 p-8 border-b border-indigo-100 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                                <RotateCcw size={24} />
                              </div>
                              <div>
                                <h3 className="text-xl font-black italic uppercase tracking-tight text-indigo-900 leading-none">Devolução em Massa</h3>
                                <p className="text-[10px] text-indigo-400 font-bold uppercase mt-2 tracking-widest">Selecione os itens para devolver ao estoque</p>
                              </div>
                            </div>
                            <button onClick={() => setIsMassReturnModalOpen(false)} className="p-3 bg-white text-slate-400 rounded-2xl shadow-sm hover:text-indigo-500 transition-all">
                              <X size={20} />
                            </button>
                          </div>

                          <div className="p-8 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                            <div className="flex items-center justify-between mb-2">
                               <label className="flex items-center gap-3 cursor-pointer group">
                                  <input 
                                    type="checkbox"
                                    className="hidden"
                                    checked={selectedReturnItems.length === cautelas.length}
                                    onChange={() => {
                                      if (selectedReturnItems.length === cautelas.length) {
                                        setSelectedReturnItems([]);
                                      } else {
                                        setSelectedReturnItems(cautelas.map(c => c.id));
                                      }
                                    }}
                                  />
                                  <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${selectedReturnItems.length === cautelas.length ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200'}`}>
                                    {selectedReturnItems.length === cautelas.length && <CheckCircle2 size={14} className="text-white" />}
                                  </div>
                                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Marcar Todos</span>
                               </label>
                               <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-tighter">
                                 {selectedReturnItems.length} selecionados
                               </span>
                            </div>

                            {cautelas.map((item) => (
                              <div key={item.id} className={`p-5 rounded-[2rem] border transition-all flex items-center justify-between ${selectedReturnItems.includes(item.id) ? 'bg-indigo-50 border-indigo-100 shadow-sm' : 'bg-white border-slate-100'}`}>
                                <div className="flex items-center gap-4">
                                  <label className="flex items-center gap-4 cursor-pointer">
                                     <input 
                                       type="checkbox"
                                       className="hidden"
                                       checked={selectedReturnItems.includes(item.id)}
                                       onChange={() => {
                                         if (selectedReturnItems.includes(item.id)) {
                                           setSelectedReturnItems(prev => prev.filter(id => id !== item.id));
                                         } else {
                                           setSelectedReturnItems(prev => [...prev, item.id]);
                                         }
                                       }}
                                     />
                                     <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${selectedReturnItems.includes(item.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200'}`}>
                                       {selectedReturnItems.includes(item.id) && <CheckCircle2 size={14} className="text-white" />}
                                     </div>
                                     <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${selectedReturnItems.includes(item.id) ? 'bg-indigo-100 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                                       {item.type === 'big' ? <Package size={20} /> : <Zap size={20} />}
                                     </div>
                                     <div>
                                        <p className={`text-xs font-black uppercase italic leading-none ${selectedReturnItems.includes(item.id) ? 'text-indigo-900' : 'text-slate-700'}`}>{item.name}</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{item.type === 'big' ? 'GRANDE PORTE' : 'PADRÃO'}</p>
                                     </div>
                                  </label>
                                </div>
                              </div>
                            ))}
                            
                            {/* Photo and Obs upload for Mass Return */}
                            <div className="mt-8 space-y-4">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-800">
                                  Foto da Devolução <span className="text-slate-400 font-normal normal-case">(opcional)</span>
                                </h4>
                                
                                <div className="space-y-4 relative w-full overflow-hidden rounded-2xl bg-white border border-slate-200">
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    ref={returnPhotoInputRef}
                                    onChange={handleReturnPhotoFromGallery}
                                  />
                                  <canvas ref={returnPhotoCaptureCanvasRef} className="hidden" />
                                  
                                  {isCapturingReturnPhoto && (
                                    <div className="relative w-full h-48 bg-black flex items-center justify-center">
                                       <video
                                         ref={returnVideoRef}
                                         autoPlay
                                         playsInline
                                         muted
                                         className="w-full h-48 object-cover"
                                       />
                                       <div className="absolute bottom-4 left-0 w-full flex justify-center gap-4 z-10">
                                         <button onClick={captureReturnPhoto} className="flex items-center gap-1 bg-indigo-600 text-white font-black text-[9px] uppercase tracking-widest px-4 py-2 rounded-xl shadow-xl">
                                           <Camera size={14} /> Capturar
                                         </button>
                                         <button onClick={() => setIsCapturingReturnPhoto(false)} className="flex items-center gap-1 bg-white text-slate-600 font-black text-[9px] uppercase tracking-widest px-4 py-2 rounded-xl shadow-xl">
                                           Cancelar
                                         </button>
                                       </div>
                                    </div>
                                  )}
                                  
                                  {returnPhoto && !isCapturingReturnPhoto && (
                                    <div className="relative w-full h-48 bg-slate-100 flex items-center justify-center">
                                      <img 
                                        src={returnPhoto} 
                                        alt="Foto da devolução"
                                        className="w-full h-48 object-cover"
                                      />
                                      <button 
                                        onClick={() => setReturnPhoto(null)}
                                        className="absolute top-4 right-4 w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg hover:bg-rose-400"
                                      >
                                        <X size={14} />
                                      </button>
                                      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center opacity-80 pointer-events-none">
                                        <p className="text-[9px] font-black text-white uppercase tracking-widest">Foto registrada ✓</p>
                                      </div>
                                    </div>
                                  )}

                                  {!returnPhoto && !isCapturingReturnPhoto && (
                                    <div className="grid grid-cols-2 gap-2 text-center h-48">
                                       <button 
                                         onClick={startReturnCamera}
                                         className="flex flex-col items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 transition-colors border-r border-slate-100 text-slate-400 group"
                                       >
                                         <Camera size={24} className="group-hover:text-indigo-500 transition-colors" />
                                          <span className="text-[9px] font-black uppercase tracking-widest group-hover:text-indigo-900 transition-colors">Tirar Foto</span>
                                       </button>
                                       <button 
                                         onClick={() => returnPhotoInputRef.current?.click()}
                                         className="flex flex-col items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 transition-colors text-slate-400 group"
                                       >
                                         <Download size={24} className="group-hover:text-indigo-500 transition-colors" />
                                          <span className="text-[9px] font-black uppercase tracking-widest group-hover:text-indigo-900 transition-colors">Galeria</span>
                                       </button>
                                    </div>
                                  )}
                                </div>
                                <div className="mt-4">
                                  <textarea
                                    className="w-full bg-white border border-slate-200 outline-none p-4 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all custom-scrollbar resize-none"
                                    rows={2}
                                    placeholder="Observação da devolução..."
                                    value={returnObs}
                                    onChange={(e) => setReturnObs(e.target.value)}
                                  />
                                </div>
                            </div>
                          </div>

                          <div className="p-8 bg-slate-50 border-t border-slate-100">
                            <button 
                              onClick={handleMassReturn}
                              disabled={isLoading || selectedReturnItems.length === 0}
                              className={`w-full font-black italic py-6 rounded-[2.5rem] shadow-2xl flex items-center justify-center gap-3 transition-all text-sm uppercase ${selectedReturnItems.length === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white shadow-indigo-200 active:scale-95'}`}
                            >
                              {isLoading ? 'PROCESSANDO...' : 'Confirmar Devolução Selecionada'}
                              <ArrowRight size={20} />
                            </button>
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                    </AnimatePresence>

                    <AnimatePresence>
                    {isDemissaoModalOpen && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
                      >
                        <motion.div
                          initial={{ scale: 0.9, opacity: 0, y: 20 }}
                          animate={{ scale: 1, opacity: 1, y: 0 }}
                          exit={{ scale: 0.9, opacity: 0, y: 20 }}
                          className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                          <div className="bg-rose-50 p-8 border-b border-rose-100 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-rose-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-200">
                                <AlertCircle size={24} />
                              </div>
                              <div>
                                <h3 className="text-xl font-black italic uppercase tracking-tight text-rose-900 leading-none">Checkout de Demissão</h3>
                                <p className="text-[10px] text-rose-400 font-bold uppercase mt-2 tracking-widest">Confirme a devolução de cada ferramenta</p>
                              </div>
                            </div>
                            <button onClick={() => setIsDemissaoModalOpen(false)} className="p-3 bg-white text-slate-400 rounded-2xl shadow-sm hover:text-rose-500 transition-all">
                              <X size={20} />
                            </button>
                          </div>

                          <div className="p-8 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                            {demissaoItems.map((item, index) => (
                              <div key={item.id} className={`p-5 rounded-[2rem] border transition-all flex items-center justify-between ${item.devolveu === true ? 'bg-emerald-50 border-emerald-100 shadow-sm' : item.devolveu === false ? 'bg-rose-50 border-rose-100 shadow-sm' : 'bg-white border-slate-100 shadow-sm'}`}>
                                <div className="flex items-center gap-4">
                                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${item.devolveu === true ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : item.devolveu === false ? 'bg-rose-100 border-rose-200 text-rose-600' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                                    {item.type === 'big' ? <Package size={20} /> : <Zap size={20} />}
                                  </div>
                                  <div>
                                    <p className={`text-xs font-black uppercase italic leading-none ${item.devolveu === true ? 'text-emerald-900' : item.devolveu === false ? 'text-rose-900' : 'text-slate-700'}`}>{item.name}</p>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{item.type === 'big' ? 'GRANDE PORTE' : 'PADRÃO'}</p>
                                  </div>
                                </div>
                                
                                <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
                                  <button 
                                    onClick={() => {
                                      const newItems = [...demissaoItems];
                                      newItems[index].devolveu = true;
                                      setDemissaoItems(newItems);
                                    }}
                                    className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${item.devolveu === true ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'text-slate-400 hover:bg-white'}`}
                                  >
                                    {item.devolveu === true && <CheckCircle2 size={10} />}
                                    Devolveu
                                  </button>
                                  <button 
                                    onClick={() => {
                                      const newItems = [...demissaoItems];
                                      newItems[index].devolveu = false;
                                      setDemissaoItems(newItems);
                                    }}
                                    className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${item.devolveu === false ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' : 'text-slate-400 hover:bg-white'}`}
                                  >
                                    {item.devolveu === false && <X size={10} />}
                                    Não Devolveu
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="p-8 bg-slate-50 border-t border-slate-100">
                            <button 
                              onClick={handleDemissaoConfirm}
                              disabled={isLoading || demissaoItems.some(i => i.devolveu === null)}
                              className={`w-full font-black italic py-6 rounded-[2.5rem] shadow-2xl flex items-center justify-center gap-3 transition-all text-sm uppercase ${demissaoItems.some(i => i.devolveu === null) ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-rose-600 text-white shadow-rose-200 active:scale-95'}`}
                            >
                              {isLoading ? 'PROCESSANDO...' : 'Finalizar e Devolver Selecionados'}
                              <ArrowRight size={20} />
                            </button>
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {viewMode === "report" && (
                    <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden p-8 space-y-8">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-800">
                          Conferência de Material
                        </h3>
                        <Calendar className="text-indigo-500" />
                      </div>

                      <div className="space-y-4">
                        {reportingItems.map((item) => (
                          <div
                            key={item.id}
                            className="p-6 bg-slate-50 rounded-[2rem] border border-slate-200 space-y-5 transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-amber-500">
                                  <Package size={20} />
                                </div>
                                <div>
                                  <p className="text-xs font-black uppercase italic leading-none text-slate-700">
                                    {item.name}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              {["ok", "missing", "damaged"].map((st) => (
                                <button
                                  key={st}
                                  onClick={() => {
                                    setReportingItems((prev) =>
                                      prev.map((i) =>
                                        i.id === item.id
                                          ? { ...i, status: st }
                                          : i,
                                      ),
                                    );
                                    if (st !== "ok") {
                                      alert(
                                        "Atenção: Você alterou o padrão. É obrigatório assinar ao final do checklist. Confira com cuidado as alterações.",
                                      );
                                    }
                                  }}
                                  className={`py-4 rounded-2xl border-2 text-[8px] font-black uppercase tracking-widest transition-all ${item.status === st ? (st === "ok" ? "bg-emerald-500 border-emerald-500 text-white shadow-lg" : "bg-rose-500 border-rose-500 text-white shadow-lg") : "bg-white border-slate-100 text-slate-400"}`}
                                >
                                  {st === "ok"
                                    ? "ESTÁ OK"
                                    : st === "missing"
                                      ? "NÃO RECEBI"
                                      : "DANIFICADO"}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="pt-8 border-t border-slate-100 space-y-6 text-center">
                        <div>
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                            Assinatura Digital
                          </h4>
                          <p className="text-[10px] text-slate-300 font-bold uppercase">
                            Assine na área abaixo para confirmar as informações
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-[2.5rem] border-2 border-slate-200 h-48 relative overflow-hidden group">
                          <canvas
                            ref={canvasRef}
                            width={600}
                            height={200}
                            className="w-full h-full cursor-crosshair"
                          />
                          <button
                            onClick={() => {
                              const ctx = canvasRef.current?.getContext("2d");
                              ctx?.clearRect(
                                0,
                                0,
                                canvasRef.current!.width,
                                canvasRef.current!.height,
                              );
                              setSignature(null);
                            }}
                            className="absolute bottom-4 right-6 text-[9px] font-black uppercase text-slate-300 hover:text-rose-500"
                          >
                            LIMPAR ASSINATURA
                          </button>
                        </div>

                        <button
                          onClick={submitReport}
                          disabled={isSubmitting || !signature}
                          className="w-full bg-slate-900 text-white font-black italic py-6 rounded-[2.5rem] shadow-2xl flex items-center justify-center gap-4 text-lg active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                        >
                          {isSubmitting
                            ? "ENVIANDO..."
                            : "FINALIZAR E ENVIAR REPORT"}{" "}
                          <ArrowRight size={20} />
                        </button>
                      </div>
                    </div>
                  )}

                  {viewMode === "manage" && (
                    <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden p-8 sm:p-12 space-y-10 animate-in fade-in zoom-in duration-500 min-h-[500px]">
                      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-10">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100">
                              <Package size={20} />
                            </div>
                            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900 leading-none">
                              Vincular Ferramentas
                            </h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-6">
                            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full bg-indigo-400"></span>
                              Estoque da Filial:{" "}
                              <span className="text-indigo-600 font-black">
                                {branches.find((b) => b.id === selectedAuditBranch)
                                  ?.name || "..."}
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                              Técnico:{" "}
                              <span className="text-emerald-600 font-black">
                                {selectedUser.name}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                            <select
                              value={selectedAuditBranch}
                              onChange={(e) => {
                                const newBranchId = e.target.value;
                                setSelectedAuditBranch(newBranchId);
                                fetchStockTools(newBranchId);
                              }}
                              className="bg-white border-none rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                            >
                              {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="relative">
                            <Search
                              size={14}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                            <input
                              type="text"
                              placeholder="BUSCAR..."
                              value={manageSearchTerm}
                              onChange={(e) => setManageSearchTerm(e.target.value)}
                              className="pl-9 pr-4 py-3 bg-slate-50 border-none rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-500 w-44 shadow-sm"
                            />
                          </div>
                        </div>
                      </header>

                      <div className="flex items-center justify-between">
                        <div className="flex gap-4">
                          <button 
                            onClick={() => setShowStandardInManage(!showStandardInManage)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${showStandardInManage ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100 opacity-60 hover:opacity-100'}`}
                          >
                            <Zap size={14} className={showStandardInManage ? "text-indigo-600" : "text-slate-400"} />
                            <span className={`text-[10px] font-black uppercase ${showStandardInManage ? "text-indigo-900" : "text-slate-500"}`}>
                              Lista Padrão {showStandardInManage ? '(Ocultar)' : '(Exibir)'}
                            </span>
                          </button>
                          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
                            <Package size={14} className="text-emerald-600" />
                            <span className="text-[10px] font-black text-emerald-900 uppercase">
                              Itens de Estoque
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {showStandardInManage && (
                            <button
                              onClick={() => {
                                setStagedAuditItems((prev) => {
                                  const standardItems =
                                    availableStandardTools.map((t) => ({
                                      tool_id: t.id,
                                      name: t.name,
                                      category: t.category || "PADRÃO",
                                      status: "ok",
                                      type: "standard",
                                    }));
                                  // Merge avoiding duplicates
                                  const filtered = prev.filter(
                                    (i) => i.type !== "standard",
                                  );
                                  return [...filtered, ...standardItems];
                                });
                              }}
                              className="px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-100"
                            >
                              + VINCULAR TUDO
                            </button>
                          )}
                          <button
                            onClick={() => setStagedAuditItems([])}
                            className="text-rose-500 hover:text-rose-600 text-[9px] font-black uppercase tracking-widest px-4 py-2"
                          >
                            LIMPAR TUDO
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar scroll-smooth">
                        {/* SECTION: STOCK TOOLS */}
                        <div className="col-span-full border-b border-emerald-50 pb-2 mb-2">
                           <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] italic">Estoque Local (Patrimônio)</h4>
                        </div>
                        {availableStockTools
                          .filter((t) =>
                            t.name
                              .toLowerCase()
                              .includes(manageSearchTerm.toLowerCase()),
                          )
                          .map((tool) => {
                            const stagedItem = stagedAuditItems.find(
                              (i) => i.tool_id === tool.id,
                            );
                            const isSelected = !!stagedItem;
                            return (
                              <div
                                key={tool.id}
                                className={`p-4 rounded-[2.5rem] border-2 transition-all flex flex-col gap-4 ${isSelected ? "border-emerald-500 bg-emerald-50/20 ring-4 ring-emerald-50/10" : "border-slate-50 bg-white hover:border-emerald-100"}`}
                              >
                                <button
                                  onClick={() => handleToolLinkToggle({ ...tool, type: 'big' })}
                                  className="flex items-center justify-between text-left group w-full"
                                >
                                  <div className="flex items-center gap-4">
                                    <div
                                      className={`p-3 rounded-xl transition-all shadow-sm ${isSelected ? "bg-emerald-600 text-white" : "bg-slate-50 text-slate-400"}`}
                                    >
                                      <Package size={18} />
                                    </div>
                                    <div className="space-y-1">
                                      <p
                                        className={`text-xs font-black uppercase italic leading-tight transition-colors ${isSelected ? "text-emerald-900" : "text-slate-800"}`}
                                      >
                                        {tool.name}
                                      </p>
                                      <div className="flex items-center gap-2">
                                        <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                                          {tool.code || "PATRIMÔNIO"}
                                        </p>
                                        <p className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${isSelected ? 'bg-emerald-600 text-white shadow-lg' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                                          ESTOQUE DISPONÍVEL: {tool.quantity_available || 0}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  <div
                                    className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${isSelected ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-100 bg-white"}`}
                                  >
                                    {isSelected ? (
                                      <CheckCircle2 size={16} />
                                    ) : (
                                      <div className="w-1.5 h-1.5 rounded-full bg-slate-100" />
                                    )}
                                  </div>
                                </button>

                                {isSelected && (
                                  <div className="flex bg-white/50 backdrop-blur-sm p-1 rounded-2xl gap-1 border border-emerald-100 self-end">
                                    {["ok", "missing", "damaged"].map((st) => (
                                      <button
                                        key={st}
                                        onClick={() =>
                                          updateStagedStatus(tool.id, st)
                                        }
                                        className={`px-3 py-1.5 rounded-xl text-[7px] font-black uppercase tracking-widest transition-all ${stagedItem.status === st ? statusMap[st].bg + " " + statusMap[st].color + " shadow-sm" : "text-slate-400 hover:bg-white"}`}
                                      >
                                        {statusMap[st].label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                        {availableStockTools.length === 0 && (
                          <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-50 rounded-[2rem] opacity-40">
                             <p className="text-[10px] font-black uppercase text-slate-400">Nenhuma ferramenta no estoque desta filial</p>
                          </div>
                        )}

                        {/* SECTION: STANDARD TOOLS */}
                        {showStandardInManage && (
                          <>
                            <div className="col-span-full border-b border-indigo-50 pb-2 mb-2 mt-6">
                               <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] italic">Modelos Padrão</h4>
                            </div>
                            {availableStandardTools
                              .filter((t) =>
                                t.name
                                  .toLowerCase()
                                  .includes(manageSearchTerm.toLowerCase()),
                              )
                              .map((tool) => {
                                const stagedItem = stagedAuditItems.find(
                                  (i) => i.tool_id === tool.id,
                                );
                                const isSelected = !!stagedItem;
                                return (
                                  <div
                                    key={tool.id}
                                    className={`p-4 rounded-[2.5rem] border-2 transition-all flex flex-col gap-4 ${isSelected ? "border-indigo-500 bg-indigo-50/20 ring-4 ring-indigo-50/10" : "border-slate-50 bg-white hover:border-indigo-100"}`}
                                  >
                                    <button
                                      onClick={() => handleToolLinkToggle({ ...tool, type: 'standard' })}
                                      className="flex items-center justify-between text-left group w-full"
                                    >
                                      <div className="flex items-center gap-4">
                                        <div
                                          className={`p-3 rounded-xl transition-all shadow-sm ${isSelected ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-400"}`}
                                        >
                                          <Zap size={18} />
                                        </div>
                                        <div className="space-y-1">
                                          <p
                                            className={`text-xs font-black uppercase italic leading-tight transition-colors ${isSelected ? "text-indigo-900" : "text-slate-800"}`}
                                          >
                                            {tool.name}
                                          </p>
                                          <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                                            {tool.category || "PADRÃO"}
                                          </p>
                                        </div>
                                      </div>
                                      <div
                                        className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-100 bg-white"}`}
                                      >
                                        {isSelected ? (
                                          <CheckCircle2 size={16} />
                                        ) : (
                                          <div className="w-1.5 h-1.5 rounded-full bg-slate-100" />
                                        )}
                                      </div>
                                    </button>

                                    {isSelected && (
                                      <div className="flex bg-white/50 backdrop-blur-sm p-1 rounded-2xl gap-1 border border-indigo-100 self-end">
                                        {["ok", "missing", "damaged"].map((st) => (
                                          <button
                                            key={st}
                                            onClick={() =>
                                              updateStagedStatus(tool.id, st)
                                            }
                                            className={`px-3 py-1.5 rounded-xl text-[7px] font-black uppercase tracking-widest transition-all ${stagedItem.status === st ? statusMap[st].bg + " " + statusMap[st].color + " shadow-sm" : "text-slate-400 hover:bg-white"}`}
                                          >
                                            {statusMap[st].label}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </>
                        )}

                        {availableStockTools.length === 0 && availableStandardTools.length === 0 && (
                          <div className="col-span-full py-24 text-center border-2 border-dashed border-slate-100 rounded-[3rem] bg-slate-50/30">
                            <Package size={42} className="text-slate-200 mx-auto mb-4" />
                            <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest italic">Nenhuma ferramenta encontrada</p>
                          </div>
                        )}
                      </div>

                      <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-6">
                        <div className="flex flex-col gap-4">
                          <div className="text-left">
                            <p className="text-xs font-black text-slate-900 uppercase italic">
                              {stagedAuditItems.length} Ferramentas Selecionadas
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                              {
                                stagedAuditItems.filter((i) => i.type === "big")
                                  .length
                              }{" "}
                              Itens de Patrimônio |{" "}
                              {
                                stagedAuditItems.filter(
                                  (i) => i.type === "standard",
                                ).length
                              }{" "}
                              Itens Padrão
                            </p>
                          </div>
                          
                          {/* Borrow Type Selector */}
                          <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-2 w-fit">
                             <button 
                               onClick={() => setBorrowType('loan')}
                               className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${borrowType === 'loan' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
                             >
                               Empréstimo
                             </button>
                             <button 
                               onClick={() => setBorrowType('caution')}
                               className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${borrowType === 'caution' ? 'bg-amber-500 text-white shadow-lg shadow-amber-100' : 'text-slate-400 hover:text-slate-600'}`}
                             >
                               Cautela
                             </button>
                          </div>
                        </div>

                        <button
                          onClick={() => generateSignatureLink()}
                          disabled={
                            isGeneratingLink || stagedAuditItems.length === 0
                          }
                          className="w-full sm:w-auto bg-emerald-500 text-white px-12 py-5 rounded-[2rem] font-black italic uppercase text-sm shadow-xl shadow-emerald-100 hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                        >
                          {isGeneratingLink ? "GERANDO..." : "OBTER LINK PARA ASSINATURA"}
                          <ArrowRight size={18} />
                        </button>
                      </div>
                    </div>
                  )}

                  {viewMode === "history" && (
                    <div className="space-y-4">
                      {history.length === 0 ? (
                        <div className="p-20 text-center bg-white rounded-[3rem] border border-dashed border-slate-200">
                          <History
                            size={48}
                            className="text-slate-100 mx-auto mb-4"
                          />
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">
                            Nenhum histórico disponível
                          </p>
                        </div>
                      ) : (
                        history.map((audit) => (
                          <div
                            key={audit.id}
                            className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-5"
                          >
                            <div className="p-5 bg-slate-50 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Calendar
                                  size={16}
                                  className="text-indigo-500"
                                />
                                <span className="text-xs font-black text-slate-700 uppercase italic">
                                  {new Date(audit.created_at || audit.check_date).toLocaleString(
                                    "pt-BR",
                                  )}
                                </span>
                                {audit.type && (
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${audit.type === 'loan' ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'}`}>
                                    {audit.type === 'loan' ? 'Empréstimo' : 'Cautela'}
                                  </span>
                                )}
                              </div>
                                 <div className="flex items-center gap-3">
                                  {audit.status === 'pending' ? (
                                    <div className="flex items-center gap-2">
                                      <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg text-[8px] font-black uppercase tracking-widest border border-rose-100 shadow-sm">
                                        Aguardando Assinatura
                                      </span>
                                      <button 
                                        onClick={() => {
                                          const link = `${window.location.origin}/assinatura/${audit.id}`;
                                          copyToClipboard(link);
                                        }}
                                        className="p-1 px-2 bg-white text-rose-500 rounded-lg border border-rose-100 shadow-sm hover:scale-105 transition-all text-[8px] font-black uppercase flex items-center gap-1"
                                        title="Copiar Link"
                                      >
                                        <Share2 size={12} /> Link
                                      </button>
                                    </div>
                                  ) : audit.signature_url ? (
                                    <div className="flex items-center gap-1 text-emerald-500 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100 shadow-sm">
                                      <SignatureIcon
                                        size={12}
                                      />
                                      <span className="text-[8px] font-black uppercase tracking-widest">Assinado</span>
                                    </div>
                                  ) : (
                                    <span className="px-3 py-1 bg-slate-100 text-slate-400 rounded-lg text-[8px] font-black uppercase tracking-widest">
                                      {audit.status || 'Finalizado'}
                                    </span>
                                  )}
                                  <span className="text-[9px] font-black bg-white px-3 py-1 rounded-lg text-slate-400 shadow-inner">
                                    {audit.cautelia_audit_items?.length || 0} ITENS
                                  </span>
                                </div>
                            </div>
                            <div className="p-6 divide-y divide-slate-50">
                              {audit.cautelia_audit_items?.map((item: any) => (
                                <div
                                  key={item.id}
                                  className="py-4 flex items-center justify-between"
                                >
                                  <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                                      {item.cautelia_standard_tools ? (
                                        <Zap size={16} className="text-indigo-400" />
                                      ) : (
                                        <Package size={16} className="text-emerald-400" />
                                      )}
                                    </div>
                                    <div>
                                      <p className="text-xs font-black text-slate-600 uppercase italic">
                                        {item.quantity ? `${item.quantity}x ` : '1x '} {item.cautelia_standard_tools?.name || item.tools?.name || 'Ferramenta Desconhecida'}
                                      </p>
                                      {item.obs && (
                                        <p className="text-[9px] text-slate-400 italic">
                                          &quot;{item.obs}&quot;
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div
                                    className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${statusMap[item.status]?.bg} ${statusMap[item.status]?.color}`}
                                  >
                                    {statusMap[item.status]?.label}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {viewMode === "compare" && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4">
                         <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest italic">Análise de Divergências</h3>
                         <div className="flex items-center gap-2">
                           <button 
                            onClick={exportAllTechniciansReport}
                            className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center gap-2"
                           >
                              <FileDown size={14} /> Geral (Excel)
                           </button>
                           {compareDates.audit1 && compareDates.audit2 && (
                             <button 
                              onClick={exportCurrentComparison}
                              className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[9px] font-black uppercase tracking-widest border border-emerald-100 hover:bg-emerald-100 transition-all flex items-center gap-2"
                             >
                                <Download size={14} /> Por Técnico (Excel)
                             </button>
                           )}
                         </div>
                      </div>
                      {/* Selector */}
                      <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl flex flex-col md:flex-row items-center gap-6">
                        <div className="flex-1 w-full relative">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
                            Snapshot Base (Antigo)
                          </label>
                          <select
                            value={compareDates.audit1}
                            onChange={(e) =>
                              setCompareDates((prev) => ({
                                ...prev,
                                audit1: e.target.value,
                              }))
                            }
                            className="w-full bg-slate-50 border-transparent rounded-2xl px-5 py-4 text-xs font-black uppercase tracking-tighter outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                          >
                            <option value="">Selecione...</option>
                            {history.map((h) => (
                              <option key={h.id} value={h.id}>
                                {new Date(h.created_at || h.check_date).toLocaleString("pt-BR")}
                                {h.type ? ` - ${h.type === 'loan' ? 'Empréstimo' : 'Cautela'}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="p-4 bg-indigo-50 text-indigo-500 rounded-2xl hidden md:block">
                          <ArrowLeftRight size={24} />
                        </div>
                        <div className="flex-1 w-full relative">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
                            Snapshot Comparação (Novo)
                          </label>
                          <select
                            value={compareDates.audit2}
                            onChange={(e) =>
                              setCompareDates((prev) => ({
                                ...prev,
                                audit2: e.target.value,
                              }))
                            }
                            className="w-full bg-slate-50 border-transparent rounded-2xl px-5 py-4 text-xs font-black uppercase tracking-tighter outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                          >
                            <option value="">Selecione...</option>
                            {history.map((h) => (
                              <option key={h.id} value={h.id}>
                                {new Date(h.created_at || h.check_date).toLocaleString("pt-BR")}
                                {h.type ? ` - ${h.type === 'loan' ? 'Empréstimo' : 'Cautela'}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Side-by-side Table */}
                      {compareDates.audit1 && compareDates.audit2 ? (
                        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden">
                          <div className="grid grid-cols-12 bg-slate-900 p-6">
                            <div className="col-span-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] pl-4">
                              Equipamento
                            </div>
                            <div className="col-span-3 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] text-center">
                              Status Anterior
                            </div>
                            <div className="col-span-3 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] text-center">
                              Status Recente
                            </div>
                          </div>
                          <div className="divide-y divide-slate-50">
                            {getComparisonData().map((item, i) => (
                              <div
                                key={i}
                                className="grid grid-cols-12 p-6 items-center hover:bg-slate-50/50 transition-colors"
                              >
                                <div className="col-span-6 flex items-center gap-4 pl-2">
                                  <div
                                    className={`w-3 h-3 rounded-full ${item.status1 !== item.status2 ? "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" : "bg-slate-200"}`}
                                  />
                                  <div>
                                    <p className="text-xs font-black uppercase text-slate-700 italic leading-none">
                                      {item.tool?.name}
                                    </p>
                                    <p className="text-[9px] font-mono font-bold text-slate-400 mt-1 uppercase">
                                      PAT: #{item.tool?.code}
                                    </p>
                                  </div>
                                </div>
                                <div className="col-span-3 flex justify-center">
                                  <div
                                    className={`px-4 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${statusMap[item.status1]?.bg || "bg-slate-100"} ${statusMap[item.status1]?.color || "text-slate-400"}`}
                                  >
                                    {statusMap[item.status1]?.label ||
                                      "AUSENTE"}
                                  </div>
                                </div>
                                <div className="col-span-3 flex justify-center">
                                  <div
                                    className={`px-4 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${statusMap[item.status2]?.bg || "bg-slate-100"} ${statusMap[item.status2]?.color || "text-slate-400"}`}
                                  >
                                    {statusMap[item.status2]?.label ||
                                      "AUSENTE"}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="p-32 text-center bg-white rounded-[3rem] border border-dashed border-slate-200">
                          <ArrowLeftRight
                            size={64}
                            className="text-slate-50 mx-auto mb-6"
                          />
                          <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest italic">
                            Escolha dois períodos para analisar divergências
                          </h3>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="h-full min-h-[600px] flex flex-col items-center justify-center p-20 text-center bg-white rounded-[4rem] border border-dashed border-slate-200 shadow-inner">
                <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center text-slate-100 mb-8 border border-slate-100 shadow-sm">
                  <UserCheck size={64} />
                </div>
                <h3 className="text-2xl font-black italic text-slate-300 uppercase tracking-[0.3em]">
                  Selecione um perfil
                </h3>
                <p className="text-slate-400 mt-4 max-w-xs text-xs font-bold uppercase tracking-[0.1em] leading-relaxed">
                  Analise a evolução da responsabilidade técnica individual
                  através de snapshots históricos.
                </p>
              </div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Link Generado Modal */}
      <AnimatePresence>
        {generatedLink && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setGeneratedLink(null)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8"
            >
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
                  <LinkIcon size={32} />
                </div>
                <h2 className="text-xl font-black italic uppercase text-slate-900">
                  Link Gerado!
                </h2>
                <p className="text-sm text-slate-500 font-medium">
                  Envie este link para o técnico <b>{selectedUser?.name}</b>{" "}
                  assinar sua cautela.
                </p>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 break-all text-[10px] font-mono text-indigo-600 select-all">
                  {generatedLink}
                </div>

                <button
                  onClick={() => {
                    copyToClipboard(generatedLink!);
                  }}
                  className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl"
                >
                  Copiar Link
                </button>

                <button
                  onClick={() => setGeneratedLink(null)}
                  className="text-[10px] font-black uppercase text-slate-300 hover:text-slate-500"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Signature Modal for Pending Audits */}
      <AnimatePresence>
        {signingAudit && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/60">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100"
            >
              <div className="bg-slate-900 p-8 text-white relative">
                <button 
                   onClick={() => setSigningAudit(null)}
                   className="absolute top-6 right-6 text-white/40 hover:text-white"
                >
                  <X size={24} />
                </button>
                <h3 className="text-2xl font-black italic uppercase tracking-tighter">Assinatura Pendente</h3>
                <p className="text-indigo-300 text-[10px] font-black uppercase tracking-widest mt-2">
                  Confirme o recebimento dos itens abaixo
                </p>
              </div>

              <div className="p-8 space-y-6">
                <div className="max-h-40 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {signingAudit.cautelia_audit_items?.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        {item.tool_id ? <Zap size={14} className="text-indigo-400" /> : <Package size={14} className="text-emerald-400" />}
                        <span className="text-[10px] font-black text-slate-600 uppercase">
                          {item.cautelia_standard_tools?.name || item.tools?.name || 'Ferramenta'}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${statusMap[item.status]?.bg} ${statusMap[item.status]?.color}`}>
                        {statusMap[item.status]?.label}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Assine no quadro abaixo
                  </p>
                  <div className="bg-slate-50 rounded-2xl border-2 border-slate-200 h-40 relative overflow-hidden">
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={200}
                      className="w-full h-full cursor-crosshair"
                      onMouseEnter={initSignaturePad}
                    />
                    <button
                      onClick={() => {
                        const ctx = canvasRef.current?.getContext("2d");
                        ctx?.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
                        setSignature(null);
                      }}
                      className="absolute bottom-3 right-4 text-[8px] font-black text-slate-300 hover:text-rose-500"
                    >
                      LIMPAR
                    </button>
                  </div>
                  
                  <button
                    onClick={() => submitSignedAudit(signingAudit)}
                    disabled={isSubmitting || !signature}
                    className="w-full bg-slate-900 text-white font-black italic py-5 rounded-2xl shadow-xl flex items-center justify-center gap-4 text-sm active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? "CONFIRMANDO..." : "CONFIRMAR RECEBIMENTO"}
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Modal with PDF Option */}
      <AnimatePresence>
        {signedAuditForPDF && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/60">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[3rem] shadow-2xl w-full max-w-sm p-10 text-center space-y-6"
            >
              <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 size={40} />
              </div>
              <div>
                <h2 className="text-2xl font-black italic uppercase text-slate-900">Sucesso!</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-widest leading-relaxed">
                  A cautela foi assinada e os itens foram vinculados ao colaborador.
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <button 
                  onClick={async () => {
                    const fileName = `Recibo_${selectedUser?.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
                    await exportToPDF('printable-receipt-content-internal', fileName);
                  }}
                  className="w-full bg-slate-900 text-white font-black italic py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 text-xs hover:bg-slate-800 transition-all uppercase tracking-widest"
                >
                  <Download size={18} /> Baixar Recibo (PDF)
                </button>
                <button 
                  onClick={() => setSignedAuditForPDF(null)}
                  className="w-full bg-slate-50 text-slate-400 font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden Print Template for Internal PDF */}
      {signedAuditForPDF && (
        <div id="printable-receipt-content-internal" className="hidden">
          <div className="p-10 bg-white min-h-screen text-slate-900 border-[10px] border-slate-900 w-[800px]">
             <div className="p-8 font-sans">
              <div className="flex justify-between items-start mb-10">
                <div className="relative h-12 w-40">
                  <Image 
                    src="https://apreflorestas.com.br/wp-content/uploads/2017/05/tracbel-2-1980x708.png"
                    alt="Tracbel"
                    fill
                    className="object-contain"
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-black italic uppercase tracking-tighter">Comprovante Digital</h2>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Protocolo: #{signedAuditForPDF.id?.substring(0, 8).toUpperCase() || 'N/A'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-8 border-b-2 border-slate-100 pb-8">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Colaborador</p>
                  <p className="text-lg font-black uppercase italic">{selectedUser?.name || 'Técnico'}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Matrícula: {selectedUser?.registration}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Data e Hora</p>
                  <p className="text-lg font-black uppercase italic">
                    {format(new Date(signedAuditForPDF.check_date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </p>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${signedAuditForPDF.type === 'caution' ? 'text-amber-600' : signedAuditForPDF.type === 'return' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                    Tipo: {signedAuditForPDF.type === 'caution' ? 'Cautela' : signedAuditForPDF.type === 'return' ? 'Devolução' : 'Empréstimo'}
                  </p>
                </div>
              </div>

              <div className="mb-8">
                <h4 className="text-[10px] font-black uppercase tracking-widest mb-4">Itens Relacionados</h4>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 text-[8px] font-black uppercase tracking-widest text-slate-400">Cód</th>
                      <th className="py-2 text-[8px] font-black uppercase tracking-widest text-slate-400">Ferramenta</th>
                      <th className="py-2 text-[8px] font-black uppercase tracking-widest text-slate-400 text-right">Qtd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {signedAuditForPDF.cautelia_audit_items?.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td className="py-2 text-[9px] font-bold uppercase">{item.tools?.code || item.cautelia_standard_tools?.code || '-'}</td>
                        <td className="py-2 text-[9px] font-black uppercase italic">{item.cautelia_standard_tools?.name || item.tools?.name || 'Ferramenta'}</td>
                        <td className="py-2 text-[9px] font-black text-right">{item.quantity || 1}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mb-8 p-5 bg-slate-50 rounded-2xl border-2 border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest mb-2 italic">Termo de Responsabilidade</p>
                <p className="text-[8px] font-bold text-slate-500 text-justify leading-relaxed uppercase">
                  Pelo presente termo, declaro que recebi os equipamentos e ferramentas acima relacionados em perfeitas condições de conservação e funcionamento. Assumo total responsabilidade pela guarda, zelo e uso exclusivo em atividades profissionais da empresa. Comprometo-me a comunicar imediatamente qualquer ocorrência, dano ou extravio, sob pena de responsabilidade administrativa e civil, autorizando desde já o desconto do valor correspondente em caso de negligência ou mau uso.
                </p>
              </div>

              <div className="flex flex-col items-center mt-12">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-6">Assinatura Certificada Digitalmente</p>
                <div className="w-full max-w-xs h-24 border-b border-slate-900 flex items-center justify-center relative">
                  {signedAuditForPDF.signature_url && (
                    <Image 
                      src={signedAuditForPDF.signature_url} 
                      alt="Assinatura" 
                      width={300} 
                      height={80} 
                      className="h-16 object-contain" 
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
                <p className="mt-2 text-[10px] font-black uppercase italic tracking-tighter">{selectedUser?.name}</p>
              </div>

              <div className="mt-12 pt-8 border-t border-slate-100 text-center">
                <p className="text-[7px] font-black text-slate-300 uppercase tracking-[0.4em]">
                  Este documento possui validade jurídica interna.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST FEEDBACK */}
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[300] bg-slate-900 text-white px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-3 border border-white/10 backdrop-blur-xl"
          >
            <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white">
              <CheckCircle2 size={16} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest">
              {toast.message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
