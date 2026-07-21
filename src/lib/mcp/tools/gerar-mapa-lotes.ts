import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
function quadraName(i: number): string {
  if (i < 26) return LETTERS[i];
  return `${LETTERS[Math.floor(i / 26) - 1]}${LETTERS[i % 26]}`;
}

export default defineTool({
  name: "gerar_mapa_lotes",
  title: "Gerar mapa de lotes",
  description:
    "Gera a estrutura de quadras e lotes (identificadores) a partir de um total de lotes e uma quantidade por quadra. Útil para planejar novos empreendimentos.",
  inputSchema: {
    total: z.number().int().min(1).max(5000).describe("Total de lotes no empreendimento."),
    por_quadra: z.number().int().min(1).max(200).describe("Quantidade de lotes por quadra."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ total, por_quadra }) => {
    const quadras: { quadra: string; lotes: string[] }[] = [];
    let qIdx = 0;
    let nInQuadra = 0;
    let current: { quadra: string; lotes: string[] } = { quadra: quadraName(0), lotes: [] };
    quadras.push(current);
    for (let i = 0; i < total; i++) {
      if (nInQuadra >= por_quadra) {
        qIdx++;
        nInQuadra = 0;
        current = { quadra: quadraName(qIdx), lotes: [] };
        quadras.push(current);
      }
      nInQuadra++;
      current.lotes.push(`${current.quadra}-${String(nInQuadra).padStart(2, "0")}`);
    }
    const data = { total, por_quadra, quantidade_quadras: quadras.length, quadras };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  },
});
