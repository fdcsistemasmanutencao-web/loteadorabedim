import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const ANNUAL_RATE = 0.05;

export default defineTool({
  name: "calcular_financiamento",
  title: "Calcular financiamento de lote",
  description:
    "Calcula o plano de financiamento de um lote: valor financiado, parcela base, cronograma com carência configurável (meses sem juros) e depois 5% a.a. composto a cada 12 meses, e total do contrato.",
  inputSchema: {
    valor_total: z.number().positive().describe("Valor total do lote em reais."),
    entrada: z.number().min(0).describe("Valor de entrada em reais."),
    parcelas: z.number().int().min(1).max(360).describe("Número de parcelas mensais (1 a 360)."),
    meses_sem_juros: z
      .number()
      .int()
      .min(0)
      .max(360)
      .default(12)
      .describe("Meses iniciais de carência sem juros. Padrão: 12."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ valor_total, entrada, parcelas, meses_sem_juros }) => {
    const carencia = Math.min(meses_sem_juros ?? 12, parcelas);
    const financiado = Math.max(0, valor_total - entrada);
    const base = financiado / parcelas;
    const cronograma = Array.from({ length: parcelas }, (_, i) => {
      const mes = i + 1;
      const emCarencia = mes <= carencia;
      const ano = emCarencia ? 0 : Math.floor((mes - carencia - 1) / 12) + 1;
      const esperado = emCarencia ? base : base * Math.pow(1 + ANNUAL_RATE, ano);
      return { mes, ano_juros: ano, esperado: Number(esperado.toFixed(2)) };
    });
    const total_parcelas = cronograma.reduce((a, p) => a + p.esperado, 0);
    const total_contrato = entrada + total_parcelas;
    const resultado = {
      valor_total,
      entrada,
      financiado: Number(financiado.toFixed(2)),
      parcelas,
      meses_sem_juros: carencia,
      parcela_base: Number(base.toFixed(2)),
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
