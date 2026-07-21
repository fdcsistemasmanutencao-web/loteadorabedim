import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const ANNUAL_RATE = 0.05;

export default defineTool({
  name: "parcela_esperada_mes",
  title: "Parcela esperada em um mês",
  description:
    "Retorna o valor esperado de uma parcela em um mês específico, considerando meses de carência sem juros e depois 5% a.a. composto a cada 12 meses.",
  inputSchema: {
    financiado: z.number().min(0).describe("Valor financiado (após entrada) em reais."),
    parcelas: z.number().int().min(1).max(360).describe("Número total de parcelas."),
    mes: z.number().int().min(1).describe("Mês desejado (1-indexado)."),
    meses_sem_juros: z
      .number()
      .int()
      .min(0)
      .max(360)
      .default(12)
      .describe("Meses iniciais de carência sem juros. Padrão: 12."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ financiado, parcelas, mes, meses_sem_juros }) => {
    if (mes > parcelas) {
      return {
        content: [{ type: "text", text: `Mês ${mes} excede o número de parcelas (${parcelas}).` }],
        isError: true,
      };
    }
    const carencia = Math.min(meses_sem_juros ?? 12, parcelas);
    const base = financiado / parcelas;
    const emCarencia = mes <= carencia;
    const ano = emCarencia ? 0 : Math.floor((mes - carencia - 1) / 12) + 1;
    const esperado = emCarencia ? base : base * Math.pow(1 + ANNUAL_RATE, ano);
    const data = {
      mes,
      meses_sem_juros: carencia,
      em_carencia: emCarencia,
      ano_juros: ano,
      parcela_base: Number(base.toFixed(2)),
      esperado: Number(esperado.toFixed(2)),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  },
});
