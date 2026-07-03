"use client";

import { useState, useMemo, useRef } from "react";
import {
  Copy, CheckCheck, HelpCircle, Clock, MessageSquare,
  Zap, Loader2, Mail, ExternalLink, AlertCircle, User, RefreshCw, Phone,
} from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FichaIA, Interaccion, Compromiso, Contacto, BorradoresGuardados, BorradorCanal } from "@/lib/types";
import type { CanalBorrador, BorradorCanalResult, TipoBorrador } from "@/app/api/preparacion/route";

// ─── Tipos internos ───────────────────────────────────────────

interface HistorialEntrada {
  fecha: string;
  tipo: string;
  remitente: string;
  resumen: string;
  proximoPaso?: string | null;
}

interface DecisorDisplay {
  id: string;
  contactoId: string | null; // UUID real del contacto en Supabase (null = sugerido por IA)
  nombre: string | null;
  cargo: string;
  area: string | null;
  dolorEspecifico: string;
  tecnicaRecomendada: string;
  tipo: TipoBorrador;
  historialContacto: HistorialEntrada[];
}

const TIPO_TITULO: Record<TipoBorrador, string> = {
  apertura:     "Borrador de apertura",
  seguimiento:  "Borrador de seguimiento",
  continuacion: "Borrador de continuación",
  reactivacion: "Borrador de reactivación",
};

const TIPO_BADGE: Record<TipoBorrador, string> = {
  apertura:     "bg-[#FFF7ED] text-[#F97316]",
  seguimiento:  "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  continuacion: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  reactivacion: "bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400",
};

const TEXTOS_RESOLUCION_POSITIVA = new Set(["Respondió al contacto"]);
const TEXTOS_RESOLUCION_NEGATIVA = new Set([
  "Sin respuesta tras 48h",
  "Vio el mensaje pero no respondió",
]);

// Meses en español para mostrar la fecha de generación
const MESES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES_ES[d.getMonth()]} ${d.getFullYear()}`;
}

// Clave estable para guardar en Supabase (no depende del índice)
function claveDecisor(d: DecisorDisplay): string {
  return d.contactoId ?? `ia-${d.cargo}`;
}

function detectarTipo(ints: Interaccion[]): TipoBorrador {
  if (ints.length === 0) return "apertura";
  const tienePositiva = ints.some(
    (i) => i.sentimiento === "positivo" || TEXTOS_RESOLUCION_POSITIVA.has(i.transcripcion ?? "")
  );
  if (tienePositiva) return "continuacion";
  const todasNegativas = ints.every(
    (i) =>
      i.sentimiento === "negativo" ||
      i.sentimiento === "sin_respuesta" ||
      i.tipo === "sin_respuesta" ||
      TEXTOS_RESOLUCION_NEGATIVA.has(i.transcripcion ?? "")
  );
  if (todasNegativas) return "reactivacion";
  return "seguimiento";
}

function buildHistorialItems(ints: Interaccion[]): HistorialEntrada[] {
  return [...ints]
    .filter(
      (i) =>
        (i.resumen_ia ?? i.transcripcion ?? "").trim() !== "" &&
        !TEXTOS_RESOLUCION_POSITIVA.has(i.transcripcion ?? "") &&
        !TEXTOS_RESOLUCION_NEGATIVA.has(i.transcripcion ?? "")
    )
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 5)
    .map((i) => ({
      fecha: i.fecha,
      tipo: i.tipo,
      remitente: i.remitente ?? "vendedor",
      resumen: i.resumen_ia ?? i.transcripcion ?? "",
      proximoPaso: i.proximo_paso,
    }));
}

interface TabPreparacionProps {
  ficha: FichaIA;
  ultimaInteraccion: Interaccion | null;
  notasVendedor?: string | null;
  empresaId: string;
  nombreEmpresa: string;
  industria?: string | null;
  interacciones: Interaccion[];
  contactos: Contacto[];
  borradores?: BorradoresGuardados | null;
}

// ─── Config de canales ────────────────────────────────────────

const CANALES: CanalBorrador[] = ["whatsapp", "correo", "linkedin", "llamada"];

const CANAL_META: Record<CanalBorrador, { label: string; icon: React.ReactNode }> = {
  whatsapp: { label: "WhatsApp", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  correo:   { label: "Correo",   icon: <Mail className="h-3.5 w-3.5" /> },
  linkedin: { label: "LinkedIn", icon: <ExternalLink className="h-3.5 w-3.5" /> },
  llamada:  { label: "Llamada",  icon: <Phone className="h-3.5 w-3.5" /> },
};

// ─── Componente principal ─────────────────────────────────────

export function TabPreparacion({
  ficha,
  ultimaInteraccion,
  notasVendedor,
  empresaId,
  interacciones,
  contactos,
  borradores,
}: TabPreparacionProps) {
  // Compromisos pendientes del vendedor de la última interacción
  const compromisosPendientes =
    (ultimaInteraccion?.compromisos as Compromiso[] | null)?.filter(
      (c) =>
        c.responsable?.toLowerCase().includes("vendedor") ||
        c.responsable?.toLowerCase().includes("nosotros") ||
        c.responsable?.toLowerCase().includes("yo")
    ) ?? [];

  // Lista de decisores: detecta tipo (apertura/seguimiento/continuacion/reactivacion)
  // según las interacciones reales con ese contacto específico.
  const decisores = useMemo((): DecisorDisplay[] => {
    const reales = contactos.filter((c) => c.es_decisor);

    if (reales.length > 0) {
      return reales.map((c) => {
        const fichaD =
          ficha.decisores.find(
            (d) => c.area && d.area && d.area.toLowerCase().includes(c.area.toLowerCase())
          ) ??
          ficha.decisores.find(
            (d) => c.cargo && d.cargo.toLowerCase().includes((c.cargo.split(" ")[0] ?? "").toLowerCase())
          ) ??
          ficha.decisores[0];

        const ints = interacciones.filter((i) => i.contacto_id === c.id);
        return {
          id: `c-${c.id}`,
          contactoId: c.id,
          nombre: c.nombre,
          cargo: c.cargo ?? fichaD?.cargo ?? "Decisor",
          area: c.area,
          dolorEspecifico:
            fichaD?.dolor_especifico ?? "continuidad y calidad en el suministro de etiquetas",
          tecnicaRecomendada:
            fichaD?.tecnica_recomendada ?? ficha.tecnica_recomendada ?? "consultiva",
          tipo: detectarTipo(ints),
          historialContacto: buildHistorialItems(ints),
        };
      });
    }

    // Fallback: decisores sugeridos por la IA — usa todas las interacciones de la empresa
    return ficha.decisores.map((d, i) => ({
      id: `f-${i}`,
      contactoId: null,
      nombre: d.persona_encontrada?.nombre ?? null,
      cargo: d.cargo,
      area: d.area,
      dolorEspecifico: d.dolor_especifico,
      tecnicaRecomendada: d.tecnica_recomendada ?? ficha.tecnica_recomendada ?? "consultiva",
      tipo: detectarTipo(interacciones),
      historialContacto: buildHistorialItems(interacciones),
    }));
  }, [contactos, ficha, interacciones]);

  // Cache vacío al arrancar — la tabla `borradores` es la fuente de verdad.
  // NO inicializar desde el JSONB de empresas: si el cache se llena sin pasar
  // por cargarBorrador, borradorIds nunca se popula y el PATCH de feedback falla.
  const [cache, setCache] = useState<
    Record<string, Partial<Record<CanalBorrador, BorradorCanalResult>>>
  >({});

  const [fechas, setFechas] = useState<
    Record<string, Partial<Record<CanalBorrador, string>>>
  >({});

  // Ref para mantener los borradores actuales sin stale closures al acumular saves
  const borradoresRef = useRef<BorradoresGuardados>(borradores ?? {});

  const [cargando, setCargando] = useState<Record<string, CanalBorrador | null>>({});
  const [errores, setErrores] = useState<
    Record<string, Partial<Record<CanalBorrador, string>>>
  >({});
  // Errores de validación de datos (no transitorios — requieren ejecutar Investigar primero)
  const [erroresBloqueados, setErroresBloqueados] = useState<
    Record<string, Partial<Record<CanalBorrador, { campos_faltantes: string[]; accion_recomendada: string }>>>
  >({});
  // Advertencias no bloqueantes (ej: área de contacto inferida, no confirmada)
  const [advertenciasBorradores, setAdvertenciasBorradores] = useState<
    Record<string, Partial<Record<CanalBorrador, string[]>>>
  >({});
  const [abiertos, setAbiertos] = useState<Record<string, CanalBorrador | undefined>>({});
  const [borradorIds, setBorradorIds] = useState<Record<string, Partial<Record<CanalBorrador, string>>>>({});
  const [marcando, setMarcando] = useState<Record<string, CanalBorrador | null>>({});

  // Persiste un borrador en Supabase (fire and forget)
  const guardarEnSupabase = (clave: string, canal: CanalBorrador, canalData: BorradorCanal) => {
    borradoresRef.current = {
      ...borradoresRef.current,
      [clave]: { ...(borradoresRef.current[clave] ?? {}), [canal]: canalData },
    };
    void fetch(`/api/empresas/${empresaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ borradores: borradoresRef.current }),
    }).catch((e) => console.error("[preparacion] error guardando borrador:", e));
  };

  // Llama a la API y guarda el resultado en cache + Supabase.
  // forzarNuevo=true salta la verificación de borrador guardado y siempre genera uno nuevo.
  const cargarBorrador = async (decisor: DecisorDisplay, canal: CanalBorrador, forzarNuevo = false) => {
    console.log("[preparacion] cargarBorrador — decisor:", decisor.id, "canal:", canal, "tipo:", decisor.tipo, "forzarNuevo:", forzarNuevo);
    setCargando((prev) => ({ ...prev, [decisor.id]: canal }));

    try {
      // Verificar si hay un borrador guardado en tabla (solo si tiene contactoId real y no se fuerza nuevo)
      if (!forzarNuevo && decisor.contactoId) {
        try {
          const params = new URLSearchParams({ empresaId, canal, contactoId: decisor.contactoId, ts: Date.now().toString() });
          const savedRes = await fetch(`/api/borradores?${params}`, { cache: "no-store" });
          if (savedRes.ok) {
            const savedData = await savedRes.json() as {
              id?: string;
              borrador?: BorradorCanalResult;
              creado_en?: string;
            };
            if (savedData.borrador && savedData.id) {
              setCache((prev) => ({ ...prev, [decisor.id]: { ...(prev[decisor.id] ?? {}), [canal]: savedData.borrador! } }));
              setFechas((prev) => ({ ...prev, [decisor.id]: { ...(prev[decisor.id] ?? {}), [canal]: savedData.creado_en ?? new Date().toISOString() } }));
              setBorradorIds((prev) => ({ ...prev, [decisor.id]: { ...(prev[decisor.id] ?? {}), [canal]: savedData.id! } }));
              return;
            }
          }
        } catch {
          // GET falló — continuar con generación normal
        }
      }

      const res = await fetch("/api/preparacion", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresaId,
          canal,
          tipo: decisor.tipo,
          decisorNombre: decisor.nombre,
          decisorCargo: decisor.cargo,
          decisorArea: decisor.area,
          contactoId: decisor.contactoId,
        }),
      });
      console.log("[preparacion] fetch respondió HTTP", res.status);

      const data = (await res.json()) as {
        ok?: boolean;
        borrador?: BorradorCanalResult;
        borradorId?: string;
        error?: string;
        campos_faltantes?: string[];
        accion_recomendada?: string;
        advertencias?: string[];
      };
      console.log("[preparacion] data.ok:", data.ok, "canal borrador:", data.borrador?.canal, "error:", data.error);

      // Error de validación de datos — no transitorio, requiere ejecutar Investigar primero
      if (data.error === "datos_insuficientes") {
        setErroresBloqueados((prev) => ({
          ...prev,
          [decisor.id]: {
            ...(prev[decisor.id] ?? {}),
            [canal]: {
              campos_faltantes: data.campos_faltantes ?? [],
              accion_recomendada: data.accion_recomendada ?? "Ejecutar 'Investigar' para esta empresa primero.",
            },
          },
        }));
        return;
      }

      if (!data.ok || !data.borrador) throw new Error(data.error ?? "Error al generar");

      // Advertencias de baja confianza (área inferida, etc.)
      if (data.advertencias?.length) {
        setAdvertenciasBorradores((prev) => ({
          ...prev,
          [decisor.id]: { ...(prev[decisor.id] ?? {}), [canal]: data.advertencias! },
        }));
      }

      const borrador = data.borrador;
      setCache((prev) => ({
        ...prev,
        [decisor.id]: { ...(prev[decisor.id] ?? {}), [canal]: borrador },
      }));

      const now = new Date().toISOString();
      setFechas((prev) => ({
        ...prev,
        [decisor.id]: { ...(prev[decisor.id] ?? {}), [canal]: now },
      }));

      if (data.borradorId) {
        setBorradorIds((prev) => ({
          ...prev,
          [decisor.id]: { ...(prev[decisor.id] ?? {}), [canal]: data.borradorId! },
        }));
      }

      // Construir el objeto para Supabase según el canal
      let canalData: BorradorCanal;
      if (borrador.canal === "correo") {
        canalData = { asunto: borrador.asunto, cuerpo: borrador.cuerpo, generado_at: now };
      } else if (borrador.canal === "llamada") {
        canalData = {
          apertura:    borrador.apertura,
          gancho:      borrador.gancho,
          si_positivo: borrador.si_positivo,
          si_negativo: borrador.si_negativo,
          cierre:      borrador.cierre,
          generado_at: now,
        };
      } else {
        canalData = { texto: borrador.texto, generado_at: now };
      }

      guardarEnSupabase(claveDecisor(decisor), canal, canalData);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setErrores((prev) => ({
        ...prev,
        [decisor.id]: { ...(prev[decisor.id] ?? {}), [canal]: msg },
      }));
    } finally {
      setCargando((prev) => ({ ...prev, [decisor.id]: null }));
    }
  };

  // Click en botón de canal: toggle open/close + carga si no hay cache
  const handleCanal = async (decisor: DecisorDisplay, canal: CanalBorrador) => {
    console.log("[preparacion] handleCanal — canal:", canal, "decisor:", decisor.id, "cargando actual:", cargando[decisor.id]);

    // Toggle: cerrar si ya estaba abierto
    if (abiertos[decisor.id] === canal) {
      setAbiertos((prev) => ({ ...prev, [decisor.id]: undefined }));
      return;
    }

    // Abrir canal
    setAbiertos((prev) => ({ ...prev, [decisor.id]: canal }));

    // Ya cacheado → solo mostrar
    if (cache[decisor.id]?.[canal]) return;

    // Ya bloqueado por falta de datos → mostrar error sin nueva API call
    if (erroresBloqueados[decisor.id]?.[canal]) return;

    // Otro canal ya cargando → esperar
    if (cargando[decisor.id] != null) return;

    await cargarBorrador(decisor, canal);
  };

  // Reintentar tras error — limpia ambos tipos de error antes de reintentar
  const handleReintentar = async (decisor: DecisorDisplay, canal: CanalBorrador) => {
    if (cargando[decisor.id] != null) return;
    setErrores((prev) => ({
      ...prev,
      [decisor.id]: { ...(prev[decisor.id] ?? {}), [canal]: undefined },
    }));
    setErroresBloqueados((prev) => {
      const nuevo = { ...(prev[decisor.id] ?? {}) };
      delete nuevo[canal];
      return { ...prev, [decisor.id]: nuevo };
    });
    await cargarBorrador(decisor, canal);
  };

  // Regenerar: borra cache del canal y genera uno nuevo (forzando nueva llamada a IA)
  const handleRegenerar = async (decisor: DecisorDisplay, canal: CanalBorrador) => {
    if (cargando[decisor.id] != null) return;
    setCache((prev) => {
      const nuevo = { ...(prev[decisor.id] ?? {}) };
      delete nuevo[canal];
      return { ...prev, [decisor.id]: nuevo };
    });
    setFechas((prev) => {
      const nuevo = { ...(prev[decisor.id] ?? {}) };
      delete nuevo[canal];
      return { ...prev, [decisor.id]: nuevo };
    });
    setBorradorIds((prev) => {
      const nuevo = { ...(prev[decisor.id] ?? {}) };
      delete nuevo[canal];
      return { ...prev, [decisor.id]: nuevo };
    });
    setErroresBloqueados((prev) => {
      const nuevo = { ...(prev[decisor.id] ?? {}) };
      delete nuevo[canal];
      return { ...prev, [decisor.id]: nuevo };
    });
    await cargarBorrador(decisor, canal, true);
  };

  // Marcar borrador como usado y generar uno nuevo automáticamente
  const handleMarcarUsado = async (decisor: DecisorDisplay, canal: CanalBorrador) => {
    const borradorId = borradorIds[decisor.id]?.[canal];
    if (!borradorId || cargando[decisor.id] != null) return;
    setMarcando((prev) => ({ ...prev, [decisor.id]: canal }));
    try {
      await fetch(`/api/borradores/${borradorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usado: true }),
      });
      setCache((prev) => { const n = { ...(prev[decisor.id] ?? {}) }; delete n[canal]; return { ...prev, [decisor.id]: n }; });
      setBorradorIds((prev) => { const n = { ...(prev[decisor.id] ?? {}) }; delete n[canal]; return { ...prev, [decisor.id]: n }; });
      setFechas((prev) => { const n = { ...(prev[decisor.id] ?? {}) }; delete n[canal]; return { ...prev, [decisor.id]: n }; });
      await cargarBorrador(decisor, canal, true);
    } finally {
      setMarcando((prev) => ({ ...prev, [decisor.id]: null }));
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {/* ── Preguntas SPIN ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Preguntas SPIN para esta empresa
          </p>
          <HelpTooltip
            titulo="¿Cómo usar estas preguntas?"
            explicacion="Son preguntas diseñadas para que el cliente descubra solo que tiene un problema. No las leas literalmente — úsalas como guía para la conversación."
            ejemplo={
              "En vez de decir 'tenemos etiquetas de mejor calidad', pregunta:\n'¿Con qué frecuencia les ocurre que rechazan un lote por problemas de etiquetado?'"
            }
          />
        </div>
        <Card>
          <CardContent className="pt-4 pb-2">
            {ficha.preguntas_spin.map((pregunta, i) => {
              const labels = ["Situación", "Problema", "Implicación"];
              return (
                <PreguntaCopiable key={i} label={labels[i] ?? `Pregunta ${i + 1}`} texto={pregunta} />
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* ── Última conversación ────────────────────────────────── */}
      {ultimaInteraccion?.resumen_ia && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Última conversación
          </p>
          <Card className="border-0 bg-muted/50">
            <CardContent className="pt-4">
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {ultimaInteraccion.resumen_ia}
              </p>
              {ultimaInteraccion.proximo_paso && (
                <div className="mt-3 flex items-start gap-2 text-xs border-t border-border pt-3">
                  <span className="text-primary font-semibold shrink-0">→</span>
                  <span>{ultimaInteraccion.proximo_paso}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Compromisos pendientes ─────────────────────────────── */}
      {compromisosPendientes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
            Compromisos pendientes tuyos
          </p>
          <Card className="border-amber-200 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-900/5">
            <CardContent className="pt-4 space-y-2">
              {compromisosPendientes.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-amber-600 shrink-0 mt-0.5">⚠️</span>
                  <div>
                    <p>{c.descripcion}</p>
                    {c.fecha && (
                      <p className="text-xs text-muted-foreground">Para: {c.fecha}</p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Borradores de apertura por decisor ────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Borradores personalizados
          </p>
          <HelpTooltip
            titulo="¿Cómo usar los borradores?"
            explicacion="El tipo de borrador se adapta automáticamente según el historial con ese contacto: apertura si es nuevo, seguimiento si hubo contacto sin respuesta clara, continuación si hay relación positiva, o reactivación si los intentos anteriores fallaron."
            ejemplo={"Lee el borrador, añade algo que solo tú sabes, y envíalo desde tu canal habitual."}
          />
        </div>

        {/* Bloque de contexto del vendedor */}
        {notasVendedor?.trim() && (
          <div className="mb-3 flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
            <span className="text-amber-600 shrink-0 text-xs mt-0.5">📒</span>
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              Tu contexto: {notasVendedor}
            </p>
          </div>
        )}

        {/* Estado vacío */}
        {decisores.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="pt-6 pb-6 text-center space-y-1.5">
              <User className="h-8 w-8 mx-auto text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">
                Agrega decisores en la pestaña Decisores para generar borradores personalizados.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {decisores.map((d) => {
              const cargandoCanal = cargando[d.id] ?? null;
              const canalAbierto = abiertos[d.id];
              const borradorActivo = canalAbierto ? cache[d.id]?.[canalAbierto] : undefined;
              const errorActivo = canalAbierto ? errores[d.id]?.[canalAbierto] : undefined;
              const erroBloqueadoActivo = canalAbierto ? erroresBloqueados[d.id]?.[canalAbierto] : undefined;
              const advertenciasActivas = canalAbierto ? advertenciasBorradores[d.id]?.[canalAbierto] : undefined;
              const fechaActiva = canalAbierto ? fechas[d.id]?.[canalAbierto] : undefined;

              return (
                <Card key={d.id}>
                  <CardContent className="pt-4 pb-4">
                    {/* Encabezado del decisor */}
                    <div className="mb-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight">{d.cargo}</p>
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap", TIPO_BADGE[d.tipo])}>
                          {TIPO_TITULO[d.tipo]}
                        </span>
                      </div>
                      {d.nombre && (
                        <p className="text-xs text-muted-foreground mt-0.5">{d.nombre}</p>
                      )}
                    </div>

                    {/* Botones de canal */}
                    <div className="flex gap-2 flex-wrap">
                      {CANALES.map((canal) => {
                        const estaAbierto = canalAbierto === canal;
                        const estaCargando = cargandoCanal === canal;
                        const cached = Boolean(cache[d.id]?.[canal]);
                        const otrosCargando = cargandoCanal !== null && cargandoCanal !== canal;

                        return (
                          <button
                            key={canal}
                            onClick={() => handleCanal(d, canal)}
                            disabled={otrosCargando}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all min-h-[36px]",
                              estaAbierto
                                ? "bg-[#F97316] text-white border-[#F97316]"
                                : cached
                                ? "border-[#F97316]/40 text-[#F97316] bg-[#F97316]/5 dark:bg-[#F97316]/10"
                                : "border-border text-muted-foreground hover:border-[#F97316]/50 hover:text-foreground",
                              otrosCargando && "opacity-40 cursor-not-allowed"
                            )}
                          >
                            {estaCargando ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              CANAL_META[canal].icon
                            )}
                            {CANAL_META[canal].label}
                            {!cached && !estaCargando && (
                              <Zap className="h-3 w-3 opacity-50" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Contenido desplegado */}
                    {canalAbierto && (
                      <div className="mt-3 border-t border-border pt-3">
                        {cargandoCanal === canalAbierto ? (
                          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin text-[#F97316]" />
                            <span>{canalAbierto === "llamada" ? "Preparando pitch telefónico..." : "Redactando con técnica SPIN..."}</span>
                          </div>
                        ) : erroBloqueadoActivo ? (
                          // Error de datos insuficientes — no transitorio, no hay "Reintentar" automático
                          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/10 dark:border-amber-800/30">
                            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1.5">
                                Datos insuficientes para generar un borrador confiable
                              </p>
                              {erroBloqueadoActivo.campos_faltantes.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {erroBloqueadoActivo.campos_faltantes.map((campo) => (
                                    <span
                                      key={campo}
                                      className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-mono"
                                    >
                                      {campo}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <p className="text-xs text-amber-700 dark:text-amber-400 mb-2 leading-relaxed">
                                {erroBloqueadoActivo.accion_recomendada}
                              </p>
                              <button
                                onClick={() => handleReintentar(d, canalAbierto)}
                                className="text-xs text-amber-700 dark:text-amber-400 underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity"
                              >
                                Reintentar (si ya ejecutaste Investigar)
                              </button>
                            </div>
                          </div>
                        ) : errorActivo ? (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-destructive leading-relaxed">
                                {errorActivo}
                              </p>
                              <button
                                onClick={() => handleReintentar(d, canalAbierto)}
                                className="text-xs text-[#F97316] mt-1.5 underline underline-offset-2"
                              >
                                Reintentar
                              </button>
                            </div>
                          </div>
                        ) : borradorActivo ? (
                          <div>
                            <BorradorContent
                              borrador={borradorActivo}
                              decisor={d}
                              empresaId={empresaId}
                              borradorId={borradorIds[d.id]?.[canalAbierto] ?? null}
                              onRegenerar={() => handleRegenerar(d, canalAbierto!)}
                            />
                            {/* Advertencias de baja confianza (ej: área inferida) */}
                            {advertenciasActivas?.map((adv, i) => (
                              <div
                                key={i}
                                className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-lg px-2.5 py-1.5 border border-amber-200 dark:border-amber-700/30"
                              >
                                <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                                <span>{adv}</span>
                              </div>
                            ))}
                            {/* Fecha + acciones del borrador */}
                            <div className="mt-3 flex items-center gap-2 flex-wrap">
                              {fechaActiva && (
                                <p className="text-[10px] text-muted-foreground shrink-0">
                                  Generado el {formatFecha(fechaActiva)}
                                </p>
                              )}
                              <div className="flex items-center gap-2 ml-auto">
                                {borradorIds[d.id]?.[canalAbierto] && (
                                  <button
                                    onClick={() => void handleMarcarUsado(d, canalAbierto)}
                                    disabled={cargandoCanal !== null || marcando[d.id] === canalAbierto}
                                    className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors disabled:opacity-50"
                                  >
                                    {marcando[d.id] === canalAbierto ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <CheckCheck className="h-3 w-3" />
                                    )}
                                    Marcar usado y generar nuevo
                                  </button>
                                )}
                                <button
                                  onClick={() => handleRegenerar(d, canalAbierto)}
                                  disabled={cargandoCanal !== null}
                                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-[#F97316] transition-colors"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  <Zap className="h-2.5 w-2.5 text-amber-500" />
                                  Generar nuevo
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────

function BorradorContent({
  borrador,
  decisor,
  empresaId,
  borradorId,
  onRegenerar,
}: {
  borrador: BorradorCanalResult;
  decisor: DecisorDisplay;
  empresaId: string;
  borradorId?: string | null;
  onRegenerar?: () => void;
}) {
  // Canal llamada tiene su propio componente de visualización
  if (borrador.canal === "llamada") {
    const borradorIaLlamada = [
      `APERTURA:\n${borrador.apertura}`,
      `GANCHO:\n${borrador.gancho}`,
      `SI RESPONDE CON INTERÉS:\n${borrador.si_positivo}`,
      `SI DICE QUE NO:\n${borrador.si_negativo}`,
      `CIERRE:\n${borrador.cierre}`,
    ].join("\n\n");
    return (
      <PitchLlamadaContent
        borrador={borrador}
        decisor={decisor}
        empresaId={empresaId}
        borradorIa={borradorIaLlamada}
        borradorId={borradorId}
        onRegenerar={onRegenerar}
      />
    );
  }

  // Correo: asunto + cuerpo; whatsapp/linkedin: texto directo
  const borradorIa =
    borrador.canal === "correo"
      ? `Asunto: ${borrador.asunto}\n\n${borrador.cuerpo}`
      : borrador.texto;

  const textoParaCopiar =
    borrador.canal === "correo"
      ? `Asunto: ${borrador.asunto}\n\n${borrador.cuerpo}`
      : borrador.texto;

  return (
    <div>
      {/* Destinatario */}
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Para:</span>
        <span className="font-medium text-foreground">
          {decisor.nombre ? `${decisor.nombre} · ${decisor.cargo}` : decisor.cargo}
        </span>
      </div>

      {/* Asunto (solo correo) */}
      {borrador.canal === "correo" && (
        <div className="mb-2 flex items-start gap-2 px-2.5 py-2 rounded-lg bg-muted/60 border border-border">
          <span className="text-xs font-semibold text-muted-foreground shrink-0">Asunto:</span>
          <span className="text-xs font-medium leading-snug">{borrador.asunto}</span>
        </div>
      )}

      {/* Cuerpo */}
      <div className="bg-muted/50 rounded-xl p-3 mb-3">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {borrador.canal === "correo" ? borrador.cuerpo : borrador.texto}
        </p>
      </div>

      {/* Feedback — antes del botón copiar */}
      <div className="mb-3 pt-2 border-t border-border">
        <FeedbackBorrador
          empresaId={empresaId}
          contactoId={decisor.contactoId}
          canal={borrador.canal}
          tipo={decisor.tipo}
          borradorIa={borradorIa}
          borradorId={borradorId}
          onRegenerar={onRegenerar}
        />
      </div>

      <CopiarBoton texto={textoParaCopiar} label="Copiar" className="w-full" />
    </div>
  );
}

// ─── Pitch de llamada con secciones ──────────────────────────

const PITCH_SECCIONES: {
  key: "apertura" | "gancho" | "si_positivo" | "si_negativo" | "cierre";
  titulo: string;
  duracion: string;
  color: string;
  icono: string;
}[] = [
  { key: "apertura",    titulo: "Apertura",               duracion: "5-10 seg",  color: "border-[#F97316] bg-[#FFF7ED] dark:bg-orange-900/20",                        icono: "📞" },
  { key: "gancho",      titulo: "Gancho",                 duracion: "10-15 seg", color: "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20",     icono: "🎯" },
  { key: "si_positivo", titulo: "Si responde con interés", duracion: "15-20 seg", color: "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20",     icono: "✅" },
  { key: "si_negativo", titulo: "Si dice que no",          duracion: "10 seg",   color: "border-red-200 bg-red-50/60 dark:border-red-800/40 dark:bg-red-900/15",        icono: "↩️" },
  { key: "cierre",      titulo: "Cierre",                 duracion: "5-10 seg", color: "border-blue-200 bg-blue-50 dark:border-blue-700/40 dark:bg-blue-900/20",       icono: "🤝" },
];

function PitchLlamadaContent({
  borrador,
  decisor,
  empresaId,
  borradorIa,
  borradorId,
  onRegenerar,
}: {
  borrador: Extract<BorradorCanalResult, { canal: "llamada" }>;
  decisor: DecisorDisplay;
  empresaId: string;
  borradorIa: string;
  borradorId?: string | null;
  onRegenerar?: () => void;
}) {
  const textoCompleto = [
    `APERTURA:\n${borrador.apertura}`,
    `GANCHO:\n${borrador.gancho}`,
    `SI RESPONDE CON INTERÉS:\n${borrador.si_positivo}`,
    `SI DICE QUE NO:\n${borrador.si_negativo}`,
    `CIERRE:\n${borrador.cierre}`,
  ].join("\n\n");

  return (
    <div className="space-y-3">
      {/* Destinatario */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Phone className="h-3 w-3" />
        <span>Llamar a:</span>
        <span className="font-medium text-foreground">
          {decisor.nombre ? `${decisor.nombre} · ${decisor.cargo}` : decisor.cargo}
        </span>
      </div>

      {/* Secciones del pitch */}
      {PITCH_SECCIONES.map((sec) => (
        <div
          key={sec.key}
          className={`rounded-xl border p-3 ${sec.color}`}
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>{sec.icono}</span>
              {sec.titulo}
            </p>
            <span className="text-[10px] text-muted-foreground shrink-0">{sec.duracion}</span>
          </div>
          <p className="text-sm leading-relaxed">{borrador[sec.key]}</p>
        </div>
      ))}

      {/* Botón copiar todo */}
      <CopiarBoton texto={textoCompleto} label="Copiar pitch completo" className="w-full mt-1" />

      {/* Feedback */}
      <div className="pt-3 border-t border-border">
        <FeedbackBorrador
          empresaId={empresaId}
          contactoId={decisor.contactoId}
          canal="llamada"
          tipo={decisor.tipo}
          borradorIa={borradorIa}
          borradorId={borradorId}
          onRegenerar={onRegenerar}
        />
      </div>
    </div>
  );
}

// ─── Feedback de borrador ─────────────────────────────────────

type FeedbackEstado = "idle" | "positivo_ok" | "negativo_form" | "guardado";

function FeedbackBorrador({
  empresaId,
  contactoId,
  canal,
  tipo,
  borradorIa,
  borradorId,
  onRegenerar,
}: {
  empresaId: string;
  contactoId: string | null;
  canal: CanalBorrador;
  tipo: TipoBorrador;
  borradorIa: string;
  borradorId?: string | null;
  onRegenerar?: () => void;
}) {
  const [estado, setEstado] = useState<FeedbackEstado>("idle");
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async (evaluacion: "positivo" | "negativo") => {
    setGuardando(true);
    try {
      // Registrar en borradores_feedback para el aprendizaje de estilo
      await fetch("/api/borradores-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          contacto_id: contactoId ?? null,
          canal,
          tipo_borrador: tipo,
          borrador_ia: borradorIa,
          evaluacion,
          version_vendedor: evaluacion === "negativo" ? (motivoRechazo.trim() || null) : null,
        }),
      });

      if (evaluacion === "negativo") {
        // Marcar siempre como usado=true para que el GET no devuelva este borrador
        // al regenerar. También guarda el motivo si se proporcionó.
        if (borradorId) {
          const patchBody: Record<string, unknown> = { usado: true };
          if (motivoRechazo.trim()) patchBody.feedback_rechazo = motivoRechazo.trim();
          await fetch(`/api/borradores/${borradorId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchBody),
          });
        }
        // Regenerar con el feedback inyectado en el contexto de Claude
        onRegenerar?.();
      } else {
        setEstado("positivo_ok");
      }
    } catch (e) {
      console.error("[feedback] error guardando:", e);
    } finally {
      setGuardando(false);
    }
  };

  if (estado === "positivo_ok") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
        <CheckCheck className="h-3.5 w-3.5" />
        <span>Guardado — la IA aprenderá tu estilo</span>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {estado === "idle" && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">¿Te sirve este borrador?</span>
          <button
            onClick={() => void guardar("positivo")}
            className="text-xs px-2.5 py-1 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800/40 dark:bg-green-900/15 dark:text-green-400 transition-colors min-h-[32px]"
          >
            👍 Me sirve
          </button>
          <button
            onClick={() => setEstado("negativo_form")}
            className="text-xs px-2.5 py-1 rounded-lg border border-red-200 bg-red-50/60 text-red-600 hover:bg-red-100/80 dark:border-red-800/40 dark:bg-red-900/15 dark:text-red-400 transition-colors min-h-[32px]"
          >
            👎 No me sirve
          </button>
        </div>
      )}
      {estado === "negativo_form" && (
        <div className="space-y-2">
          <textarea
            value={motivoRechazo}
            onChange={(e) => setMotivoRechazo(e.target.value.slice(0, 100))}
            placeholder="¿Por qué no te sirve? Ej: muy largo, tono equivocado, ya envié algo similar"
            rows={2}
            maxLength={100}
            className="w-full text-xs rounded-xl border border-border bg-muted/40 px-3 py-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-[#F97316] focus:border-[#F97316] placeholder:text-muted-foreground/60"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => void guardar("negativo")}
              disabled={guardando}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#F97316] text-white font-medium disabled:opacity-50 min-h-[32px]"
            >
              {guardando && <Loader2 className="h-3 w-3 animate-spin" />}
              <Zap className="h-3 w-3" />
              Enviar feedback y regenerar
            </button>
            <button
              onClick={() => setEstado("idle")}
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground min-h-[32px]"
            >
              Cancelar
            </button>
            <span className="text-[10px] text-muted-foreground ml-auto">{motivoRechazo.length}/100</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PreguntaCopiable({ label, texto }: { label: string; texto: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <span className="text-xs font-semibold text-primary">{label}</span>
          <p className="text-sm mt-0.5 leading-relaxed">{texto}</p>
        </div>
        <button
          onClick={copiar}
          className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors shrink-0"
        >
          {copiado ? (
            <CheckCheck className="h-4 w-4 text-[#22C55E]" />
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}

function CopiarBoton({
  texto,
  label,
  className,
}: {
  texto: string;
  label: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className={`gap-1.5 ${className ?? ""}`}
      onClick={copiar}
    >
      {copiado ? (
        <>
          <CheckCheck className="h-3.5 w-3.5 text-[#22C55E]" /> Copiado
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> {label}
        </>
      )}
    </Button>
  );
}
