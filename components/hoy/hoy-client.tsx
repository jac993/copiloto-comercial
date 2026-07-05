"use client";

// =============================================================
// Componente cliente principal de la pantalla "Hoy".
// Carga métricas reales al montar y al recuperar foco.
// El botón "Actualizar prioridades" llama a la IA explícitamente
// (regla: nada automático que gaste créditos).
// =============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Sun, Zap, Target, TrendingUp, RefreshCw,
  ChevronRight, ChevronDown, Building2, AlertCircle, CheckCircle2,
  XCircle, MinusCircle, ClipboardCheck, Loader2, Pencil,
} from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Empresa, PrioridadCacheItem, ResultadoMision, TareaPendiente } from "@/lib/types";

// ── Tipos de respuesta de las APIs ──────────────────────────

interface MetricasHoy {
  contactos_hoy: number;
  meta: number;
  racha_actual: number;
  llamadas_hoy: number;
  ganados_mes: number;
  reactivaciones: Empresa[];
  prioridades_cache: PrioridadCacheItem[] | null;
  prioridades_generadas_en: string | null;
  resumen_dia_cache: string | null;
  tareas_pendientes: TareaPendiente[];
}

// Feedback de coaching que devuelve la API tras guardar misiones
interface FeedbackItem {
  empresa_id: string;
  nombre_empresa: string;
  resultado: ResultadoMision;
  feedback_ia: string;
}

// Subconjunto mínimo de empresa que necesita la tarjeta de prioridad
interface EmpresaResumen {
  nombre: string;
  industria?: string | null;
}

interface PrioridadIA {
  empresa_id: string;
  score: number;
  razon: string;
  accion_sugerida: string;
  urgencia: "alta" | "media" | "baja";
  empresa: EmpresaResumen | null;
}

interface RespuestaPriorizar {
  prioridades: PrioridadIA[];
  resumen_dia: string;
}

// El vendedor solo trabaja de lunes a viernes — evita gastar créditos
// en auto-generación de prioridades sábado y domingo.
function esFinDeSemanaCl(): boolean {
  const diaSemanaCl = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Santiago" })
  ).getDay();
  return diaSemanaCl === 0 || diaSemanaCl === 6;
}

// ── Colores de urgencia ──────────────────────────────────────

const URGENCIA_CONFIG = {
  alta: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    borde: "border-l-4 border-l-red-500",
    label: "Urgente",
  },
  media: {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    borde: "border-l-4 border-l-amber-400",
    label: "Esta semana",
  },
  baja: {
    badge: "bg-muted text-muted-foreground",
    borde: "border-l-4 border-l-border",
    label: "Cuando puedas",
  },
};

// ── Componente principal ─────────────────────────────────────

export function HoyClient() {
  const [metricas, setMetricas] = useState<MetricasHoy | null>(null);
  const [cargandoMetricas, setCargandoMetricas] = useState(true);
  const [prioridades, setPrioridades] = useState<PrioridadIA[]>([]);
  const [resumenDia, setResumenDia] = useState<string | null>(null);
  const [cargandoPrioridades, setCargandoPrioridades] = useState(false);
  const [errorPrioridades, setErrorPrioridades] = useState<string | null>(null);
  const [cacheTimestamp, setCacheTimestamp] = useState<string | null>(null);
  const [marcandoId, setMarcandoId] = useState<string | null>(null);
  const [filtroTareas, setFiltroTareas] = useState<"vencidas" | "hoy" | "7d" | "todas">("7d");
  const [dialogReporte, setDialogReporte] = useState(false);
  const [resultados, setResultados] = useState<Record<string, ResultadoMision>>({});
  const [guardandoReporte, setGuardandoReporte] = useState(false);
  const [reporteGuardado, setReporteGuardado] = useState(false);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  // Distingue el skeleton de la primera generación automática del día
  // (mensaje "Preparando tu día...") del recálculo manual (mensajes rotativos).
  const [autoPreparando, setAutoPreparando] = useState(false);
  const prevContactosRef = useRef(0);
  // Evita disparar la generación automática más de una vez por sesión —
  // cargarMetricas se vuelve a llamar en cada focus de ventana.
  const autoTriggeredRef = useRef(false);

  // Identidad estable (deps vacías) para que cargarMetricas no cambie de
  // referencia en cada render y el useEffect de montaje no se re-dispare.
  const actualizarPrioridades = useCallback(async (opts?: { auto?: boolean }) => {
    if (opts?.auto) setAutoPreparando(true);
    setCargandoPrioridades(true);
    setErrorPrioridades(null);
    try {
      const res = await fetch("/api/priorizar", { method: "POST" });
      if (!res.ok) throw new Error("Error al calcular prioridades");
      const data: RespuestaPriorizar = await res.json();
      setPrioridades(data.prioridades);
      setResumenDia(data.resumen_dia);
      setCacheTimestamp(new Date().toISOString());
    } catch {
      setErrorPrioridades("No se pudieron calcular las prioridades. Intenta de nuevo.");
    } finally {
      setCargandoPrioridades(false);
      setAutoPreparando(false);
    }
  }, []);

  const cargarMetricas = useCallback(async () => {
    try {
      const res = await fetch("/api/metricas/hoy");
      if (!res.ok) throw new Error("Error al cargar métricas");
      const data: MetricasHoy = await res.json();

      // Disparar confeti si acaba de llegar a la meta
      if (
        prevContactosRef.current < data.meta &&
        data.contactos_hoy >= data.meta
      ) {
        dispararConfeti();
      }
      prevContactosRef.current = data.contactos_hoy;
      setMetricas(data);

      // ¿Las prioridades cacheadas son de HOY? Mismo campo que ya usa
      // GET /api/metricas/hoy: prioridades_generadas_en. Comparación en
      // huso horario de Chile para no cruzar el día antes de medianoche local.
      const hoyClStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
      const generadasHoy = !!data.prioridades_generadas_en &&
        new Date(data.prioridades_generadas_en).toLocaleDateString("en-CA", { timeZone: "America/Santiago" }) === hoyClStr;

      if (data.prioridades_cache && data.prioridades_cache.length > 0 && generadasHoy) {
        // Hidratar desde caché — no gasta créditos de nuevo
        const fromCache: PrioridadIA[] = data.prioridades_cache.map((item) => ({
          empresa_id: item.empresa_id,
          score: item.score,
          razon: item.razon,
          accion_sugerida: item.accion_sugerida,
          urgencia: item.urgencia,
          empresa: { nombre: item.nombre_empresa, industria: item.industria },
        }));
        setPrioridades(fromCache);
        if (data.resumen_dia_cache) setResumenDia(data.resumen_dia_cache);
        if (data.prioridades_generadas_en) setCacheTimestamp(data.prioridades_generadas_en);
      } else if (!autoTriggeredRef.current) {
        // Sin prioridades de hoy — generar automáticamente, una sola vez por sesión,
        // salvo sábado o domingo: el vendedor no trabaja esos días y no vale la pena
        // gastar créditos sin uso real. El botón "↻ Recalcular" sigue disponible
        // por si igual quiere forzarlo un fin de semana puntual.
        if (!esFinDeSemanaCl()) {
          autoTriggeredRef.current = true;
          void actualizarPrioridades({ auto: true });
        }
      }
    } catch {
      // No interrumpir la pantalla si falla
    } finally {
      setCargandoMetricas(false);
    }
  }, [actualizarPrioridades]);

  // Cargar al montar
  useEffect(() => {
    cargarMetricas();
  }, [cargarMetricas]);

  // Refrescar al recuperar el foco (vuelve del cliente, de una llamada, etc.)
  useEffect(() => {
    const onFocus = () => cargarMetricas();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [cargarMetricas]);

  async function marcarHecha(id: string) {
    setMarcandoId(id);
    try {
      const res = await fetch(`/api/interacciones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resuelta: true }),
      });
      if (res.ok) {
        setMetricas((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tareas_pendientes: prev.tareas_pendientes.filter((t) => t.id !== id),
          };
        });
      }
    } finally {
      setMarcandoId(null);
    }
  }

  const abrirDialogReporte = () => {
    const init: Record<string, ResultadoMision> = {};
    prioridades.forEach((p) => { init[p.empresa_id] = "completada"; });
    setResultados(init);
    setReporteGuardado(false);
    setFeedbacks([]);
    setDialogReporte(true);
  };

  const guardarReporte = async () => {
    setGuardandoReporte(true);
    try {
      const misiones = prioridades.map((p) => ({
        empresa_id: p.empresa_id,
        accion_sugerida: p.accion_sugerida,
        resultado: resultados[p.empresa_id] ?? "no_ejecutada",
      }));
      const res = await fetch("/api/misiones/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ misiones }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      const data = await res.json() as { ok: boolean; feedbacks?: FeedbackItem[] };
      const fbConTexto = (data.feedbacks ?? []).filter((f) => f.feedback_ia);
      setFeedbacks(fbConTexto);
      setReporteGuardado(true);
      // Si no hay feedback de IA, cerrar automáticamente
      if (fbConTexto.length === 0) setTimeout(() => setDialogReporte(false), 1200);
    } catch {
      // No interrumpir UI si falla
    } finally {
      setGuardandoReporte(false);
    }
  };

  // Fecha en zona horaria de Chile — evita que el día cambie antes de medianoche local
  const hoyStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const en7diasDate = new Date(hoyStr + "T12:00:00");
  en7diasDate.setDate(en7diasDate.getDate() + 7);
  const en7dias = en7diasDate.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const todasTareas = metricas?.tareas_pendientes ?? [];
  const tareas = todasTareas.filter((t) => {
    if (filtroTareas === "vencidas") return t.proximo_paso_fecha < hoyStr;
    if (filtroTareas === "hoy")      return t.proximo_paso_fecha === hoyStr;
    if (filtroTareas === "7d")       return t.proximo_paso_fecha <= en7dias;
    return true;
  });
  const countVencidas = todasTareas.filter((t) => t.proximo_paso_fecha < hoyStr).length;
  const countHoy      = todasTareas.filter((t) => t.proximo_paso_fecha === hoyStr).length;

  const contactos = metricas?.contactos_hoy ?? 0;
  const meta = metricas?.meta ?? 5;
  const porcentaje = Math.min(Math.round((contactos / meta) * 100), 100);
  const racha = metricas?.racha_actual ?? 0;

  // "Tu día recién comienza" reemplaza los ceros fríos antes de las 14:00
  // en huso horario de Chile, cuando aún no hay ninguna interacción registrada.
  const horaCl = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hour: "numeric", hour12: false }).format(new Date())
  );
  const diaRecienComienza =
    !cargandoMetricas && contactos === 0 && (metricas?.llamadas_hoy ?? 0) === 0 && horaCl < 14;

  const hoy = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header con gradiente violeta→fucsia — compacto */}
      <header className="gradient-hoy px-4 pt-6 pb-4 md:pt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/70 text-xs font-medium capitalize">{hoy}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <h1 className="text-white text-xl font-extrabold">Buenos días 👋</h1>
              <HelpTooltip
                titulo="¿Para qué sirve esta pantalla?"
                explicacion="Es tu agenda diaria. Muestra las 5 cuentas más importantes para contactar hoy, ordenadas por prioridad. Cada mañana revísala antes de empezar a trabajar."
                ejemplo={"Si ves una cuenta con badge rojo, tiene urgencia alta — contactarla hoy puede marcar la diferencia."}
              />
            </div>
          </div>
          <div className="bg-white/20 rounded-xl p-1">
            <ThemeToggle />
          </div>
        </div>

        {/* Resumen de IA (aparece después de priorizar) */}
        {resumenDia && (
          <div className="mt-2 bg-white/15 rounded-xl px-3 py-2">
            <p className="text-white/90 text-xs leading-relaxed">✨ {resumenDia}</p>
          </div>
        )}

        {/* Barra de progreso del día */}
        <div className="mt-3">
          <div className="flex justify-between text-white/80 text-xs font-medium mb-1.5">
            <div className="flex items-center gap-1">
              <span>
                {cargandoMetricas
                  ? "Cargando..."
                  : `Meta: ${contactos} / ${meta} contactos`}
              </span>
              <HelpTooltip
                titulo="Meta diaria de contactos"
                explicacion="Tu objetivo es hacer 5 contactos comerciales por día. Cada llamada, correo, WhatsApp o LinkedIn que registres en la app cuenta como un contacto."
                ejemplo={"Si registras 5 interacciones hoy, la barra llega al 100% y tu racha sube en 1."}
              />
            </div>
            <span>{porcentaje}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/20">
            <div
              className="h-1.5 rounded-full bg-white transition-all duration-700"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <div className="flex-1 px-4 py-4 space-y-4">

        {/* Racha de días */}
        <Card className="border-0 bg-gradient-to-r from-brand-50 to-orange-50 dark:from-brand-900/20 dark:to-orange-900/10">
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center text-xl">
              🔥
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold">
                  {cargandoMetricas ? "Cargando..." : `Racha: ${racha} ${racha === 1 ? "día" : "días"}`}
                </p>
                <HelpTooltip
                  titulo="¿Qué es la racha?"
                  explicacion="Cuenta los días seguidos que cumples tu meta de 5 contactos. Es como Duolingo — si un día no llegas a 5, la racha vuelve a cero."
                  ejemplo={"Una racha de 20 días significa que contactaste al menos 5 empresas durante 20 días hábiles seguidos."}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {racha === 0
                  ? "Tu racha empieza hoy 🔥"
                  : racha < 5
                  ? "¡Vas bien! Mantén el ritmo"
                  : `¡${racha} días seguidos! Excelente constancia`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Reactivaciones */}
        {(metricas?.reactivaciones ?? []).length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw className="h-4 w-4 text-amber-500" />
              <h2 className="font-semibold text-base">Reactivar hoy</h2>
              <span className="ml-1 text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full">
                {metricas!.reactivaciones.length}
              </span>
            </div>
            <div className="space-y-3">
              {metricas!.reactivaciones.map((empresa) => (
                <ReactivacionCard key={empresa.id} empresa={empresa} />
              ))}
            </div>
          </section>
        )}

        {/* Tareas pendientes */}
        {(metricas?.tareas_pendientes.length ?? 0) > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">📋</span>
              <h2 className="font-semibold text-base">Tareas pendientes</h2>
              <span className="text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">
                {tareas.length}
              </span>
            </div>
            {/* Selector de filtro */}
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {/* Vencidas — rojo si hay, gris si no */}
              <button
                onClick={() => setFiltroTareas("vencidas")}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  filtroTareas === "vencidas"
                    ? countVencidas > 0
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-primary text-white border-primary"
                    : countVencidas > 0
                      ? "bg-red-50 text-red-600 border-red-300 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                Vencidas{countVencidas > 0 ? ` (${countVencidas})` : ""}
              </button>

              {/* Hoy — verde si hay, gris si no */}
              <button
                onClick={() => setFiltroTareas("hoy")}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  filtroTareas === "hoy"
                    ? countHoy > 0
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-primary text-white border-primary"
                    : countHoy > 0
                      ? "bg-green-50 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                Hoy{countHoy > 0 ? ` (${countHoy})` : ""}
              </button>

              {/* 7 días */}
              <button
                onClick={() => setFiltroTareas("7d")}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  filtroTareas === "7d"
                    ? "bg-primary text-white border-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                7 días
              </button>

              {/* Todas */}
              <button
                onClick={() => setFiltroTareas("todas")}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  filtroTareas === "todas"
                    ? "bg-primary text-white border-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                Todas
              </button>
            </div>
            <div className="space-y-2">
              {tareas.map((t) => (
                <TareaCard
                  key={t.id}
                  tarea={t}
                  marcando={marcandoId === t.id}
                  onMarcar={() => marcarHecha(t.id)}
                  onFechaChange={(nuevaFecha) =>
                    setMetricas((prev) =>
                      prev
                        ? {
                            ...prev,
                            tareas_pendientes: prev.tareas_pendientes.map((x) =>
                              x.id === t.id ? { ...x, proximo_paso_fecha: nuevaFecha } : x
                            ),
                          }
                        : prev
                    )
                  }
                />
              ))}
              {tareas.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  ✅ Sin tareas pendientes para este filtro
                </p>
              )}
            </div>
          </section>
        )}

        {/* Prioridades del día */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Prioridades de hoy
              </h2>
              {cacheTimestamp && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Actualizado a las {formatearHora(cacheTimestamp)}
                </p>
              )}
            </div>
            <Badge variant="ai" className="text-xs">
              <Zap className="h-3 w-3 mr-1" /> usa IA
            </Badge>
          </div>

          {cargandoPrioridades ? (
            <SkeletonPrioridades mensaje={autoPreparando ? "Preparando tu día..." : undefined} />
          ) : prioridades.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                  <TrendingUp className="h-8 w-8 text-muted-foreground" />
                </div>
                {esFinDeSemanaCl() ? (
                  <div className="space-y-1.5 max-w-xs">
                    <p className="font-semibold">Es fin de semana 🎉</p>
                    <p className="text-sm text-muted-foreground">
                      Las prioridades se generan de lunes a viernes. Si igual quieres
                      trabajar hoy, recalcula manualmente.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-w-xs">
                    <p className="font-semibold">Sin prioridades aún</p>
                    <p className="text-sm text-muted-foreground">
                      La IA analizará tus cuentas y te dirá con quién hablar hoy
                      y por qué, en orden de oportunidad.
                    </p>
                  </div>
                )}
                {errorPrioridades && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2.5 max-w-xs">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {errorPrioridades}
                  </div>
                )}
                <button
                  onClick={() => void actualizarPrioridades()}
                  className="mt-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  ↻ Recalcular
                </button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {prioridades.map((p, i) => (
                <PrioridadCard key={p.empresa_id} prioridad={p} posicion={i + 1} />
              ))}
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => void actualizarPrioridades()}
                  disabled={cargandoPrioridades}
                >
                  <Zap className="h-3.5 w-3.5" />
                  Recalcular
                </Button>
                <Button
                  size="sm"
                  className="flex-1 gap-1.5 bg-[#22C55E] hover:bg-[#16a34a] text-white"
                  onClick={abrirDialogReporte}
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Reportar mi día
                </Button>
              </div>
              {errorPrioridades && (
                <p className="text-xs text-destructive text-center">{errorPrioridades}</p>
              )}
            </div>
          )}
        </section>

        {/* Resumen rápido */}
        <section>
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Sun className="h-4 w-4 text-[#F59E0B]" />
            Resumen del día
          </h2>
          {diaRecienComienza ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  Tu día recién comienza
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Contactos"
                value={cargandoMetricas ? "—" : String(contactos)}
                color="text-primary"
              />
              <StatCard
                label="Llamadas"
                value={cargandoMetricas ? "—" : String(metricas?.llamadas_hoy ?? 0)}
                color="text-[#22C55E]"
              />
              <StatCard
                label="Ganados"
                value={cargandoMetricas ? "—" : String(metricas?.ganados_mes ?? 0)}
                color="text-[#F59E0B]"
              />
            </div>
          )}
        </section>
      </div>

      {/* Dialog: Reportar mi día */}
      <Dialog open={dialogReporte} onOpenChange={setDialogReporte}>
        <DialogContent className="max-w-sm mx-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {reporteGuardado && feedbacks.length > 0 ? (
                <>🎯 Tu coaching de hoy</>
              ) : (
                <>
                  <ClipboardCheck className="h-5 w-5 text-[#22C55E]" />
                  ¿Cómo resultó el día?
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {reporteGuardado && feedbacks.length > 0 ? (
            // Paso 2: mostrar coaching de la IA
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              <p className="text-xs text-muted-foreground text-center pb-1">
                Basado en lo que reportaste hoy
              </p>
              {feedbacks.map((fb) => (
                <CoachingCard key={fb.empresa_id} feedback={fb} />
              ))}
            </div>
          ) : reporteGuardado ? (
            // Paso 2 fallback: éxito simple sin IA
            <div className="py-8 flex flex-col items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-[#22C55E]/15 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-[#22C55E]" />
              </div>
              <p className="font-semibold text-sm">¡Reporte guardado!</p>
              <p className="text-xs text-muted-foreground">Tus resultados quedan en el historial.</p>
            </div>
          ) : (
            <div className="space-y-4 py-1 max-h-[60vh] overflow-y-auto pr-1">
              {prioridades.map((p) => (
                <div key={p.empresa_id} className="space-y-2">
                  <div>
                    <p className="font-semibold text-sm">{p.empresa?.nombre ?? "Empresa"}</p>
                    <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                      {p.accion_sugerida}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <ResultadoBtn
                      activo={resultados[p.empresa_id] === "completada"}
                      onClick={() => setResultados((prev) => ({ ...prev, [p.empresa_id]: "completada" }))}
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      label="Hecha"
                      colorActivo="bg-[#22C55E]/15 border-[#22C55E] text-[#16a34a] dark:text-[#22C55E]"
                    />
                    <ResultadoBtn
                      activo={resultados[p.empresa_id] === "parcial"}
                      onClick={() => setResultados((prev) => ({ ...prev, [p.empresa_id]: "parcial" }))}
                      icon={<MinusCircle className="h-4 w-4" />}
                      label="Parcial"
                      colorActivo="bg-amber-50 border-amber-400 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                    />
                    <ResultadoBtn
                      activo={resultados[p.empresa_id] === "no_ejecutada"}
                      onClick={() => setResultados((prev) => ({ ...prev, [p.empresa_id]: "no_ejecutada" }))}
                      icon={<XCircle className="h-4 w-4" />}
                      label="No hecha"
                      colorActivo="bg-red-50 border-red-400 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            {reporteGuardado && feedbacks.length > 0 ? (
              <Button className="w-full" onClick={() => setDialogReporte(false)}>
                Entendido 👍
              </Button>
            ) : !reporteGuardado ? (
              <Button
                className="w-full gap-2"
                onClick={guardarReporte}
                disabled={guardandoReporte}
              >
                {guardandoReporte ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {guardandoReporte ? "Analizando tu día... ⚡" : "Guardar resultados"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Tarjeta de prioridad ─────────────────────────────────────

function PrioridadCard({
  prioridad,
  posicion,
}: {
  prioridad: PrioridadIA;
  posicion: number;
}) {
  const conf = URGENCIA_CONFIG[prioridad.urgencia];
  const empresa = prioridad.empresa;

  return (
    <Card className={`overflow-hidden ${conf.borde}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            {/* Número de posición */}
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-primary">{posicion}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm leading-tight">
                  {empresa?.nombre ?? "Empresa"}
                </p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${conf.badge}`}>
                  {conf.label}
                </span>
              </div>
              {empresa?.industria && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {empresa.industria}
                </p>
              )}
            </div>
          </div>
          {/* Score */}
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold text-primary">{prioridad.score}</p>
            <div className="flex items-center justify-end -mt-0.5">
              <p className="text-xs text-muted-foreground">score</p>
              <HelpTooltip
                titulo="Score de prioridad"
                explicacion="Qué tan urgente es hablar con esta empresa hoy, del 0 al 100, según señales de la IA."
                ejemplo=""
              />
            </div>
          </div>
        </div>

        {/* Razón de prioridad */}
        <div className="bg-muted/50 rounded-xl px-3 py-2.5 mb-2.5">
          <p className="text-xs leading-relaxed text-foreground/80">{prioridad.razon}</p>
        </div>

        {/* Acción sugerida */}
        <div className="flex items-start gap-1.5 mb-3">
          <span className="text-primary font-bold text-xs shrink-0 mt-0.5">→</span>
          <p className="text-xs text-foreground font-medium leading-relaxed">
            {prioridad.accion_sugerida}
          </p>
        </div>

        {/* Botón ver ficha */}
        <Link
          href={`/cuentas/${prioridad.empresa_id}`}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-border
            text-xs font-medium hover:border-primary/40 hover:bg-primary/5 transition-all"
        >
          <Building2 className="h-3.5 w-3.5" />
          Ver ficha completa
          <ChevronRight className="h-3.5 w-3.5 ml-auto" />
        </Link>
      </CardContent>
    </Card>
  );
}

// ── Card de reactivación ─────────────────────────────────────

function ReactivacionCard({ empresa }: { empresa: Empresa }) {
  return (
    <Card className="border-amber-200 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-900/5">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-2 py-0.5 rounded-full">
                🔄 Reactivar
              </span>
            </div>
            <p className="font-semibold text-sm mt-1.5">{empresa.nombre}</p>
            {empresa.industria && (
              <p className="text-xs text-muted-foreground">{empresa.industria}</p>
            )}
          </div>
        </div>

        {empresa.razon_perdido && (
          <div className="mt-2 p-2.5 rounded-lg bg-background border border-amber-200 dark:border-amber-800/30">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Se perdió por:</span>{" "}
              {empresa.razon_perdido}
            </p>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="sm" className="flex-1 text-xs" asChild>
            <Link href={`/cuentas/${empresa.id}`}>Ver historial</Link>
          </Button>
          <Button size="sm" className="flex-1 text-xs gap-1" asChild>
            <Link href={`/cuentas/${empresa.id}`}>
              <Zap className="h-3 w-3" />
              Nuevo contacto
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Skeleton de prioridades (mientras carga) ─────────────────

function SkeletonPrioridades({ mensaje }: { mensaje?: string } = {}) {
  const MENSAJES = [
    "Analizando el pipeline...",
    "Leyendo señales de oportunidad...",
    "Calculando urgencias...",
  ];

  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="overflow-hidden border-l-4 border-l-muted">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2.5 mb-3">
              <div className="h-8 w-8 rounded-xl bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
              </div>
            </div>
            <div className="h-10 bg-muted rounded-xl animate-pulse mb-2.5" />
            <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground text-center animate-pulse pt-1">
        {mensaje ?? MENSAJES[Math.floor(Date.now() / 3000) % MENSAJES.length]}
      </p>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 text-center">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

// ── Card de coaching post-misión ─────────────────────────────

const RESULTADO_LABEL: Record<ResultadoMision, string> = {
  completada: "✅ Completada",
  parcial: "🔄 Parcial",
  no_ejecutada: "❌ No ejecutada",
};

function CoachingCard({ feedback }: { feedback: FeedbackItem }) {
  return (
    <div
      className="rounded-2xl p-4 space-y-2.5"
      style={{ background: "#FFF7ED", border: "1px solid rgba(124,58,237,0.15)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-sm text-[#F97316]">{feedback.nombre_empresa}</p>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {RESULTADO_LABEL[feedback.resultado]}
        </span>
      </div>
      <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">
        {feedback.feedback_ia}
      </p>
    </div>
  );
}

// ── Botón de resultado para el dialog de reporte ────────────

function ResultadoBtn({
  activo,
  onClick,
  icon,
  label,
  colorActivo,
}: {
  activo: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  colorActivo: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-medium transition-all active:scale-[0.97]
        ${activo ? colorActivo : "border-border text-muted-foreground hover:border-primary/30 hover:bg-primary/5"}`}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Tarjeta de tarea pendiente ───────────────────────────────

function formatearVencimiento(fechaIso: string): { texto: string; color: string } {
  const hoyStr = new Date().toISOString().split("T")[0];
  const mananaStr = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const soloFecha = fechaIso.split("T")[0];
  const tieneHora = fechaIso.includes("T");
  const horaStr = tieneHora
    ? new Date(fechaIso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })
    : null;
  const sufijo = horaStr ? ` ${horaStr}` : "";

  const vencida = soloFecha < hoyStr;
  const esHoy = soloFecha === hoyStr;
  const esManana = soloFecha === mananaStr;
  const label = new Date(soloFecha + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" });

  if (vencida)  return { texto: `Venció ${label}${sufijo}`,  color: "text-red-600 dark:text-red-400" };
  if (esHoy)    return { texto: `Vence hoy ${label}${sufijo}`, color: "text-orange-500 dark:text-orange-400" };
  if (esManana) return { texto: `Vence mañana ${label}${sufijo}`, color: "text-muted-foreground" };
  return         { texto: `Vence ${label}${sufijo}`,          color: "text-muted-foreground" };
}

// Infiere hora sugerida a partir del texto de la tarea (sin IA, sin tildes)
function inferirHoraSugerida(texto: string): string {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/whatsapp|mensaje|escribir/.test(t))          return "09:00";
  if (/llamar|llamada|telefono/.test(t))            return "10:30";
  if (/correo|email|propuesta/.test(t))             return "12:00";
  if (/reunion|visita|presencial/.test(t))          return "14:00";
  if (/seguimiento|revisar|confirmar/.test(t))      return "16:00";
  return "09:00";
}

// Convierte ISO o YYYY-MM-DD al formato que acepta <input type="datetime-local">
function toDatetimeLocal(fechaIso: string): string {
  const soloFecha = fechaIso.split("T")[0];
  if (!fechaIso.includes("T")) return `${soloFecha}T00:00`;
  const d = new Date(fechaIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${soloFecha}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TareaCard({
  tarea,
  marcando,
  onMarcar,
  onFechaChange,
}: {
  tarea: TareaPendiente;
  marcando: boolean;
  onMarcar: () => void;
  onFechaChange: (nuevaFecha: string) => void;
}) {
  const hoy = new Date().toISOString().split("T")[0];
  const vencida = tarea.proximo_paso_fecha < hoy;
  const esHoy = tarea.proximo_paso_fecha.startsWith(hoy);
  const { texto: textoVencimiento, color: colorVencimiento } = formatearVencimiento(tarea.proximo_paso_fecha);
  const horaSugerida = inferirHoraSugerida(tarea.proximo_paso);

  const [expandida, setExpandida] = useState(false);
  const [editando, setEditando] = useState(false);
  const [inputVal, setInputVal] = useState(toDatetimeLocal(tarea.proximo_paso_fecha));
  const [guardando, setGuardando] = useState(false);

  // Fecha corta para vista colapsada: "1 jul", "31 dic"
  const fechaCorta = (() => {
    const [, mes, dia] = tarea.proximo_paso_fecha.split("-");
    const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    return `${parseInt(dia)} ${meses[parseInt(mes) - 1]}`;
  })();

  const confirmarFecha = async () => {
    if (!inputVal) return;
    setGuardando(true);
    try {
      const iso = new Date(inputVal).toISOString();
      const res = await fetch(`/api/interacciones/${tarea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proximo_paso_fecha: iso, resuelta: false }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      onFechaChange(iso);
      setEditando(false);
    } catch {
      // mantener modo edición para que el usuario reintente
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={`rounded-2xl border bg-card transition-colors ${vencida ? "border-red-200 dark:border-red-900/40" : "border-border"}`}>

      {/* ── Fila colapsada (siempre visible) ── */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Chevron toggle */}
        <button
          onClick={() => setExpandida((v) => !v)}
          className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          aria-label={expandida ? "Colapsar" : "Expandir"}
        >
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandida ? "rotate-180" : ""}`} />
        </button>

        {/* Nombre empresa — clickable para expandir */}
        <button
          onClick={() => setExpandida((v) => !v)}
          className="flex-1 min-w-0 text-left"
        >
          <span className="text-sm font-semibold truncate block leading-tight">
            {tarea.empresa_nombre}
          </span>
        </button>

        {/* Fecha corta + hora */}
        <div className="shrink-0 flex items-center gap-1.5 text-xs">
          {vencida ? (
            <span className="font-semibold text-red-600 dark:text-red-400">{fechaCorta}</span>
          ) : esHoy ? (
            <span className="font-semibold text-amber-600 dark:text-amber-400">{fechaCorta}</span>
          ) : (
            <span className="text-muted-foreground">{fechaCorta}</span>
          )}
          <span className="text-muted-foreground/50">·</span>
          <span className="text-muted-foreground/70">{horaSugerida}</span>
        </div>

        {/* Botón Hecho — siempre visible */}
        <button
          onClick={onMarcar}
          disabled={marcando}
          className="shrink-0 h-7 px-2.5 rounded-xl border border-green-300 bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors disabled:opacity-50 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400 flex items-center gap-1 ml-1"
        >
          {marcando ? <Loader2 className="h-3 w-3 animate-spin" /> : "✓ Hecho"}
        </button>
      </div>

      {/* ── Detalle expandido ── */}
      <div className={`overflow-hidden transition-all duration-200 ${expandida ? "max-h-64" : "max-h-0"}`}>
        <div className="px-4 pb-3 pt-0 border-t border-border/50 space-y-2">

          {/* Contacto */}
          {tarea.contacto_nombre && (
            <p className="text-xs text-muted-foreground pt-2">👤 {tarea.contacto_nombre}</p>
          )}

          {/* Descripción de la tarea */}
          <p className="text-xs text-muted-foreground leading-snug">{tarea.proximo_paso}</p>

          {/* Fecha + edición inline */}
          {editando ? (
            <div className="flex items-center gap-1.5">
              <input
                type="datetime-local"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void confirmarFecha(); if (e.key === "Escape") setEditando(false); }}
                className="text-xs border border-border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <button
                onClick={() => void confirmarFecha()}
                disabled={guardando}
                className="text-xs px-2 py-1 rounded-lg bg-primary text-white font-medium disabled:opacity-50"
              >
                {guardando ? <Loader2 className="h-3 w-3 animate-spin" /> : "✓"}
              </button>
              <button
                onClick={() => setEditando(false)}
                className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <p className={`text-xs font-medium ${colorVencimiento}`}>{textoVencimiento}</p>
                <button
                  onClick={() => { setInputVal(toDatetimeLocal(tarea.proximo_paso_fecha)); setEditando(true); }}
                  className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  title="Editar fecha"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
              <Link
                href={`/cuentas/${tarea.empresa_id}`}
                className="text-xs text-primary hover:underline"
              >
                Ver empresa →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Formateador de hora para el timestamp del caché ─────────

function formatearHora(isoStr: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoStr));
}

// ── Confeti al cumplir la meta ───────────────────────────────

async function dispararConfeti() {
  try {
    const confetti = (await import("canvas-confetti")).default;
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#F97316", "#22C55E", "#F59E0B", "#F97316"],
    });
  } catch {
    // canvas-confetti no disponible — no interrumpir
  }
}
