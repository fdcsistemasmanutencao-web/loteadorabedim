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
import { LogOut } from "lucide-react";

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
  pagamentos: Pagamento[];
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
    pagamentos: Array.from({ length: 60 }, () => ({ valor: null, data: null })),
  };
}

const STORAGE_KEY = "loteadora:config:v1";
type PersistedConfig = {
  total: number;
  perQuadra: number;
  precoOverrides: Record<string, number>;
  nomeOverrides: Record<string, string>;
  statusOverrides: Record<string, Status>;
  sales: Record<string, Sale>;
};

function loadConfig(): Partial<PersistedConfig> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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
  const [total, setTotal] = useState(150);
  const [perQuadra, setPerQuadra] = useState(15);
  const [sales, setSales] = useState<Record<string, Sale>>({});
  const [precoOverrides, setPrecoOverrides] = useState<Record<string, number>>({});
  const [nomeOverrides, setNomeOverrides] = useState<Record<string, string>>({});
  const [statusOverrides, setStatusOverrides] = useState<Record<string, Status>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  // Carregar configuração salva
  useEffect(() => {
    const cfg = loadConfig();
    if (cfg.total) setTotal(cfg.total);
    if (cfg.perQuadra) setPerQuadra(cfg.perQuadra);
    if (cfg.precoOverrides) setPrecoOverrides(cfg.precoOverrides);
    if (cfg.nomeOverrides) setNomeOverrides(cfg.nomeOverrides);
    if (cfg.statusOverrides) setStatusOverrides(cfg.statusOverrides);
    if (cfg.sales) setSales(cfg.sales);
  }, []);

  const salvarConfig = () => {
    const payload: PersistedConfig = { total, perQuadra, precoOverrides, nomeOverrides, statusOverrides, sales };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setSavedAt(new Date().toLocaleTimeString("pt-BR"));
  };

  const lotesBase = useMemo(() => generateLotes(total, perQuadra), [total, perQuadra]);
  const lotes = useMemo(
    () => lotesBase.map((l) => (precoOverrides[l.id] != null ? { ...l, preco: precoOverrides[l.id] } : l)),
    [lotesBase, precoOverrides],
  );

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
  }, [lotes, filters, search]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Mapa de Lotes</h1>
            <p className="text-sm text-muted-foreground">Empreendimento Residencial Jardim das Palmeiras</p>
          </div>
          <div className="flex w-full items-center gap-2 md:w-auto">
            <div className="flex-1 md:w-72">
              <Input
                placeholder="Buscar por lote, cliente ou corretor…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {userEmail && (
              <span className="hidden text-xs text-muted-foreground lg:inline">{userEmail}</span>
            )}
            <Button variant="outline" size="sm" onClick={handleSignOut} title="Sair">
              <LogOut className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
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
          <div className="ml-auto flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
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
          </div>
        </div>


        {/* Mapa por quadra */}
        <div className="space-y-6">
          {Object.keys(quadras).length === 0 && (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nenhum lote corresponde aos filtros atuais.
            </div>
          )}
          {Object.entries(quadras).map(([q, lotes]) => (
            <section key={q} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Quadra {q}
                </h2>
                <span className="text-xs text-muted-foreground">{lotes.length} lotes</span>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12">
                {lotes.map((l) => {
                  const meta = STATUS_META[l.status];
                  const nome = nomeOverrides[l.id];
                  const label = nome ?? String(l.numero);
                  return (
                    <button
                      key={l.id}
                      onClick={() => setSelected(l)}
                      title={`Lote ${nome ? `${nome} (${l.id})` : l.id} — ${meta.label}`}
                      className={cn(
                        "group relative aspect-square rounded-md border text-xs font-semibold transition focus:outline-none focus:ring-2",
                        meta.fill,
                        meta.ring,
                      )}
                    >
                      <span className="absolute left-1 top-1 text-[10px] font-normal opacity-70">{l.quadra}</span>
                      <span className={cn("truncate px-1", label.length > 3 ? "text-xs" : "text-base")}>{label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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
                  <div className="flex items-center justify-between gap-3">
                    <DialogTitle className="text-xl">Lote {nomeOverrides[selected.id] ? `${nomeOverrides[selected.id]} · ${selected.id}` : selected.id}</DialogTitle>
                    <Badge variant="outline" className={cn("border", STATUS_META[selected.status].badge)}>
                      <span className={cn("mr-1.5 h-2 w-2 rounded-full", STATUS_META[selected.status].dot)} />
                      {STATUS_META[selected.status].label}
                    </Badge>
                  </div>
                  <DialogDescription>
                    Quadra {selected.quadra} · Lote {selected.numero} · {selected.area} m² · Valor {brl(preco)}
                  </DialogDescription>
                </DialogHeader>

                {/* Dados da venda financiada */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Label htmlFor="cliente">Cliente comprador</Label>
                    <Input
                      id="cliente"
                      value={currentSale.cliente}
                      onChange={(e) => updateSale(selected.id, { cliente: e.target.value })}
                      placeholder="Nome do comprador"
                    />
                  </div>
                  <div>
                    <Label htmlFor="nomeLote">Renomear lote</Label>
                    <Input
                      id="nomeLote"
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
                      placeholder={String(selected.numero)}
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
                  <div className="sm:col-span-3">
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
    </div>
  );
}
