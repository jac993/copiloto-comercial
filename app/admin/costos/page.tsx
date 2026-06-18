// =============================================================
// /admin/costos — Monitor de uso y costos de APIs externas.
// Server Component — consulta directa a Supabase sin exponer keys.
// =============================================================

import { createClient } from "@supabase/supabase-js";
import { ExternalLink } from "lucide-react";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface ApiUsageRow {
  id: string;
  created_at: string;
  api: string;
  endpoint: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  audio_seconds: number | null;
  costo_usd: number | null;
}

interface ResumenApi {
  api: string;
  total_usd: number;
  llamadas: number;
}

const API_LABELS: Record<string, { label: string; color: string }> = {
  claude:     { label: "Claude (Anthropic)", color: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300" },
  perplexity: { label: "Perplexity",         color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  assemblyai: { label: "AssemblyAI",         color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  whisper:    { label: "Whisper (OpenAI)",   color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
};

function formatUsd(value: number) {
  if (value < 0.001) return "< $0.001";
  return `$${value.toFixed(4)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CostosPage() {
  const supabase = getAdmin();

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  // Resumen por API del mes actual
  const { data: rawMes } = await supabase
    .from("api_usage")
    .select("api, costo_usd")
    .gte("created_at", inicioMes.toISOString());

  // Últimas 20 llamadas
  const { data: ultimas } = await supabase
    .from("api_usage")
    .select("id, created_at, api, endpoint, input_tokens, output_tokens, audio_seconds, costo_usd")
    .order("created_at", { ascending: false })
    .limit(20);

  // Agrupar por api
  const resumenMap = new Map<string, ResumenApi>();
  for (const row of rawMes ?? []) {
    const entry = resumenMap.get(row.api) ?? { api: row.api, total_usd: 0, llamadas: 0 };
    entry.total_usd += row.costo_usd ?? 0;
    entry.llamadas += 1;
    resumenMap.set(row.api, entry);
  }
  const resumen = Array.from(resumenMap.values()).sort((a, b) => b.total_usd - a.total_usd);
  const totalMes = resumen.reduce((acc, r) => acc + r.total_usd, 0);

  const rows = (ultimas ?? []) as ApiUsageRow[];

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-background p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Monitor de costos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Uso de APIs externas — mes actual
        </p>
      </div>

      {/* Cards de APIs + Total */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total */}
        <div className="col-span-2 md:col-span-1 rounded-2xl bg-[#7C3AED] text-white p-4 shadow-sm shadow-violet-400/30 flex flex-col justify-between min-h-[100px]">
          <p className="text-xs font-medium opacity-80 uppercase tracking-wide">Total del mes</p>
          <p className="text-3xl font-bold mt-2">{formatUsd(totalMes)}</p>
          <p className="text-xs opacity-70 mt-1">{rows.length > 0 ? `${(rawMes ?? []).length} llamadas` : "Sin datos aún"}</p>
        </div>

        {/* Por API */}
        {["claude", "perplexity", "assemblyai", "whisper"].map((api) => {
          const datos = resumenMap.get(api);
          const meta = API_LABELS[api];
          return (
            <div key={api} className="rounded-2xl bg-white dark:bg-card border border-border p-4 shadow-sm flex flex-col justify-between min-h-[100px]">
              <p className="text-xs text-muted-foreground font-medium">{meta.label}</p>
              <p className="text-2xl font-bold text-foreground mt-2">
                {datos ? formatUsd(datos.total_usd) : "$0"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {datos ? `${datos.llamadas} llamadas` : "Sin uso este mes"}
              </p>
            </div>
          );
        })}
      </div>

      {/* Link Vercel */}
      <div className="rounded-2xl bg-white dark:bg-card border border-border p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Costos de infraestructura</p>
          <p className="text-xs text-muted-foreground mt-0.5">Uso de Vercel Pro, ancho de banda y funciones serverless</p>
        </div>
        <a
          href="https://vercel.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl bg-[#7C3AED] text-white text-sm font-medium px-4 py-2.5 hover:bg-violet-700 transition-colors"
        >
          Ver en Vercel
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Tabla últimas llamadas */}
      <div className="rounded-2xl bg-white dark:bg-card border border-border overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Últimas 20 llamadas</h2>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Aún no hay llamadas registradas. Cuando uses IA en la app, aparecerán aquí.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">API</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Endpoint / Modelo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground hidden md:table-cell">Tokens in</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground hidden md:table-cell">Tokens out</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground hidden md:table-cell">Audio (s)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Costo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const meta = API_LABELS[row.api] ?? { label: row.api, color: "bg-gray-100 text-gray-700" };
                  return (
                    <tr key={row.id} className={i % 2 === 0 ? "" : "bg-muted/10"}>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                        {row.endpoint ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden md:table-cell">
                        {row.input_tokens?.toLocaleString("es-CL") ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden md:table-cell">
                        {row.output_tokens?.toLocaleString("es-CL") ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden md:table-cell">
                        {row.audio_seconds != null ? row.audio_seconds.toFixed(1) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {row.costo_usd != null ? formatUsd(row.costo_usd) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
