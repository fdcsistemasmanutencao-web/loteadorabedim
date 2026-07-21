import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const ANNUAL_RATE = 0.05;

export default defineTool({
  name: "calcular_financiamento",
  title: "Calcular financiamento de lote",
  description:
    "Calcula o plano de financiamento de um lote: valor financiado, parcela base do 1º ano, parcela esperada por mês (com juros de 5% a.a. compostos a partir do 2º ano) e total do contrato.",
  inputSchema: {
    valor_total: z.number().positive().describe("Valor total do lote em reais."),
    entrada: z.number().min(0).describe("Valor de entrada em reais."),
    parcelas: z.number().int().min(1).max(360).describe("Número de parcelas mensais (1 a 360)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ valor_total, entrada, parcelas }) => {
    const financiado = Math.max(0, valor_total - entrada);
    const base = financiado / parcelas;
    const cronograma = Array.from({ length: parcelas }, (_, i) => {
      const mes = i + 1;
      const ano = Math.floor(i / 12) + 1;
      const esperado = base * Math.pow(1 + ANNUAL_RATE, ano - 1);
      return { mes, ano, esperado: Number(esperado.toFixed(2)) };
    });
    const total_parcelas = cronograma.reduce((a, p) => a + p.esperado, 0);
    const total_contrato = entrada + total_parcelas;
    const resultado = {
      valor_total,
      entrada,
      financiado: Number(financiado.toFixed(2)),
      parcelas,
      parcela_base_primeiro_ano: Number(base.toFixed(2)),
      juros_ao_ano: ANNUAL_RATE,
      total_parcelas: Number(total_parcelas.toFixed(2)),
      total_contrato: Number(total_contrato.toFixed(2)),
      cronograma,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(resultado, null, 2) }],
      structuredContent: resultado,
    };
  },
});
