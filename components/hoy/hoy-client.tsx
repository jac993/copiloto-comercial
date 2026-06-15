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
  ChevronRight, Building2, AlertCircle, CheckCircle2,
  XCircle, MinusCircle, ClipboardCheck, Loader2,
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
import type { Empresa, PrioridadCacheItem, ResultadoMision } from "@/lib/types";

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
  const [dialogReporte, setDialogReporte] = useState(false);
  const [resultados, setResultados] = useState<Record<string, ResultadoMision>>({});
  const [guardandoReporte, setGuardandoReporte] = useState(false);
  const [reporteGuardado, setReporteGuardado] = useState(false);
  const prevContactosRef = useRef(0);

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

      // Hidratar prioridades desde el caché del día (evita llamar a la IA al abrir)
      if (data.prioridades_cache && data.prioridades_cache.length > 0) {
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
      }
    } catch {
      // No interrumpir la pantalla si falla
    } finally {
      setCargandoMetricas(false);
    }
  }, []);

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

  const actualizarPrioridades = async () => {
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
    }
  };

  const abrirDialogReporte = () => {
    // Pre-seleccionar "completada" para todas como punto de partida
    const init: Record<string, ResultadoMision> = {};
    prioridades.forEach((p) => { init[p.empresa_id] = "completada"; });
    setResultados(init);
    setReporteGuardado(false);
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
      setReporteGuardado(true);
      setTimeout(() => setDialogReporte(false), 1200);
    } catch {
      // El error se maneja con el estado guardandoReporte falso
    } finally {
      setGuardandoReporte(false);
    }
  };

  const contactos = metricas?.contactos_hoy ?? 0;
  const meta = metricas?.meta ?? 5;
  const porcentaje = Math.min(Math.round((contactos / meta) * 100), 100);
  const racha = metricas?.racha_actual ?? 0;

  const hoy = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header con gradiente violeta→fucsia */}
      <header className="gradient-hoy px-5 pt-10 pb-8 md:pt-8">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/80 text-sm font-medium capitalize">{hoy}</p>
            <div className="flex items-center gap-2 mt-1">
              <h1 className="text-white text-2xl font-semibold">Buenos días 👋</h1>
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
          <div className="mt-4 bg-white/15 rounded-xl px-4 py-2.5">
            <p className="text-white/90 text-sm leading-relaxed">✨ {resumenDia}</p>
          </div>
        )}

        {/* Barra de progreso del día */}
        <div className="mt-5">
          <div className="flex justify-between text-white/80 text-xs font-medium mb-2">
            <div className="flex items-center gap-1.5">
              <span>
                {cargandoMetricas
                  ? "Cargando..."
                  : `Meta diaria: ${contactos} / ${meta} contactos`}
              </span>
              <HelpTooltip
                titulo="Meta diaria de contactos"
                explicacion="Tu objetivo es hacer 5 contactos comerciales por día. Cada llamada, correo, WhatsApp o LinkedIn que registres en la app cuenta como un contacto."
                ejemplo={"Si registras 5 interacciones hoy, la barra llega al 100% y tu racha sube en 1."}
              />
            </div>
            <span>{porcentaje}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/20">
            <div
              className="h-2 rounded-full bg-white transition-all duration-700"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <div className="flex-1 px-4 py-6 space-y-6">

        {/* Racha de días */}
        <Card className="border-0 bg-gradient-to-r from-brand-50 to-purple-50 dark:from-brand-900/20 dark:to-purple-900/10">
          <CardContent className="pt-5 pb-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center text-2xl">
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
                  ? "Completa tu meta hoy para empezar tu racha"
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

          {prioridades.length === 0 && !cargandoPrioridades ? (
            <Card className="border-dashed">
              <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                  <TrendingUp className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-1.5 max-w-xs">
                  <p className="font-semibold">Sin prioridades aún</p>
                  <p className="text-sm text-muted-foreground">
                    La IA analizará tus cuentas y te dirá con quién hablar hoy
                    y por qué, en orden de oportunidad.
                  </p>
                </div>
                {errorPrioridades && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2.5 max-w-xs">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {errorPrioridades}
                  </div>
                )}
                <Button
                  size="lg"
                  className="mt-2 w-full max-w-xs gap-2"
                  onClick={actualizarPrioridades}
                  disabled={cargandoPrioridades}
                >
                  <Zap className="h-4 w-4" />
                  Actualizar prioridades
                </Button>
              </CardContent>
            </Card>
          ) : cargandoPrioridades ? (
            <SkeletonPrioridades />
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
                  onClick={actualizarPrioridades}
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
        </section>
      </div>

      {/* Dialog: Reportar mi día */}
      <Dialog open={dialogReporte} onOpenChange={setDialogReporte}>
        <DialogContent className="max-w-sm mx-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-[#22C55E]" />
              ¿Cómo resultó el día?
            </DialogTitle>
          </DialogHeader>

          {reporteGuardado ? (
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

          {!reporteGuardado && (
            <DialogFooter>
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
                {guardandoReporte ? "Guardando..." : "Guardar resultados"}
              </Button>
            </DialogFooter>
          )}
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
            <p className="text-xs text-muted-foreground -mt-0.5">score</p>
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

function SkeletonPrioridades() {
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
        {MENSAJES[Math.floor(Date.now() / 3000) % MENSAJES.length]}
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
      colors: ["#7C3AED", "#22C55E", "#F59E0B", "#F97316"],
    });
  } catch {
    // canvas-confetti no disponible — no interrumpir
  }
}
