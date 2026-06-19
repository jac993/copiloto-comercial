"use client";

// =============================================================
// Tab Historial — hilo tipo chat WhatsApp por cada interacción.
// Tarjeta colapsada: nombre contacto + canal + fecha + resumen.
// Tarjeta expandida: burbujas vendedor (derecha) y prospecto
// (izquierda), badge countdown, botones de resolución y análisis.
// Las respuestas del prospecto se vinculan via parent_id o se
// detectan por TEXTOS_RESOLUCION para datos anteriores.
// =============================================================

import { useState, useEffect, useMemo } from "react";
import {
  Phone, Mail, MessageCircle, Briefcase, PhoneOff, Users,
  Trash2, ChevronDown, Loader2, Plus, Zap,
  TrendingUp, Minus, Brain, AlertCircle, Clock,
  CheckCircle2, XCircle, AlertTriangle, MessageSquarePlus,
  User,
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
import type {
  Interaccion, BadgeEstado, AnalisisConversacion,
  CorreoDetectado, Contacto, TipoInteraccion, SentimientoInteraccion,
} from "@/lib/types";

// ── Configuración visual de badges ──────────────────────────

interface BadgeConf {
  label: string;
  dot: string;
  bg: string;
  text: string;
  Icon: React.ElementType;
}

const BADGE_CONF: Record<BadgeEstado, BadgeConf> = {
  avanzando:    { label: "Avanzando",       dot: "#22C55E", bg: "bg-green-100 dark:bg-green-900/20",   text: "text-green-700 dark:text-green-400",   Icon: TrendingUp },
  neutral:      { label: "Neutral",         dot: "#F59E0B", bg: "bg-amber-100 dark:bg-amber-900/20",   text: "text-amber-700 dark:text-amber-400",   Icon: Minus },
  evaluando:    { label: "Evaluando",       dot: "#3B82F6", bg: "bg-blue-100 dark:bg-blue-900/20",     text: "text-blue-700 dark:text-blue-400",     Icon: Brain },
  resistente:   { label: "Resistente",      dot: "#F97316", bg: "bg-orange-100 dark:bg-orange-900/20", text: "text-orange-700 dark:text-orange-400", Icon: AlertTriangle },
  senal_cierre: { label: "Señal de cierre", dot: "#22C55E", bg: "bg-green-100 dark:bg-green-900/20",   text: "text-green-700 dark:text-green-400",   Icon: CheckCircle2 },
  sin_respuesta:{ label: "Sin respuesta",   dot: "#6B7280", bg: "bg-gray-100 dark:bg-gray-800",        text: "text-gray-500 dark:text-gray-400",     Icon: Clock },
  rechazado:    { label: "Rechazado",       dot: "#7F1D1D", bg: "bg-red-200 dark:bg-red-950/40",       text: "text-red-900 dark:text-red-300",       Icon: XCircle },
};

const SENTIMIENTO_BADGE: Record<string, { label: string; className: string }> = {
  positivo: { label: "Positivo", className: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400" },
  neutro:   { label: "Neutro",   className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  negativo: { label: "Negativo", className: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400" },
};

// ── Icono y label por tipo ────────────────────────────────────

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
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ── Countdown 48h ─────────────────────────────────────────────

const TIPOS_COUNTDOWN: TipoInteraccion[] = ["whatsapp", "email", "linkedin"];

// Textos fijos que identifican una respuesta del prospecto guardada sin parent_id (datos legacy)
const TEXTOS_RESOLUCION = new Set([
  "Respondió al contacto",
  "Vio el mensaje pero no respondió",
  "Sin respuesta tras 48h",
]);

// Mapa de texto de resolución → sentimiento visual en burbuja
const RESOLUCION_LABEL: Record<string, { texto: string; positivo: boolean }> = {
  "Respondió al contacto":         { texto: "✅ Respondió", positivo: true },
  "Vio el mensaje pero no respondió": { texto: "👁️ Lo vio, no respondió", positivo: false },
  "Sin respuesta tras 48h":        { texto: "❌ Sin respuesta", positivo: false },
};

type EstadoCountdown = "amarillo" | "naranja" | "vencida";

function calcCountdown(fechaIso: string, now: number): { estado: EstadoCountdown; texto: string } | null {
  const ms = now - new Date(fechaIso).getTime();
  const limite = 48 * 60 * 60 * 1000;
  const restante = limite - ms;
  if (ms < 0) return null;
  if (restante > 8 * 60 * 60 * 1000) {
    const h = Math.floor(restante / (60 * 60 * 1000));
    return { estado: "amarillo", texto: `${h}h para responder` };
  }
  if (restante > 0) {
    const h = Math.floor(restante / (60 * 60 * 1000));
    const m = Math.floor((restante % (60 * 60 * 1000)) / (60 * 1000));
    return { estado: "naranja", texto: `${h}h ${m}m restante` };
  }
  return { estado: "vencida", texto: "⚠️ Sin respuesta" };
}

const COUNTDOWN_STYLE: Record<EstadoCountdown, string> = {
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

// ── Hilo de interacciones (parent + children agrupados) ───────

interface Hilo {
  parent: Interaccion;
  respuestas: Interaccion[]; // hijas directas (parent_id) + legacy (TEXTOS_RESOLUCION)
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
  const [now, setNow] = useState(() => Date.now());

  // Agrupa interacciones en hilos: las hijas (por parent_id o texto legacy) se
  // anidan dentro de su padre. Las demás aparecen como hilos independientes.
  const hilos = useMemo((): Hilo[] => {
    // IDs que son hijas por parent_id
    const hijasConParent = new Set(
      lista.filter((i) => i.parent_id != null).map((i) => i.id)
    );
    // IDs legacy: misma estrategia de detección de resolución anterior
    const legacyHijas = new Set<string>();
    for (const i of lista) {
      if (!TEXTOS_RESOLUCION.has(i.transcripcion ?? "")) continue;
      if (i.parent_id != null) continue; // ya tiene parent, no legacy
      legacyHijas.add(i.id);
    }

    const esHija = (i: Interaccion) =>
      hijasConParent.has(i.id) || legacyHijas.has(i.id);

    // Padres = interacciones que no son hijas, ordenados desc por fecha
    const padres = lista
      .filter((i) => !esHija(i))
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    return padres.map((padre) => {
      // Hijas con parent_id explícito
      const hijasDirectas = lista
        .filter((i) => i.parent_id === padre.id)
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

      // Hijas legacy: misma detection anterior (mismo tipo + texto resolución + fecha posterior)
      const hijasLegacy = lista
        .filter(
          (i) =>
            legacyHijas.has(i.id) &&
            i.tipo === padre.tipo &&
            new Date(i.fecha).getTime() > new Date(padre.fecha).getTime()
        )
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

      // Unir evitando duplicados (si alguien tiene parent_id Y texto resolución)
      const idsDirectas = new Set(hijasDirectas.map((h) => h.id));
      const respuestas = [
        ...hijasDirectas,
        ...hijasLegacy.filter((h) => !idsDirectas.has(h.id)),
      ];

      return { parent: padre, respuestas };
    });
  }, [lista]);

  // resolvedIds: hilos que ya tienen al menos una respuesta
  const resolvedIds = useMemo(() => {
    const r = new Set<string>();
    for (const hilo of hilos) {
      if (hilo.respuestas.length > 0) r.add(hilo.parent.id);
    }
    return r;
  }, [hilos]);

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

  // ── Agregar respuesta del prospecto (crea hija con parent_id) ─
  async function agregarRespuesta(
    padre: Interaccion,
    texto: string,
    sentimiento: SentimientoInteraccion
  ) {
    const res = await fetch("/api/interacciones/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empresa_id: padre.empresa_id,
        tipo: padre.tipo,
        contacto_id: padre.contacto_id ?? undefined,
        parent_id: padre.id,
        texto,
        sentimiento,
        fecha: new Date().toISOString(),
      }),
    });
    const data = await res.json() as { ok: boolean; interaccion?: Interaccion; error?: string };
    if (!data.ok) throw new Error(data.error ?? "Error al registrar respuesta");
    if (data.interaccion) setLista((prev) => [data.interaccion!, ...prev]);
  }

  function handleCreada(nueva: Interaccion) {
    setLista((prev) => [nueva, ...prev]);
  }

  // Número de hilos "raíz" (excluye hijas) para el botón "Analizar todo"
  const hilosRaiz = hilos.length;

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
        {hilosRaiz >= 2 && (
          <button
            onClick={analizarTodo}
            disabled={analizandoTodo}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#7C3AED] hover:text-[#6D28D9] transition-colors disabled:opacity-50"
          >
            {analizandoTodo
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Zap className="w-3.5 h-3.5" />}
            ⚡ Analizar conversación
          </button>
        )}
      </div>

      {/* Lista vacía */}
      {hilos.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">Sin interacciones aún</p>
          <p className="text-xs text-muted-foreground">Toca el botón + para registrar la primera</p>
        </div>
      )}

      {/* Hilos */}
      <div className="space-y-3">
        {hilos.map((hilo) => (
          <TarjetaHilo
            key={hilo.parent.id}
            hilo={hilo}
            contactos={contactos}
            eliminando={eliminandoId === hilo.parent.id}
            analizando={analizandoId === hilo.parent.id}
            resolved={resolvedIds.has(hilo.parent.id)}
            now={now}
            onEliminar={() => setConfirmandoId(hilo.parent.id)}
            onAnalizar={() => analizarExistente(hilo.parent.id)}
            onAgregarRespuesta={(texto, sent) => agregarRespuesta(hilo.parent, texto, sent)}
          />
        ))}
      </div>

      {/* Dialog confirmación eliminación */}
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
      <Dialog
        open={analisisTodo !== null || errorTodo !== null}
        onOpenChange={(open) => { if (!open) { setAnalisisTodo(null); setErrorTodo(null); } }}
      >
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

// ── Tarjeta individual (hilo padre + respuestas) ──────────────

function TarjetaHilo({
  hilo,
  contactos,
  eliminando,
  analizando,
  resolved,
  now,
  onEliminar,
  onAnalizar,
  onAgregarRespuesta,
}: {
  hilo: Hilo;
  contactos: Contacto[];
  eliminando: boolean;
  analizando: boolean;
  resolved: boolean;
  now: number;
  onEliminar: () => void;
  onAnalizar: () => void;
  onAgregarRespuesta: (texto: string, sent: SentimientoInteraccion) => Promise<void>;
}) {
  const { parent, respuestas } = hilo;
  const [expandido, setExpandido] = useState(false);
  const [mostrarFormRespuesta, setMostrarFormRespuesta] = useState(false);
  const [textoRespuesta, setTextoRespuesta] = useState("");
  const [sentimientoRespuesta, setSentimientoRespuesta] = useState<SentimientoInteraccion | "">("");
  const [guardandoRespuesta, setGuardandoRespuesta] = useState(false);
  const [errorRespuesta, setErrorRespuesta] = useState<string | null>(null);
  const [resolviendoId, setResolviendoId] = useState<SentimientoInteraccion | null>(null);
  const [mostrarCoaching, setMostrarCoaching] = useState(false);

  const tipoConf = TIPO_CONF[parent.tipo] ?? TIPO_CONF.llamada;
  const badgeConf = parent.badge_estado ? BADGE_CONF[parent.badge_estado] : null;
  const sentimientoConf = parent.sentimiento && parent.sentimiento !== "sin_respuesta"
    ? (SENTIMIENTO_BADGE[parent.sentimiento] ?? null)
    : null;

  // Contacto asociado
  const contacto = contactos.find((c) => c.id === parent.contacto_id);

  // Contenido del mensaje del vendedor
  const mensajeVendedor = parent.resumen_ia ?? parent.transcripcion ?? null;

  // Countdown (solo para canales de espera, sin resolución)
  const countdown =
    !resolved &&
    TIPOS_COUNTDOWN.includes(parent.tipo as TipoInteraccion)
      ? calcCountdown(parent.fecha, now)
      : null;
  const estaVencida = countdown?.estado === "vencida";

  // Parsear coaching_ia
  let coaching: {
    coaching?: { bien?: string; mejorar?: string; oportunidad_perdida?: string };
    borrador_respuesta?: string;
    lo_que_no_respondio?: string;
  } | null = null;
  if (parent.coaching_ia) {
    try { coaching = JSON.parse(parent.coaching_ia); } catch { /* ignorar */ }
  }

  async function handleResolverVencida(resumen: string, sent: SentimientoInteraccion) {
    setResolviendoId(sent);
    try {
      await onAgregarRespuesta(resumen, sent);
    } finally {
      setResolviendoId(null);
    }
  }

  async function handleGuardarRespuesta() {
    if (!textoRespuesta.trim()) {
      setErrorRespuesta("Escribe la respuesta antes de guardar.");
      return;
    }
    setGuardandoRespuesta(true);
    setErrorRespuesta(null);
    try {
      await onAgregarRespuesta(textoRespuesta.trim(), (sentimientoRespuesta || "neutro") as SentimientoInteraccion);
      setTextoRespuesta("");
      setSentimientoRespuesta("");
      setMostrarFormRespuesta(false);
    } catch (e) {
      setErrorRespuesta(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardandoRespuesta(false);
    }
  }

  return (
    <div className={`rounded-2xl border border-border bg-card shadow-sm overflow-hidden transition-opacity ${eliminando ? "opacity-40 pointer-events-none" : ""}`}>

      {/* ── Encabezado (siempre visible, tappable para expandir) ── */}
      <button
        onClick={() => setExpandido(!expandido)}
        className="w-full text-left px-4 pt-3.5 pb-3 flex items-start gap-3 hover:bg-muted/30 transition-colors active:bg-muted/50"
      >
        {/* Avatar / ícono canal */}
        <div className="w-9 h-9 rounded-full bg-[#EDE9FE] dark:bg-[#1E1B4B]/50 flex items-center justify-center shrink-0 mt-0.5">
          <tipoConf.Icon className="w-4 h-4 text-[#7C3AED]" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Fila: nombre + canal + eliminar */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {contacto ? (
                <span className="text-sm font-semibold text-foreground truncate">{contacto.nombre}</span>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">Sin contacto</span>
              )}
              <span className="text-muted-foreground/50 text-xs shrink-0">·</span>
              <span className="text-xs text-muted-foreground shrink-0">{tipoConf.emoji} {tipoConf.label}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={onEliminar}
                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-destructive/10 transition-colors"
                aria-label="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive/50 hover:text-destructive" />
              </button>
            </div>
          </div>

          {/* Fecha */}
          <p className="text-xs text-muted-foreground mt-0.5">{fechaCorta(parent.fecha)}</p>

          {/* Resumen colapsado + badges */}
          {!expandido && (
            <>
              {mensajeVendedor && (
                <p className="text-xs text-foreground/70 mt-1.5 line-clamp-2 leading-relaxed">
                  {mensajeVendedor}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {countdown && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COUNTDOWN_STYLE[countdown.estado]}`}>
                    {countdown.texto}
                  </span>
                )}
                {sentimientoConf && !estaVencida && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sentimientoConf.className}`}>
                    {sentimientoConf.label}
                  </span>
                )}
                {badgeConf && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${badgeConf.bg} ${badgeConf.text}`}>
                    <badgeConf.Icon className="w-3 h-3" />
                    {badgeConf.label}
                  </span>
                )}
                {respuestas.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {respuestas.length} respuesta{respuestas.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform ${expandido ? "rotate-180" : ""}`}
        />
      </button>

      {/* ── Hilo expandido ────────────────────────────────────── */}
      {expandido && (
        <div className="border-t border-border">

          {/* Área de burbujas */}
          <div className="px-4 py-4 space-y-3 bg-[#F8F7FF] dark:bg-[#0F0A1E]/30">

            {/* Burbuja del vendedor (derecha) */}
            {mensajeVendedor && (
              <div className="flex justify-end">
                <div className="max-w-[82%] bg-[#7C3AED] text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 shadow-sm">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{mensajeVendedor}</p>
                  <p className="text-[10px] text-white/60 text-right mt-1">{fechaCorta(parent.fecha)} ✓✓</p>
                </div>
              </div>
            )}

            {/* Sin mensaje propio */}
            {!mensajeVendedor && (
              <div className="flex justify-end">
                <div className="max-w-[82%] bg-[#7C3AED]/80 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 shadow-sm">
                  <p className="text-sm italic text-white/80">
                    {parent.tipo === "llamada" ? "Llamada registrada" : "Interacción registrada"}
                  </p>
                  <p className="text-[10px] text-white/60 text-right mt-1">{fechaCorta(parent.fecha)}</p>
                </div>
              </div>
            )}

            {/* Burbujas de respuestas del prospecto (izquierda) */}
            {respuestas.map((resp) => {
              const resolucionInfo = RESOLUCION_LABEL[resp.transcripcion ?? ""];
              const textoMostrar = resolucionInfo?.texto ?? resp.resumen_ia ?? resp.transcripcion ?? "Respuesta registrada";
              const esPositiva = resolucionInfo
                ? resolucionInfo.positivo
                : resp.sentimiento === "positivo";

              return (
                <div key={resp.id} className="flex justify-start items-end gap-2">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div
                    className={`max-w-[82%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm ${
                      esPositiva
                        ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/40"
                        : "bg-card border border-border"
                    }`}
                  >
                    <p className="text-sm text-foreground leading-relaxed">{textoMostrar}</p>
                    <p className="text-[10px] text-muted-foreground text-right mt-1">
                      {fechaCorta(resp.fecha)}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* Badge countdown (dentro del hilo, antes de los botones) */}
            {countdown && (
              <div className="flex justify-center">
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${COUNTDOWN_STYLE[countdown.estado]}`}>
                  {countdown.texto}
                </span>
              </div>
            )}

            {/* Botones "¿Hubo respuesta?" cuando está vencida */}
            {estaVencida && !resolved && (
              <div className="pt-1">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2 text-center">
                  ¿Hubo respuesta?
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={!!resolviendoId}
                    onClick={() => handleResolverVencida("Respondió al contacto", "positivo")}
                    className="flex-1 h-9 text-xs font-semibold rounded-xl bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400 transition-colors disabled:opacity-50"
                  >
                    {resolviendoId === "positivo" ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "✅ Sí contestó"}
                  </button>
                  <button
                    disabled={!!resolviendoId}
                    onClick={() => handleResolverVencida("Vio el mensaje pero no respondió", "negativo")}
                    className="flex-1 h-9 text-xs font-semibold rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400 transition-colors disabled:opacity-50"
                  >
                    {resolviendoId === "negativo" ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "👁️ Lo vio"}
                  </button>
                  <button
                    disabled={!!resolviendoId}
                    onClick={() => handleResolverVencida("Sin respuesta tras 48h", "negativo")}
                    className="flex-1 h-9 text-xs font-semibold rounded-xl bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-900/20 dark:border-gray-700 dark:text-gray-400 transition-colors disabled:opacity-50"
                  >
                    {resolviendoId ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "❌ No contestó"}
                  </button>
                </div>
              </div>
            )}

            {/* "+ Agregar respuesta" inline — si no hay respuestas y no está vencida */}
            {!estaVencida && !resolved && TIPOS_COUNTDOWN.includes(parent.tipo as TipoInteraccion) && (
              !mostrarFormRespuesta ? (
                <button
                  onClick={() => setMostrarFormRespuesta(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#7C3AED] hover:text-[#6D28D9] transition-colors"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  + Agregar respuesta
                </button>
              ) : (
                <div className="space-y-2 pt-1">
                  <Textarea
                    autoFocus
                    value={textoRespuesta}
                    onChange={(e) => setTextoRespuesta(e.target.value)}
                    placeholder="¿Qué respondió el prospecto?"
                    rows={3}
                    className="text-sm rounded-xl resize-none bg-card"
                  />
                  {/* Resultado de la respuesta */}
                  <div className="flex gap-2">
                    {(["positivo", "neutro", "negativo"] as const).map((s) => {
                      const conf = {
                        positivo: { label: "👍 Positivo", active: "bg-green-100 border-green-400 text-green-700", idle: "border-border text-muted-foreground" },
                        neutro:   { label: "😐 Neutro",   active: "bg-amber-100 border-amber-400 text-amber-700", idle: "border-border text-muted-foreground" },
                        negativo: { label: "👎 Negativo", active: "bg-red-100 border-red-400 text-red-700",       idle: "border-border text-muted-foreground" },
                      }[s];
                      return (
                        <button
                          key={s}
                          onClick={() => setSentimientoRespuesta(sentimientoRespuesta === s ? "" : s)}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-all ${sentimientoRespuesta === s ? conf.active : conf.idle}`}
                        >
                          {conf.label}
                        </button>
                      );
                    })}
                  </div>
                  {errorRespuesta && (
                    <p className="text-xs text-destructive">{errorRespuesta}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setMostrarFormRespuesta(false); setTextoRespuesta(""); setErrorRespuesta(null); }}
                      className="flex-1 h-9 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleGuardarRespuesta}
                      disabled={guardandoRespuesta}
                      className="flex-1 h-9 rounded-xl bg-[#7C3AED] text-white text-xs font-semibold hover:bg-[#6D28D9] transition-colors disabled:opacity-50"
                    >
                      {guardandoRespuesta ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Guardar respuesta"}
                    </button>
                  </div>
                </div>
              )
            )}
          </div>

          {/* ── Barra de acciones (análisis + coaching) ─────────── */}
          <div className="px-4 py-3 flex items-center justify-between border-t border-border/50">
            {parent.resumen_ia ? (
              <button
                onClick={() => setMostrarCoaching(!mostrarCoaching)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <Brain className="w-3.5 h-3.5" />
                {mostrarCoaching ? "Ocultar coaching" : "Ver coaching IA"}
              </button>
            ) : (
              <button
                onClick={onAnalizar}
                disabled={analizando}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#7C3AED] hover:text-[#6D28D9] transition-colors disabled:opacity-50"
              >
                {analizando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                {analizando ? "Analizando…" : "⚡ Analizar"}
              </button>
            )}

            {/* Info secundaria */}
            <div className="flex items-center gap-2">
              {sentimientoConf && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sentimientoConf.className}`}>
                  {sentimientoConf.label}
                </span>
              )}
              {badgeConf && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${badgeConf.bg} ${badgeConf.text}`}>
                  <badgeConf.Icon className="w-3 h-3" />
                  {badgeConf.label}
                </span>
              )}
            </div>
          </div>

          {/* ── Sección coaching expandida ──────────────────────── */}
          {mostrarCoaching && coaching && (
            <div className="px-4 pb-4 pt-1 border-t border-border space-y-3">
              {coaching.coaching?.bien && (
                <div>
                  <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">✅ Qué hiciste bien</p>
                  <p className="text-xs text-foreground/80 leading-relaxed">{coaching.coaching.bien}</p>
                </div>
              )}
              {coaching.coaching?.mejorar && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">🎯 Qué mejorar</p>
                  <p className="text-xs text-foreground/80 leading-relaxed">{coaching.coaching.mejorar}</p>
                </div>
              )}
              {coaching.coaching?.oportunidad_perdida && (
                <div>
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">💡 Oportunidad perdida</p>
                  <p className="text-xs text-foreground/80 leading-relaxed">{coaching.coaching.oportunidad_perdida}</p>
                </div>
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
              {parent.proximo_paso && (
                <div className="flex items-start gap-1.5 text-xs">
                  <span className="text-primary font-medium shrink-0">→</span>
                  <span className="text-foreground/80">{parent.proximo_paso}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Vista análisis completo ───────────────────────────────────

function AnalisisTodoView({ analisis }: { analisis: AnalisisConversacion }) {
  const probConf: Record<string, { color: string }> = {
    alta:  { color: "text-green-600 bg-green-100" },
    media: { color: "text-amber-600 bg-amber-100" },
    baja:  { color: "text-red-600 bg-red-100" },
  };
  const prob = probConf[analisis.probabilidad_cierre] ?? probConf.media;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">Probabilidad de cierre</p>
        <span className={`text-sm font-bold px-3 py-1 rounded-full ${prob.color}`}>
          {analisis.probabilidad_cierre.charAt(0).toUpperCase() + analisis.probabilidad_cierre.slice(1)}
        </span>
      </div>
      <section>
        <p className="text-xs font-extrabold text-[#7C3AED] uppercase tracking-wide mb-1.5">Evolución de la relación</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.evolucion}</p>
      </section>
      <section>
        <p className="text-xs font-extrabold text-[#7C3AED] uppercase tracking-wide mb-1.5">Justificación</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.justificacion_probabilidad}</p>
      </section>
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
      <section>
        <p className="text-xs font-extrabold text-[#7C3AED] uppercase tracking-wide mb-1.5">Patrón del prospecto</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.patron_prospecto}</p>
      </section>
      <section>
        <p className="text-xs font-extrabold text-[#7C3AED] uppercase tracking-wide mb-1.5">Estado actual real</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.estado_actual_real}</p>
      </section>
      <section>
        <p className="text-xs font-extrabold text-[#7C3AED] uppercase tracking-wide mb-1.5">Estrategia recomendada</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.estrategia_recomendada}</p>
      </section>
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
