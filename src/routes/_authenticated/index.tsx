import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";

const ANNUAL_RATE = 0.05;
const DEFAULT_MESES_SEM_JUROS = 12;

// Configurável: `mesesSemJuros` meses iniciais sem juros. Depois, a cada 12 meses,
// aplica +5% ao ano composto sobre a parcela base.
function parcelaBase(financiado: number, n: number): number {
  if (financiado <= 0 || n <= 0) return 0;
  return financiado / n;
}
function parcelaEsperadaMes(financiado: number, n: number, mes: number, mesesSemJuros: number = DEFAULT_MESES_SEM_JUROS): number {
  const base = parcelaBase(financiado, n);
  if (mes <= mesesSemJuros) return base;
  const ano = Math.floor((mes - mesesSemJuros - 1) / 12) + 1;
  return base * Math.pow(1 + ANNUAL_RATE, ano);
}
function totalContratoCalc(financiado: number, n: number, mesesSemJuros: number = DEFAULT_MESES_SEM_JUROS): number {
  let s = 0;
  for (let i = 1; i <= n; i++) s += parcelaEsperadaMes(financiado, n, i, mesesSemJuros);
  return s;
}

type Pagamento = { valor: number | null; data: string | null };
type Sale = {
  cliente: string;
  entrada: number;
  parcelas: number;
  mesesSemJuros: number;
  dataPrimeiraParcela?: string | null;
  email?: string;
  celular?: string;
  cpf?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  pagamentos: Pagamento[];
};

type StatusHistoryEntry = {
  id: string;
  lot_id: string;
  from_status: Status | null;
  to_status: Status;
  changed_by_email: string | null;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Mapa de Lotes — Loteadora" },
      { name: "description", content: "Mapa visual interativo de lotes com status Disponível, Reservado, Vendido e Cancelado." },
    ],
  }),
  component: Index,
});

type Status = "disponivel" | "reservado" | "vendido" | "cancelado";

type Lote = {
  id: string;
  quadra: string;
  numero: number;
  area: number;
  preco: number;
  status: Status;
  cliente?: string;
  corretor?: string;
};

const STATUS_META: Record<Status, { label: string; dot: string; fill: string; ring: string; badge: string }> = {
  disponivel: {
    label: "Disponível",
    dot: "bg-emerald-500",
    fill: "bg-emerald-500/15 hover:bg-emerald-500/30 border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  reservado: {
    label: "Reservado",
    dot: "bg-amber-500",
    fill: "bg-amber-500/15 hover:bg-amber-500/30 border-amber-500/50 text-amber-700 dark:text-amber-300",
    ring: "ring-amber-500",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  vendido: {
    label: "Vendido",
    dot: "bg-sky-600",
    fill: "bg-sky-600/15 hover:bg-sky-600/30 border-sky-600/50 text-sky-700 dark:text-sky-300",
    ring: "ring-sky-600",
    badge: "bg-sky-600/15 text-sky-700 dark:text-sky-300 border-sky-600/30",
  },
  cancelado: {
    label: "Cancelado",
    dot: "bg-rose-500",
    fill: "bg-rose-500/15 hover:bg-rose-500/30 border-rose-500/50 text-rose-700 dark:text-rose-300",
    ring: "ring-rose-500",
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
};

const STATUS_ORDER: Status[] = ["disponivel", "reservado", "vendido", "cancelado"];

const QUADRA_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function quadraName(i: number): string {
  // A..Z, AA, AB...
  if (i < 26) return QUADRA_LETTERS[i];
  const first = QUADRA_LETTERS[Math.floor(i / 26) - 1];
  const second = QUADRA_LETTERS[i % 26];
  return `${first}${second}`;
}

function generateLotes(total: number, perQuadra: number): Lote[] {
  const statuses: Status[] = ["disponivel", "disponivel", "disponivel", "reservado", "vendido", "vendido", "cancelado"];
  const clientes = ["Maria Silva", "João Souza", "Ana Costa", "Carlos Lima", "Bruno Alves", "Paula Rocha"];
  const corretores = ["R. Mendes", "L. Ferreira", "T. Oliveira"];
  const out: Lote[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  let qIdx = 0;
  let nInQuadra = 0;
  for (let i = 0; i < total; i++) {
    if (nInQuadra >= perQuadra) {
      qIdx++;
      nInQuadra = 0;
    }
    nInQuadra++;
    const q = quadraName(qIdx);
    const status = statuses[Math.floor(rand() * statuses.length)];
    const area = 200 + Math.floor(rand() * 250);
    const preco = area * (350 + Math.floor(rand() * 200));
    const isSold = status === "vendido" || status === "reservado";
    out.push({
      id: `${q}-${String(nInQuadra).padStart(2, "0")}`,
      quadra: q,
      numero: nInQuadra,
      area,
      preco,
      status,
      cliente: isSold ? clientes[Math.floor(rand() * clientes.length)] : undefined,
      corretor: isSold ? corretores[Math.floor(rand() * corretores.length)] : undefined,
    });
  }
  return out;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

function defaultSale(l: Lote): Sale {
  return {
    cliente: l.cliente ?? "",
    entrada: Math.round(l.preco * 0.2),
    parcelas: 60,
    mesesSemJuros: DEFAULT_MESES_SEM_JUROS,
    dataPrimeiraParcela: null,
    pagamentos: Array.from({ length: 60 }, () => ({ valor: null, data: null })),
  };
}

function addMonths(iso: string, months: number): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m - 1) + months, d);
  // Corrige overflow de meses curtos (ex.: 31 jan + 1 mês)
  if (dt.getDate() !== d) dt.setDate(0);
  return dt;
}
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const brDate = (d: Date) => d.toLocaleDateString("pt-BR");

const LEGACY_STORAGE_KEY = "loteadora:config:v1";
const EMPS_KEY = "loteadora:empreendimentos:v1";
const ACTIVE_KEY = "loteadora:active:v1";
const configKey = (id: string) => `loteadora:config:v1:${id}`;

type PersistedConfig = {
  empreendimento: string;
  total: number;
  perQuadra: number;
  precoOverrides: Record<string, number>;
  nomeOverrides: Record<string, string>;
  statusOverrides: Record<string, Status>;
  corretorOverrides: Record<string, string>;
  sales: Record<string, Sale>;
  deletedIds: string[];
};

type EmpItem = { id: string; nome: string };

const DEFAULT_EMPREENDIMENTO = "";

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `emp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function loadEmpList(): { list: EmpItem[]; activeId: string } {
  if (typeof window === "undefined") return { list: [], activeId: "" };
  try {
    const raw = window.localStorage.getItem(EMPS_KEY);
    let list: EmpItem[] = raw ? (JSON.parse(raw) as EmpItem[]) : [];
    if (!Array.isArray(list) || list.length === 0) {
      // Migração da configuração antiga (single-empreendimento)
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      const id = newId();
      if (legacy) {
        try {
          const parsed = JSON.parse(legacy) as Partial<PersistedConfig>;
          list = [{ id, nome: parsed.empreendimento || "" }];
          window.localStorage.setItem(configKey(id), legacy);
        } catch {
          list = [{ id, nome: "" }];
        }
      } else {
        list = [{ id, nome: "" }];
      }
      window.localStorage.setItem(EMPS_KEY, JSON.stringify(list));
      window.localStorage.setItem(ACTIVE_KEY, id);
      return { list, activeId: id };
    }
    let activeId = window.localStorage.getItem(ACTIVE_KEY) || list[0].id;
    if (!list.find((e) => e.id === activeId)) activeId = list[0].id;
    return { list, activeId };
  } catch {
    return { list: [], activeId: "" };
  }
}

function loadConfigFor(id: string): Partial<PersistedConfig> {
  if (typeof window === "undefined" || !id) return {};
  try {
    const raw = window.localStorage.getItem(configKey(id));
    return raw ? (JSON.parse(raw) as Partial<PersistedConfig>) : {};
  } catch {
    return {};
  }
}


function Index() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Set<Status>>(new Set(STATUS_ORDER));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Lote | null>(null);
  const [empreendimento, setEmpreendimento] = useState(DEFAULT_EMPREENDIMENTO);
  const [empreendimentoEdit, setEmpreendimentoEdit] = useState(false);
  const [total, setTotal] = useState(150);
  const [perQuadra, setPerQuadra] = useState(15);
  const [sales, setSales] = useState<Record<string, Sale>>({});
  const [precoOverrides, setPrecoOverrides] = useState<Record<string, number>>({});
  const [nomeOverrides, setNomeOverrides] = useState<Record<string, string>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [statusOverrides, setStatusOverrides] = useState<Record<string, Status>>({});
  const [corretorOverrides, setCorretorOverrides] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [cpf, setCpf] = useState("");
  const [celular, setCelular] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPendingStatus, setBulkPendingStatus] = useState<Status | null>(null);
  const [bulkCorretor, setBulkCorretor] = useState("");
  const [bulkCliente, setBulkCliente] = useState("");
  const [bulkErrors, setBulkErrors] = useState<{ corretor?: string; cliente?: string }>({});

  // Multi-empreendimento
  const [empList, setEmpList] = useState<EmpItem[]>([]);
  const [activeEmpId, setActiveEmpId] = useState<string>("");
  const [empsLoaded, setEmpsLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      setUserEmail(u?.email ?? null);
      setUserId(u?.id ?? null);
      setUserCreatedAt(u?.created_at ?? null);
      if (u?.id) {
        const { data: p } = await supabase
          .from("profiles")
          .select("display_name, avatar_url, cpf, celular, endereco, bairro, cidade")
          .eq("id", u.id)
          .maybeSingle();
        setDisplayName(p?.display_name ?? "");
        setAvatarUrl(p?.avatar_url ?? "");
        setCpf(p?.cpf ?? "");
        setCelular(p?.celular ?? "");
        setEndereco(p?.endereco ?? "");
        setBairro(p?.bairro ?? "");
        setCidade(p?.cidade ?? "");
      }
    });
  }, []);

  const handleSaveAccount = async () => {
    if (!userId) return;
    setSavingAccount(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName || null,
        avatar_url: avatarUrl || null,
        cpf: cpf || null,
        celular: celular || null,
        endereco: endereco || null,
        bairro: bairro || null,
        cidade: cidade || null,
      })
      .eq("id", userId);
    setSavingAccount(false);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else toast.success("Dados atualizados");
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPwd(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Senha alterada");
      setNewPassword("");
    }
  };

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  // Aplicar uma configuração ao estado (ou resetar para defaults)
  const applyConfig = (cfg: Partial<PersistedConfig>) => {
    setEmpreendimento(cfg.empreendimento ?? DEFAULT_EMPREENDIMENTO);
    setTotal(cfg.total ?? 150);
    setPerQuadra(cfg.perQuadra ?? 15);
    setPrecoOverrides(cfg.precoOverrides ?? {});
    setNomeOverrides(cfg.nomeOverrides ?? {});
    setDeletedIds(new Set(cfg.deletedIds ?? []));
    setStatusOverrides(cfg.statusOverrides ?? {});
    setCorretorOverrides(cfg.corretorOverrides ?? {});
    setSales(cfg.sales ?? {});
    setSavedAt(null);
  };

  // Carregar lista de empreendimentos + configuração ativa (na montagem)
  useEffect(() => {
    const { list, activeId } = loadEmpList();
    setEmpList(list);
    setActiveEmpId(activeId);
    applyConfig(loadConfigFor(activeId));
    setEmpsLoaded(true);
  }, []);

  const persistConfigFor = (id: string) => {
    if (!id) return;
    const payload: PersistedConfig = { empreendimento, total, perQuadra, precoOverrides, nomeOverrides, statusOverrides, corretorOverrides, sales, deletedIds: Array.from(deletedIds) };
    window.localStorage.setItem(configKey(id), JSON.stringify(payload));
  };

  const salvarConfig = () => {
    if (!activeEmpId) return;
    persistConfigFor(activeEmpId);
    // Atualiza o nome do empreendimento na lista
    setEmpList((prev) => {
      const next = prev.map((e) => (e.id === activeEmpId ? { ...e, nome: empreendimento } : e));
      window.localStorage.setItem(EMPS_KEY, JSON.stringify(next));
      return next;
    });
    setSavedAt(new Date().toLocaleTimeString("pt-BR"));
  };

  const switchEmpreendimento = (id: string) => {
    if (!id || id === activeEmpId) return;
    // Salva o atual antes de trocar (auto-save)
    if (activeEmpId) {
      persistConfigFor(activeEmpId);
      setEmpList((prev) => {
        const next = prev.map((e) => (e.id === activeEmpId ? { ...e, nome: empreendimento } : e));
        window.localStorage.setItem(EMPS_KEY, JSON.stringify(next));
        return next;
      });
    }
    window.localStorage.setItem(ACTIVE_KEY, id);
    setActiveEmpId(id);
    applyConfig(loadConfigFor(id));
  };

  const criarEmpreendimento = () => {
    const nome = window.prompt("Nome do novo empreendimento (pode deixar em branco):", "") ?? "";
    if (nome === null) return;
    // Salva o atual antes
    if (activeEmpId) persistConfigFor(activeEmpId);
    const id = newId();
    const item: EmpItem = { id, nome: nome.trim() };
    setEmpList((prev) => {
      const next = [...prev.map((e) => (e.id === activeEmpId ? { ...e, nome: empreendimento } : e)), item];
      window.localStorage.setItem(EMPS_KEY, JSON.stringify(next));
      return next;
    });
    window.localStorage.setItem(ACTIVE_KEY, id);
    setActiveEmpId(id);
    applyConfig({ empreendimento: item.nome });
    setEmpreendimentoEdit(!item.nome);
  };

  const excluirEmpreendimento = () => {
    if (!activeEmpId) return;
    if (empList.length <= 1) {
      window.alert("Não é possível excluir: mantenha ao menos um empreendimento.");
      return;
    }
    const atual = empList.find((e) => e.id === activeEmpId);
    const ok = window.confirm(`Excluir "${atual?.nome || "(sem nome)"}"? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    window.localStorage.removeItem(configKey(activeEmpId));
    const remaining = empList.filter((e) => e.id !== activeEmpId);
    const nextId = remaining[0].id;
    window.localStorage.setItem(EMPS_KEY, JSON.stringify(remaining));
    window.localStorage.setItem(ACTIVE_KEY, nextId);
    setEmpList(remaining);
    setActiveEmpId(nextId);
    applyConfig(loadConfigFor(nextId));
  };



  const lotesBase = useMemo(() => generateLotes(total, perQuadra), [total, perQuadra]);
  const lotes = useMemo(
    () => lotesBase
      .filter((l) => !deletedIds.has(l.id))
      .map((l) => {
        const next = { ...l };
        if (precoOverrides[l.id] != null) next.preco = precoOverrides[l.id];
        if (statusOverrides[l.id]) next.status = statusOverrides[l.id];
        if (corretorOverrides[l.id]) next.corretor = corretorOverrides[l.id];
        if (sales[l.id]?.cliente) next.cliente = sales[l.id].cliente;
        return next;
      }),
    [lotesBase, precoOverrides, statusOverrides, corretorOverrides, sales, deletedIds],
  );

  // Carrega histórico de status ao abrir o modal
  useEffect(() => {
    if (!selected || !userId) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    supabase
      .from("lot_status_history")
      .select("*")
      .eq("lot_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setHistory((data ?? []) as StatusHistoryEntry[]);
        setHistoryLoading(false);
      });
  }, [selected, userId]);

  const changeStatus = async (novo: Status) => {
    if (!selected || !userId) return;
    const atual = (lotes.find((l) => l.id === selected.id)?.status) ?? selected.status;
    if (novo === atual) return;
    setStatusOverrides((prev) => {
      const next = { ...prev };
      if (novo === selected.status) delete next[selected.id];
      else next[selected.id] = novo;
      return next;
    });
    if (novo === "disponivel") {
      setSales((prev) => {
        if (!(selected.id in prev)) return prev;
        const next = { ...prev };
        delete next[selected.id];
        return next;
      });
      setCorretorOverrides((prev) => {
        if (!(selected.id in prev)) return prev;
        const next = { ...prev };
        delete next[selected.id];
        return next;
      });
    }
    const { data, error } = await supabase
      .from("lot_status_history")
      .insert({
        user_id: userId,
        lot_id: selected.id,
        from_status: atual,
        to_status: novo,
        changed_by_email: userEmail,
      })
      .select()
      .single();
    if (!error && data) {
      setHistory((prev) => [data as StatusHistoryEntry, ...prev]);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectAllFiltered = () => {
    const ids = new Set<string>();
    for (const l of lotes) {
      if (!filters.has(l.status)) continue;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${l.id} ${nomeOverrides[l.id] ?? ""} ${l.cliente ?? ""} ${l.corretor ?? ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      ids.add(l.id);
    }
    setSelectedIds(ids);
  };

  const applyBulkStatus = async (
    novo: Status,
    extras?: { corretor?: string; cliente?: string },
  ) => {
    if (!userId || selectedIds.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    const currentById = new Map(lotes.map((l) => [l.id, l.status] as const));
    const toApply = ids.filter((id) => currentById.get(id) !== novo);

    setStatusOverrides((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const base = lotesBase.find((l) => l.id === id);
        if (base && novo === base.status) delete next[id];
        else next[id] = novo;
      }
      return next;
    });

    if (novo === "disponivel") {
      setSales((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const id of ids) {
          if (id in next) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setCorretorOverrides((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const id of ids) {
          if (id in next) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }

    if (extras?.corretor) {
      const corretor = extras.corretor;
      setCorretorOverrides((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = corretor;
        return next;
      });
    }

    if (extras?.cliente) {
      const cliente = extras.cliente;
      setSales((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          const base = lotesBase.find((l) => l.id === id);
          const existing = next[id] ?? (base ? defaultSale(base) : null);
          if (existing) next[id] = { ...existing, cliente };
        }
        return next;
      });
    }

    if (toApply.length > 0) {
      const rows = toApply.map((id) => ({
        user_id: userId,
        lot_id: id,
        from_status: currentById.get(id) ?? null,
        to_status: novo,
        changed_by_email: userEmail,
      }));
      const { data } = await supabase.from("lot_status_history").insert(rows).select();
      if (data && selected) {
        const forSelected = (data as unknown as StatusHistoryEntry[]).filter((d) => d.lot_id === selected.id);
        if (forSelected.length > 0) setHistory((prev) => [...forSelected, ...prev]);
      }
    }
    setBulkBusy(false);
  };

  const bulkChangeStatus = (novo: Status) => {
    if (selectedIds.size === 0) return;
    if (novo === "reservado" || novo === "vendido") {
      // Pré-preenche com o corretor mais frequente entre os selecionados
      const freq = new Map<string, number>();
      for (const id of selectedIds) {
        const c = corretorOverrides[id] ?? lotesBase.find((l) => l.id === id)?.corretor;
        if (c) freq.set(c, (freq.get(c) ?? 0) + 1);
      }
      const topCorretor = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      setBulkCorretor(topCorretor);
      setBulkCliente("");
      setBulkErrors({});
      setBulkPendingStatus(novo);
      return;
    }
    void applyBulkStatus(novo);
  };

  const confirmBulkAssignment = async () => {
    if (!bulkPendingStatus) return;
    const errors: { corretor?: string; cliente?: string } = {};
    const corretor = bulkCorretor.trim();
    const cliente = bulkCliente.trim();
    if (corretor.length < 2) errors.corretor = "Informe o nome do corretor (mín. 2 caracteres).";
    if (corretor.length > 120) errors.corretor = "Máx. 120 caracteres.";
    if (bulkPendingStatus === "vendido") {
      if (cliente.length < 2) errors.cliente = "Informe o nome do cliente (mín. 2 caracteres).";
      else if (cliente.length > 120) errors.cliente = "Máx. 120 caracteres.";
    }
    if (Object.keys(errors).length > 0) {
      setBulkErrors(errors);
      return;
    }
    const pending = bulkPendingStatus;
    setBulkPendingStatus(null);
    await applyBulkStatus(pending, {
      corretor,
      cliente: pending === "vendido" ? cliente : undefined,
    });
  };


  const currentSale = selected
    ? (() => {
        const s = sales[selected.id] ?? defaultSale(selected);
        return { ...s, mesesSemJuros: s.mesesSemJuros ?? DEFAULT_MESES_SEM_JUROS };
      })()
    : null;

  const updateSale = (id: string, patch: Partial<Sale>) => {
    setSales((prev) => {
      const base = prev[id] ?? (selected ? defaultSale(selected) : null);
      if (!base) return prev;
      const next: Sale = { ...base, ...patch };
      if (patch.parcelas !== undefined && patch.parcelas !== base.parcelas) {
        const arr: Pagamento[] = Array.from({ length: patch.parcelas }, () => ({ valor: null, data: null }));
        for (let i = 0; i < Math.min(arr.length, base.pagamentos.length); i++) arr[i] = base.pagamentos[i];
        next.pagamentos = arr;
      }
      return { ...prev, [id]: next };
    });
  };

  const updatePagamento = (id: string, idx: number, patch: Partial<Pagamento>) => {
    setSales((prev) => {
      const base = prev[id] ?? (selected ? defaultSale(selected) : null);
      if (!base) return prev;
      const pagamentos = [...base.pagamentos];
      pagamentos[idx] = { ...pagamentos[idx], ...patch };
      return { ...prev, [id]: { ...base, pagamentos } };
    });
  };

  const toggle = (s: Status) => {
    const next = new Set(filters);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setFilters(next);
  };

  const counts = useMemo(() => {
    const c: Record<Status, number> = { disponivel: 0, reservado: 0, vendido: 0, cancelado: 0 };
    for (const l of lotes) c[l.status]++;
    return c;
  }, [lotes]);

  type ParcelaInfo = {
    lotId: string;
    lotLabel: string;
    cliente: string;
    numero: number;
    total: number;
    vencimento: Date;
    esperado: number;
    diasAtraso: number; // >0 atrasado, <=0 dias até vencer (negativo)
  };
  const parcelasInfo = useMemo(() => {
    const today = startOfToday();
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    const atrasadas: ParcelaInfo[] = [];
    const proximas: ParcelaInfo[] = [];
    for (const l of lotes) {
      const s = sales[l.id];
      if (!s || !s.dataPrimeiraParcela) continue;
      const financiado = Math.max(0, l.preco - s.entrada);
      const nome = nomeOverrides[l.id];
      const label = nome ? `${nome} (${l.id})` : l.id;
      const mesesSemJuros = s.mesesSemJuros ?? DEFAULT_MESES_SEM_JUROS;
      for (let i = 0; i < s.parcelas; i++) {
        const pago = s.pagamentos[i];
        const esperado = parcelaEsperadaMes(financiado, s.parcelas, i + 1, mesesSemJuros);
        const valor = pago?.valor;
        const quitada = valor !== null && valor !== undefined && valor >= esperado - 0.005;
        if (quitada) continue;
        const venc = addMonths(s.dataPrimeiraParcela, i);
        const diffMs = today.getTime() - venc.getTime();
        const diasAtraso = Math.floor(diffMs / 86400000);
        const info: ParcelaInfo = {
          lotId: l.id,
          lotLabel: label,
          cliente: s.cliente || l.cliente || "—",
          numero: i + 1,
          total: s.parcelas,
          vencimento: venc,
          esperado,
          diasAtraso,
        };
        if (venc < today) atrasadas.push(info);
        else if (venc <= in30) proximas.push(info);
      }
    }
    atrasadas.sort((a, b) => b.diasAtraso - a.diasAtraso);
    proximas.sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime());
    const somaAtrasadas = atrasadas.reduce((a, p) => a + p.esperado, 0);
    const somaProximas = proximas.reduce((a, p) => a + p.esperado, 0);
    return { atrasadas, proximas, somaAtrasadas, somaProximas };
  }, [lotes, sales, nomeOverrides]);

  const quadras = useMemo(() => {
    const grouped: Record<string, Lote[]> = {};
    for (const l of lotes) {
      if (!filters.has(l.status)) continue;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${l.id} ${nomeOverrides[l.id] ?? ""} ${l.cliente ?? ""} ${l.corretor ?? ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      (grouped[l.quadra] ||= []).push(l);
    }
    return grouped;
  }, [lotes, filters, search, nomeOverrides]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 sm:py-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">Mapa de Lotes</h1>
            {empreendimentoEdit ? (
              <div className="mt-1 flex items-center gap-2">
                <Input
                  value={empreendimento}
                  maxLength={160}
                  onChange={(e) => setEmpreendimento(e.target.value)}
                  placeholder="Nome do loteamento"
                  className="h-8 w-full sm:w-72"

                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setEmpreendimentoEdit(false);
                    if (e.key === "Escape") setEmpreendimentoEdit(false);
                  }}
                />
                <Button size="sm" variant="outline" className="h-8" onClick={() => setEmpreendimentoEdit(false)}>
                  OK
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEmpreendimentoEdit(true)}
                title="Editar nome do loteamento"
                className={`text-left text-sm hover:underline ${empreendimento ? "text-muted-foreground hover:text-foreground" : "italic text-muted-foreground/70 hover:text-foreground"}`}
              >
                {empreendimento || "Nome do loteamento"}
              </button>
            )}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <label className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground sm:flex-none">
              <span className="hidden sm:inline">Empreendimento</span>
              <select
                value={activeEmpId}
                onChange={(e) => switchEmpreendimento(e.target.value)}
                className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm sm:max-w-[180px]"
                title="Trocar de empreendimento"
              >
                {empList.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome || "(sem nome)"}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="outline" size="sm" onClick={criarEmpreendimento} className="h-9 shrink-0" title="Novo empreendimento">
              + Novo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={excluirEmpreendimento}
              disabled={empList.length <= 1}
              className="h-9 shrink-0"
              title="Excluir empreendimento atual"
            >
              Excluir
            </Button>
            <div className="w-full md:w-72">
              <Input
                placeholder="Buscar por lote, cliente ou corretor…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {userEmail && (
              <span className="hidden text-xs text-muted-foreground lg:inline">{userEmail}</span>
            )}
            <Button variant="outline" size="sm" onClick={() => setAccountOpen(true)} title="Minha conta">
              <Settings className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">Conta</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut} title="Sair">
              <LogOut className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>


      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
        {/* Filtros / Legenda */}
        <div className="mb-6 flex flex-wrap items-center gap-2">

          {STATUS_ORDER.map((s) => {
            const meta = STATUS_META[s];
            const active = filters.has(s);
            return (
              <button
                key={s}
                onClick={() => toggle(s)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                  active ? "border-border bg-card" : "border-transparent bg-muted/40 text-muted-foreground opacity-60",
                )}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", meta.dot)} />
                <span className="font-medium">{meta.label}</span>
                <span className="text-xs text-muted-foreground">{counts[s]}</span>
              </button>
            );
          })}
          <div className="flex w-full flex-wrap items-center gap-3 text-sm text-muted-foreground md:ml-auto md:w-auto">
            <label className="flex items-center gap-2">
              <span>Total de lotes</span>
              <Input
                type="number"
                min={1}
                max={5000}
                value={total}
                onChange={(e) => setTotal(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))}
                className="h-8 w-24"
              />
            </label>
            <label className="flex items-center gap-2">
              <span>Lotes por quadra</span>
              <Input
                type="number"
                min={1}
                max={200}
                value={perQuadra}
                onChange={(e) => setPerQuadra(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="h-8 w-20"
              />
            </label>
            <span>
              <span className="font-medium text-foreground">{lotes.length}</span> lotes ·{" "}
              <span className="font-medium text-foreground">{Object.keys(quadras).length || Math.ceil(total / perQuadra)}</span> quadras
            </span>
            <Button size="sm" variant="outline" onClick={salvarConfig} className="h-8">
              Salvar configuração
            </Button>
            {savedAt && <span className="text-xs">Salvo às {savedAt}</span>}
            <Button
              size="sm"
              variant={selectionMode ? "default" : "outline"}
              onClick={() => {
                setSelectionMode((v) => {
                  if (v) clearSelection();
                  return !v;
                });
              }}
              className="h-8"
            >
              {selectionMode ? "Sair da seleção" : "Selecionar lotes"}
            </Button>
          </div>
        </div>

        {/* Painel de parcelas: em atraso e a vencer */}
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                  Parcelas em atraso
                </div>
                <div className="mt-1 text-2xl font-bold text-red-700 dark:text-red-300 tabular-nums">
                  {parcelasInfo.atrasadas.length}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total esperado</div>
                <div className="text-sm font-semibold tabular-nums">{brl(parcelasInfo.somaAtrasadas)}</div>
              </div>
            </div>
            {parcelasInfo.atrasadas.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Nenhuma parcela em atraso.</p>
            ) : (
              <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">
                {parcelasInfo.atrasadas.slice(0, 8).map((p) => {
                  const lote = lotes.find((l) => l.id === p.lotId);
                  return (
                    <li key={`${p.lotId}-${p.numero}`} className="flex items-center justify-between gap-2 rounded border border-red-500/20 bg-background/60 px-2 py-1">
                      <button
                        type="button"
                        className="truncate text-left font-medium hover:underline"
                        onClick={() => lote && setSelected(lote)}
                      >
                        Lote {p.lotLabel} · {p.cliente}
                      </button>
                      <div className="flex shrink-0 items-center gap-2 tabular-nums">
                        <span>{brDate(p.vencimento)}</span>
                        <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">
                          {p.diasAtraso}d
                        </Badge>
                        <span className="font-semibold">{brl(p.esperado)}</span>
                      </div>
                    </li>
                  );
                })}
                {parcelasInfo.atrasadas.length > 8 && (
                  <li className="pt-1 text-center text-muted-foreground">
                    +{parcelasInfo.atrasadas.length - 8} outras
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  Parcelas a vencer (30 dias)
                </div>
                <div className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                  {parcelasInfo.proximas.length}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total esperado</div>
                <div className="text-sm font-semibold tabular-nums">{brl(parcelasInfo.somaProximas)}</div>
              </div>
            </div>
            {parcelasInfo.proximas.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Nenhuma parcela nos próximos 30 dias.</p>
            ) : (
              <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">
                {parcelasInfo.proximas.slice(0, 8).map((p) => {
                  const lote = lotes.find((l) => l.id === p.lotId);
                  const dias = Math.max(0, -p.diasAtraso);
                  return (
                    <li key={`${p.lotId}-${p.numero}`} className="flex items-center justify-between gap-2 rounded border border-amber-500/20 bg-background/60 px-2 py-1">
                      <button
                        type="button"
                        className="truncate text-left font-medium hover:underline"
                        onClick={() => lote && setSelected(lote)}
                      >
                        Lote {p.lotLabel} · {p.cliente}
                      </button>
                      <div className="flex shrink-0 items-center gap-2 tabular-nums">
                        <span>{brDate(p.vencimento)}</span>
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                          em {dias}d
                        </Badge>
                        <span className="font-semibold">{brl(p.esperado)}</span>
                      </div>
                    </li>
                  );
                })}
                {parcelasInfo.proximas.length > 8 && (
                  <li className="pt-1 text-center text-muted-foreground">
                    +{parcelasInfo.proximas.length - 8} outras
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
        {!Object.values(sales).some((s) => s?.dataPrimeiraParcela) && (
          <div className="mb-6 rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
            Dica: defina a <strong>Data da 1ª parcela</strong> no modal de cada lote vendido para que as parcelas apareçam nos painéis acima.
          </div>
        )}

        {/* Barra de ações em massa */}
        {selectionMode && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow-sm">
            <span className="text-sm">
              <span className="font-semibold text-foreground">{selectedIds.size}</span> lote(s) selecionado(s)
            </span>
            <Button size="sm" variant="ghost" onClick={selectAllFiltered} className="h-8">
              Selecionar todos filtrados
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection} className="h-8" disabled={selectedIds.size === 0}>
              Limpar
            </Button>
            <span className="mx-1 hidden text-xs text-muted-foreground sm:inline">Alterar status para:</span>
            {STATUS_ORDER.map((s) => {
              const meta = STATUS_META[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => bulkChangeStatus(s)}
                  disabled={bulkBusy || selectedIds.size === 0}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition disabled:opacity-40",
                    meta.fill,
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                  {meta.label}
                </button>
              );
            })}
            {bulkBusy && <span className="text-xs text-muted-foreground">aplicando…</span>}
          </div>
        )}



        {/* Mapa por quadra */}
        <div className="space-y-6">
          {Object.keys(quadras).length === 0 && (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nenhum lote corresponde aos filtros atuais.
            </div>
          )}
          {Object.entries(quadras).map(([q, lotes]) => (
            <section key={q} className="rounded-xl border bg-card p-3 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="truncate text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Quadra {q}
                </h2>
                <span className="shrink-0 text-xs text-muted-foreground">{lotes.length} lotes</span>
              </div>
              <div className="grid grid-cols-3 gap-2 xs:grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12">

                {lotes.map((l) => {
                  const meta = STATUS_META[l.status];
                  const nome = nomeOverrides[l.id];
                  const label = nome ?? String(l.numero);
                  const isSelected = selectedIds.has(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => (selectionMode ? toggleSelect(l.id) : setSelected(l))}
                      title={`Lote ${nome ? `${nome} (${l.id})` : l.id} — ${meta.label}`}
                      className={cn(
                        "group relative aspect-square rounded-md border text-xs font-semibold transition focus:outline-none focus:ring-2",
                        meta.fill,
                        meta.ring,
                        selectionMode && isSelected && "ring-2 ring-offset-2 ring-primary",
                      )}
                    >
                      <span className="absolute left-1 top-1 text-[10px] font-normal opacity-70">{l.quadra}</span>
                      <span className={cn("truncate px-1", label.length > 3 ? "text-xs" : "text-base")}>{label}</span>
                      {selectionMode && isSelected && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
          {selected && currentSale && (() => {
            const live = lotes.find((l) => l.id === selected.id) ?? selected;
            const preco = live.preco;
            const financiado = Math.max(0, preco - currentSale.entrada);
            const parcelaBaseVal = parcelaBase(financiado, currentSale.parcelas);
            const totalPago = currentSale.pagamentos.reduce<number>((a, p) => a + (p.valor ?? 0), 0);
            const totalContrato = currentSale.entrada + totalContratoCalc(financiado, currentSale.parcelas, currentSale.mesesSemJuros);
            return (
              <>
                <DialogHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <DialogTitle className="min-w-0 break-words text-lg sm:text-xl">Lote {nomeOverrides[selected.id] ? `${nomeOverrides[selected.id]} · ${selected.id}` : selected.id}</DialogTitle>
                    <Badge variant="outline" className={cn("shrink-0 border", STATUS_META[live.status].badge)}>
                      <span className={cn("mr-1.5 h-2 w-2 rounded-full", STATUS_META[live.status].dot)} />
                      {STATUS_META[live.status].label}
                    </Badge>
                  </div>

                  <DialogDescription>
                    Quadra {selected.quadra} · Lote {selected.numero} · {selected.area} m² · Valor {brl(preco)}
                  </DialogDescription>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Label htmlFor="nomeLoteTop" className="whitespace-nowrap text-xs text-muted-foreground">
                      Nome do lote
                    </Label>
                    <Input
                      id="nomeLoteTop"
                      value={nomeOverrides[selected.id] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setNomeOverrides((prev) => {
                          const next = { ...prev };
                          if (v.trim() === "") delete next[selected.id];
                          else next[selected.id] = v;
                          return next;
                        });
                      }}
                      placeholder={`Ex.: ${selected.id} (padrão)`}
                      className="h-8 min-w-[10rem] flex-1"

                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"
                      onClick={() => {
                        const nome = nomeOverrides[selected.id] ?? selected.id;
                        if (!window.confirm(`Excluir o lote "${nome}"? Esta ação remove o lote do mapa junto com seus dados de venda.`)) return;
                        const id = selected.id;
                        setDeletedIds((prev) => {
                          const next = new Set(prev);
                          next.add(id);
                          return next;
                        });
                        setNomeOverrides((prev) => { const n = { ...prev }; delete n[id]; return n; });
                        setStatusOverrides((prev) => { const n = { ...prev }; delete n[id]; return n; });
                        setCorretorOverrides((prev) => { const n = { ...prev }; delete n[id]; return n; });
                        setPrecoOverrides((prev) => { const n = { ...prev }; delete n[id]; return n; });
                        setSales((prev) => { const n = { ...prev }; delete n[id]; return n; });
                        setSelected(null);
                        toast.success("Lote excluído");
                      }}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Excluir
                    </Button>
                  </div>
                </DialogHeader>


                {/* Alterar status */}
                <div className="mt-4">
                  <Label>Status do lote</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {STATUS_ORDER.map((s) => {
                      const meta = STATUS_META[s];
                      const active = live.status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => changeStatus(s)}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                            active ? meta.fill : "border-border bg-card text-muted-foreground hover:bg-muted/50",
                          )}
                        >
                          <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 rounded-md border bg-muted/30 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Histórico de alterações
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {historyLoading ? "carregando…" : `${history.length} registro(s)`}
                      </span>
                    </div>
                    {history.length === 0 && !historyLoading ? (
                      <p className="text-xs text-muted-foreground">Nenhuma alteração registrada ainda.</p>
                    ) : (
                      <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs">
                        {history.map((h) => {
                          const from = h.from_status ? STATUS_META[h.from_status]?.label ?? h.from_status : "—";
                          const to = STATUS_META[h.to_status]?.label ?? h.to_status;
                          const when = new Date(h.created_at).toLocaleString("pt-BR");
                          return (
                            <li key={h.id} className="flex flex-wrap items-center gap-1.5">
                              <span className="text-muted-foreground">{when}</span>
                              <span>·</span>
                              <span className="font-medium">{h.changed_by_email ?? "usuário"}</span>
                              <span className="text-muted-foreground">alterou de</span>
                              <span className="font-medium">{from}</span>
                              <span className="text-muted-foreground">para</span>
                              <span className="font-medium">{to}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>



                {/* Dados da venda financiada */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <Label htmlFor="cliente">Cliente comprador</Label>
                    <Input
                      id="cliente"
                      value={currentSale.cliente}
                      onChange={(e) => updateSale(selected.id, { cliente: e.target.value })}
                      placeholder="Nome do comprador"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cli-cpf">CPF (opcional)</Label>
                    <Input
                      id="cli-cpf"
                      value={currentSale.cpf ?? ""}
                      maxLength={20}
                      onChange={(e) => updateSale(selected.id, { cpf: e.target.value })}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cli-cel">Celular</Label>
                    <Input
                      id="cli-cel"
                      type="tel"
                      value={currentSale.celular ?? ""}
                      maxLength={20}
                      onChange={(e) => updateSale(selected.id, { celular: e.target.value })}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cli-email">E-mail</Label>
                    <Input
                      id="cli-email"
                      type="email"
                      value={currentSale.email ?? ""}
                      maxLength={255}
                      onChange={(e) => updateSale(selected.id, { email: e.target.value })}
                      placeholder="cliente@exemplo.com"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="cli-end">Endereço</Label>
                    <Input
                      id="cli-end"
                      value={currentSale.endereco ?? ""}
                      maxLength={200}
                      onChange={(e) => updateSale(selected.id, { endereco: e.target.value })}
                      placeholder="Rua, número, complemento"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cli-bairro">Bairro</Label>
                    <Input
                      id="cli-bairro"
                      value={currentSale.bairro ?? ""}
                      maxLength={100}
                      onChange={(e) => updateSale(selected.id, { bairro: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="cli-cidade">Cidade</Label>
                    <Input
                      id="cli-cidade"
                      value={currentSale.cidade ?? ""}
                      maxLength={100}
                      onChange={(e) => updateSale(selected.id, { cidade: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Label htmlFor="corretor">Corretor responsável</Label>
                    <Input
                      id="corretor"
                      value={corretorOverrides[selected.id] ?? live.corretor ?? ""}
                      maxLength={120}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCorretorOverrides((prev) => {
                          const next = { ...prev };
                          if (v.trim() === "") delete next[selected.id];
                          else next[selected.id] = v;
                          return next;
                        });
                      }}
                      placeholder="Nome do corretor"
                    />
                  </div>
                  <div>
                    <Label htmlFor="preco">Valor total do lote</Label>
                    <Input
                      id="preco"
                      type="number"
                      min={0}
                      step="0.01"
                      value={preco}
                      onChange={(e) => {
                        const v = Math.max(0, Number(e.target.value) || 0);
                        setPrecoOverrides((prev) => ({ ...prev, [selected.id]: v }));
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="entrada">Valor de entrada</Label>
                    <Input
                      id="entrada"
                      type="number"
                      min={0}
                      max={preco}
                      value={currentSale.entrada}
                      onChange={(e) => updateSale(selected.id, { entrada: Math.max(0, Math.min(preco, Number(e.target.value) || 0)) })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="parcelas">Nº de parcelas</Label>
                    <Input
                      id="parcelas"
                      type="number"
                      min={1}
                      max={360}
                      value={currentSale.parcelas}
                      onChange={(e) => updateSale(selected.id, { parcelas: Math.max(1, Math.min(360, Number(e.target.value) || 1)) })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="data1a">Data da 1ª parcela</Label>
                    <Input
                      id="data1a"
                      type="date"
                      value={currentSale.dataPrimeiraParcela ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateSale(selected.id, { dataPrimeiraParcela: v === "" ? null : v });
                      }}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Usada para calcular parcelas em atraso e a vencer.
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="carencia">Meses sem juros (carência)</Label>
                    <Input
                      id="carencia"
                      type="number"
                      min={0}
                      max={currentSale.parcelas}
                      value={currentSale.mesesSemJuros}
                      onChange={(e) =>
                        updateSale(selected.id, {
                          mesesSemJuros: Math.max(0, Math.min(currentSale.parcelas, Number(e.target.value) || 0)),
                        })
                      }
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Após esses meses, aplica-se 5% ao ano composto a cada 12 meses.
                    </p>
                  </div>
                </div>

                {/* Resumo financeiro */}
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-4">
                  <div>
                    <div className="text-muted-foreground">Financiado</div>
                    <div className="font-semibold">{brl(financiado)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Parcela base (carência)</div>
                    <div className="font-semibold">{brl(parcelaBaseVal)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Juros a.a.</div>
                    <div className="font-semibold">5,00%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total contrato</div>
                    <div className="font-semibold">{brl(totalContrato)}</div>
                  </div>
                </div>

                {/* Parcelas */}
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Parcelas</h3>
                    <div className="text-xs text-muted-foreground">
                      Pago: <span className="font-medium text-foreground">{brl(totalPago)}</span>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-right">Esperado</th>
                          <th className="px-3 py-2 text-right">Valor recebido</th>
                          <th className="px-3 py-2 text-right">Data pagto</th>
                          <th className="px-3 py-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentSale.pagamentos.map((pago, i) => {
                          const esperado = parcelaEsperadaMes(financiado, currentSale.parcelas, i + 1, currentSale.mesesSemJuros);
                          const valor = pago.valor;
                          const pago_ = valor !== null;
                          const below = pago_ && valor! < esperado - 0.005;
                          const above = pago_ && valor! >= esperado - 0.005;
                          const rowClass = below
                            ? "bg-red-500/5"
                            : above
                              ? "bg-emerald-500/5"
                              : "";
                          const mes = i + 1;
                          const anoLabel = mes <= currentSale.mesesSemJuros
                            ? "c"
                            : `a${Math.floor((mes - currentSale.mesesSemJuros - 1) / 12) + 2}`;
                          return (
                            <tr key={i} className={cn("border-t", rowClass)}>
                              <td className="px-3 py-1.5 text-muted-foreground">{i + 1} <span className="text-[10px] opacity-60">{anoLabel}</span></td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{brl(esperado)}</td>
                              <td className="px-3 py-1.5 text-right">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={valor ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    updatePagamento(selected.id, i, { valor: v === "" ? null : Number(v) });
                                  }}
                                  className={cn(
                                    "ml-auto h-8 w-28 text-right tabular-nums",
                                    below && "border-red-500 bg-red-500/10 text-red-700 focus-visible:ring-red-500 dark:text-red-300",
                                    above && "border-emerald-500 bg-emerald-500/10 text-emerald-700 focus-visible:ring-emerald-500 dark:text-emerald-300",
                                  )}
                                  placeholder="—"
                                />
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                <Input
                                  type="date"
                                  value={pago.data ?? ""}
                                  onChange={(e) => {
                                    const d = e.target.value;
                                    updatePagamento(selected.id, i, { data: d === "" ? null : d });
                                  }}
                                  className="ml-auto h-8 w-40"
                                />
                              </td>
                              <td className="px-3 py-1.5 text-right text-xs font-medium">
                                {!pago_ ? (
                                  <span className="text-muted-foreground">pendente</span>
                                ) : below ? (
                                  <span className="text-red-600 dark:text-red-400">abaixo</span>
                                ) : (
                                  <span className="text-emerald-600 dark:text-emerald-400">ok</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSelected(null)}>Fechar</Button>
                  <Button onClick={() => setSelected(null)}>Salvar</Button>
                </div>
              </>
            );
          })()}
        </DialogContent>

      </Dialog>

      <Dialog open={bulkPendingStatus !== null} onOpenChange={(o) => !o && setBulkPendingStatus(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {bulkPendingStatus === "vendido" ? "Vender lotes em massa" : "Reservar lotes em massa"}
            </DialogTitle>
            <DialogDescription>
              {selectedIds.size} lote(s) selecionado(s). Informe os dados abaixo para concluir.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <div>
              <Label htmlFor="bulk-corretor">Corretor responsável *</Label>
              <Input
                id="bulk-corretor"
                value={bulkCorretor}
                maxLength={120}
                onChange={(e) => setBulkCorretor(e.target.value)}
                placeholder="Nome do corretor"
                aria-invalid={!!bulkErrors.corretor}
              />
              {bulkErrors.corretor && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{bulkErrors.corretor}</p>
              )}
            </div>
            {bulkPendingStatus === "vendido" && (
              <div>
                <Label htmlFor="bulk-cliente">Cliente comprador *</Label>
                <Input
                  id="bulk-cliente"
                  value={bulkCliente}
                  maxLength={120}
                  onChange={(e) => setBulkCliente(e.target.value)}
                  placeholder="Nome do cliente"
                  aria-invalid={!!bulkErrors.cliente}
                />
                {bulkErrors.cliente && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{bulkErrors.cliente}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Será aplicado a todos os lotes selecionados. Ajustes individuais podem ser feitos depois no lote.
                </p>
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkPendingStatus(null)} disabled={bulkBusy}>
              Cancelar
            </Button>
            <Button onClick={confirmBulkAssignment} disabled={bulkBusy}>
              {bulkBusy ? "Aplicando…" : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Minha conta */}
      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Minha conta</DialogTitle>
            <DialogDescription>Dados do usuário e preferências.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover border" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full border bg-muted text-lg font-semibold">
                  {(displayName || userEmail || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{displayName || "(sem nome)"}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="acc-id">ID</Label>
                <Input id="acc-id" value={userId ?? ""} readOnly disabled className="font-mono text-xs" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="acc-name">Nome de exibição</Label>
                <Input
                  id="acc-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Seu nome"
                />
              </div>
              <div>
                <Label htmlFor="acc-cpf">CPF (opcional)</Label>
                <Input id="acc-cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div>
                <Label htmlFor="acc-cel">Celular</Label>
                <Input id="acc-cel" value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="acc-end">Endereço</Label>
                <Input id="acc-end" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, complemento" />
              </div>
              <div>
                <Label htmlFor="acc-bairro">Bairro</Label>
                <Input id="acc-bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="acc-cidade">Cidade</Label>
                <Input id="acc-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
              </div>
              {userCreatedAt && (
                <div className="sm:col-span-2">
                  <Label>Conta criada em</Label>
                  <p className="text-sm text-muted-foreground">
                    {new Date(userCreatedAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveAccount} disabled={savingAccount || !userId}>
                {savingAccount ? "Salvando…" : "Salvar dados"}
              </Button>
            </div>

            <div className="border-t pt-4">
              <Label htmlFor="acc-pwd">Alterar senha</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  id="acc-pwd"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nova senha (mín. 6)"
                  autoComplete="new-password"
                />
                <Button variant="outline" onClick={handleChangePassword} disabled={changingPwd || !newPassword}>
                  {changingPwd ? "…" : "Alterar"}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <span className="text-xs text-muted-foreground">Encerrar sessão neste dispositivo</span>
              <Button variant="destructive" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-1 h-4 w-4" /> Sair
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
