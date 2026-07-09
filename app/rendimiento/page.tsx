"use client";

// =============================================================
// Pantalla Rendimiento — muestra el historial de evaluaciones
// semanales y métricas acumuladas del vendedor.
// El botón "Evaluar semana" llama a la IA explícitamente.
// =============================================================

import { useState, useEffect, useCallback } from "react";
import {
  BarChart2, Zap, TrendingUp, Award, Target,
  ChevronDown, ChevronUp, AlertCircle, Loader2,
  CheckCircle2, MinusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import type { EvaluacionSemanal, RendimientoEjecutivo } from "@/lib/types";

// ── Tipos de respuesta ───────────────────────────────────────

interface CumplimientoTareas {
  total: number;
  resueltas: number;
  porcentaje: number | null;
}

interface RespuestaRendimiento {
  rendimiento: RendimientoEjecutivo | null;
  evaluaciones: EvaluacionSemanal[];
  cumplimiento_tareas: CumplimientoTareas;
}

interface RespuestaEvaluar {
  evaluacion?: EvaluacionSemanal;
  error?: string;
}

interface Recomendacion {
  accion: string;
  razon: string;
}

// ── Helpers ──────────────────────────────────────────────────

function formatSemana(inicio: string, fin: string): string {
  const fmt = (d: string) =>
    new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short" }).format(
      new Date(`${d}T12:00:00`)
    );
  return `${fmt(inicio)} – ${fmt(fin)}`;
}

function colorTasa(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-[#22C55E]";
  if (pct >= 50) return "text-[#F59E0B]";
  return "text-destructive";
}

// ── Componente principal ─────────────────────────────────────

export default function RendimientoPage() {
  const [data, setData] = useState<RespuestaRendimiento | null>(null);
  const [cargando, setCargando] = useState(true);
  const [evaluando, setEvaluando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    try {
      const res = await fetch("/api/rendimiento");
      if (!res.ok) throw new Error("Error al cargar rendimiento");
      const json = await res.json() as RespuestaRendimiento;
      setData(json);
    } catch {
      setError("No se pudo cargar el historial. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const evaluarSemana = async () => {
    setEvaluando(true);
    setError(null);
    try {
      const res = await fetch("/api/rendimiento/evaluar", { method: "POST" });
      const json = await res.json() as RespuestaEvaluar;
      if (!res.ok) throw new Error(json.error ?? "Error al evaluar");
      // Recargar datos para incluir la nueva evaluación
      await cargarDatos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al evaluar la semana.");
    } finally {
      setEvaluando(false);
    }
  };

  const r = data?.rendimiento;
  const evaluaciones = data?.evaluaciones ?? [];
  const ct = data?.cumplimiento_tareas;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#F97316] to-[#EA580C] px-5 pt-10 pb-7 md:pt-8">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/70 text-sm font-medium">Tu progreso</p>
            <div className="flex items-center gap-2 mt-1">
              <h1 className="text-white text-2xl md:text-3xl font-extrabold">Rendimiento</h1>
              <HelpTooltip
                titulo="¿Para qué sirve esta pantalla?"
                explicacion="Muestra tu historial de evaluaciones semanales generadas por IA. Cada semana la IA analiza tus misiones, contactos y resultados para darte coaching específico."
                ejemplo={"Usa el botón 'Evaluar semana' al terminar tu semana laboral para recibir el análisis."}
              />
            </div>
          </div>
          <Button
            onClick={evaluarSemana}
            disabled={evaluando}
            className="bg-white/20 hover:bg-white/30 text-white border-0 gap-2 shrink-0"
            size="sm"
          >
            {evaluando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {evaluando ? "Analizando..." : "Evaluar semana"}
          </Button>
        </div>
      </header>

      {/* Contenido */}
      <div className="flex-1 px-4 py-6 space-y-6">

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Cumplimiento de tareas — calculado directo desde interacciones, siempre disponible */}
        {cargando ? (
          <SkeletonMetricas />
        ) : ct ? (
          <section>
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Cumplimiento de tareas
              <span className="text-xs font-normal text-muted-foreground">(últimos 30 días)</span>
            </h2>
            {ct.total === 0 ? (
              <Card className="border-dashed">
                <CardContent className="pt-5 pb-5 text-center">
                  <p className="text-sm text-muted-foreground">
                    Aún no tienes tareas registradas. Cuando registres interacciones con próximo paso,
                    aquí verás cuántas completaste.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <p className={`text-3xl font-bold ${colorTasa(ct.porcentaje)}`}>
                        {ct.porcentaje !== null ? `${ct.porcentaje}%` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ct.resueltas} de {ct.total} tareas completadas
                      </p>
                    </div>
                    <CheckCircle2 className={`h-8 w-8 ${colorTasa(ct.porcentaje)}`} />
                  </div>
                  {/* Barra de progreso */}
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${ct.porcentaje ?? 0}%`,
                        backgroundColor:
                          (ct.porcentaje ?? 0) >= 80 ? "#22C55E"
                          : (ct.porcentaje ?? 0) >= 50 ? "#F59E0B"
                          : "#DC2626",
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        ) : null}

        {/* Métricas ejecutivas globales — se alimentan de evaluaciones_semanales */}
        {cargando ? null : evaluaciones.length === 0 ? (
          <section>
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              Métricas acumuladas
            </h2>
            <Card className="border-dashed">
              <CardContent className="pt-5 pb-5 flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  Las métricas acumuladas se calculan al evaluar la semana con IA.
                  Presiona &quot;Evaluar semana&quot; al terminar tu semana laboral para ver tu score,
                  racha récord y tasa de conversión histórica.
                </p>
              </CardContent>
            </Card>
          </section>
        ) : (
          <section>
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              Métricas acumuladas
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <MetricaCard
                label="Cumplimiento de meta"
                valor={r ? `${r.tasa_cumplimiento_historica}%` : "—"}
                color={colorTasa(r?.tasa_cumplimiento_historica ?? null)}
                hint="Días que cumpliste la meta de 5 contactos diarios"
              />
              <MetricaCard
                label="Tasa de conversión"
                valor={r ? `${r.tasa_conversion_historica}%` : "—"}
                color={colorTasa(r?.tasa_conversion_historica ?? null)}
                hint="Negocios ganados sobre contactos totales"
              />
              <MetricaCard
                label="Racha récord"
                valor={r ? `${r.racha_record} días` : "—"}
                color="text-[#F59E0B]"
                hint="Máxima racha de días cumpliendo la meta diaria"
              />
              <MetricaCard
                label="Score actual"
                valor={r ? String(r.score_actual) : "—"}
                color="text-primary"
                hint="Puntuación general calculada por la IA"
              />
            </div>
          </section>
        )}

        {/* Historial de evaluaciones semanales */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Evaluaciones semanales
            </h2>
            <Badge variant="ai" className="text-xs">
              <Zap className="h-3 w-3 mr-1" /> usa IA
            </Badge>
          </div>

          {cargando ? (
            <SkeletonEvaluaciones />
          ) : evaluaciones.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                  <BarChart2 className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-1.5 max-w-xs">
                  <p className="font-semibold">Sin evaluaciones aún</p>
                  <p className="text-sm text-muted-foreground">
                    Al terminar la semana, aprieta &quot;Evaluar semana&quot; para recibir
                    coaching personalizado basado en tus resultados reales.
                  </p>
                </div>
                <Button
                  size="lg"
                  className="w-full max-w-xs gap-2"
                  onClick={evaluarSemana}
                  disabled={evaluando}
                >
                  {evaluando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  {evaluando ? "Analizando..." : "Evaluar esta semana"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {evaluaciones.map((ev) => (
                <EvaluacionCard
                  key={ev.id}
                  evaluacion={ev}
                  abierta={expandido === ev.id}
                  onToggle={() => setExpandido(expandido === ev.id ? null : ev.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Tarjeta de evaluación semanal ────────────────────────────

function EvaluacionCard({
  evaluacion: ev,
  abierta,
  onToggle,
}: {
  evaluacion: EvaluacionSemanal;
  abierta: boolean;
  onToggle: () => void;
}) {
  const recomendaciones = (ev.recomendaciones ?? []) as unknown as Recomendacion[];

  return (
    <Card className={abierta ? "border-primary/30" : ""}>
      <CardHeader className="pt-4 pb-3 cursor-pointer select-none" onClick={onToggle}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">
              {formatSemana(ev.semana_inicio, ev.semana_fin)}
            </p>
            {ev.resumen_ia && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {ev.resumen_ia}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {ev.tasa_cumplimiento !== null && (
              <div className="text-right">
                <p className={`text-lg font-bold ${colorTasa(ev.tasa_cumplimiento)}`}>
                  {ev.tasa_cumplimiento}%
                </p>
                <p className="text-[10px] text-muted-foreground -mt-0.5">meta</p>
              </div>
            )}
            {abierta ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {abierta && (
        <CardContent className="pt-0 pb-4 space-y-4">
          {/* Tasas */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${colorTasa(ev.tasa_cumplimiento)}`}>
                {ev.tasa_cumplimiento ?? "—"}%
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Cumplimiento</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${colorTasa(ev.tasa_conversion)}`}>
                {ev.tasa_conversion ?? "—"}%
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Conversión</p>
            </div>
          </div>

          {/* Fortalezas */}
          {ev.fortalezas && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E] shrink-0" />
                <p className="text-xs font-semibold text-[#16a34a] dark:text-[#22C55E]">
                  Fortalezas
                </p>
              </div>
              <p className="text-xs leading-relaxed text-foreground/80 bg-[#22C55E]/8 dark:bg-[#22C55E]/10 rounded-xl px-3 py-2.5">
                {ev.fortalezas}
              </p>
            </div>
          )}

          {/* Áreas de mejora */}
          {ev.areas_mejora && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <MinusCircle className="h-3.5 w-3.5 text-[#F59E0B] shrink-0" />
                <p className="text-xs font-semibold text-amber-700 dark:text-[#F59E0B]">
                  Áreas de mejora
                </p>
              </div>
              <p className="text-xs leading-relaxed text-foreground/80 bg-amber-50 dark:bg-amber-900/10 rounded-xl px-3 py-2.5">
                {ev.areas_mejora}
              </p>
            </div>
          )}

          {/* Recomendaciones */}
          {recomendaciones.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />
                <p className="text-xs font-semibold text-primary">
                  Próxima semana
                </p>
              </div>
              {recomendaciones.map((rec, i) => (
                <div key={i} className="bg-muted/50 rounded-xl px-3 py-2.5 space-y-0.5">
                  <p className="text-xs font-medium">
                    <span className="text-primary mr-1">{i + 1}.</span>
                    {rec.accion}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {rec.razon}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Métrica card ─────────────────────────────────────────────

function MetricaCard({
  label,
  valor,
  color,
  hint,
}: {
  label: string;
  valor: string;
  color: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className={`text-2xl font-bold ${color}`}>{valor}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <p className="text-xs text-muted-foreground leading-tight">{label}</p>
          <HelpTooltip titulo={label} explicacion={hint} ejemplo="" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Skeletons ────────────────────────────────────────────────

function SkeletonMetricas() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="pt-4 pb-4 space-y-2">
            <div className="h-7 w-16 bg-muted rounded animate-pulse" />
            <div className="h-3 w-24 bg-muted rounded animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SkeletonEvaluaciones() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <Card key={i}>
          <CardContent className="pt-4 pb-4 space-y-2">
            <div className="h-4 w-36 bg-muted rounded animate-pulse" />
            <div className="h-3 w-48 bg-muted rounded animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
