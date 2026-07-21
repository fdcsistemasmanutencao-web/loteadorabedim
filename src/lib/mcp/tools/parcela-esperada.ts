import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const ANNUAL_RATE = 0.05;

export default defineTool({
  name: "parcela_esperada_mes",
  title: "Parcela esperada em um mês",
  description:
    "Retorna o valor esperado de uma parcela específica considerando 5% a.a. de juros compostos aplicados anualmente a partir do 2º ano.",
  inputSchema: {
    financiado: z.number().min(0).describe("Valor financiado (após entrada) em reais."),
    parcelas: z.number().int().min(1).max(360).describe("Número total de parcelas."),
    mes: z.number().int().min(1).describe("Mês desejado (1-indexado)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ financiado, parcelas, mes }) => {
    if (mes > parcelas) {
      return {
        content: [{ type: "text", text: `Mês ${mes} excede o número de parcelas (${parcelas}).` }],
        isError: true,
      };
    }
    const base = financiado / parcelas;
    const ano = Math.floor((mes - 1) / 12) + 1;
    const esperado = base * Math.pow(1 + ANNUAL_RATE, ano - 1);
    const data = {
      mes,
      ano,
      parcela_base: Number(base.toFixed(2)),
      esperado: Number(esperado.toFixed(2)),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  },
});
