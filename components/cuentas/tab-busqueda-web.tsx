"use client";

// Tab "Búsqueda Web" — busca información pública con Perplexity
// y la analiza con Claude. Separado del flujo de investigación
// principal para no mezclar fuentes ni consumir créditos sin querer.

import { useState } from "react";
import { Globe, Zap, RefreshCw, AlertCircle, CheckCircle, ExternalLink, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { EmpresaCompleta, BusquedaWebRaw, AnalisisWeb } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TabBusquedaWebProps {
  empresa: EmpresaCompleta;
}

export function TabBusquedaWeb({ empresa }: TabBusquedaWebProps) {
  const [cargando, setCargando] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [confirmarRegen, setConfirmarRegen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<BusquedaWebRaw | null>(empresa.busqueda_web_raw);
  const [analisis, setAnalisis] = useState<AnalisisWeb | null>(empresa.busqueda_web_analisis);

  async function buscarEnInternet() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/empresas/${empresa.id}/buscar-web`, {
        method: "POST",
      });
      const data = await res.json() as { ok: boolean; raw?: BusquedaWebRaw; analisis?: AnalisisWeb; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Error al buscar");
      setRaw(data.raw ?? null);
      setAnalisis(data.analisis ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCargando(false);
    }
  }

  async function regenerarFicha() {
    setRegenerando(true);
    setConfirmarRegen(false);
    setError(null);
    try {
      const res = await fetch(`/api/empresas/${empresa.id}/regenerar`, {
        method: "POST",
      });
      const data = await res.json() as { ok: boolean; nombre?: string; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Error al regenerar");
      // Recargar la página para mostrar la ficha actualizada
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setRegenerando(false);
    }
  }

  const tieneResultados = !!(raw?.contactosTexto || raw?.inteligenciaTexto);

  return (
    <div className="pb-24 space-y-5">
      {/* ── Botón principal ──────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base">Búsqueda en internet</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Perplexity busca información pública sobre esta empresa y la IA la analiza
            </p>
          </div>
        </div>

        <Button
          className="w-full gap-2 h-12 text-base font-semibold"
          onClick={buscarEnInternet}
          disabled={cargando}
        >
          {cargando ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Buscando en internet...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              {raw ? "Volver a buscar" : "Buscar en internet"}
            </>
          )}
        </Button>

        {raw && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Última búsqueda: {formatearFecha(raw.buscado_en)}
          </div>
        )}
      </div>

      {/* ── Error ────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 flex gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* ── Resultados — dos columnas ─────────────────────────── */}
      {(raw || analisis) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Columna izquierda: texto crudo de Perplexity */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Perplexity encontró
              </h3>
              {tieneResultados ? (
                <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-0 text-xs gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Funcionando
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs gap-1 bg-destructive/15 text-destructive border-0">
                  <AlertCircle className="h-3 w-3" />
                  Sin resultados
                </Badge>
              )}
            </div>

            {raw?.fuentes && raw.fuentes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {raw.fuentes.slice(0, 4).map((f, i) => (
                  <a
                    key={i}
                    href={f}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline underline-offset-2 hover:no-underline truncate max-w-[140px]"
                  >
                    {fuenteCorta(f)}
                  </a>
                ))}
              </div>
            )}

            {raw?.contactosTexto ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contactos</p>
                <div className="max-h-48 overflow-y-auto rounded-xl bg-muted/40 p-3">
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {raw.contactosTexto}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Perplexity no encontró información pública sobre ejecutivos de esta empresa
              </p>
            )}

            {raw?.inteligenciaTexto && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Inteligencia comercial</p>
                <div className="max-h-48 overflow-y-auto rounded-xl bg-muted/40 p-3">
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {raw.inteligenciaTexto}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Columna derecha: análisis de Claude */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Análisis IA
            </h3>

            {!analisis ? (
              <p className="text-sm text-muted-foreground italic">
                La IA aún no analizó los resultados.
              </p>
            ) : (
              <>
                {/* Personas encontradas */}
                {analisis.personas_encontradas.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Personas encontradas
                    </p>
                    {analisis.personas_encontradas.map((p, i) => (
                      <PersonaCard key={i} persona={p} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">
                      No se encontraron personas con nombre y cargo verificado.
                    </p>
                  </div>
                )}

                {/* Inteligencia comercial */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Inteligencia comercial
  				        </p>
                  <InteligenciaCard intel={analisis.inteligencia_comercial} />
                </div>

                {/* Recomendación */}
                {analisis.recomendacion_accion && (
                  <div className="rounded-xl bg-primary/8 border border-primary/20 p-3">
                    <p className="text-xs font-semibold text-primary mb-1">Acción recomendada</p>
                    <p className="text-sm text-foreground">{analisis.recomendacion_accion}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Botón regenerar ficha completa ────────────────────── */}
      {empresa.url && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <RefreshCw className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-base">Regenerar ficha completa</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Reinvestiga desde cero — actualiza el resumen, decisores y ángulo de entrada
              </p>
            </div>
          </div>

          {!confirmarRegen ? (
            <Button
              variant="outline"
              className="w-full gap-2 h-11"
              onClick={() => setConfirmarRegen(true)}
              disabled={regenerando}
            >
              <RefreshCw className={cn("h-4 w-4", regenerando && "animate-spin")} />
              {regenerando ? "Regenerando ficha..." : "↻ Regenerar ficha con nuevos datos"}
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  ¿Regenerar la ficha completa? Esto actualiza el resumen, decisores y ángulo de entrada con el sitio web actual.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmarRegen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={regenerarFicha}
                  disabled={regenerando}
                >
                  <Zap className="h-4 w-4" />
                  Sí, regenerar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes ────────────────────────────────────────────

function PersonaCard({ persona }: { persona: import("@/lib/types").PersonaWebEncontrada }) {
  const confianzaColor = {
    alta: "bg-green-500/15 text-green-700 dark:text-green-400",
    media: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    baja: "bg-muted text-muted-foreground",
  }[persona.confianza];

  return (
    <div className="rounded-xl bg-muted/40 p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
            {persona.nombre.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{persona.nombre}</p>
            <p className="text-xs text-muted-foreground truncate">{persona.cargo}</p>
          </div>
        </div>
        <Badge className={cn("text-xs border-0 shrink-0", confianzaColor)}>
          {persona.confianza}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {persona.linkedin_url && (
          <a
            href={persona.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            LinkedIn
          </a>
        )}
        {persona.email && (
          <span className="text-xs text-muted-foreground">{persona.email}</span>
        )}
        {persona.telefono && (
          <span className="text-xs text-muted-foreground">{persona.telefono}</span>
        )}
      </div>

      {persona.fuente && (
        <p className="text-xs text-muted-foreground/60 truncate">Fuente: {persona.fuente}</p>
      )}
    </div>
  );
}

function InteligenciaCard({ intel }: { intel: import("@/lib/types").InteligenciaComercialWeb }) {
  return (
    <div className="space-y-2">
      {intel.situacion_actual && !intel.situacion_actual.startsWith("Sin información") && (
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Situación actual</p>
          <p className="text-xs text-foreground/80">{intel.situacion_actual}</p>
        </div>
      )}

      {intel.noticias_relevantes.length > 0 && (
        <div className="rounded-xl bg-muted/40 p-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground mb-1">Noticias relevantes</p>
          {intel.noticias_relevantes.map((n, i) => (
            <p key={i} className="text-xs text-foreground/80 flex gap-1.5">
              <span className="text-primary shrink-0">•</span>
              {n}
            </p>
          ))}
        </div>
      )}

      {intel.licitaciones.length > 0 && (
        <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 p-3 space-y-1">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Licitaciones</p>
          {intel.licitaciones.map((l, i) => (
            <p key={i} className="text-xs text-foreground/80">{l}</p>
          ))}
        </div>
      )}

      {intel.oportunidad_detectada && (
        <div className="rounded-xl bg-green-500/8 border border-green-500/20 p-3">
          <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Oportunidad detectada</p>
          <p className="text-xs text-foreground/80">{intel.oportunidad_detectada}</p>
        </div>
      )}
    </div>
  );
}

// ── Utilidades ────────────────────────────────────────────────

function formatearFecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CL", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fuenteCorta(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 30);
  }
}
