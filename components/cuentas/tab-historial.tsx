"use client";

// =============================================================
// Tab Historial — hilos tipo WhatsApp agrupados por contacto+canal.
// Un hilo = todos los mensajes con el mismo contacto Y canal.
// Rendering plano y cronológico: dirección de burbuja según `remitente`.
// MEJORA 1: Barra de input fija entre scroll area y barra de acciones.
// MEJORA 2: Nombre del contacto encima de cada burbuja del prospecto.
// =============================================================

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Phone, Mail, MessageCircle, Briefcase, PhoneOff, Users,
  Trash2, ChevronDown, Loader2, Plus, Zap,
  TrendingUp, Minus, Brain, AlertCircle, Clock,
  CheckCircle2, XCircle, AlertTriangle, User, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { NuevaInteraccionSheet } from "@/components/cuentas/nueva-interaccion-sheet";
import type {
  Interaccion, BadgeEstado, AnalisisConversacion,
  CorreoDetectado, Contacto, TipoInteraccion, SentimientoInteraccion,
} from "@/lib/types";

// ── Visual configs ────────────────────────────────────────────

const BADGE_CONF: Record<BadgeEstado, { label: string; bg: string; text: string; Icon: React.ElementType }> = {
  avanzando:    { label: "Avanzando",       bg: "bg-green-100 dark:bg-green-900/20",   text: "text-green-700 dark:text-green-400",   Icon: TrendingUp },
  neutral:      { label: "Neutral",         bg: "bg-amber-100 dark:bg-amber-900/20",   text: "text-amber-700 dark:text-amber-400",   Icon: Minus },
  evaluando:    { label: "Evaluando",       bg: "bg-blue-100 dark:bg-blue-900/20",     text: "text-blue-700 dark:text-blue-400",     Icon: Brain },
  resistente:   { label: "Resistente",      bg: "bg-orange-100 dark:bg-orange-900/20", text: "text-orange-700 dark:text-orange-400", Icon: AlertTriangle },
  senal_cierre: { label: "Señal de cierre", bg: "bg-green-100 dark:bg-green-900/20",   text: "text-green-700 dark:text-green-400",   Icon: CheckCircle2 },
  sin_respuesta:{ label: "Sin respuesta",   bg: "bg-gray-100 dark:bg-gray-800",        text: "text-gray-500 dark:text-gray-400",     Icon: Clock },
  rechazado:    { label: "Rechazado",       bg: "bg-red-200 dark:bg-red-950/40",       text: "text-red-900 dark:text-red-300",       Icon: XCircle },
};

const SENTIMIENTO_BADGE: Record<string, { label: string; className: string }> = {
  positivo: { label: "Positivo", className: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400" },
  neutro:   { label: "Neutro",   className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  negativo: { label: "Negativo", className: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400" },
};

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

const TIPOS_COUNTDOWN: TipoInteraccion[] = ["whatsapp", "email", "linkedin"];

// Textos legacy que identifican respuestas del prospecto sin parent_id
const TEXTOS_RESOLUCION = new Set([
  "Respondió al contacto",
  "Vio el mensaje pero no respondió",
  "Sin respuesta tras 48h",
]);

const RESOLUCION_LABEL: Record<string, { texto: string; positivo: boolean }> = {
  "Respondió al contacto":            { texto: "✅ Respondió al contacto",         positivo: true  },
  "Vio el mensaje pero no respondió": { texto: "👁️ Vio el mensaje, no respondió",  positivo: false },
  "Sin respuesta tras 48h":           { texto: "❌ Sin respuesta tras 48h",         positivo: false },
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

// Una interacción es del prospecto si: remitente explícito = 'prospecto'
// o coincide con los textos legacy de resolución (para retrocompatibilidad).
function esProspectoMsg(i: Interaccion): boolean {
  return i.remitente === "prospecto" || TEXTOS_RESOLUCION.has(i.transcripcion ?? "");
}

// ── Data model ────────────────────────────────────────────────

interface TabHistorialProps {
  interacciones: Interaccion[];
  empresaId: string;
  contactos: Contacto[];
}

// Hilo = todos los mensajes del mismo contacto+canal, en orden cronológico
interface Hilo {
  key: string;
  contactoId: string | null;
  tipo: TipoInteraccion;
  todosMensajes: Interaccion[]; // asc por fecha (vendedor + prospecto mezclados)
  rootId: string | null;        // ID del primer mensaje — parent_id para mensajes nuevos
  ultimaFecha: string;
  todosLosIds: string[];
}

// Estado del formulario inline de respuesta (botones ✅ / ❌)
interface FormRespuesta {
  open: boolean;
  texto: string;
  sentimiento: SentimientoInteraccion | "";
  guardando: boolean;
  error: string | null;
}

// Estado de la barra de input fija del hilo
interface InputBarState {
  texto: string;
  remitente: "vendedor" | "prospecto";
  enviando: boolean;
  error: string | null;
}

// ── Main component ────────────────────────────────────────────

export function TabHistorial({ interacciones: inicial, empresaId, contactos }: TabHistorialProps) {
  const [lista, setLista] = useState<Interaccion[]>(inicial);
  const [confirmandoHilo, setConfirmandoHilo] = useState<{ ids: string[]; count: number } | null>(null);
  const [eliminandoIds, setEliminandoIds] = useState<Set<string>>(new Set());
  const [analizandoId, setAnalizandoId] = useState<string | null>(null);
  const [sheetAbierto, setSheetAbierto] = useState(false);
  const [analizandoTodo, setAnalizandoTodo] = useState(false);
  const [analisisTodo, setAnalisisTodo] = useState<AnalisisConversacion | null>(null);
  const [errorTodo, setErrorTodo] = useState<string | null>(null);
  const [correos, setCorreos] = useState<CorreoDetectado[]>([]);
  const [now, setNow] = useState(() => Date.now());

  // Agrupa lista plana en hilos por contacto+canal.
  // Rendering plano y cronológico: la dirección de burbuja se decide por `remitente`.
  const hilos = useMemo((): Hilo[] => {
    // 1. IDs legacy (TEXTOS_RESOLUCION sin parent_id) — retrocompatibilidad
    const legacyRespIds = new Set<string>();
    for (const i of lista) {
      if (i.parent_id == null && TEXTOS_RESOLUCION.has(i.transcripcion ?? "")) {
        legacyRespIds.add(i.id);
      }
    }

    // 2. Mensajes raíz (sin parent_id, no legacy) — forman los hilos
    const rootMsgs = lista.filter(
      (i) => i.parent_id == null && !legacyRespIds.has(i.id)
    );

    // 3. Mensajes legacy sin parent_id
    const legacyMsgs = lista.filter((i) => legacyRespIds.has(i.id));

    // 4. Mapa parentId → hijos (mensajes con parent_id: desde botones o input bar)
    const childrenByParent = new Map<string, Interaccion[]>();
    for (const i of lista) {
      if (i.parent_id) {
        const arr = childrenByParent.get(i.parent_id) ?? [];
        arr.push(i);
        childrenByParent.set(i.parent_id, arr);
      }
    }

    // 5. Pre-calcular qué mensaje raíz "reclama" cada legacy
    const legacyToRootId = new Map<string, string>();
    for (const leg of legacyMsgs) {
      const legTime = new Date(leg.fecha).getTime();
      let best: Interaccion | null = null;
      let bestDiff = Infinity;
      for (const r of rootMsgs) {
        if (r.tipo !== leg.tipo) continue;
        const diff = legTime - new Date(r.fecha).getTime();
        if (diff >= 0 && diff < bestDiff) { bestDiff = diff; best = r; }
      }
      if (best) legacyToRootId.set(leg.id, best.id);
    }

    // 6. Agrupar raíces por (contacto_id + tipo)
    const hiloMap = new Map<string, Interaccion[]>();
    for (const r of rootMsgs) {
      const key = `${r.contacto_id ?? "__none__"}::${r.tipo}`;
      const arr = hiloMap.get(key) ?? [];
      arr.push(r);
      hiloMap.set(key, arr);
    }

    // 7. Construir objeto Hilo
    return Array.from(hiloMap.entries())
      .map(([key, roots]) => {
        const sorted = [...roots].sort(
          (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
        );

        const allMsgs: Interaccion[] = [];
        const allIds = new Set<string>();

        for (const root of sorted) {
          if (!allIds.has(root.id)) { allMsgs.push(root); allIds.add(root.id); }
          for (const child of childrenByParent.get(root.id) ?? []) {
            if (!allIds.has(child.id)) { allMsgs.push(child); allIds.add(child.id); }
          }
        }

        // Agregar legacy que apuntan a alguna raíz de este hilo
        const rootIdSet = new Set(sorted.map((r) => r.id));
        for (const leg of legacyMsgs) {
          const rid = legacyToRootId.get(leg.id);
          if (rid && rootIdSet.has(rid) && !allIds.has(leg.id)) {
            allMsgs.push(leg);
            allIds.add(leg.id);
          }
        }

        allMsgs.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

        const ultimaFecha = allMsgs.reduce(
          (max, m) => (new Date(m.fecha) > new Date(max) ? m.fecha : max),
          allMsgs[0].fecha
        );

        return {
          key,
          contactoId: sorted[0].contacto_id,
          tipo: sorted[0].tipo as TipoInteraccion,
          todosMensajes: allMsgs,
          rootId: sorted[0]?.id ?? null,
          ultimaFecha,
          todosLosIds: Array.from(allIds),
        };
      })
      .sort((a, b) => new Date(b.ultimaFecha).getTime() - new Date(a.ultimaFecha).getTime());
  }, [lista]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch(`/api/correos/${empresaId}`)
      .then((r) => r.json())
      .then((d) => setCorreos(d.correos ?? []))
      .catch(() => {});
  }, [empresaId]);

  async function eliminarHilo(ids: string[]) {
    setEliminandoIds(new Set(ids));
    setConfirmandoHilo(null);
    try {
      await Promise.all(ids.map((id) => fetch(`/api/interacciones/${id}`, { method: "DELETE" })));
      setLista((prev) => prev.filter((i) => !ids.includes(i.id)));
    } finally {
      setEliminandoIds(new Set());
    }
  }

  async function analizarExistente(id: string) {
    setAnalizandoId(id);
    try {
      const res = await fetch(`/api/interacciones/${id}/analizar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLista((prev) => prev.map((i) => (i.id === id ? data.interaccion : i)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al analizar");
    } finally {
      setAnalizandoId(null);
    }
  }

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

  // Registrar respuesta del prospecto via botones ✅/❌ — siempre remitente='prospecto'
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
        remitente: "prospecto",
        fecha: new Date().toISOString(),
      }),
    });
    const data = await res.json() as { ok: boolean; interaccion?: Interaccion | null; error?: string };
    if (!data.ok) throw new Error(data.error ?? "Error al registrar respuesta");

    // Optimistic update: construir el objeto local con datos conocidos.
    // Usar el ID real de la BD si está disponible; si no, generar uno temporal.
    // remitente siempre 'prospecto' — no depender de lo que devuelva la API.
    const nueva: Interaccion = {
      id: data.interaccion?.id ?? crypto.randomUUID(),
      empresa_id: padre.empresa_id,
      contacto_id: padre.contacto_id,
      parent_id: padre.id,
      remitente: "prospecto",
      tipo: padre.tipo,
      fecha: new Date().toISOString(),
      audio_url: null,
      transcripcion: texto,
      resumen_ia: null,
      compromisos: null,
      sentimiento,
      tecnica_usada: null,
      coaching_ia: null,
      proximo_paso: null,
      proximo_paso_fecha: null,
      badge_estado: null,
      decision_sugerida: null,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    };
    setLista((prev) => [...prev, nueva]);
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

      {/* Header */}
      <div className="flex items-center justify-between px-0.5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Historial</p>
        {hilos.length >= 2 && (
          <button
            onClick={analizarTodo}
            disabled={analizandoTodo}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#7C3AED] hover:text-[#6D28D9] transition-colors disabled:opacity-50"
          >
            {analizandoTodo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            ⚡ Analizar conversación
          </button>
        )}
      </div>

      {/* Empty state */}
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
            key={hilo.key}
            hilo={hilo}
            contactos={contactos}
            eliminandoIds={eliminandoIds}
            analizandoId={analizandoId}
            now={now}
            empresaId={empresaId}
            onEliminar={() => setConfirmandoHilo({ ids: hilo.todosLosIds, count: hilo.todosLosIds.length })}
            onAgregarRespuesta={agregarRespuesta}
            onAnalizar={analizarExistente}
            onMensajeAgregado={(nueva) => setLista((prev) => [...prev, nueva])}
          />
        ))}
      </div>

      {/* Confirm delete hilo */}
      <AlertDialog
        open={confirmandoHilo !== null}
        onOpenChange={(open) => { if (!open) setConfirmandoHilo(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este hilo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán {confirmandoHilo?.count ?? 0} interaccion{(confirmandoHilo?.count ?? 0) !== 1 ? "es" : ""}.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmandoHilo && eliminarHilo(confirmandoHilo.ids)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Full analysis dialog */}
      <Dialog
        open={analisisTodo !== null || errorTodo !== null}
        onOpenChange={(open) => { if (!open) { setAnalisisTodo(null); setErrorTodo(null); } }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold">⚡ Análisis de la conversación completa</DialogTitle>
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

      {/* Nueva interacción */}
      <NuevaInteraccionSheet
        abierto={sheetAbierto}
        onCerrar={() => setSheetAbierto(false)}
        empresaId={empresaId}
        contactos={contactos}
        onCreada={(nueva) => setLista((prev) => [nueva, ...prev])}
      />

      {/* FAB */}
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

// ── Tarjeta de hilo ───────────────────────────────────────────

function TarjetaHilo({
  hilo,
  contactos,
  eliminandoIds,
  analizandoId,
  now,
  empresaId,
  onEliminar,
  onAgregarRespuesta,
  onAnalizar,
  onMensajeAgregado,
}: {
  hilo: Hilo;
  contactos: Contacto[];
  eliminandoIds: Set<string>;
  analizandoId: string | null;
  now: number;
  empresaId: string;
  onEliminar: () => void;
  onAgregarRespuesta: (padre: Interaccion, texto: string, sent: SentimientoInteraccion) => Promise<void>;
  onAnalizar: (id: string) => Promise<void>;
  onMensajeAgregado: (i: Interaccion) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const [forms, setForms] = useState<Record<string, FormRespuesta>>({});
  const [enVuelo, setEnVuelo] = useState<Set<string>>(new Set());
  const [mostrarCoaching, setMostrarCoaching] = useState(false);
  const [inputBar, setInputBar] = useState<InputBarState>({
    texto: "", remitente: "vendedor", enviando: false, error: null,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tipoConf = TIPO_CONF[hilo.tipo] ?? TIPO_CONF.llamada;
  const contacto = contactos.find((c) => c.id === hilo.contactoId);
  const tieneAlgunEliminado = hilo.todosLosIds.some((id) => eliminandoIds.has(id));

  // Último mensaje del vendedor (para coaching/analizar y badges)
  const ultimoMsj = [...hilo.todosMensajes].reverse().find((m) => !esProspectoMsg(m)) ?? null;
  const badgeConf = ultimoMsj?.badge_estado ? BADGE_CONF[ultimoMsj.badge_estado] : null;
  const sentimientoConf =
    ultimoMsj?.sentimiento && ultimoMsj.sentimiento !== "sin_respuesta"
      ? (SENTIMIENTO_BADGE[ultimoMsj.sentimiento] ?? null)
      : null;

  // Índice del último mensaje del vendedor — para mostrar countdown y botones de respuesta
  const lastVendorIdx = hilo.todosMensajes.reduceRight(
    (found, msg, idx) => (found === -1 && !esProspectoMsg(msg) ? idx : found),
    -1
  );
  // Solo mostrar botones de respuesta si el último mensaje del vendedor no tiene prospecto después
  const showResponseButtons =
    TIPOS_COUNTDOWN.includes(hilo.tipo) &&
    lastVendorIdx >= 0 &&
    !hilo.todosMensajes.slice(lastVendorIdx + 1).some(esProspectoMsg);

  let coaching: {
    coaching?: { bien?: string; mejorar?: string; oportunidad_perdida?: string };
    borrador_respuesta?: string;
    lo_que_no_respondio?: string;
  } | null = null;
  if (ultimoMsj?.coaching_ia) {
    try { coaching = JSON.parse(ultimoMsj.coaching_ia); } catch { /* */ }
  }

  // Scroll al fondo cuando se expande o llegan mensajes nuevos
  useEffect(() => {
    if (expandido && scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 50);
    }
  }, [expandido, hilo.todosMensajes.length]);

  function getForm(pid: string): FormRespuesta {
    return forms[pid] ?? { open: false, texto: "", sentimiento: "", guardando: false, error: null };
  }

  function setForm(pid: string, upd: Partial<FormRespuesta>) {
    setForms((prev) => ({
      ...prev,
      [pid]: { ...(prev[pid] ?? { open: false, texto: "", sentimiento: "", guardando: false, error: null }), ...upd },
    }));
  }

  async function handleGuardar(padre: Interaccion) {
    const f = getForm(padre.id);
    if (!f.texto.trim()) { setForm(padre.id, { error: "Escribe la respuesta antes de guardar." }); return; }
    setForm(padre.id, { guardando: true, error: null });
    try {
      await onAgregarRespuesta(padre, f.texto.trim(), (f.sentimiento || "neutro") as SentimientoInteraccion);
      setForm(padre.id, { open: false, texto: "", sentimiento: "", guardando: false, error: null });
    } catch (e) {
      setForm(padre.id, { guardando: false, error: e instanceof Error ? e.message : "Error" });
    }
  }

  async function handleDirecto(padre: Interaccion, texto: string, sent: SentimientoInteraccion) {
    setEnVuelo((prev) => new Set(Array.from(prev).concat(padre.id)));
    try {
      await onAgregarRespuesta(padre, texto, sent);
    } finally {
      setEnVuelo((prev) => { const s = new Set(Array.from(prev)); s.delete(padre.id); return s; });
    }
  }

  async function handleEnviarInputBar() {
    const texto = inputBar.texto.trim();
    if (!texto || !hilo.rootId) return;
    setInputBar((prev) => ({ ...prev, enviando: true, error: null }));
    try {
      const res = await fetch("/api/interacciones/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          tipo: hilo.tipo,
          contacto_id: hilo.contactoId ?? undefined,
          parent_id: hilo.rootId,
          texto,
          remitente: inputBar.remitente,
          sentimiento: inputBar.remitente === "prospecto" ? "neutro" : null,
          fecha: new Date().toISOString(),
        }),
      });
      const data = await res.json() as { ok: boolean; interaccion?: Interaccion | null; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Error al enviar");

      // Optimistic update: burbuja aparece de inmediato sin esperar refetch.
      const nueva: Interaccion = {
        id: data.interaccion?.id ?? crypto.randomUUID(),
        empresa_id: empresaId,
        contacto_id: hilo.contactoId,
        parent_id: hilo.rootId,
        remitente: inputBar.remitente,
        tipo: hilo.tipo,
        fecha: new Date().toISOString(),
        audio_url: null,
        transcripcion: texto,
        resumen_ia: null,
        compromisos: null,
        sentimiento: inputBar.remitente === "prospecto" ? "neutro" : null,
        tecnica_usada: null,
        coaching_ia: null,
        proximo_paso: null,
        proximo_paso_fecha: null,
        badge_estado: null,
        decision_sugerida: null,
        creado_en: new Date().toISOString(),
        actualizado_en: new Date().toISOString(),
      };
      onMensajeAgregado(nueva);
      setInputBar((prev) => ({ ...prev, texto: "", enviando: false }));
      textareaRef.current?.focus();
    } catch (e) {
      setInputBar((prev) => ({
        ...prev,
        enviando: false,
        error: e instanceof Error ? e.message : "Error al enviar",
      }));
    }
  }

  const previewTexto =
    hilo.todosMensajes[hilo.todosMensajes.length - 1]?.resumen_ia ??
    hilo.todosMensajes[hilo.todosMensajes.length - 1]?.transcripcion;

  return (
    <div className={`rounded-2xl border border-border bg-card shadow-sm overflow-hidden ${tieneAlgunEliminado ? "opacity-40 pointer-events-none" : ""}`}>

      {/* ── Header ── */}
      <button
        onClick={() => setExpandido(!expandido)}
        className="w-full text-left px-4 pt-3.5 pb-3 flex items-start gap-3 hover:bg-muted/30 active:bg-muted/50 transition-colors"
      >
        <div className="w-9 h-9 rounded-full bg-[#EDE9FE] dark:bg-[#1E1B4B]/50 flex items-center justify-center shrink-0 mt-0.5">
          <tipoConf.Icon className="w-4 h-4 text-[#7C3AED]" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">
                {contacto?.nombre ?? "Sin contacto"}
              </span>
              <span className="text-muted-foreground/40 text-xs shrink-0">·</span>
              <span className="text-xs text-muted-foreground shrink-0">{tipoConf.emoji} {tipoConf.label}</span>
              {hilo.todosMensajes.length > 1 && (
                <span className="text-[10px] text-muted-foreground/60 shrink-0">
                  ({hilo.todosMensajes.length})
                </span>
              )}
            </div>
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={onEliminar}
                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive/50 hover:text-destructive" />
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-0.5">{fechaCorta(hilo.ultimaFecha)}</p>

          {!expandido && (
            <>
              {previewTexto && (
                <p className="text-xs text-foreground/70 mt-1.5 line-clamp-2 leading-relaxed">{previewTexto}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-1.5">
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
            </>
          )}
        </div>

        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform duration-200 ${expandido ? "rotate-180" : ""}`}
        />
      </button>

      {/* ── Hilo expandido ── */}
      {expandido && (
        <div className="border-t border-border">

          {/* Chat scroll area */}
          <div
            ref={scrollRef}
            className="px-4 py-4 space-y-3 bg-[#F8F7FF] dark:bg-[#0F0A1E]/30 max-h-[400px] overflow-y-auto"
          >
            {hilo.todosMensajes.map((msg, idx) => {
              const esProsp = esProspectoMsg(msg);
              const form = getForm(msg.id);
              const volando = enVuelo.has(msg.id);
              const isLastVendor = !esProsp && idx === lastVendorIdx;
              const countdown = isLastVendor && showResponseButtons
                ? calcCountdown(msg.fecha, now)
                : null;
              const estaVencida = countdown?.estado === "vencida";

              if (esProsp) {
                // ── Burbuja prospecto (izquierda) ──
                const resInfo = RESOLUCION_LABEL[msg.transcripcion ?? ""];
                const textoResp = resInfo?.texto ?? msg.resumen_ia ?? msg.transcripcion ?? "Respuesta registrada";
                const esPos = resInfo ? resInfo.positivo : msg.sentimiento === "positivo";
                return (
                  <div key={msg.id} className="space-y-0.5">
                    {/* Nombre del contacto encima (estilo grupos de WhatsApp) */}
                    <p className="text-[10px] font-medium text-[#7C3AED] ml-8">
                      {contacto?.nombre ?? "Prospecto"}
                    </p>
                    <div className="flex justify-start items-end gap-2">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mb-0.5">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className={`max-w-[84%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm ${
                        esPos
                          ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/40"
                          : "bg-card border border-border"
                      }`}>
                        <p className="text-sm text-foreground leading-relaxed">{textoResp}</p>
                        <p className="text-[10px] text-muted-foreground text-right mt-1">{fechaCorta(msg.fecha)}</p>
                      </div>
                    </div>
                  </div>
                );
              }

              // ── Burbuja vendedor (derecha) ──
              const texto = msg.resumen_ia ?? msg.transcripcion;
              return (
                <div key={msg.id} className="space-y-2">
                  <div className="flex justify-end">
                    <div className="max-w-[84%] bg-[#7C3AED] text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 shadow-sm">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {texto ?? (msg.tipo === "llamada" ? "Llamada registrada" : "Interacción registrada")}
                      </p>
                      <p className="text-[10px] text-white/60 text-right mt-1">{fechaCorta(msg.fecha)} ✓✓</p>
                    </div>
                  </div>

                  {/* Badge countdown */}
                  {countdown && (
                    <div className="flex justify-end">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${COUNTDOWN_STYLE[countdown.estado]}`}>
                        {countdown.texto}
                      </span>
                    </div>
                  )}

                  {/* Botones de respuesta rápida (solo bajo el último mensaje sin respuesta) */}
                  {isLastVendor && showResponseButtons && !form.open && (
                    <div className="flex justify-end">
                      {estaVencida ? (
                        <div className="flex gap-1.5 flex-wrap justify-end">
                          <button
                            disabled={volando}
                            onClick={() => setForm(msg.id, { open: true })}
                            className="h-8 px-2.5 text-xs font-semibold rounded-xl bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400 transition-colors disabled:opacity-50"
                          >
                            {volando ? <Loader2 className="h-3 w-3 animate-spin" /> : "✅ Sí contestó"}
                          </button>
                          <button
                            disabled={volando}
                            onClick={() => handleDirecto(msg, "Vio el mensaje pero no respondió", "negativo")}
                            className="h-8 px-2.5 text-xs font-semibold rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400 transition-colors disabled:opacity-50"
                          >
                            {volando ? <Loader2 className="h-3 w-3 animate-spin" /> : "👁️ Lo vio"}
                          </button>
                          <button
                            disabled={volando}
                            onClick={() => handleDirecto(msg, "Sin respuesta tras 48h", "negativo")}
                            className="h-8 px-2.5 text-xs font-semibold rounded-xl bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-900/20 dark:border-gray-700 dark:text-gray-400 transition-colors disabled:opacity-50"
                          >
                            {volando ? <Loader2 className="h-3 w-3 animate-spin" /> : "❌ No contestó"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setForm(msg.id, { open: true })}
                            className="h-7 px-2.5 text-xs font-semibold rounded-xl bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400 transition-colors"
                          >
                            ✅ Respondió
                          </button>
                          <button
                            disabled={volando}
                            onClick={() => handleDirecto(msg, "Sin respuesta tras 48h", "negativo")}
                            className="h-7 px-2.5 text-xs font-semibold rounded-xl bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 dark:bg-gray-900/20 dark:border-gray-700 dark:text-gray-400 transition-colors disabled:opacity-50"
                          >
                            {volando ? <Loader2 className="h-3 w-3 animate-spin" /> : "❌ No respondió"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Formulario inline de respuesta */}
                  {form.open && (
                    <div className="space-y-2">
                      <Textarea
                        autoFocus
                        value={form.texto}
                        onChange={(e) => setForm(msg.id, { texto: e.target.value })}
                        placeholder="¿Qué respondió el prospecto?"
                        rows={3}
                        className="text-sm rounded-xl resize-none bg-card"
                      />
                      <div className="flex gap-2">
                        {(["positivo", "neutro", "negativo"] as const).map((s) => {
                          const c = {
                            positivo: { lbl: "👍 Positivo", act: "bg-green-100 border-green-400 text-green-700" },
                            neutro:   { lbl: "😐 Neutro",   act: "bg-amber-100 border-amber-400 text-amber-700" },
                            negativo: { lbl: "👎 Negativo", act: "bg-red-100 border-red-400 text-red-700" },
                          }[s];
                          return (
                            <button
                              key={s}
                              onClick={() => setForm(msg.id, { sentimiento: form.sentimiento === s ? "" : s })}
                              className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                                form.sentimiento === s ? c.act : "border-border text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {c.lbl}
                            </button>
                          );
                        })}
                      </div>
                      {form.error && <p className="text-xs text-destructive">{form.error}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setForm(msg.id, { open: false, texto: "", sentimiento: "", error: null })}
                          className="flex-1 h-9 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleGuardar(msg)}
                          disabled={form.guardando}
                          className="flex-1 h-9 rounded-xl bg-[#7C3AED] text-white text-xs font-semibold hover:bg-[#6D28D9] transition-colors disabled:opacity-50"
                        >
                          {form.guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Guardar"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Barra de input fija ── */}
          <div className="border-t border-border bg-card px-3 py-2.5">
            <div className="flex items-end gap-2">
              {/* Toggle Yo / Prospecto */}
              <div className="flex rounded-lg border border-border overflow-hidden shrink-0 text-[11px] font-semibold">
                <button
                  onClick={() => setInputBar((prev) => ({ ...prev, remitente: "vendedor" }))}
                  className={`px-2.5 py-1.5 transition-colors ${
                    inputBar.remitente === "vendedor"
                      ? "bg-[#7C3AED] text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Yo
                </button>
                <button
                  onClick={() => setInputBar((prev) => ({ ...prev, remitente: "prospecto" }))}
                  className={`px-2 py-1.5 transition-colors ${
                    inputBar.remitente === "prospecto"
                      ? "bg-gray-600 dark:bg-gray-500 text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Prospecto
                </button>
              </div>

              {/* Input */}
              <Textarea
                ref={textareaRef}
                value={inputBar.texto}
                onChange={(e) => setInputBar((prev) => ({ ...prev, texto: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleEnviarInputBar();
                  }
                }}
                placeholder="Escribe un mensaje..."
                rows={1}
                className="flex-1 text-sm rounded-xl resize-none bg-muted/50 min-h-[36px] max-h-20 py-2 leading-tight"
              />

              {/* Botón enviar */}
              <button
                onClick={() => void handleEnviarInputBar()}
                disabled={inputBar.enviando || !inputBar.texto.trim()}
                className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 ${
                  inputBar.remitente === "vendedor"
                    ? "bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
                    : "bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-400 text-white"
                }`}
              >
                {inputBar.enviando
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />}
              </button>
            </div>
            {inputBar.error && (
              <p className="text-xs text-destructive mt-1.5 pl-1">{inputBar.error}</p>
            )}
          </div>

          {/* ── Barra de acciones ── */}
          <div className="px-4 py-3 border-t border-border/50 flex items-center justify-between gap-3">
            {ultimoMsj?.resumen_ia ? (
              <button
                onClick={() => setMostrarCoaching(!mostrarCoaching)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <Brain className="w-3.5 h-3.5" />
                {mostrarCoaching ? "Ocultar coaching" : "Ver coaching IA"}
              </button>
            ) : ultimoMsj ? (
              <button
                onClick={() => onAnalizar(ultimoMsj.id)}
                disabled={analizandoId === ultimoMsj.id}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#7C3AED] hover:text-[#6D28D9] transition-colors disabled:opacity-50"
              >
                {analizandoId === ultimoMsj.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Zap className="w-3.5 h-3.5" />}
                {analizandoId === ultimoMsj.id ? "Analizando…" : "⚡ Analizar"}
              </button>
            ) : null}

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

          {/* ── Coaching ── */}
          {mostrarCoaching && coaching && (
            <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
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
              {ultimoMsj?.proximo_paso && (
                <div className="flex items-start gap-1.5 text-xs">
                  <span className="text-primary font-medium shrink-0">→</span>
                  <span className="text-foreground/80">{ultimoMsj.proximo_paso}</span>
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
