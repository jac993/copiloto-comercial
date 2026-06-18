"use client";

// =============================================================
// Tab Historial — timeline visual tipo WhatsApp con badge de
// diagnóstico por interacción. Incluye panel "Nueva interacción"
// y análisis completo de la conversación.
// =============================================================

import { useState, useEffect, useRef } from "react";
import {
  Phone, Mail, MessageCircle, Briefcase, PhoneOff, Users,
  Trash2, ChevronDown, ChevronUp, Loader2, Plus, Zap,
  TrendingUp, Minus, Brain, AlertCircle, Clock,
  CheckCircle2, XCircle, AlertTriangle, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NuevaInteraccionSheet } from "@/components/cuentas/nueva-interaccion-sheet";
import type { Interaccion, BadgeEstado, AnalisisConversacion, CorreoDetectado, Contacto, TipoInteraccion, SentimientoInteraccion } from "@/lib/types";

// ── Configuración visual de badges ───────────────────────────

interface BadgeConf {
  label: string;
  dot: string;        // color del punto en el timeline
  bg: string;         // fondo del badge
  text: string;       // color del texto
  Icon: React.ElementType;
}

const BADGE_CONF: Record<BadgeEstado, BadgeConf> = {
  avanzando:    { label: "Avanzando",       dot: "#22C55E", bg: "bg-green-100 dark:bg-green-900/20",   text: "text-green-700 dark:text-green-400",   Icon: TrendingUp },
  neutral:      { label: "Neutral",         dot: "#F59E0B", bg: "bg-amber-100 dark:bg-amber-900/20",   text: "text-amber-700 dark:text-amber-400",   Icon: Minus },
  evaluando:    { label: "Evaluando",       dot: "#3B82F6", bg: "bg-blue-100 dark:bg-blue-900/20",     text: "text-blue-700 dark:text-blue-400",     Icon: Brain },
  resistente:   { label: "Resistente",      dot: "#F97316", bg: "bg-orange-100 dark:bg-orange-900/20", text: "text-orange-700 dark:text-orange-400", Icon: AlertTriangle },
  senal_cierre: { label: "Señal de cierre", dot: "#DC2626", bg: "bg-red-100 dark:bg-red-900/20",       text: "text-red-600 dark:text-red-400",       Icon: CheckCircle2 },
  sin_respuesta:{ label: "Sin respuesta",   dot: "#6B7280", bg: "bg-gray-100 dark:bg-gray-800",        text: "text-gray-500 dark:text-gray-400",     Icon: Clock },
  rechazado:    { label: "Rechazado",       dot: "#7F1D1D", bg: "bg-red-200 dark:bg-red-950/40",       text: "text-red-900 dark:text-red-300",       Icon: XCircle },
};

const DEFAULT_DOT = "#A78BFA";

// ── Badge de resultado (sentimiento manual) ───────────────────

const SENTIMIENTO_BADGE: Record<string, { label: string; className: string }> = {
  positivo: { label: "Positivo", className: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400" },
  neutro:   { label: "Neutro",   className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  negativo: { label: "Negativo", className: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400" },
};

// ── Icono por tipo ────────────────────────────────────────────

const TIPO_CONF: Record<string, { emoji: string; Icon: React.ElementType; label: string }> = {
  llamada:      { emoji: "📞", Icon: Phone,         label: "Llamada" },
  email:        { emoji: "📧", Icon: Mail,          label: "Correo" },
  whatsapp:     { emoji: "💬", Icon: MessageCircle, label: "WhatsApp" },
  linkedin:     { emoji: "💼", Icon: Briefcase,     label: "LinkedIn" },
  reunion:      { emoji: "🤝", Icon: Users,         label: "Reunión" },
  sin_respuesta:{ emoji: "⏰", Icon: PhoneOff,      label: "Sin respuesta" },
};

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Countdown 48h ─────────────────────────────────────────────

const TIPOS_COUNTDOWN: TipoInteraccion[] = ["whatsapp", "email", "linkedin"];

type EstadoCountdown = "verde" | "amarillo" | "naranja" | "vencida";

function calcCountdown(fechaIso: string, now: number): { estado: EstadoCountdown; texto: string } | null {
  const ms = now - new Date(fechaIso).getTime();
  const limite = 48 * 60 * 60 * 1000;
  const restante = limite - ms;

  if (ms < 0) return null; // fecha en el futuro
  if (restante > 8 * 60 * 60 * 1000) {
    // más de 8h hasta vencer — amarillo
    const h = Math.floor(restante / (60 * 60 * 1000));
    return { estado: "amarillo", texto: `${h}h para responder` };
  }
  if (restante > 0) {
    // menos de 8h — naranja parpadeante
    const h = Math.floor(restante / (60 * 60 * 1000));
    const m = Math.floor((restante % (60 * 60 * 1000)) / (60 * 1000));
    return { estado: "naranja", texto: `${h}h ${m}m restante` };
  }
  return { estado: "vencida", texto: "⚠️ Sin respuesta" };
}

const COUNTDOWN_STYLE: Record<EstadoCountdown, string> = {
  verde:   "",
  amarillo: "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  naranja:  "bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 animate-pulse",
  vencida:  "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400",
};

// ── Props ─────────────────────────────────────────────────────

interface TabHistorialProps {
  interacciones: Interaccion[];
  empresaId: string;
  contactos: Contacto[];
}

// ── Componente principal ──────────────────────────────────────

export function TabHistorial({ interacciones: inicial, empresaId, contactos }: TabHistorialProps) {
  const [lista, setLista] = useState<Interaccion[]>(inicial);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [analizandoId, setAnalizandoId] = useState<string | null>(null);
  const [sheetAbierto, setSheetAbierto] = useState(false);
  const [analizandoTodo, setAnalizandoTodo] = useState(false);
  const [analisisTodo, setAnalisisTodo] = useState<AnalisisConversacion | null>(null);
  const [errorTodo, setErrorTodo] = useState<string | null>(null);
  const [correos, setCorreos] = useState<CorreoDetectado[]>([]);
  const [editando, setEditando] = useState<Interaccion | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  // Actualiza "ahora" cada minuto para refrescar los countdowns
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch(`/api/correos/${empresaId}`)
      .then((r) => r.json())
      .then((d) => setCorreos(d.correos ?? []))
      .catch(() => {/* silencioso */});
  }, [empresaId]);

  // ── Eliminar ────────────────────────────────────────────────
  async function eliminar() {
    if (!confirmandoId) return;
    setEliminandoId(confirmandoId);
    setConfirmandoId(null);
    try {
      await fetch(`/api/interacciones/${confirmandoId}`, { method: "DELETE" });
      setLista((prev) => prev.filter((i) => i.id !== confirmandoId));
    } finally {
      setEliminandoId(null);
    }
  }

  // ── Analizar interacción existente ───────────────────────────
  async function analizarExistente(id: string) {
    setAnalizandoId(id);
    try {
      const res = await fetch(`/api/interacciones/${id}/analizar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLista((prev) => prev.map((i) => i.id === id ? data.interaccion : i));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al analizar");
    } finally {
      setAnalizandoId(null);
    }
  }

  // ── Analizar toda la conversación ────────────────────────────
  async function analizarTodo() {
    setAnalizandoTodo(true);
    setErrorTodo(null);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/analizar-todo`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnalisisTodo(data.analisis);
    } catch (e) {
      setErrorTodo(e instanceof Error ? e.message : "Error al analizar");
    } finally {
      setAnalizandoTodo(false);
    }
  }

  // ── Guardar edición ─────────────────────────────────────────
  async function guardarEdicion(
    id: string,
    campos: { tipo: TipoInteraccion; contacto_id: string | null; fecha: string; texto: string; sentimiento: string }
  ) {
    const res = await fetch(`/api/interacciones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campos),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Error al guardar");
    setLista((prev) => prev.map((i) => i.id === id ? { ...i, ...data.interaccion } : i));
    setEditando(null);
  }

  // ── Resolver vencida desde la tarjeta ───────────────────────
  async function resolverVencida(
    interaccion: Interaccion,
    resumen: string,
    sentimiento: SentimientoInteraccion
  ) {
    await fetch("/api/interacciones/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empresa_id: interaccion.empresa_id,
        tipo: interaccion.tipo,
        contacto_id: interaccion.contacto_id ?? undefined,
        texto: resumen,
        sentimiento,
        fecha: new Date().toISOString(),
      }),
    });
    setResolvedIds((prev) => new Set(Array.from(prev).concat(interaccion.id)));
  }

  // ── Nueva interacción guardada ───────────────────────────────
  function handleCreada(nueva: Interaccion) {
    setLista((prev) => [nueva, ...prev]);
  }

  return (
    <div className="space-y-3 pb-28">

      {/* Banner correos detectados */}
      {correos.length > 0 && (
        <div className="bg-[#FFFBEB] border border-amber-200 rounded-xl p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            {correos.length} correo{correos.length > 1 ? "s" : ""} detectado{correos.length > 1 ? "s" : ""} en Gmail
          </p>
          {correos.slice(0, 2).map((c) => (
            <p key={c.id} className="text-xs text-amber-800 pl-5 truncate">
              <span className="font-medium">{c.asunto ?? "(sin asunto)"}</span>
              {c.snippet && <span className="text-amber-600"> — {c.snippet.slice(0, 70)}</span>}
            </p>
          ))}
          {correos.length > 2 && <p className="text-xs text-amber-600 pl-5">+{correos.length - 2} más</p>}
        </div>
      )}

      {/* Header con botón de análisis completo */}
      <div className="flex items-center justify-between px-0.5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Historial
        </p>
        {lista.length >= 2 && (
          <button
            onClick={analizarTodo}
            disabled={analizandoTodo}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#7C3AED] hover:text-[#6D28D9] transition-colors disabled:opacity-50"
          >
            {analizandoTodo
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Zap className="w-3.5 h-3.5" />}
            Analizar conversación completa
          </button>
        )}
      </div>

      {/* Lista vacía */}
      {lista.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">Sin interacciones aún</p>
          <p className="text-xs text-muted-foreground">
            Toca el botón + para registrar la primera
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Línea vertical del timeline */}
        {lista.length > 0 && (
          <div className="absolute left-[11px] top-4 bottom-4 w-px bg-border" />
        )}

        <div className="space-y-4">
          {lista.map((interaccion) => (
            <EntradaTimeline
              key={interaccion.id}
              interaccion={interaccion}
              eliminando={eliminandoId === interaccion.id}
              analizando={analizandoId === interaccion.id}
              resolved={resolvedIds.has(interaccion.id)}
              now={now}
              onEliminar={() => setConfirmandoId(interaccion.id)}
              onAnalizar={() => analizarExistente(interaccion.id)}
              onEditar={() => setEditando(interaccion)}
              onResolver={(resumen, sent) => resolverVencida(interaccion, resumen, sent)}
            />
          ))}
        </div>
      </div>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={confirmandoId !== null} onOpenChange={(open) => { if (!open) setConfirmandoId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta interacción?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={eliminar}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal análisis completo */}
      <Dialog open={analisisTodo !== null || errorTodo !== null} onOpenChange={(open) => { if (!open) { setAnalisisTodo(null); setErrorTodo(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold">
              ⚡ Análisis de la conversación completa
            </DialogTitle>
          </DialogHeader>
          {errorTodo && (
            <div className="flex items-start gap-2 bg-destructive/10 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{errorTodo}</p>
            </div>
          )}
          {analisisTodo && <AnalisisTodoView analisis={analisisTodo} />}
        </DialogContent>
      </Dialog>

      {/* Modal de edición */}
      {editando && (
        <EditarInteraccionModal
          interaccion={editando}
          contactos={contactos}
          onCerrar={() => setEditando(null)}
          onGuardar={guardarEdicion}
        />
      )}

      {/* Panel nueva interacción */}
      <NuevaInteraccionSheet
        abierto={sheetAbierto}
        onCerrar={() => setSheetAbierto(false)}
        empresaId={empresaId}
        contactos={contactos}
        onCreada={handleCreada}
      />

      {/* FAB + Nueva interacción */}
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40">
        <Button
          size="lg"
          className="rounded-2xl shadow-xl shadow-primary/30 gap-2 pr-5 h-14"
          onClick={() => setSheetAbierto(true)}
        >
          <Plus className="h-5 w-5" />
          Nueva interacción
        </Button>
      </div>
    </div>
  );
}

// ── Entrada individual del timeline ──────────────────────────

function EntradaTimeline({
  interaccion,
  eliminando,
  analizando,
  resolved,
  now,
  onEliminar,
  onAnalizar,
  onEditar,
  onResolver,
}: {
  interaccion: Interaccion;
  eliminando: boolean;
  analizando: boolean;
  resolved: boolean;
  now: number;
  onEliminar: () => void;
  onAnalizar: () => void;
  onEditar: () => void;
  onResolver: (resumen: string, sent: SentimientoInteraccion) => Promise<void>;
}) {
  const [expandido, setExpandido] = useState(false);
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);

  const badgeConf = interaccion.badge_estado ? BADGE_CONF[interaccion.badge_estado] : null;
  const tipoConf = TIPO_CONF[interaccion.tipo] ?? TIPO_CONF.llamada;
  const dotColor = badgeConf?.dot ?? DEFAULT_DOT;

  // Parsear coaching_ia si existe
  let coaching: { coaching?: { bien?: string; mejorar?: string; oportunidad_perdida?: string }; borrador_respuesta?: string; lo_que_no_respondio?: string } | null = null;
  if (interaccion.coaching_ia) {
    try { coaching = JSON.parse(interaccion.coaching_ia); } catch { /* ignorar */ }
  }

  const analizado = !!interaccion.resumen_ia;
  const resumen = interaccion.resumen_ia ?? interaccion.transcripcion;
  const sentimientoConf = interaccion.sentimiento && interaccion.sentimiento !== "sin_respuesta"
    ? (SENTIMIENTO_BADGE[interaccion.sentimiento] ?? null)
    : null;

  // Countdown 48h para whatsapp/email/linkedin
  const countdown = !resolved && TIPOS_COUNTDOWN.includes(interaccion.tipo as TipoInteraccion)
    ? calcCountdown(interaccion.fecha, now)
    : null;
  const estaVencida = countdown?.estado === "vencida";

  async function handleResolver(resumen: string, sent: SentimientoInteraccion) {
    setResolviendoId(sent);
    try { await onResolver(resumen, sent); }
    finally { setResolviendoId(null); }
  }

  return (
    <div
      className={`relative pl-7 transition-opacity ${eliminando ? "opacity-40 pointer-events-none" : ""}`}
    >
      {/* Punto del timeline */}
      <div
        className="absolute left-0 top-3.5 w-5 h-5 rounded-full border-2 border-background flex items-center justify-center z-10"
        style={{ backgroundColor: dotColor }}
      />

      {/* Tarjeta */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-4 pt-3.5 pb-3">

          {/* Fila 1: tipo + badges */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {tipoConf.emoji} {tipoConf.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fechaCorta(interaccion.fecha)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              {/* Badge countdown */}
              {countdown && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COUNTDOWN_STYLE[countdown.estado]}`}>
                  {countdown.texto}
                </span>
              )}
              {/* Badge sentimiento manual */}
              {sentimientoConf && !estaVencida && (
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${sentimientoConf.className}`}>
                  {sentimientoConf.label}
                </span>
              )}
            </div>
          </div>

          {/* Resumen — resumen_ia o transcripcion como fallback, siempre truncado */}
          {resumen && (
            <p className="text-xs text-foreground/70 mt-2 line-clamp-2 leading-relaxed">
              {resumen}
            </p>
          )}

          {/* Badge de estado IA */}
          {badgeConf && (
            <div className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${badgeConf.bg} ${badgeConf.text}`}>
              <badgeConf.Icon className="w-3 h-3" />
              {badgeConf.label}
            </div>
          )}

          {/* Próximo paso */}
          {interaccion.proximo_paso && (
            <div className="mt-2 flex items-start gap-1.5 text-xs">
              <span className="text-primary font-medium shrink-0">→</span>
              <span className="text-foreground/80">{interaccion.proximo_paso}</span>
            </div>
          )}

          {/* Botones de resolución cuando está vencida */}
          {estaVencida && !resolved && (
            <div className="mt-3 pt-2.5 border-t border-border/50">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">¿Hubo respuesta?</p>
              <div className="flex gap-2">
                <button
                  disabled={!!resolviendoId}
                  onClick={() => handleResolver("Respondió al contacto", "positivo")}
                  className="flex-1 h-9 text-xs font-semibold rounded-xl bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400 transition-colors disabled:opacity-50"
                >
                  {resolviendoId === "positivo" ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "✅ Sí contestó"}
                </button>
                <button
                  disabled={!!resolviendoId}
                  onClick={() => handleResolver("Vio el mensaje pero no respondió", "negativo")}
                  className="flex-1 h-9 text-xs font-semibold rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400 transition-colors disabled:opacity-50"
                >
                  {resolviendoId === "negativo" ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "👁️ Lo vio"}
                </button>
                <button
                  disabled={!!resolviendoId}
                  onClick={() => handleResolver("Sin respuesta tras 48h", "negativo")}
                  className="flex-1 h-9 text-xs font-semibold rounded-xl bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-900/20 dark:border-gray-700 dark:text-gray-400 transition-colors disabled:opacity-50"
                >
                  {resolviendoId ? null : "❌ No contestó"}
                </button>
              </div>
            </div>
          )}

          {/* Fila de acciones: analizar/ver análisis + lápiz + eliminar */}
          <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between">
            {analizado ? (
              <button
                onClick={() => setExpandido(!expandido)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {expandido
                  ? <><ChevronUp className="w-3.5 h-3.5" /> Ocultar análisis</>
                  : <><ChevronDown className="w-3.5 h-3.5" /> Ver análisis</>
                }
              </button>
            ) : (
              <button
                onClick={onAnalizar}
                disabled={analizando}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#7C3AED] hover:text-[#6D28D9] transition-colors disabled:opacity-50"
              >
                {analizando
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Zap className="w-3.5 h-3.5" />
                }
                {analizando ? "Analizando…" : "⚡ Analizar ahora"}
              </button>
            )}
            <div className="flex items-center gap-1">
              <button
                onClick={onEditar}
                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
                aria-label="Editar"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
              <button
                onClick={onEliminar}
                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-destructive/10 transition-colors"
                aria-label="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive/60 hover:text-destructive" />
              </button>
            </div>
          </div>
        </div>

        {/* Sección expandida de coaching */}
        {expandido && coaching && (
          <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
            {coaching.coaching && (
              <>
                {coaching.coaching.bien && (
                  <div>
                    <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">✅ Qué hiciste bien</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">{coaching.coaching.bien}</p>
                  </div>
                )}
                {coaching.coaching.mejorar && (
                  <div>
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">🎯 Qué mejorar</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">{coaching.coaching.mejorar}</p>
                  </div>
                )}
                {coaching.coaching.oportunidad_perdida && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">💡 Oportunidad perdida</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">{coaching.coaching.oportunidad_perdida}</p>
                  </div>
                )}
              </>
            )}
            {coaching.lo_que_no_respondio && (
              <div>
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1">🔍 Lo que no respondió</p>
                <p className="text-xs text-foreground/80 leading-relaxed">{coaching.lo_que_no_respondio}</p>
              </div>
            )}
            {coaching.borrador_respuesta && (
              <div className="bg-[#F5F3FF] dark:bg-[#1E1B4B]/30 border border-violet-200 dark:border-violet-800/40 rounded-xl p-3">
                <p className="text-xs font-semibold text-[#7C3AED] mb-1.5">✉️ Borrador de respuesta</p>
                <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{coaching.borrador_respuesta}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal editar interacción ──────────────────────────────────

const TIPOS_EDITABLES: { value: TipoInteraccion; label: string; emoji: string }[] = [
  { value: "llamada",       label: "Llamada",       emoji: "📞" },
  { value: "reunion",       label: "Reunión",       emoji: "🤝" },
  { value: "whatsapp",      label: "WhatsApp",      emoji: "💬" },
  { value: "email",         label: "Correo",        emoji: "📧" },
  { value: "linkedin",      label: "LinkedIn",      emoji: "💼" },
  { value: "sin_respuesta", label: "Sin respuesta", emoji: "⏰" },
];

function EditarInteraccionModal({
  interaccion,
  contactos,
  onCerrar,
  onGuardar,
}: {
  interaccion: Interaccion;
  contactos: Contacto[];
  onCerrar: () => void;
  onGuardar: (id: string, campos: { tipo: TipoInteraccion; contacto_id: string | null; fecha: string; texto: string; sentimiento: string }) => Promise<void>;
}) {
  const [tipo, setTipo] = useState<TipoInteraccion>(interaccion.tipo as TipoInteraccion);
  const [contactoId, setContactoId] = useState<string>(interaccion.contacto_id ?? "");
  const [fecha, setFecha] = useState<string>(
    new Date(interaccion.fecha).toISOString().slice(0, 16)
  );
  const [texto, setTexto] = useState<string>(
    interaccion.transcripcion ?? ""
  );
  const [sentimiento, setSentimiento] = useState<string>(
    interaccion.sentimiento && interaccion.sentimiento !== "sin_respuesta"
      ? interaccion.sentimiento
      : ""
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(interaccion.id, {
        tipo,
        contacto_id: contactoId || null,
        fecha,
        texto,
        sentimiento,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCerrar(); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold">Editar interacción</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Canal */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Canal</p>
            <div className="flex flex-wrap gap-2">
              {TIPOS_EDITABLES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTipo(t.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    tipo === t.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contacto */}
          {contactos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Contacto</p>
              <select
                value={contactoId}
                onChange={(e) => setContactoId(e.target.value)}
                className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Sin contacto específico</option>
                {contactos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.cargo ? `· ${c.cargo}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Fecha */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Fecha y hora</p>
            <input
              type="datetime-local"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Resumen */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Resumen</p>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Resumen de la interacción..."
              rows={3}
              className="text-sm rounded-xl resize-none"
            />
          </div>

          {/* Resultado */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Resultado</p>
            <div className="flex gap-2">
              {(["positivo", "neutro", "negativo"] as const).map((s) => {
                const conf = {
                  positivo: { label: "Positivo", active: "bg-green-500 text-white border-green-500", idle: "border-green-200 text-green-700 hover:bg-green-50" },
                  neutro:   { label: "Neutro",   active: "bg-gray-500 text-white border-gray-500",  idle: "border-gray-200 text-gray-600 hover:bg-gray-50" },
                  negativo: { label: "Negativo", active: "bg-red-500 text-white border-red-500",    idle: "border-red-200 text-red-700 hover:bg-red-50" },
                }[s];
                return (
                  <button
                    key={s}
                    onClick={() => setSentimiento(sentimiento === s ? "" : s)}
                    className={`flex-1 h-9 rounded-xl text-xs font-semibold border transition-all ${
                      sentimiento === s ? conf.active : conf.idle
                    }`}
                  >
                    {conf.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button className="flex-1 rounded-xl" disabled={guardando} onClick={handleGuardar}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar cambios"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal análisis completo ───────────────────────────────────

function AnalisisTodoView({ analisis }: { analisis: AnalisisConversacion }) {
  const probConf: Record<string, { color: string; label: string }> = {
    alta:  { color: "text-green-600 bg-green-100",  label: "Alta" },
    media: { color: "text-amber-600 bg-amber-100",  label: "Media" },
    baja:  { color: "text-red-600 bg-red-100",      label: "Baja" },
  };
  const prob = probConf[analisis.probabilidad_cierre] ?? probConf.media;

  return (
    <div className="space-y-5">
      {/* Probabilidad */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">Probabilidad de cierre</p>
        <span className={`text-sm font-bold px-3 py-1 rounded-full ${prob.color}`}>
          {prob.label}
        </span>
      </div>

      {/* Evolución */}
      <section>
        <p className="text-xs font-extrabold text-[#7C3AED] uppercase tracking-wide mb-1.5">Evolución de la relación</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.evolucion}</p>
      </section>

      {/* Justificación probabilidad */}
      <section>
        <p className="text-xs font-extrabold text-[#7C3AED] uppercase tracking-wide mb-1.5">Justificación</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.justificacion_probabilidad}</p>
      </section>

      {/* Momentos clave */}
      {analisis.momentos_clave.length > 0 && (
        <section>
          <p className="text-xs font-extrabold text-[#7C3AED] uppercase tracking-wide mb-2">Momentos clave</p>
          <div className="space-y-2">
            {analisis.momentos_clave.map((m, i) => (
              <div key={i} className={`rounded-xl p-3 flex items-start gap-2.5 ${m.impacto === "positivo" ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`}>
                <span className="text-base shrink-0">{m.impacto === "positivo" ? "✅" : "⚠️"}</span>
                <div>
                  <p className="text-xs font-semibold">{m.fecha}</p>
                  <p className="text-xs text-foreground/80 mt-0.5">{m.descripcion}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Patrón del prospecto */}
      <section>
        <p className="text-xs font-extrabold text-[#7C3AED] uppercase tracking-wide mb-1.5">Patrón del prospecto</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.patron_prospecto}</p>
      </section>

      {/* Estado actual real */}
      <section>
        <p className="text-xs font-extrabold text-[#7C3AED] uppercase tracking-wide mb-1.5">Estado actual real</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.estado_actual_real}</p>
      </section>

      {/* Estrategia */}
      <section>
        <p className="text-xs font-extrabold text-[#7C3AED] uppercase tracking-wide mb-1.5">Estrategia recomendada</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.estrategia_recomendada}</p>
      </section>

      {/* Próximos 3 pasos */}
      <section>
        <p className="text-xs font-extrabold text-[#7C3AED] uppercase tracking-wide mb-2">Próximos 3 pasos</p>
        <div className="space-y-2">
          {analisis.proximos_3_pasos.map((paso, i) => (
            <div key={i} className="flex items-start gap-2.5 bg-[#F5F3FF] dark:bg-[#1E1B4B]/30 rounded-xl p-3">
              <span className="text-xs font-extrabold text-[#7C3AED] shrink-0 mt-0.5">{i + 1}</span>
              <p className="text-sm text-foreground/80">{paso}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
