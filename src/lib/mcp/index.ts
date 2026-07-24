import { auth, defineMcp } from "@lovable.dev/mcp-js";
import calcularFinanciamento from "./tools/calcular-financiamento";
import parcelaEsperadaMes from "./tools/parcela-esperada";
import gerarMapaLotes from "./tools/gerar-mapa-lotes";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "loteadora-mcp",
  title: "Loteadora — Mapa e Financiamento",
  version: "0.1.0",
  instructions:
    "Ferramentas para uma loteadora: gerar a estrutura de quadras/lotes de um empreendimento e calcular o plano de financiamento (parcela base, cronograma com 5% a.a. compostos a partir do 2º ano, total do contrato).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [calcularFinanciamento, parcelaEsperadaMes, gerarMapaLotes],
});

