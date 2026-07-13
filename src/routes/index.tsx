import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
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

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Index() {
  const [filters, setFilters] = useState<Set<Status>>(new Set(STATUS_ORDER));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Lote | null>(null);
  const [total, setTotal] = useState(150);
  const [perQuadra, setPerQuadra] = useState(15);

  const lotes = useMemo(() => generateLotes(total, perQuadra), [total, perQuadra]);

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
        const hay = `${l.id} ${l.cliente ?? ""} ${l.corretor ?? ""}`.toLowerCase();
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
          <div className="w-full md:w-72">
            <Input
              placeholder="Buscar por lote, cliente ou corretor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
          <div className="ml-auto text-sm text-muted-foreground">
            Total: <span className="font-medium text-foreground">{ALL_LOTES.length}</span> lotes
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
                  return (
                    <button
                      key={l.id}
                      onClick={() => setSelected(l)}
                      title={`Lote ${l.id} — ${meta.label}`}
                      className={cn(
                        "group relative aspect-square rounded-md border text-xs font-semibold transition focus:outline-none focus:ring-2",
                        meta.fill,
                        meta.ring,
                      )}
                    >
                      <span className="absolute left-1 top-1 text-[10px] font-normal opacity-70">{l.quadra}</span>
                      <span className="text-base">{l.numero}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="text-xl">Lote {selected.id}</DialogTitle>
                  <Badge variant="outline" className={cn("border", STATUS_META[selected.status].badge)}>
                    <span className={cn("mr-1.5 h-2 w-2 rounded-full", STATUS_META[selected.status].dot)} />
                    {STATUS_META[selected.status].label}
                  </Badge>
                </div>
                <DialogDescription>Quadra {selected.quadra} · Lote {selected.numero}</DialogDescription>
              </DialogHeader>

              <dl className="mt-2 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Área</dt>
                  <dd className="font-medium">{selected.area} m²</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Valor</dt>
                  <dd className="font-medium">{brl(selected.preco)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cliente</dt>
                  <dd className="font-medium">{selected.cliente ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Corretor</dt>
                  <dd className="font-medium">{selected.corretor ?? "—"}</dd>
                </div>
              </dl>

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelected(null)}>Fechar</Button>
                <Button>Ver contrato</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
