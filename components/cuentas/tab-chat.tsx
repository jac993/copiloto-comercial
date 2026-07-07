"use client";

// =============================================================
// Tab "Consultar" — fusiona el chat contextual persistente con la
// generación de borradores por canal (antes tab-preparacion.tsx).
// El chat de texto libre sigue viviendo en chat_empresa; los
// borradores generados por los botones de canal viven SOLO en
// estado local (no se persisten en chat_empresa) y se mezclan
// visualmente con el chat por fecha. Al recargar la página el
// chat de texto libre persiste; las tarjetas de borrador no.
// =============================================================

import { useState, useEffect, useRef, useMemo, KeyboardEvent } from "react";
import {
  Send, Bot, User, Loader2, X, Copy, CheckCheck, Clock,
  Mail, ExternalLink, AlertCircle, RefreshCw, Phone, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { cn } from "@/lib/utils";
import { calcularCadencia } from "@/lib/cadencia";
import type {
  ChatEmpresa, FichaIA, Interaccion, Compromiso, Contacto,
} from "@/lib/types";
import type { CanalBorrador, BorradorCanalResult, TipoBorrador } from "@/app/api/preparacion/route";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── Tipos trasladados de tab-preparacion.tsx (misma lógica) ───

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

// Un borrador generado en el feed — SOLO estado local, no se persiste en chat_empresa
interface BorradorFeedItem {
  id: string;
  creado_en: string;
  decisor: DecisorDisplay;
  canal: CanalBorrador;
  estado: "cargando" | "bloqueado" | "error" | "listo";
  borrador?: BorradorCanalResult;
  borradorId?: string | null;
  error?: string;
  erroBloqueado?: { campos_faltantes: string[]; accion_recomendada: string };
  advertencias?: string[];
  marcando?: boolean;
}

const TIPO_TITULO: Record<TipoBorrador, string> = {
  apertura:     "Apertura",
  seguimiento:  "Seguimiento",
  continuacion: "Continuación",
  reactivacion: "Reactivación",
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

const MESES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function fechaHora(isoStr: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(isoStr));
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

// ── Config de canales ────────────────────────────────────────

const CANALES: CanalBorrador[] = ["whatsapp", "correo", "linkedin", "llamada"];

const CANAL_META: Record<CanalBorrador, { label: string; emoji: string; icon: React.ReactNode }> = {
  whatsapp: { label: "WhatsApp", emoji: "📱", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  correo:   { label: "Correo",   emoji: "📧", icon: <Mail className="h-3.5 w-3.5" /> },
  linkedin: { label: "LinkedIn", emoji: "💼", icon: <ExternalLink className="h-3.5 w-3.5" /> },
  llamada:  { label: "Llamada",  emoji: "📞", icon: <Phone className="h-3.5 w-3.5" /> },
};

// ── Preguntas rápidas de texto libre (sin "Prepararme para visita" —
// ese pasó a la fila de botones de acción rápida, siempre visible) ──

const PREGUNTAS_RAPIDAS = [
  "¿Cuál es mi mejor ángulo de entrada ahora?",
  "¿Vale la pena seguir con esta cuenta?",
  "¿Cómo manejo la objeción de precio?",
  "¿Qué haría diferente en la próxima llamada?",
];

const PROMPT_PREPARARME_VISITA =
  "Voy a visitar esta empresa. Dame un briefing completo con: (1) lo que sé de ellos, (2) los gaps de información que tengo, (3) 3 preguntas SPIN concretas para esta visita basadas en su situación real, y (4) qué criterios MEDDIC me faltan cubrir.";

// ── Props ────────────────────────────────────────────────────

interface TabChatProps {
  empresaId: string;
  empresaNombre: string;
  ficha: FichaIA | null;
  ultimaInteraccion: Interaccion | null;
  notasVendedor?: string | null;
  interacciones: Interaccion[];
  contactos: Contacto[];
}

export function TabChat({
  empresaId,
  empresaNombre,
  ficha,
  ultimaInteraccion,
  notasVendedor,
  interacciones,
  contactos,
}: TabChatProps) {
  const [historial, setHistorial] = useState<ChatEmpresa[]>([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Borradores generados por los botones de canal — SOLO estado local
  const [borradorItems, setBorradorItems] = useState<BorradorFeedItem[]>([]);
  const [decisorActivoId, setDecisorActivoId] = useState<string | null>(null);

  // Compromisos pendientes del vendedor de la última interacción
  const compromisosPendientes =
    (ultimaInteraccion?.compromisos as Compromiso[] | null)?.filter(
      (c) =>
        c.responsable?.toLowerCase().includes("vendedor") ||
        c.responsable?.toLowerCase().includes("nosotros") ||
        c.responsable?.toLowerCase().includes("yo")
    ) ?? [];

  // Lista de decisores — misma lógica de tab-preparacion.tsx
  const decisores = useMemo((): DecisorDisplay[] => {
    if (!ficha) return [];
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

  // Auto-seleccionar el primer decisor para que los botones sirvan de inmediato
  useEffect(() => {
    if (decisorActivoId == null && decisores.length > 0) {
      setDecisorActivoId(decisores[0].id);
    }
  }, [decisores, decisorActivoId]);

  const decisorActivo = decisores.find((d) => d.id === decisorActivoId) ?? null;
  const cadenciaActiva = decisorActivo?.contactoId
    ? calcularCadencia(interacciones, decisorActivo.contactoId)
    : null;

  // Cargar historial de chat persistido al montar
  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch(`/api/empresas/${empresaId}/chat`);
        if (res.ok) {
          const data = await res.json() as { historial: ChatEmpresa[] };
          setHistorial(data.historial);
        }
      } finally {
        setCargandoHistorial(false);
      }
    }
    cargar();
  }, [empresaId]);

  // Scroll al fondo cuando llegan mensajes o borradores nuevos
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [historial, borradorItems, cargando]);

  // ── Chat de texto libre — sin cambios respecto a hoy ──────────

  const enviar = async (texto?: string) => {
    const msgTexto = (texto ?? input).trim();
    if (!msgTexto || cargando) return;

    setInput("");
    setCargando(true);

    const tempId = `temp-${Date.now()}`;
    const mensajeTemp: ChatEmpresa = {
      id: tempId,
      empresa_id: empresaId,
      pregunta: msgTexto,
      respuesta: "",
      creado_en: new Date().toISOString(),
    };
    setHistorial((prev) => [...prev, mensajeTemp]);

    try {
      const res = await fetch(`/api/empresas/${empresaId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: msgTexto }),
      });

      if (!res.ok) throw new Error("Error al consultar la IA");
      const data = await res.json() as { respuesta: string };

      setHistorial((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, respuesta: data.respuesta } : m))
      );
    } catch {
      setHistorial((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, respuesta: "Hubo un error. Intenta de nuevo." } : m
        )
      );
    } finally {
      setCargando(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  // ── Borradores por canal — misma lógica de tab-preparacion.tsx,
  // reestructurada de "cache por decisor+canal" a "items de feed" ──

  const actualizarItem = (itemId: string, patch: Partial<BorradorFeedItem>) => {
    setBorradorItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  };

  const ejecutarFetchBorrador = async (
    decisor: DecisorDisplay,
    canal: CanalBorrador,
    forzarNuevo: boolean,
    onUpdate: (patch: Partial<BorradorFeedItem>) => void
  ) => {
    onUpdate({ estado: "cargando", error: undefined, erroBloqueado: undefined });
    try {
      if (!forzarNuevo && decisor.contactoId) {
        try {
          const params = new URLSearchParams({ empresaId, canal, contactoId: decisor.contactoId, ts: Date.now().toString() });
          const savedRes = await fetch(`/api/borradores?${params}`, { cache: "no-store" });
          if (savedRes.ok) {
            const savedData = await savedRes.json() as { id?: string; borrador?: BorradorCanalResult };
            if (savedData.borrador && savedData.id) {
              onUpdate({ estado: "listo", borrador: savedData.borrador, borradorId: savedData.id });
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

      const data = (await res.json()) as {
        ok?: boolean;
        borrador?: BorradorCanalResult;
        borradorId?: string;
        error?: string;
        campos_faltantes?: string[];
        accion_recomendada?: string;
        advertencias?: string[];
      };

      if (data.error === "datos_insuficientes") {
        onUpdate({
          estado: "bloqueado",
          erroBloqueado: {
            campos_faltantes: data.campos_faltantes ?? [],
            accion_recomendada: data.accion_recomendada ?? "Ejecutar 'Investigar' para esta empresa primero.",
          },
        });
        return;
      }

      if (!data.ok || !data.borrador) throw new Error(data.error ?? "Error al generar");

      onUpdate({
        estado: "listo",
        borrador: data.borrador,
        borradorId: data.borradorId ?? null,
        advertencias: data.advertencias?.length ? data.advertencias : undefined,
      });
    } catch (e) {
      onUpdate({ estado: "error", error: e instanceof Error ? e.message : "Error desconocido" });
    }
  };

  // Click en un botón de canal: siempre agrega una entrada nueva al feed
  const generarBorradorNuevo = async (canal: CanalBorrador) => {
    if (!decisorActivo) return;
    const itemId = `borrador-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nuevoItem: BorradorFeedItem = {
      id: itemId,
      creado_en: new Date().toISOString(),
      decisor: decisorActivo,
      canal,
      estado: "cargando",
    };
    setBorradorItems((prev) => [...prev, nuevoItem]);
    await ejecutarFetchBorrador(decisorActivo, canal, false, (patch) => actualizarItem(itemId, patch));
  };

  const handleReintentar = (item: BorradorFeedItem) =>
    ejecutarFetchBorrador(item.decisor, item.canal, false, (patch) => actualizarItem(item.id, patch));

  const handleRegenerar = (item: BorradorFeedItem) =>
    ejecutarFetchBorrador(item.decisor, item.canal, true, (patch) => actualizarItem(item.id, patch));

  const handleMarcarUsado = async (item: BorradorFeedItem) => {
    if (!item.borradorId || item.marcando) return;
    actualizarItem(item.id, { marcando: true });
    try {
      await fetch(`/api/borradores/${item.borradorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usado: true }),
      });
      await ejecutarFetchBorrador(item.decisor, item.canal, true, (patch) => actualizarItem(item.id, patch));
    } finally {
      actualizarItem(item.id, { marcando: false });
    }
  };

  const hayCargandoBorrador = borradorItems.some((it) => it.estado === "cargando");

  // ── Feed combinado: chat de texto libre + borradores locales, por fecha ──

  type FeedEntry =
    | { key: string; creado_en: string; kind: "texto"; chat: ChatEmpresa }
    | { key: string; creado_en: string; kind: "borrador"; item: BorradorFeedItem };

  const feed: FeedEntry[] = [
    ...historial.map((h): FeedEntry => ({ key: `t-${h.id}`, creado_en: h.creado_en, kind: "texto", chat: h })),
    ...borradorItems.map((b): FeedEntry => ({ key: `b-${b.id}`, creado_en: b.creado_en, kind: "borrador", item: b })),
  ].sort((a, b) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime());

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[500px] pb-4 max-w-full overflow-x-hidden">
      {/* ── Contexto fijo arriba: SPIN, última conversación, compromisos ── */}
      <div className="space-y-3 mb-3">
        {ficha && ficha.preguntas_spin.length > 0 && (
          <details className="group rounded-xl border border-border bg-card">
            <summary className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none">
              Preguntas SPIN para esta empresa
              <HelpTooltip
                titulo="¿Cómo usar estas preguntas?"
                explicacion="Son preguntas diseñadas para que el cliente descubra solo que tiene un problema. No las leas literalmente — úsalas como guía para la conversación."
                ejemplo={"En vez de decir 'tenemos etiquetas de mejor calidad', pregunta:\n'¿Con qué frecuencia les ocurre que rechazan un lote por problemas de etiquetado?'"}
              />
            </summary>
            <div className="px-3 pb-2">
              {ficha.preguntas_spin.map((pregunta, i) => {
                const labels = ["Situación", "Problema", "Implicación"];
                return <PreguntaCopiable key={i} label={labels[i] ?? `Pregunta ${i + 1}`} texto={pregunta} />;
              })}
            </div>
          </details>
        )}

        {ultimaInteraccion?.resumen_ia && (
          <details className="group rounded-xl border border-border bg-muted/50">
            <summary className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none">
              <Clock className="h-3.5 w-3.5" />
              Última conversación
            </summary>
            <div className="px-3 pb-3">
              <p className="text-sm leading-relaxed whitespace-pre-line">{ultimaInteraccion.resumen_ia}</p>
              {ultimaInteraccion.proximo_paso && (
                <div className="mt-2 flex items-start gap-2 text-xs border-t border-border pt-2">
                  <span className="text-primary font-semibold shrink-0">→</span>
                  <span>{ultimaInteraccion.proximo_paso}</span>
                </div>
              )}
            </div>
          </details>
        )}

        {compromisosPendientes.length > 0 && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-900/5 px-3 py-2.5 space-y-1.5">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Compromisos pendientes tuyos</p>
            {compromisosPendientes.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-amber-600 shrink-0 mt-0.5">⚠️</span>
                <div>
                  <p>{c.descripcion}</p>
                  {c.fecha && <p className="text-muted-foreground">Para: {c.fecha}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Selector de decisor + botones de acción rápida */}
        {ficha && decisores.length > 0 && (
          <div className="space-y-2">
            {notasVendedor?.trim() && (
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
                <span className="text-amber-600 shrink-0 text-xs mt-0.5">📒</span>
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  Tu contexto: {notasVendedor}
                </p>
              </div>
            )}
            <div className="flex items-center flex-wrap gap-1.5 pb-1">
              {decisores.map((d) => {
                const cad = d.contactoId ? calcularCadencia(interacciones, d.contactoId) : null;
                const activo = d.id === decisorActivoId;
                return (
                  <button
                    key={d.id}
                    onClick={() => setDecisorActivoId(d.id)}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors",
                      activo
                        ? "bg-[#F97316] text-white border-[#F97316]"
                        : "border-border text-muted-foreground hover:border-[#F97316]/50 hover:text-foreground"
                    )}
                  >
                    {d.nombre ?? d.cargo}
                    {cad && (
                      <span className={cn("text-[10px] font-semibold", activo ? "text-white/80" : "text-[#F97316]")}>
                        {cad.touch}/{cad.totalTouches}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {cadenciaActiva && (
              <div className={cn(
                "flex items-start gap-2 rounded-xl px-3 py-2 text-xs border",
                cadenciaActiva.accion === "pausar"
                  ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/15 dark:border-amber-800/40 dark:text-amber-400"
                  : "bg-[#F97316]/10 border-[#F97316]/20 text-[#C2410C] dark:text-orange-300"
              )}>
                <span className="shrink-0 font-semibold whitespace-nowrap">
                  Touch {cadenciaActiva.touch}/{cadenciaActiva.totalTouches}
                </span>
                <span className="leading-relaxed">{cadenciaActiva.resumen}</span>
              </div>
            )}

            <div className="flex items-center flex-wrap gap-1.5 pb-1">
              {CANALES.map((canal) => (
                <button
                  key={canal}
                  onClick={() => void generarBorradorNuevo(canal)}
                  disabled={hayCargandoBorrador || cargando}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:border-[#F97316]/50 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>{CANAL_META[canal].emoji}</span>
                  {CANAL_META[canal].label}
                </button>
              ))}
              <button
                onClick={() => void enviar(PROMPT_PREPARARME_VISITA)}
                disabled={hayCargandoBorrador || cargando}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:border-[#F97316]/50 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                🎯 Prepararme para visita
              </button>
            </div>
          </div>
        )}

        {ficha && decisores.length === 0 && (
          <p className="text-xs text-muted-foreground px-1">
            Agrega decisores en la pestaña Decisores para generar borradores personalizados.
          </p>
        )}
      </div>

      {/* Área de mensajes */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {cargandoHistorial ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : feed.length === 0 ? (
          <EstadoVacio empresaNombre={empresaNombre} onPregunta={enviar} />
        ) : (
          feed.map((entry) =>
            entry.kind === "texto" ? (
              <ParMensajes
                key={entry.key}
                item={entry.chat}
                cargando={!entry.chat.respuesta && cargando}
                onEliminar={() => {
                  setHistorial((prev) => prev.filter((m) => m.id !== entry.chat.id));
                  void fetch(`/api/chat-mensaje/${entry.chat.id}`, { method: "DELETE" });
                }}
              />
            ) : (
              <TarjetaBorrador
                key={entry.key}
                item={entry.item}
                empresaId={empresaId}
                onReintentar={() => void handleReintentar(entry.item)}
                onRegenerar={() => void handleRegenerar(entry.item)}
                onMarcarUsado={() => void handleMarcarUsado(entry.item)}
              />
            )
          )
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2 items-end border border-border rounded-2xl p-2 bg-background focus-within:border-primary transition-colors">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Pregúntame sobre ${empresaNombre}...`}
          rows={1}
          disabled={cargando}
          className={cn(
            "flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground",
            "focus:outline-none leading-relaxed max-h-32 overflow-y-auto py-1 px-2",
            "disabled:opacity-50"
          )}
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <Button
          size="sm"
          onClick={() => enviar()}
          disabled={!input.trim() || cargando}
          className="rounded-xl h-8 w-8 p-0 shrink-0"
        >
          {cargando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground text-center mt-1.5">
        Enter para enviar · Shift+Enter para nueva línea
      </p>
    </div>
  );
}

// ── Tarjeta de borrador dentro del feed ────────────────────────

function TarjetaBorrador({
  item,
  empresaId,
  onReintentar,
  onRegenerar,
  onMarcarUsado,
}: {
  item: BorradorFeedItem;
  empresaId: string;
  onReintentar: () => void;
  onRegenerar: () => void;
  onMarcarUsado: () => void;
}) {
  const { decisor, canal } = item;

  return (
    <div className="flex items-start gap-2.5">
      <div className="h-7 w-7 rounded-full bg-[#F97316]/15 flex items-center justify-center shrink-0">
        {CANAL_META[canal].icon}
      </div>
      <div className="max-w-[92%] w-full">
        <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold text-muted-foreground">
              {CANAL_META[canal].label} · {decisor.cargo}
            </p>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap", TIPO_BADGE[decisor.tipo])}>
              {TIPO_TITULO[decisor.tipo]}
            </span>
          </div>

          {item.estado === "cargando" ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-[#F97316]" />
              <span>{canal === "llamada" ? "Preparando pitch telefónico..." : "Redactando con técnica SPIN..."}</span>
            </div>
          ) : item.estado === "bloqueado" && item.erroBloqueado ? (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/10 dark:border-amber-800/30">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1.5">
                  Datos insuficientes para generar un borrador confiable
                </p>
                {item.erroBloqueado.campos_faltantes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {item.erroBloqueado.campos_faltantes.map((campo) => (
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
                  {item.erroBloqueado.accion_recomendada}
                </p>
                <button
                  onClick={onReintentar}
                  className="text-xs text-amber-700 dark:text-amber-400 underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity"
                >
                  Reintentar (si ya ejecutaste Investigar)
                </button>
              </div>
            </div>
          ) : item.estado === "error" ? (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-destructive leading-relaxed">{item.error}</p>
                <button
                  onClick={onReintentar}
                  className="text-xs text-[#F97316] mt-1.5 underline underline-offset-2"
                >
                  Reintentar
                </button>
              </div>
            </div>
          ) : item.estado === "listo" && item.borrador ? (
            <div>
              <BorradorContent
                borrador={item.borrador}
                decisor={decisor}
                empresaId={empresaId}
                borradorId={item.borradorId ?? null}
                onRegenerar={onRegenerar}
              />
              {item.advertencias?.map((adv, i) => (
                <div
                  key={i}
                  className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-lg px-2.5 py-1.5 border border-amber-200 dark:border-amber-700/30"
                >
                  <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{adv}</span>
                </div>
              ))}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <p className="text-[10px] text-muted-foreground shrink-0">
                  Generado el {formatFecha(item.creado_en)}
                </p>
                <div className="flex items-center gap-2 ml-auto">
                  {item.borradorId && (
                    <button
                      onClick={onMarcarUsado}
                      disabled={item.marcando}
                      className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors disabled:opacity-50"
                    >
                      {item.marcando ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCheck className="h-3 w-3" />
                      )}
                      Marcar usado y generar nuevo
                    </button>
                  )}
                  <button
                    onClick={onRegenerar}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-[#F97316] transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Generar nuevo
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 pr-1">{fechaHora(item.creado_en)}</p>
      </div>
    </div>
  );
}

// ── Contenido del borrador (texto/correo) — trasladado tal cual ─

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
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Para:</span>
        <span className="font-medium text-foreground">
          {decisor.nombre ? `${decisor.nombre} · ${decisor.cargo}` : decisor.cargo}
        </span>
      </div>

      {borrador.canal === "correo" && (
        <div className="mb-2 flex items-start gap-2 px-2.5 py-2 rounded-lg bg-muted/60 border border-border">
          <span className="text-xs font-semibold text-muted-foreground shrink-0">Asunto:</span>
          <span className="text-xs font-medium leading-snug">{borrador.asunto}</span>
        </div>
      )}

      <div className="bg-muted/50 rounded-xl p-3 mb-3">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {borrador.canal === "correo" ? borrador.cuerpo : borrador.texto}
        </p>
      </div>

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

// ── Pitch de llamada con secciones — trasladado tal cual ───────

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
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Phone className="h-3 w-3" />
        <span>Llamar a:</span>
        <span className="font-medium text-foreground">
          {decisor.nombre ? `${decisor.nombre} · ${decisor.cargo}` : decisor.cargo}
        </span>
      </div>

      {PITCH_SECCIONES.map((sec) => (
        <div key={sec.key} className={`rounded-xl border p-3 ${sec.color}`}>
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

      <CopiarBoton texto={textoCompleto} label="Copiar pitch completo" className="w-full mt-1" />

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

// ── Feedback de borrador — trasladado tal cual ─────────────────

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
        if (borradorId) {
          const patchBody: Record<string, unknown> = { usado: true };
          if (motivoRechazo.trim()) patchBody.feedback_rechazo = motivoRechazo.trim();
          await fetch(`/api/borradores/${borradorId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchBody),
          });
        }
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

// ── Utilidades copiables — trasladadas tal cual ────────────────

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
    <Button variant="outline" size="sm" className={`gap-1.5 ${className ?? ""}`} onClick={copiar}>
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

// ── Par pregunta / respuesta de texto libre — sin cambios ──────

function ParMensajes({
  item,
  cargando,
  onEliminar,
}: {
  item: ChatEmpresa;
  cargando: boolean;
  onEliminar: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2.5 flex-row-reverse">
        <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <User className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="max-w-[82%]">
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm leading-relaxed">
            {item.pregunta}
          </div>
          <p className="text-[10px] text-muted-foreground text-right mt-0.5 pr-1">
            {fechaHora(item.creado_en)}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="max-w-[82%] relative group">
          {cargando || !item.respuesta ? (
            <div className="bg-muted rounded-2xl rounded-tl-sm px-3.5 py-3 space-y-1.5">
              <div className="h-3 bg-muted-foreground/20 rounded-full animate-pulse w-3/4" />
              <div className="h-3 bg-muted-foreground/20 rounded-full animate-pulse w-1/2" />
              <div className="h-3 bg-muted-foreground/20 rounded-full animate-pulse w-2/3" />
            </div>
          ) : (
            <>
              <button
                onClick={onEliminar}
                className="absolute -top-2 -right-2 z-10 h-5 w-5 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/40 text-muted-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Eliminar mensaje"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="bg-muted text-foreground rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1">{children}</p>,
                    h2: ({ children }) => <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1">{children}</p>,
                    h3: ({ children }) => <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-2 mb-1">{children}</p>,
                    hr: () => null,
                    table: ({ children }) => <table className="text-xs w-full border-collapse my-2">{children}</table>,
                    th: ({ children }) => <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs font-semibold bg-gray-50 dark:bg-gray-800 text-left">{children}</th>,
                    td: ({ children }) => <td className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs">{children}</td>,
                    p: ({ children }) => <p className="my-1">{children}</p>,
                    ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
                    ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
                    li: ({ children }) => <li className="text-sm">{children}</li>,
                  }}
                >{item.respuesta}</ReactMarkdown>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Estado vacío con preguntas rápidas de texto libre ──────────

function EstadoVacio({
  empresaNombre,
  onPregunta,
}: {
  empresaNombre: string;
  onPregunta: (p: string) => void;
}) {
  return (
    <div className="flex flex-col items-center py-6 gap-5">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Bot className="h-7 w-7 text-primary" />
      </div>
      <div className="text-center space-y-1 px-4">
        <p className="font-semibold text-sm">Consulta sobre {empresaNombre}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Tengo el contexto completo de esta cuenta. El historial queda guardado.
        </p>
      </div>
      <div className="w-full space-y-2 px-1">
        <p className="text-xs font-medium text-muted-foreground px-1">Preguntas frecuentes:</p>
        {PREGUNTAS_RAPIDAS.map((p) => (
          <button
            key={p}
            onClick={() => onPregunta(p)}
            className="w-full text-left text-xs px-3.5 py-2.5 rounded-xl border border-border
              hover:border-primary/40 hover:bg-primary/5 transition-all active:scale-[0.98]"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
