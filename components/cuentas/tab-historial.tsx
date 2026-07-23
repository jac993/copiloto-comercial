"use client";

// =============================================================
// Tab Historial — hilos tipo WhatsApp agrupados por contacto+canal.
// CAMBIO 1: fechaCorta con AM/PM; fallback a creado_en.
// CAMBIO 3: botón editar (lápiz) por burbuja + en cabecera del hilo.
// =============================================================

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Phone, Mail, MessageCircle, Briefcase, PhoneOff, Users,
  Trash2, ChevronDown, Loader2, Plus, Zap,
  TrendingUp, Minus, Brain, AlertCircle, Clock,
  CheckCircle2, XCircle, AlertTriangle, User, Send, Pencil, CalendarPlus,
} from "lucide-react";
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
import { msRespuestaHabil } from "@/lib/fecha";

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

// Formato "19 jun, 04:36 p.m." — usa fecha, con fallback a creado_en
function fechaCorta(iso: string | null | undefined, fallback?: string | null): string {
  const src = iso || fallback;
  if (!src) return "";
  return new Date(src).toLocaleString("es-CL", {
    day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

// Convierte ISO a valor de <input type="datetime-local"> en hora local
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  // Tiempo HÁBIL transcurrido: el contador se congela sábado y domingo (hora
  // Chile) y se reanuda el lunes, para no marcar como vencido lo que el
  // prospecto no respondió simplemente porque no trabaja el fin de semana.
  const ms = msRespuestaHabil(new Date(fechaIso).getTime(), now);
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

function esProspectoMsg(i: Interaccion): boolean {
  return i.remitente === "prospecto" || TEXTOS_RESOLUCION.has(i.transcripcion ?? "");
}

// Marcadores de sistema que NO son conversación real y se OCULTAN del
// historial: filas vacías (stubs de métricas del botón "✓ Hecho") y
// "Sin respuesta tras 48h" standalone (stub de tarea, sin parent_id).
// OJO: "Llamada sin respuesta" NO va aquí — el vendedor la ingresa a mano
// desde el sheet ("No contestó") y ocultarla parecía pérdida de datos
// (regresión de bc611ab). Se muestra como evento compacto de sistema.
const MARCADORES_OCULTAR = new Set(["Sin respuesta tras 48h"]);
const MARCADOR_LLAMADA_SIN_RESPUESTA = "Llamada sin respuesta";

function esStubDeTarea(i: Interaccion): boolean {
  if (i.parent_id) return false;
  const t = (i.transcripcion ?? "").trim();
  const sinResumen = !(i.resumen_ia ?? "").trim();
  // Sin resumen de IA y cuyo único "texto" es vacío o un marcador de sistema.
  return sinResumen && (t === "" || MARCADORES_OCULTAR.has(t));
}

// Registro real del vendedor pero sin contenido conversacional: se renderiza
// como línea de evento (📞 Llamada sin respuesta · fecha), no como burbuja.
function esEventoSistema(i: Interaccion): boolean {
  if (i.parent_id) return false;
  const t = (i.transcripcion ?? "").trim();
  return !(i.resumen_ia ?? "").trim() && t === MARCADOR_LLAMADA_SIN_RESPUESTA;
}

// ── Data model ────────────────────────────────────────────────

interface TabHistorialProps {
  interacciones: Interaccion[];
  empresaId: string;
  contactos: Contacto[];
  conversacionPausadaAt: string | null;
}

interface Hilo {
  key: string;
  contactoId: string | null;
  tipo: TipoInteraccion;
  todosMensajes: Interaccion[];
  rootId: string | null;
  ultimaFecha: string;
  todosLosIds: string[];
}

interface FormRespuesta {
  open: boolean;
  texto: string;
  sentimiento: SentimientoInteraccion | "";
  guardando: boolean;
  error: string | null;
}

interface InputBarState {
  texto: string;
  remitente: "vendedor" | "prospecto";
  enviando: boolean;
  error: string | null;
}

// Estado del formulario inline de edición de una burbuja
interface EditMsgState {
  id: string;
  texto: string;
  fecha: string; // formato datetime-local "YYYY-MM-DDTHH:mm"
  guardando: boolean;
  error: string | null;
}

// ── Main component ────────────────────────────────────────────

export function TabHistorial({ interacciones: inicial, empresaId, contactos, conversacionPausadaAt: pausadaAtInit }: TabHistorialProps) {
  const [lista, setLista] = useState<Interaccion[]>(inicial);
  const [pausadaAt, setPausadaAt] = useState<string | null>(pausadaAtInit);
  const [confirmandoHilo, setConfirmandoHilo] = useState<{ ids: string[]; count: number } | null>(null);
  const [eliminandoIds, setEliminandoIds] = useState<Set<string>>(new Set());
  const [analizandoId, setAnalizandoId] = useState<string | null>(null);
  const [sheetAbierto, setSheetAbierto] = useState(false);
  const [analizandoTodo, setAnalizandoTodo] = useState(false);
  const [analisisTodo, setAnalisisTodo] = useState<AnalisisConversacion | null>(null);
  const [errorTodo, setErrorTodo] = useState<string | null>(null);
  const [correos, setCorreos] = useState<CorreoDetectado[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const hilos = useMemo((): Hilo[] => {
    // Ocultar stubs de tarea/estado; el resto del armado de hilos usa `visibles`.
    const visibles = lista.filter((i) => !esStubDeTarea(i));

    const legacyRespIds = new Set<string>();
    for (const i of visibles) {
      if (i.parent_id == null && TEXTOS_RESOLUCION.has(i.transcripcion ?? "")) {
        legacyRespIds.add(i.id);
      }
    }

    const rootMsgs = visibles.filter(
      (i) => i.parent_id == null && !legacyRespIds.has(i.id)
    );
    const legacyMsgs = visibles.filter((i) => legacyRespIds.has(i.id));

    const childrenByParent = new Map<string, Interaccion[]>();
    for (const i of visibles) {
      if (i.parent_id) {
        const arr = childrenByParent.get(i.parent_id) ?? [];
        arr.push(i);
        childrenByParent.set(i.parent_id, arr);
      }
    }

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

    const hiloMap = new Map<string, Interaccion[]>();
    for (const r of rootMsgs) {
      const key = `${r.contacto_id ?? "__none__"}::${r.tipo}`;
      const arr = hiloMap.get(key) ?? [];
      arr.push(r);
      hiloMap.set(key, arr);
    }

    return Array.from(hiloMap.entries())
      .map(([key, roots]) => {
        const sorted = [...roots].sort(
          (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
        );

        const allMsgs: Interaccion[] = [];
        const allIds = new Set<string>();

        for (const root of sorted) {
          if (!allIds.has(root.id)) { allMsgs.push(root); allIds.add(root.id); }
          const queue = [root.id];
          while (queue.length > 0) {
            const parentId = queue.shift()!;
            for (const child of childrenByParent.get(parentId) ?? []) {
              if (!allIds.has(child.id)) {
                allMsgs.push(child);
                allIds.add(child.id);
                queue.push(child.id);
              }
            }
          }
        }

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
      router.refresh();
    } finally {
      setEliminandoIds(new Set());
    }
  }

  async function eliminarHiloDirecto(ids: string[]) {
    setEliminandoIds(new Set(ids));
    try {
      await Promise.all(ids.map((id) => fetch(`/api/interacciones/${id}`, { method: "DELETE" })));
      setLista((prev) => prev.filter((i) => !ids.includes(i.id)));
      router.refresh();
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

    // Fix 3: PATCH explícito sobre el padre para garantizar resuelta=true
    // aunque tenga proximo_paso asignado (el bulk update del endpoint lo excluiría).
    void fetch(`/api/interacciones/${padre.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resuelta: true }),
    });

    if (data.interaccion) {
      setLista((prev) => [...prev, data.interaccion!]);
    } else {
      try {
        const rf = await fetch(`/api/interacciones/empresa/${padre.empresa_id}`);
        const rd = await rf.json() as { ok: boolean; interacciones?: Interaccion[] };
        if (rd.interacciones) setLista(rd.interacciones);
      } catch {
        const nueva: Interaccion = {
          id: crypto.randomUUID(),
          empresa_id: padre.empresa_id,
          contacto_id: padre.contacto_id,
          parent_id: padre.id,
          remitente: "prospecto",
          tipo: padre.tipo,
          fecha: new Date().toISOString(),
          audio_url: null, transcripcion: texto, resumen_ia: null, compromisos: null,
          sentimiento, tecnica_usada: null, coaching_ia: null, proximo_paso: null,
          proximo_paso_fecha: null, badge_estado: null, decision_sugerida: null, resuelta: false, no_realizada: false,
          creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
        };
        setLista((prev) => [...prev, nueva]);
      }
    }
    router.refresh();
  }

  return (
    <div className="space-y-3 pb-28">

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

      <div className="flex items-center justify-between px-0.5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Historial</p>
        <div className="flex items-center gap-3">
          {hilos.length >= 2 && (
            <button
              onClick={analizarTodo}
              disabled={analizandoTodo}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#F97316] hover:text-[#EA580C] transition-colors disabled:opacity-50"
            >
              {analizandoTodo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              ⚡ Analizar conversación
            </button>
          )}
          <button
            onClick={() => setSheetAbierto(true)}
            className="flex items-center gap-1 text-xs font-semibold text-[#F97316] hover:text-[#EA580C] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva
          </button>
        </div>
      </div>

      {hilos.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">Sin interacciones aún</p>
          <p className="text-xs text-muted-foreground">Toca el botón + para registrar la primera</p>
        </div>
      )}

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
            pausadaAt={pausadaAt}
            onPausaToggle={setPausadaAt}
            onEliminar={() => setConfirmandoHilo({ ids: hilo.todosLosIds, count: hilo.todosLosIds.length })}
            onEliminarHiloDirecto={() => void eliminarHiloDirecto(hilo.todosLosIds)}
            onAgregarRespuesta={agregarRespuesta}
            onAnalizar={analizarExistente}
            onMensajeAgregado={(nueva) => setLista((prev) => [...prev, nueva])}
            onMensajeEliminado={(id) => setLista((prev) => prev.filter((i) => i.id !== id))}
            onInteraccionActualizada={(actualizada) =>
              setLista((prev) => prev.map((i) => (i.id === actualizada.id ? actualizada : i)))
            }
          />
        ))}
      </div>

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

      <NuevaInteraccionSheet
        abierto={sheetAbierto}
        onCerrar={() => setSheetAbierto(false)}
        empresaId={empresaId}
        contactos={contactos}
        onCreada={(nueva) => { setLista((prev) => [nueva, ...prev]); router.refresh(); }}
      />

    </div>
  );
}

// ── Tarjeta de hilo ───────────────────────────────────────────

function TarjetaHilo({
  hilo, contactos, eliminandoIds, analizandoId, now, empresaId,
  pausadaAt, onPausaToggle,
  onEliminar, onEliminarHiloDirecto, onAgregarRespuesta, onAnalizar,
  onMensajeAgregado, onMensajeEliminado, onInteraccionActualizada,
}: {
  hilo: Hilo;
  contactos: Contacto[];
  eliminandoIds: Set<string>;
  analizandoId: string | null;
  now: number;
  empresaId: string;
  pausadaAt: string | null;
  onPausaToggle: (v: string | null) => void;
  onEliminar: () => void;
  onEliminarHiloDirecto: () => void;
  onAgregarRespuesta: (padre: Interaccion, texto: string, sent: SentimientoInteraccion) => Promise<void>;
  onAnalizar: (id: string) => Promise<void>;
  onMensajeAgregado: (i: Interaccion) => void;
  onMensajeEliminado: (id: string) => void;
  onInteraccionActualizada: (i: Interaccion) => void;
}) {
  const router = useRouter();
  const [expandido, setExpandido] = useState(false);
  const [forms, setForms] = useState<Record<string, FormRespuesta>>({});
  const [enVuelo, setEnVuelo] = useState<Set<string>>(new Set());
  const [mostrarCoaching, setMostrarCoaching] = useState(false);
  const [inputBar, setInputBar] = useState<InputBarState>({
    texto: "", remitente: "vendedor", enviando: false, error: null,
  });
  const [eliminandoMsgId, setEliminandoMsgId] = useState<string | null>(null);
  const [confirmandoMsg, setConfirmandoMsg] = useState<{ id: string; esRoot: boolean } | null>(null);
  // Edición de burbuja individual
  const [editandoMsg, setEditandoMsg] = useState<EditMsgState | null>(null);
  // Edición de fecha/hora desde la cabecera del hilo (edita el mensaje raíz)
  const [editandoHiloFecha, setEditandoHiloFecha] = useState<string | null>(null);
  const [guardandoHiloFecha, setGuardandoHiloFecha] = useState(false);
  const [errorHiloFecha, setErrorHiloFecha] = useState<string | null>(null);
  const [recordatorioAbierto, setRecordatorioAbierto] = useState(false);
  const [recFecha, setRecFecha] = useState("");
  const [recTexto, setRecTexto] = useState("");
  const [guardandoRec, setGuardandoRec] = useState(false);
  const [recGuardado, setRecGuardado] = useState(false);
  const [toggling, setToggling] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tipoConf = TIPO_CONF[hilo.tipo] ?? TIPO_CONF.llamada;
  const contacto = contactos.find((c) => c.id === hilo.contactoId);
  const tieneAlgunEliminado = hilo.todosLosIds.some((id) => eliminandoIds.has(id));

  // Excluye eventos de sistema: sus badges (sentimiento neutro) no deben
  // pisar el encabezado del hilo.
  const ultimoMsj = [...hilo.todosMensajes].reverse().find((m) => !esProspectoMsg(m) && !esEventoSistema(m)) ?? null;
  const badgeConf = ultimoMsj?.badge_estado ? BADGE_CONF[ultimoMsj.badge_estado] : null;
  const sentimientoConf =
    ultimoMsj?.sentimiento && ultimoMsj.sentimiento !== "sin_respuesta"
      ? (SENTIMIENTO_BADGE[ultimoMsj.sentimiento] ?? null)
      : null;

  const lastVendorIdx = hilo.todosMensajes.reduceRight(
    (found, msg, idx) => (found === -1 && !esProspectoMsg(msg) ? idx : found),
    -1
  );
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

  useEffect(() => {
    if (expandido && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
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

      if (data.interaccion) {
        onMensajeAgregado(data.interaccion);
      } else {
        const nueva: Interaccion = {
          id: crypto.randomUUID(),
          empresa_id: empresaId,
          contacto_id: hilo.contactoId,
          parent_id: hilo.rootId,
          remitente: inputBar.remitente,
          tipo: hilo.tipo,
          fecha: new Date().toISOString(),
          audio_url: null, transcripcion: texto, resumen_ia: null, compromisos: null,
          sentimiento: inputBar.remitente === "prospecto" ? "neutro" : null,
          tecnica_usada: null, coaching_ia: null, proximo_paso: null,
          proximo_paso_fecha: null, badge_estado: null, decision_sugerida: null, resuelta: false, no_realizada: false,
          creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
        };
        onMensajeAgregado(nueva);
      }
      setInputBar((prev) => ({ ...prev, texto: "", enviando: false }));
      router.refresh();
      textareaRef.current?.focus();
    } catch (e) {
      setInputBar((prev) => ({ ...prev, enviando: false, error: e instanceof Error ? e.message : "Error al enviar" }));
    }
  }

  function solicitarEliminarMensaje(id: string) {
    setConfirmandoMsg({ id, esRoot: id === hilo.rootId });
  }

  async function confirmarEliminarMensaje(msgId: string, esRootMsg: boolean, soloEsteMensaje: boolean) {
    console.log(`[borrar-msg] id=${msgId} esRoot=${esRootMsg} solo=${soloEsteMensaje}`);
    setConfirmandoMsg(null);

    if (esRootMsg && !soloEsteMensaje) {
      onEliminarHiloDirecto();
      return;
    }

    setEliminandoMsgId(msgId);
    try {
      console.log(`[borrar-msg] llamando DELETE /api/interacciones/${msgId}`);
      const res = await fetch(`/api/interacciones/${msgId}`, { method: "DELETE" });
      const body = await res.json() as { ok?: boolean; error?: string };
      console.log(`[borrar-msg] respuesta HTTP ${res.status}:`, body);
      if (!res.ok || !body.ok) throw new Error(body.error ?? `Error HTTP ${res.status}`);
      onMensajeEliminado(msgId);
      router.refresh();
    } catch (e) {
      console.error("[borrar-msg] error:", e);
      alert(e instanceof Error ? e.message : "Error al eliminar el mensaje");
    } finally {
      setEliminandoMsgId(null);
    }
  }

  // ── Guardar edición de texto + fecha de una burbuja individual ──
  async function guardarEdicionMensaje() {
    if (!editandoMsg) return;
    const { id, texto, fecha } = editandoMsg;
    setEditandoMsg((prev) => prev ? { ...prev, guardando: true, error: null } : null);
    try {
      const res = await fetch(`/api/interacciones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.trim(), fecha: new Date(fecha).toISOString() }),
      });
      const data = await res.json() as { ok: boolean; interaccion?: Interaccion; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error al guardar");
      if (data.interaccion) onInteraccionActualizada(data.interaccion);
      setEditandoMsg(null);
      router.refresh();
    } catch (e) {
      setEditandoMsg((prev) => prev
        ? { ...prev, guardando: false, error: e instanceof Error ? e.message : "Error al guardar" }
        : null);
    }
  }

  // ── Recordatorio: pre-rellena si el root ya tiene proximo_paso ──
  function abrirRecordatorio() {
    setRecFecha(rootMsg?.proximo_paso_fecha ?? "");
    setRecTexto(rootMsg?.proximo_paso ?? "");
    setRecordatorioAbierto(true);
    setRecGuardado(false);
  }

  async function guardarRecordatorio() {
    if (!hilo.rootId) return;
    setGuardandoRec(true);
    console.log('[RECORDATORIO] guardando en id:', hilo.rootId, 'fecha:', recFecha, 'texto:', recTexto);
    try {
      await fetch(`/api/interacciones/${hilo.rootId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proximo_paso: recTexto, proximo_paso_fecha: recFecha, resuelta: false }),
      });
      setRecGuardado(true);
      router.refresh();
      setTimeout(() => { setRecordatorioAbierto(false); setRecGuardado(false); }, 2000);
    } finally {
      setGuardandoRec(false);
    }
  }

  // ── Guardar fecha/hora del mensaje raíz desde la cabecera ──
  async function guardarFechaHilo() {
    if (!hilo.rootId || !editandoHiloFecha) return;
    setGuardandoHiloFecha(true);
    setErrorHiloFecha(null);
    try {
      const res = await fetch(`/api/interacciones/${hilo.rootId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: new Date(editandoHiloFecha).toISOString() }),
      });
      const data = await res.json() as { ok: boolean; interaccion?: Interaccion; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error al guardar");
      if (data.interaccion) onInteraccionActualizada(data.interaccion);
      setEditandoHiloFecha(null);
    } catch (e) {
      setErrorHiloFecha(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardandoHiloFecha(false);
    }
  }

  const previewTexto =
    hilo.todosMensajes[hilo.todosMensajes.length - 1]?.resumen_ia ??
    hilo.todosMensajes[hilo.todosMensajes.length - 1]?.transcripcion;

  const rootMsg = hilo.todosMensajes.find((m) => m.id === hilo.rootId);

  return (
    <div className={`rounded-2xl border border-border bg-card shadow-sm overflow-hidden ${tieneAlgunEliminado ? "opacity-40 pointer-events-none" : ""}`}>

      {/* ── Header ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpandido(!expandido)}
        onKeyDown={(e) => e.key === "Enter" && setExpandido(!expandido)}
        className="w-full text-left px-4 pt-3.5 pb-3 flex items-start gap-3 hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer"
      >
        <div className="w-9 h-9 rounded-full bg-[#FFF7ED] dark:bg-[#431407]/50 flex items-center justify-center shrink-0 mt-0.5">
          <tipoConf.Icon className="w-4 h-4 text-[#F97316]" />
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
            {/* Botones cabecera: lápiz + basura */}
            <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                title="Editar fecha y hora"
                onClick={() => setEditandoHiloFecha(
                  rootMsg ? toDatetimeLocal(rootMsg.fecha) : toDatetimeLocal(new Date().toISOString())
                )}
                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-foreground" />
              </button>
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
      </div>

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
              const estaBorrando = eliminandoMsgId === msg.id;
              const estaEditando = editandoMsg?.id === msg.id;
              const msgFecha = fechaCorta(msg.fecha, msg.creado_en);

              if (esEventoSistema(msg)) {
                // ── Evento de sistema (centrado, compacto) ──
                // Registro real del vendedor sin contenido de conversación.
                return (
                  <div key={msg.id} className="flex items-center justify-center gap-1.5 py-0.5 group">
                    <p className="text-[11px] text-muted-foreground bg-muted/60 border border-border/50 rounded-full px-3 py-1">
                      📞 Llamada sin respuesta · {msgFecha}
                    </p>
                    <button
                      onClick={() => solicitarEliminarMensaje(msg.id)}
                      disabled={estaBorrando}
                      title="Eliminar registro"
                      className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center opacity-30 sm:opacity-0 sm:group-hover:opacity-100 hover:opacity-100 hover:bg-destructive/10 transition-opacity disabled:opacity-20"
                    >
                      {estaBorrando
                        ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        : <Trash2 className="h-3 w-3 text-destructive/70" />
                      }
                    </button>
                  </div>
                );
              }

              if (esProsp) {
                // ── Burbuja prospecto (izquierda) ──
                const resInfo = RESOLUCION_LABEL[msg.transcripcion ?? ""];
                const textoResp = resInfo?.texto ?? msg.resumen_ia ?? msg.transcripcion ?? "Respuesta registrada";
                const esPos = resInfo ? resInfo.positivo : msg.sentimiento === "positivo";
                return (
                  <div key={msg.id} className="space-y-0.5">
                    <p className="text-[10px] font-medium text-[#F97316] ml-8">
                      {contacto?.nombre ?? "Prospecto"}
                    </p>
                    <div className="flex justify-start items-end gap-2 group">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mb-0.5">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className={`max-w-[78%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm ${
                        esPos
                          ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/40"
                          : "bg-card border border-border"
                      }`}>
                        <p className="text-sm text-foreground leading-relaxed">{textoResp}</p>
                        <p className="text-[10px] text-muted-foreground text-right mt-1">{msgFecha}</p>
                      </div>
                      {/* Lápiz editar */}
                      <button
                        onClick={() => setEditandoMsg({
                          id: msg.id,
                          texto: msg.transcripcion ?? msg.resumen_ia ?? "",
                          fecha: toDatetimeLocal(msg.fecha || msg.creado_en),
                          guardando: false, error: null,
                        })}
                        title="Editar mensaje"
                        className="self-center shrink-0 h-6 w-6 rounded-full flex items-center justify-center mb-0.5 opacity-30 sm:opacity-0 sm:group-hover:opacity-100 hover:opacity-100 hover:bg-muted transition-opacity"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                      {/* Basura */}
                      <button
                        onClick={() => solicitarEliminarMensaje(msg.id)}
                        disabled={estaBorrando}
                        title="Eliminar mensaje"
                        className="self-center shrink-0 h-6 w-6 rounded-full flex items-center justify-center mb-0.5 opacity-30 sm:opacity-0 sm:group-hover:opacity-100 hover:opacity-100 hover:bg-destructive/10 transition-opacity disabled:opacity-20"
                      >
                        {estaBorrando
                          ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          : <Trash2 className="h-3 w-3 text-destructive/70" />
                        }
                      </button>
                    </div>
                    {/* Formulario edición inline — prospecto */}
                    {estaEditando && <FormEdicion editandoMsg={editandoMsg!} setEditandoMsg={setEditandoMsg} onGuardar={guardarEdicionMensaje} />}
                  </div>
                );
              }

              // ── Burbuja vendedor (derecha) ──
              const texto = msg.resumen_ia ?? msg.transcripcion;
              return (
                <div key={msg.id} className="space-y-2">
                  <div className="flex justify-end items-start gap-1.5 group">
                    {/* Lápiz editar */}
                    <button
                      onClick={() => setEditandoMsg({
                        id: msg.id,
                        texto: msg.resumen_ia ?? msg.transcripcion ?? "",
                        fecha: toDatetimeLocal(msg.fecha || msg.creado_en),
                        guardando: false, error: null,
                      })}
                      title="Editar mensaje"
                      className="self-center shrink-0 h-6 w-6 rounded-full flex items-center justify-center mt-0.5 opacity-30 sm:opacity-0 sm:group-hover:opacity-100 hover:opacity-100 hover:bg-muted transition-opacity"
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                    {/* Basura */}
                    <button
                      onClick={() => solicitarEliminarMensaje(msg.id)}
                      disabled={estaBorrando}
                      title="Eliminar mensaje"
                      className="self-center shrink-0 h-6 w-6 rounded-full flex items-center justify-center mt-0.5 opacity-30 sm:opacity-0 sm:group-hover:opacity-100 hover:opacity-100 hover:bg-destructive/10 transition-opacity disabled:opacity-20"
                    >
                      {estaBorrando
                        ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        : <Trash2 className="h-3 w-3 text-destructive/70" />
                      }
                    </button>
                    <div className="max-w-[84%] bg-[#F97316] text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 shadow-sm">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {texto ?? (msg.tipo === "llamada" ? "Llamada registrada" : "Interacción registrada")}
                      </p>
                      <p className="text-[10px] text-white/60 text-right mt-1">{msgFecha} ✓✓</p>
                    </div>
                  </div>

                  {/* Formulario edición inline — vendedor */}
                  {estaEditando && <FormEdicion editandoMsg={editandoMsg!} setEditandoMsg={setEditandoMsg} onGuardar={guardarEdicionMensaje} />}

                  {countdown && !pausadaAt && (
                    <div className="flex justify-end">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${COUNTDOWN_STYLE[countdown.estado]}`}>
                        {countdown.texto}
                      </span>
                    </div>
                  )}

                  {isLastVendor && showResponseButtons && !form.open && !estaEditando && !pausadaAt && (
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
                          className="flex-1 h-9 rounded-xl bg-[#F97316] text-white text-xs font-semibold hover:bg-[#EA580C] transition-colors disabled:opacity-50"
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
              <div className="flex rounded-lg border border-border overflow-hidden shrink-0 text-[11px] font-semibold">
                <button
                  onClick={() => setInputBar((prev) => ({ ...prev, remitente: "vendedor" }))}
                  className={`px-2.5 py-1.5 transition-colors ${
                    inputBar.remitente === "vendedor" ? "bg-[#F97316] text-white" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Yo
                </button>
                <button
                  onClick={() => setInputBar((prev) => ({ ...prev, remitente: "prospecto" }))}
                  className={`px-2 py-1.5 transition-colors ${
                    inputBar.remitente === "prospecto" ? "bg-gray-600 dark:bg-gray-500 text-white" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Prospecto
                </button>
              </div>
              <Textarea
                ref={textareaRef}
                value={inputBar.texto}
                onChange={(e) => setInputBar((prev) => ({ ...prev, texto: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleEnviarInputBar(); }
                }}
                placeholder="Escribe un mensaje..."
                rows={1}
                className="flex-1 text-sm rounded-xl resize-none bg-muted/50 min-h-[36px] max-h-20 py-2 leading-tight"
              />
              <button
                onClick={() => void handleEnviarInputBar()}
                disabled={inputBar.enviando || !inputBar.texto.trim()}
                className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 ${
                  inputBar.remitente === "vendedor"
                    ? "bg-[#F97316] hover:bg-[#EA580C] text-white"
                    : "bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-400 text-white"
                }`}
              >
                {inputBar.enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            {inputBar.error && <p className="text-xs text-destructive mt-1.5 pl-1">{inputBar.error}</p>}
          </div>

          {/* ── Recordatorio ── */}
          <div className="px-4 py-2.5 border-t border-border/40">
            {!recordatorioAbierto ? (
              <button
                onClick={abrirRecordatorio}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                {rootMsg?.proximo_paso ? "📅 Editar tarea" : "📅 Crear tarea"}
              </button>
            ) : recGuardado ? (
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Tarea guardada</p>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={recFecha}
                    onChange={(e) => setRecFecha(e.target.value)}
                    className="flex-1 text-xs rounded-xl border border-border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <input
                  type="text"
                  value={recTexto}
                  onChange={(e) => setRecTexto(e.target.value)}
                  placeholder="Ej: Visitar planta, llamar para confirmar..."
                  className="w-full text-xs rounded-xl border border-border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => void guardarRecordatorio()}
                    disabled={guardandoRec}
                    className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {guardandoRec ? <Loader2 className="w-3 h-3 animate-spin" /> : "Guardar"}
                  </button>
                  <button
                    onClick={() => setRecordatorioAbierto(false)}
                    className="px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Botón pausar conversación ── */}
          {hilo.tipo !== "llamada" && (
            <div className="px-4 py-2 border-t border-border/40">
              <button
                onClick={async () => {
                  setToggling(true);
                  try {
                    const pausar = !pausadaAt;
                    const res = await fetch(`/api/empresas/${empresaId}/pausar`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ pausar }),
                    });
                    if (res.ok) onPausaToggle(pausar ? new Date().toISOString() : null);
                  } finally {
                    setToggling(false);
                  }
                }}
                disabled={toggling}
                className={`flex items-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                  pausadaAt
                    ? "text-amber-600 dark:text-amber-400 hover:text-amber-700"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {toggling
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <span>{pausadaAt ? "▶" : "⏸"}</span>}
                {pausadaAt ? "Conversación pausada — reactivar" : "Pausar conversación"}
              </button>
            </div>
          )}

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
                className="flex items-center gap-1.5 text-xs font-semibold text-[#F97316] hover:text-[#EA580C] transition-colors disabled:opacity-50"
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
                <div className="bg-[#FFF7ED] dark:bg-[#431407]/30 border border-orange-200 dark:border-orange-800/40 rounded-xl p-3">
                  <p className="text-xs font-semibold text-[#F97316] mb-1.5">✉️ Borrador de respuesta</p>
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

          {/* ── Dialog confirmación borrar mensaje ── */}
          <AlertDialog
            open={confirmandoMsg !== null}
            onOpenChange={(open) => { if (!open) setConfirmandoMsg(null); }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirmandoMsg?.esRoot ? "¿Qué quieres eliminar?" : "¿Eliminar este mensaje?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmandoMsg?.esRoot
                    ? "Este es el primer mensaje del hilo. Puedes eliminar solo este mensaje o borrar el hilo completo."
                    : "Esta acción no se puede deshacer."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className={confirmandoMsg?.esRoot ? "flex-col-reverse sm:flex-row gap-2" : ""}>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                {confirmandoMsg?.esRoot ? (
                  <>
                    <AlertDialogAction
                      onClick={() => {
                        const snap = confirmandoMsg;
                        if (snap) void confirmarEliminarMensaje(snap.id, snap.esRoot, true);
                      }}
                      className="bg-destructive/70 text-white hover:bg-destructive/90"
                    >
                      Solo este mensaje
                    </AlertDialogAction>
                    <AlertDialogAction
                      onClick={() => {
                        const snap = confirmandoMsg;
                        if (snap) void confirmarEliminarMensaje(snap.id, snap.esRoot, false);
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Todo el hilo
                    </AlertDialogAction>
                  </>
                ) : (
                  <AlertDialogAction
                    onClick={() => {
                      const snap = confirmandoMsg;
                      if (snap) void confirmarEliminarMensaje(snap.id, snap.esRoot, true);
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Eliminar
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ── Dialog editar fecha/hora del hilo (mensaje raíz) ── */}
          <Dialog
            open={editandoHiloFecha !== null}
            onOpenChange={(open) => { if (!open) { setEditandoHiloFecha(null); setErrorHiloFecha(null); } }}
          >
            <DialogContent className="max-w-sm rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-sm font-bold">Editar fecha y hora</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    Fecha y hora del primer mensaje
                  </label>
                  <input
                    type="datetime-local"
                    value={editandoHiloFecha ?? ""}
                    onChange={(e) => setEditandoHiloFecha(e.target.value)}
                    className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                {errorHiloFecha && (
                  <p className="text-xs text-destructive">{errorHiloFecha}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setEditandoHiloFecha(null); setErrorHiloFecha(null); }}
                    className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => void guardarFechaHilo()}
                    disabled={guardandoHiloFecha}
                    className="flex-1 h-10 rounded-xl bg-[#F97316] text-white text-sm font-semibold hover:bg-[#EA580C] transition-colors disabled:opacity-50"
                  >
                    {guardandoHiloFecha ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Guardar"}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

        </div>
      )}
    </div>
  );
}

// ── Formulario inline de edición de burbuja ───────────────────

function FormEdicion({
  editandoMsg,
  setEditandoMsg,
  onGuardar,
}: {
  editandoMsg: EditMsgState;
  setEditandoMsg: React.Dispatch<React.SetStateAction<EditMsgState | null>>;
  onGuardar: () => Promise<void>;
}) {
  return (
    <div className="space-y-2 mt-1 pl-8">
      <Textarea
        autoFocus
        value={editandoMsg.texto}
        onChange={(e) => setEditandoMsg((prev) => prev ? { ...prev, texto: e.target.value } : null)}
        rows={3}
        className="text-sm rounded-xl resize-none bg-card"
        placeholder="Texto del mensaje…"
      />
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
          Fecha y hora
        </label>
        <input
          type="datetime-local"
          value={editandoMsg.fecha}
          onChange={(e) => setEditandoMsg((prev) => prev ? { ...prev, fecha: e.target.value } : null)}
          className="w-full text-sm rounded-xl border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
      {editandoMsg.error && <p className="text-xs text-destructive">{editandoMsg.error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => setEditandoMsg(null)}
          className="flex-1 h-9 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={() => void onGuardar()}
          disabled={editandoMsg.guardando}
          className="flex-1 h-9 rounded-xl bg-[#F97316] text-white text-xs font-semibold hover:bg-[#EA580C] transition-colors disabled:opacity-50"
        >
          {editandoMsg.guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Guardar"}
        </button>
      </div>
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
        <p className="text-xs font-extrabold text-[#F97316] uppercase tracking-wide mb-1.5">Evolución de la relación</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.evolucion}</p>
      </section>
      <section>
        <p className="text-xs font-extrabold text-[#F97316] uppercase tracking-wide mb-1.5">Justificación</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.justificacion_probabilidad}</p>
      </section>
      {analisis.momentos_clave.length > 0 && (
        <section>
          <p className="text-xs font-extrabold text-[#F97316] uppercase tracking-wide mb-2">Momentos clave</p>
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
        <p className="text-xs font-extrabold text-[#F97316] uppercase tracking-wide mb-1.5">Patrón del prospecto</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.patron_prospecto}</p>
      </section>
      <section>
        <p className="text-xs font-extrabold text-[#F97316] uppercase tracking-wide mb-1.5">Estado actual real</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.estado_actual_real}</p>
      </section>
      <section>
        <p className="text-xs font-extrabold text-[#F97316] uppercase tracking-wide mb-1.5">Estrategia recomendada</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{analisis.estrategia_recomendada}</p>
      </section>
      <section>
        <p className="text-xs font-extrabold text-[#F97316] uppercase tracking-wide mb-2">Próximos 3 pasos</p>
        <div className="space-y-2">
          {analisis.proximos_3_pasos.map((paso, i) => (
            <div key={i} className="flex items-start gap-2.5 bg-[#FFF7ED] dark:bg-[#431407]/30 rounded-xl p-3">
              <span className="text-xs font-extrabold text-[#F97316] shrink-0 mt-0.5">{i + 1}</span>
              <p className="text-sm text-foreground/80">{paso}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
