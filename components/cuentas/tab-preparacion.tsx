"use client";

import { useState, useMemo } from "react";
import {
  Copy, CheckCheck, HelpCircle, Clock, MessageSquare,
  Zap, Loader2, Mail, ExternalLink, AlertCircle, User,
} from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FichaIA, Interaccion, Compromiso, Contacto } from "@/lib/types";
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
  apertura:     "bg-[#EDE9FE] text-[#7C3AED]",
  seguimiento:  "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  continuacion: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  reactivacion: "bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400",
};

const TEXTOS_RESOLUCION_POSITIVA = new Set(["Respondió al contacto"]);
const TEXTOS_RESOLUCION_NEGATIVA = new Set([
  "Sin respuesta tras 48h",
  "Vio el mensaje pero no respondió",
]);

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
}

// ─── Config de canales ────────────────────────────────────────

const CANALES: CanalBorrador[] = ["whatsapp", "correo", "linkedin"];

const CANAL_META: Record<CanalBorrador, { label: string; icon: React.ReactNode }> = {
  whatsapp: { label: "WhatsApp", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  correo:   { label: "Correo",   icon: <Mail className="h-3.5 w-3.5" /> },
  linkedin: { label: "LinkedIn", icon: <ExternalLink className="h-3.5 w-3.5" /> },
};

// ─── Componente principal ─────────────────────────────────────

export function TabPreparacion({
  ficha,
  ultimaInteraccion,
  notasVendedor,
  empresaId,
  interacciones,
  contactos,
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

  // Estado por decisor: cache, cargando, errores, canal abierto
  const [cache, setCache] = useState<
    Record<string, Partial<Record<CanalBorrador, BorradorCanalResult>>>
  >({});
  const [cargando, setCargando] = useState<Record<string, CanalBorrador | null>>({});
  const [errores, setErrores] = useState<
    Record<string, Partial<Record<CanalBorrador, string>>>
  >({});
  const [abiertos, setAbiertos] = useState<Record<string, CanalBorrador | undefined>>({});

  // Llama a la API y guarda el resultado en cache
  const cargarBorrador = async (decisor: DecisorDisplay, canal: CanalBorrador) => {
    console.log("[preparacion] cargarBorrador — decisor:", decisor.id, "canal:", canal, "tipo:", decisor.tipo);
    setCargando((prev) => ({ ...prev, [decisor.id]: canal }));

    try {
      const res = await fetch("/api/preparacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresaId,
          canal,
          tipo: decisor.tipo,
          decisorNombre: decisor.nombre,
          decisorCargo: decisor.cargo,
          decisorArea: decisor.area,
        }),
      });
      console.log("[preparacion] fetch respondió HTTP", res.status);

      const data = (await res.json()) as {
        ok: boolean;
        borrador?: BorradorCanalResult;
        error?: string;
      };
      console.log("[preparacion] data.ok:", data.ok, "canal borrador:", data.borrador?.canal, "error:", data.error);

      if (!data.ok || !data.borrador) throw new Error(data.error ?? "Error al generar");

      const borrador = data.borrador;
      setCache((prev) => ({
        ...prev,
        [decisor.id]: { ...(prev[decisor.id] ?? {}), [canal]: borrador },
      }));
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

    // Otro canal ya cargando → esperar (cargando[d] es string solo cuando carga activamente)
    // IMPORTANTE: usar != null (loose) para tratar undefined igual que null
    if (cargando[decisor.id] != null) return;

    await cargarBorrador(decisor, canal);
  };

  // Reintentar sin pasar por el toggle
  const handleReintentar = async (decisor: DecisorDisplay, canal: CanalBorrador) => {
    if (cargando[decisor.id] != null) return;
    setErrores((prev) => ({
      ...prev,
      [decisor.id]: { ...(prev[decisor.id] ?? {}), [canal]: undefined },
    }));
    await cargarBorrador(decisor, canal);
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
                                ? "bg-[#7C3AED] text-white border-[#7C3AED]"
                                : cached
                                ? "border-[#7C3AED]/40 text-[#7C3AED] bg-[#7C3AED]/5 dark:bg-[#7C3AED]/10"
                                : "border-border text-muted-foreground hover:border-[#7C3AED]/50 hover:text-foreground",
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
                            <Loader2 className="h-4 w-4 animate-spin text-[#7C3AED]" />
                            <span>Redactando con técnica SPIN...</span>
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
                                className="text-xs text-[#7C3AED] mt-1.5 underline underline-offset-2"
                              >
                                Reintentar
                              </button>
                            </div>
                          </div>
                        ) : borradorActivo ? (
                          <BorradorContent borrador={borradorActivo} decisor={d} />
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
}: {
  borrador: BorradorCanalResult;
  decisor: DecisorDisplay;
}) {
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

      <CopiarBoton texto={textoParaCopiar} label="Copiar" className="w-full" />
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
