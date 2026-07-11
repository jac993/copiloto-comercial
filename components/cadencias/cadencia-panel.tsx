"use client";

// =============================================================
// Panel de cadencia de una empresa. Dos estados:
// • Con cadencia activa → línea de progreso "Paso X de Y ·
//   Próximo: [canal], [fecha]" + botón Detener.
// • Sin cadencia → botón "Iniciar cadencia" que abre el selector
//   con la sugerida pre-marcada según etapa y PREVIEW de la
//   secuencia adaptada a los canales del decisor (adaptarCadencia,
//   pura — cero IA, cero costo).
// =============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  adaptarCadencia,
  canalesDisponibles,
  CANAL_PASO_LABEL,
  CANAL_PASO_EMOJI,
} from "@/lib/cadencias";
import type { CadenciaPlantilla, CadenciaPaso, Contacto, EstadoEmpresa } from "@/lib/types";

interface CadenciaConPasos extends CadenciaPlantilla {
  pasos: CadenciaPaso[];
}

interface AsignacionEstado {
  id: string;
  cadencia_nombre: string;
  contacto_nombre: string | null;
  paso_actual: number;
  total_pasos: number;
  proximo_canal: string | null;
  proxima_fecha: string | null;
}

function fechaCorta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${parseInt(dia)} ${meses[parseInt(mes) - 1]}`;
}

// Fecha calendario chilena de hoy (cliente)
function hoyClCliente(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

export function CadenciaPanel({
  empresaId,
  estado,
  contactos: contactosProp,
}: {
  empresaId: string;
  estado: EstadoEmpresa;
  // Si no se entrega (ej: dialog de Investigar recién creada la empresa),
  // el panel los carga solo desde /api/contactos.
  contactos?: Contacto[];
}) {
  const [contactosFetched, setContactosFetched] = useState<Contacto[] | null>(null);
  const contactos = contactosProp ?? contactosFetched ?? [];
  const [asignacion, setAsignacion] = useState<AsignacionEstado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [cadencias, setCadencias] = useState<CadenciaConPasos[] | null>(null);
  const [cadenciaId, setCadenciaId] = useState<string | null>(null);
  const [contactoId, setContactoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarEstado = useCallback(async () => {
    try {
      const res = await fetch(`/api/cadencias/asignacion?empresaId=${empresaId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json() as { asignacion: AsignacionEstado | null };
        setAsignacion(data.asignacion);
      }
    } finally {
      setCargando(false);
    }
  }, [empresaId]);

  useEffect(() => { void cargarEstado(); }, [cargarEstado]);

  // Cargar plantillas (y contactos si no vinieron por prop) solo al abrir
  // el selector — lazy, sin costo de IA.
  const abrirSelector = async () => {
    setSelectorAbierto(true);
    setError(null);
    if (cadencias) return;
    try {
      const [resCad, listaContactos] = await Promise.all([
        fetch("/api/cadencias", { cache: "no-store" }),
        contactosProp
          ? Promise.resolve(contactosProp)
          : fetch(`/api/contactos?empresa_id=${empresaId}`, { cache: "no-store" })
              .then((r) => r.json() as Promise<{ contactos: Contacto[] }>)
              .then((d) => {
                setContactosFetched(d.contactos ?? []);
                return d.contactos ?? [];
              }),
      ]);
      if (!resCad.ok) throw new Error();
      const data = await resCad.json() as { cadencias: CadenciaConPasos[] };
      setCadencias(data.cadencias);
      // Pre-marcar la sugerida según etapa del pipeline
      const sugerida = data.cadencias.find((c) => c.etapa_pipeline === estado) ?? data.cadencias[0];
      if (sugerida) setCadenciaId(sugerida.id);
      // Pre-seleccionar el primer contacto con al menos un canal
      const conCanal = listaContactos.find((c) => canalesDisponibles(c).size > 0);
      if (conCanal) setContactoId(conCanal.id);
    } catch {
      setError("No se pudieron cargar las cadencias. Intenta de nuevo.");
    }
  };

  const cadenciaSel = cadencias?.find((c) => c.id === cadenciaId) ?? null;
  const contactoSel = contactos.find((c) => c.id === contactoId) ?? null;

  // Preview determinístico de la secuencia adaptada — misma función que usa el servidor
  const preview = useMemo(() => {
    if (!cadenciaSel || !contactoSel) return null;
    return adaptarCadencia(cadenciaSel.pasos, canalesDisponibles(contactoSel), hoyClCliente());
  }, [cadenciaSel, contactoSel]);

  const canalesOmitidosTexto = useMemo(() => {
    if (!preview || preview.omitidos.length === 0) return null;
    const canales = Array.from(new Set(preview.omitidos.map((o) => CANAL_PASO_LABEL[o.canal])));
    return canales.join(" y ");
  }, [preview]);

  const iniciar = async () => {
    if (!cadenciaId || !contactoId) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/cadencias/asignar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId, contacto_id: contactoId, cadencia_id: cadenciaId }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "No se pudo iniciar la cadencia");
      setSelectorAbierto(false);
      await cargarEstado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al iniciar la cadencia");
    } finally {
      setGuardando(false);
    }
  };

  const detener = async () => {
    if (!asignacion) return;
    setGuardando(true);
    try {
      await fetch("/api/cadencias/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asignacion_id: asignacion.id, motivo: "manual" }),
      });
      setAsignacion(null);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return null;

  // ── Estado: cadencia activa — línea de progreso ─────────────
  if (asignacion) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3 flex-wrap">
        <ListChecks className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {asignacion.cadencia_nombre}
            {asignacion.contacto_nombre ? ` · ${asignacion.contacto_nombre}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Paso {asignacion.paso_actual} de {asignacion.total_pasos}
            {asignacion.proximo_canal && asignacion.proxima_fecha
              ? ` · Próximo: ${asignacion.proximo_canal}, ${fechaCorta(asignacion.proxima_fecha)}`
              : ""}
          </p>
        </div>
        <button
          onClick={() => void detener()}
          disabled={guardando}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 shrink-0 min-h-[32px]"
        >
          {guardando ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          Detener
        </button>
      </div>
    );
  }

  // ── Estado: sin cadencia — botón + selector con preview ─────
  if (!selectorAbierto) {
    return (
      <button
        onClick={() => void abrirSelector()}
        className="w-full rounded-2xl border border-dashed border-border px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
      >
        <ListChecks className="h-4 w-4" />
        Iniciar cadencia de seguimiento
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" /> Iniciar cadencia
        </p>
        <button
          onClick={() => setSelectorAbierto(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!cadencias && !error && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando cadencias...
        </div>
      )}

      {cadencias && (
        <>
          {/* Decisor */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Decisor</label>
            <select
              value={contactoId ?? ""}
              onChange={(e) => setContactoId(e.target.value || null)}
              className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Selecciona un decisor...</option>
              {contactos.map((c) => {
                const canales = canalesDisponibles(c);
                return (
                  <option key={c.id} value={c.id} disabled={canales.size === 0}>
                    {c.nombre ?? c.cargo ?? "Sin nombre"}
                    {canales.size === 0 ? " (sin canales de contacto)" : ""}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Cadencia — la sugerida según etapa viene pre-marcada */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Cadencia</label>
            <select
              value={cadenciaId ?? ""}
              onChange={(e) => setCadenciaId(e.target.value || null)}
              className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {cadencias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}{c.etapa_pipeline === estado ? " (sugerida)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Preview de la secuencia adaptada a los canales del decisor */}
          {preview && preview.pasos.length > 0 && (
            <div className="rounded-xl bg-muted/40 px-3 py-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Secuencia adaptada
              </p>
              {preview.pasos.map((p) => (
                <p key={p.pasoId} className="text-xs flex items-center gap-1.5">
                  <span className="text-muted-foreground shrink-0">{fechaCorta(p.fecha)}</span>
                  <span>{CANAL_PASO_EMOJI[p.canal]} {CANAL_PASO_LABEL[p.canal]}</span>
                  {p.canal !== p.canalOriginal && (
                    <span className="text-[10px] text-muted-foreground">(reemplaza {CANAL_PASO_LABEL[p.canalOriginal]})</span>
                  )}
                  <span className="text-muted-foreground truncate">— {p.intencion}</span>
                </p>
              ))}
              {canalesOmitidosTexto && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 pt-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Sin datos de contacto: se omitieron pasos de {canalesOmitidosTexto}
                </p>
              )}
            </div>
          )}
          {preview && preview.pasos.length === 0 && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Ningún paso es ejecutable con los canales de este decisor.
            </p>
          )}

          {error && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}

          <Button
            onClick={() => void iniciar()}
            disabled={guardando || !contactoId || !cadenciaId || !preview || preview.pasos.length === 0}
            className="w-full gap-1.5"
            size="sm"
          >
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Iniciar cadencia
          </Button>
        </>
      )}

      {error && !cadencias && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
