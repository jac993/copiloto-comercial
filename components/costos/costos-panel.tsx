"use client";

// =============================================================
// Panel de "Costos y uso" — versión client del monitor de costos.
// Consume GET /api/costos. Se embebe en Configuración (sección
// colapsable). Mantiene todas las funciones del antiguo /costos.
// =============================================================

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, AlertCircle } from "lucide-react";

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

interface CostosData {
  resumen: ResumenApi[];
  totalMes: number;
  totalLlamadas: number;
  ultimas: ApiUsageRow[];
}

const API_LABELS: Record<string, { label: string; color: string }> = {
  claude:     { label: "Claude (Anthropic)", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  perplexity: { label: "Perplexity",         color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  assemblyai: { label: "AssemblyAI",         color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  whisper:    { label: "Whisper (OpenAI)",   color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
};

// Cards de resumen: montos mensuales redondeados a centavos — mismo formato
// y mismo ancho en todas las cards para que los números queden alineados.
function formatUsdResumen(value: number) {
  if (value === 0) return "$0.00";
  if (value < 0.01) return "< $0.01";
  return `$${value.toFixed(2)}`;
}

// Tabla de llamadas: costos unitarios ínfimos, 4 decimales fijos.
function formatUsd(value: number) {
  if (value > 0 && value < 0.0001) return "< $0.0001";
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

export function CostosPanel() {
  const [data, setData] = useState<CostosData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/costos", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: CostosData) => setData(d))
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
        <AlertCircle className="h-4 w-4 shrink-0" />
        No se pudieron cargar los costos. Intenta recargar la página.
      </div>
    );
  }

  const resumenMap = new Map(data.resumen.map((r) => [r.api, r]));
  const rows = data.ultimas;

  return (
    <div className="space-y-4">
      {/* Cards de APIs + Total. Misma estructura y tamaño de número en TODAS
          (antes el total usaba text-3xl + justify-between y los montos quedaban
          a alturas distintas → "casillas descuadradas"). En pantallas < lg el
          total ocupa la fila completa y las 4 APIs quedan en 2x2 parejas. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-1 rounded-2xl bg-[#F97316] text-white p-4 shadow-sm shadow-orange-400/30 min-h-[100px]">
          <p className="text-xs font-medium opacity-80 uppercase tracking-wide">Total del mes</p>
          <p className="text-2xl font-bold tabular-nums mt-2">{formatUsdResumen(data.totalMes)}</p>
          <p className="text-xs opacity-70 mt-1">{data.totalLlamadas > 0 ? `${data.totalLlamadas} llamadas` : "Sin datos aún"}</p>
        </div>

        {["claude", "perplexity", "assemblyai", "whisper"].map((api) => {
          const datos = resumenMap.get(api);
          const meta = API_LABELS[api];
          return (
            <div key={api} className="rounded-2xl bg-white dark:bg-card border border-border p-4 shadow-sm min-h-[100px]">
              <p className="text-xs text-muted-foreground font-medium">{meta.label}</p>
              <p className="text-2xl font-bold text-foreground tabular-nums mt-2">
                {datos ? formatUsdResumen(datos.total_usd) : "$0.00"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {datos ? `${datos.llamadas} llamadas` : "Sin uso este mes"}
              </p>
            </div>
          );
        })}
      </div>

      {/* Link Vercel */}
      <div className="rounded-2xl bg-white dark:bg-card border border-border p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Costos de infraestructura</p>
          <p className="text-xs text-muted-foreground mt-0.5">Uso de Vercel Pro, ancho de banda y funciones serverless</p>
        </div>
        <a
          href="https://vercel.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl bg-[#F97316] text-white text-sm font-medium px-4 py-2.5 hover:bg-orange-700 transition-colors shrink-0"
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
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums hidden md:table-cell">
                        {row.input_tokens?.toLocaleString("es-CL") ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums hidden md:table-cell">
                        {row.output_tokens?.toLocaleString("es-CL") ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums hidden md:table-cell">
                        {row.audio_seconds != null ? row.audio_seconds.toFixed(1) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">
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
