"use client";

// =============================================================
// Panel "Nueva interacción" — se abre desde el tab Historial.
// Tipo llamada: upload audio → AssemblyAI → guardar + analizar.
// Tipos texto: textarea → guardar sin analizar o ⚡ guardar y analizar.
// Sin respuesta: registro directo, gratis.
// =============================================================

import { useState, useRef } from "react";
import { nowChileLocal } from "@/lib/fecha";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Phone, Mail, MessageCircle, Briefcase, PhoneOff, Users,
  Upload, Loader2, CheckCircle2,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import type { Contacto, Interaccion, TipoInteraccion } from "@/lib/types";

type Fase = "tipos" | "form" | "transcribiendo" | "ok";

const TIPOS = [
  { id: "llamada" as TipoInteraccion,       emoji: "📞", label: "Llamada",        Icon: Phone,          ia: true  },
  { id: "reunion" as TipoInteraccion,       emoji: "🤝", label: "Reunión",        Icon: Users,          ia: false },
  { id: "whatsapp" as TipoInteraccion,      emoji: "💬", label: "WhatsApp",       Icon: MessageCircle,  ia: false },
  { id: "email" as TipoInteraccion,         emoji: "📧", label: "Correo",         Icon: Mail,           ia: false },
  { id: "linkedin" as TipoInteraccion,      emoji: "💼", label: "LinkedIn",       Icon: Briefcase,      ia: false },
  { id: "sin_respuesta" as TipoInteraccion, emoji: "⏰", label: "Sin respuesta",  Icon: PhoneOff,       ia: false },
];

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  empresaId: string;
  contactos: Contacto[];
  onCreada: (interaccion: Interaccion) => void;
}

export function NuevaInteraccionSheet({
  abierto, onCerrar, empresaId, contactos, onCreada,
}: Props) {
  const [fase, setFase] = useState<Fase>("tipos");
  const [tipo, setTipo] = useState<TipoInteraccion | null>(null);
  const [texto, setTexto] = useState("");
  const [contactoId, setContactoId] = useState<string>("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mensajeCarga, setMensajeCarga] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string>(() => nowChileLocal());
  const [resultado, setResultado] = useState<string>("");
  const [noContesto, setNoContesto] = useState(false);
  const [proximoPasoFecha, setProximoPasoFecha] = useState("");
  const [proximoPasoTexto, setProximoPasoTexto] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFase("tipos");
    setTipo(null);
    setTexto("");
    setContactoId("");
    setArchivo(null);
    setCargando(false);
    setMensajeCarga("");
    setError(null);
    setFecha(nowChileLocal());
    setResultado("");
    setNoContesto(false);
    setProximoPasoFecha("");
    setProximoPasoTexto("");
  }

  function cerrar() {
    reset();
    onCerrar();
  }

  function seleccionarTipo(t: TipoInteraccion) {
    setTipo(t);
    setFase("form");
    setError(null);
  }

  // ── Registrar sin respuesta ──────────────────────────────────
  async function registrarSinRespuesta() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/interacciones/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          tipo: "sin_respuesta",
          contacto_id: contactoId || undefined,
          fecha: new Date(fecha).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreada(data.interaccion);
      setFase("ok");
      setTimeout(cerrar, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar");
    } finally {
      setCargando(false);
    }
  }

  // ── Guardar texto sin análisis ───────────────────────────────
  async function guardarSinAnalizar() {
    if (!texto.trim()) { setError("Escribe el resumen antes de guardar."); return; }
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/interacciones/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          tipo,
          texto: texto.trim(),
          contacto_id: contactoId || undefined,
          fecha: new Date(fecha).toISOString(),
          sentimiento: resultado || undefined,
          proximo_paso: proximoPasoTexto || undefined,
          proximo_paso_fecha: proximoPasoFecha || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreada(data.interaccion);
      setFase("ok");
      setTimeout(cerrar, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setCargando(false);
    }
  }

  // ── Guardar texto + analizar con Claude ──────────────────────
  async function guardarYAnalizar() {
    if (!texto.trim()) { setError("Escribe el resumen antes de analizar."); return; }
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/analizar-interaccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          tipo,
          texto: texto.trim(),
          contacto_id: contactoId || undefined,
          fecha: new Date(fecha).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreada(data.interaccion_id
        // El endpoint devuelve interaccion_id, no el objeto completo.
        // Construimos un objeto mínimo para actualizar la lista.
        ? { ...data.resultado, id: data.interaccion_id, empresa_id: empresaId, tipo, fecha: new Date().toISOString(), contacto_id: contactoId || null, parent_id: null, remitente: "vendedor", audio_url: null, transcripcion: tipo === "llamada" ? texto : null, resumen_ia: data.resultado?.resumen ?? null, compromisos: null, sentimiento: data.resultado?.sentimiento_prospecto ?? null, tecnica_usada: data.resultado?.tecnica_recomendada ?? null, coaching_ia: JSON.stringify(data.resultado), proximo_paso: data.resultado?.proximo_paso ?? null, proximo_paso_fecha: null, badge_estado: data.resultado?.badge_estado ?? null, decision_sugerida: data.resultado?.decision_sugerida ?? null, resuelta: false, creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() } as Interaccion
        : data.interaccion
      );
      setFase("ok");
      setTimeout(cerrar, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al analizar");
    } finally {
      setCargando(false);
    }
  }

  // ── Llamada sin respuesta — sin audio, sin IA ───────────────
  async function guardarNoContesto() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/interacciones/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          tipo: "llamada",
          contacto_id: contactoId || undefined,
          fecha: new Date(fecha).toISOString(),
          texto: "Llamada sin respuesta",
          sentimiento: "neutro",
        }),
      });
      const data = await res.json() as { ok: boolean; interaccion: Interaccion; error?: string };
      if (!res.ok) throw new Error(data.error);
      onCreada(data.interaccion);
      setFase("ok");
      setTimeout(cerrar, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar");
    } finally {
      setCargando(false);
    }
  }

  // ── Subir llamada (AssemblyAI → análisis) ───────────────────
  async function subirYAnalizar() {
    if (!archivo) { setError("Selecciona un archivo de audio."); return; }
    setCargando(true);
    setError(null);
    try {
      setMensajeCarga("Subiendo audio a la nube... ⚡");
      setFase("transcribiendo");

      const supabase = createClient();
      const pathStorage = `${Date.now()}_${archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("Llamadas")
        .upload(pathStorage, archivo, { contentType: archivo.type.startsWith("video/") ? archivo.type.replace("video/", "audio/") : archivo.type, upsert: false });

      if (uploadError || !uploadData?.path) {
        throw new Error(`Error al subir el audio: ${uploadError?.message ?? "sin respuesta de Storage"}`);
      }

      const resT = await fetch("/api/transcribir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: uploadData.path }),
      });
      const dataT = await resT.json();
      if (!resT.ok) throw new Error(dataT.error);

      setMensajeCarga("Analizando con IA... ⚡");

      const resA = await fetch("/api/analizar-interaccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          tipo: "llamada",
          texto: dataT.transcripcion,
          audio_url: dataT.audio_url,
          contacto_id: contactoId || undefined,
          fecha: new Date(fecha).toISOString(),
        }),
      });
      const dataA = await resA.json();
      if (!resA.ok) throw new Error(dataA.error);

      // Para la lista, creamos objeto Interaccion mínimo con los datos disponibles
      const interaccionCreada: Interaccion = {
        id: dataA.interaccion_id,
        empresa_id: empresaId,
        contacto_id: contactoId || null,
        parent_id: null,
        tipo: "llamada",
        fecha: new Date().toISOString(),
        audio_url: dataT.audio_url ?? null,
        transcripcion: dataT.transcripcion,
        resumen_ia: dataA.resultado?.resumen ?? null,
        compromisos: null,
        sentimiento: dataA.resultado?.sentimiento_prospecto ?? null,
        tecnica_usada: dataA.resultado?.tecnica_recomendada ?? null,
        coaching_ia: JSON.stringify(dataA.resultado),
        proximo_paso: dataA.resultado?.proximo_paso ?? null,
        proximo_paso_fecha: null,
        badge_estado: dataA.resultado?.badge_estado ?? null,
        decision_sugerida: dataA.resultado?.decision_sugerida ?? null,
        remitente: "vendedor",
        resuelta: false,
        creado_en: new Date().toISOString(),
        actualizado_en: new Date().toISOString(),
      };

      onCreada(interaccionCreada);
      setFase("ok");
      setTimeout(cerrar, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar el audio");
      setFase("form");
    } finally {
      setCargando(false);
      setMensajeCarga("");
    }
  }

  const tipoConf = TIPOS.find((t) => t.id === tipo);

  return (
    <Dialog open={abierto} onOpenChange={(open) => { if (!open) cerrar(); }}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden gap-0 flex flex-col max-h-[90vh]">

        {/* ── FASE: Selección de tipo ── */}
        {fase === "tipos" && (
          <>
            <DialogHeader className="px-5 pt-5 pb-3">
              <DialogTitle className="text-base font-extrabold">Nueva interacción</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">¿Qué tipo de contacto fue?</p>
            </DialogHeader>
            <div className="px-4 pb-5 space-y-2 overflow-y-auto flex-1">
              {TIPOS.map(({ id, emoji, label, ia }) => (
                <button
                  key={id}
                  onClick={() => seleccionarTipo(id)}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left active:scale-[0.98]"
                >
                  <span className="text-xl">{emoji}</span>
                  <span className="flex-1 font-medium text-sm">{label}</span>
                  {ia && (
                    <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
                      ⚡ usa IA
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── FASE: Formulario ── */}
        {fase === "form" && tipoConf && (
          <>
            <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
              <button
                onClick={() => setFase("tipos")}
                className="text-xs text-muted-foreground hover:text-foreground mb-1"
              >
                ← Volver
              </button>
              <DialogTitle className="text-base font-extrabold">
                {tipoConf.emoji} {tipoConf.label}
              </DialogTitle>
            </DialogHeader>

            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Toggle "No contestó" — solo para llamadas, primer elemento visible */}
              {tipo === "llamada" && (
                <button
                  type="button"
                  onClick={() => setNoContesto(!noContesto)}
                  className={[
                    "w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all active:scale-[0.98]",
                    noContesto
                      ? "border-[#F97316] bg-[#F97316]/8"
                      : "border-border hover:border-primary/40",
                  ].join(" ")}
                >
                  <PhoneOff className={["w-4 h-4 shrink-0", noContesto ? "text-[#F97316]" : "text-muted-foreground"].join(" ")} />
                  <div className="flex-1 text-left">
                    <p className={["text-sm font-semibold", noContesto ? "text-[#F97316]" : "text-foreground"].join(" ")}>
                      No contestó
                    </p>
                    <p className="text-xs text-muted-foreground">Registrar sin audio ni análisis</p>
                  </div>
                  {/* Toggle pill */}
                  <div className={["w-10 h-6 rounded-full transition-colors relative shrink-0", noContesto ? "bg-[#F97316]" : "bg-muted"].join(" ")}>
                    <div className={["absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all", noContesto ? "left-5" : "left-1"].join(" ")} />
                  </div>
                </button>
              )}

              {/* Fecha y hora */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Fecha y hora
                </label>
                <input
                  type="datetime-local"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Selector de contacto */}
              {contactos.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    Contacto (opcional)
                  </label>
                  <select
                    value={contactoId}
                    onChange={(e) => setContactoId(e.target.value)}
                    className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="">Sin contacto específico</option>
                    {contactos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}{c.cargo ? ` — ${c.cargo}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Llamada: file upload — se oculta cuando "No contestó" está activo */}
              {tipo === "llamada" && !noContesto && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    Archivo de audio
                  </label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".mp3,.mp4,.m4a,.wav,.ogg,.flac,.webm"
                    className="hidden"
                    onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-muted/40 transition-all"
                  >
                    <Upload className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {archivo ? archivo.name : "Seleccionar MP3, M4A, WAV…"}
                    </span>
                  </button>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    ⚡ Transcribe con AssemblyAI y analiza con Claude
                  </p>
                </div>
              )}

              {/* Sin respuesta: solo info */}
              {tipo === "sin_respuesta" && (
                <div className="bg-muted/40 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Registra que enviaste un mensaje o llamaste y no obtuviste respuesta.
                    El copiloto lo recordará para hacerte seguimiento en 5 días hábiles.
                  </p>
                </div>
              )}

              {/* Tipos texto: resumen libre */}
              {tipo !== "llamada" && tipo !== "sin_respuesta" && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    Resumen
                  </label>
                  <Textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder={
                      tipo === "reunion"
                        ? "¿De qué se habló? ¿Qué acordaron?"
                        : tipo === "email"
                        ? "Pega el correo o escribe un resumen…"
                        : tipo === "whatsapp"
                        ? "Pega la conversación o escribe un resumen…"
                        : "Pega el hilo o escribe un resumen…"
                    }
                    className="min-h-[120px] text-sm rounded-xl resize-none"
                  />
                </div>
              )}

              {/* Resultado — solo para tipos texto (no llamada ni sin_respuesta) */}
              {tipo !== "llamada" && tipo !== "sin_respuesta" && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    Resultado (opcional)
                  </label>
                  <div className="flex gap-2">
                    {(["positivo", "neutro", "negativo"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setResultado(resultado === r ? "" : r)}
                        className={[
                          "flex-1 py-2 rounded-xl text-xs font-semibold border transition-all",
                          resultado === r
                            ? r === "positivo"
                              ? "bg-green-100 border-green-400 text-green-700 dark:bg-green-900/30 dark:border-green-600 dark:text-green-400"
                              : r === "negativo"
                              ? "bg-red-100 border-red-400 text-red-700 dark:bg-red-900/30 dark:border-red-600 dark:text-red-400"
                              : "bg-amber-100 border-amber-400 text-amber-700 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-400"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        ].join(" ")}
                      >
                        {r === "positivo" ? "👍 Positivo" : r === "negativo" ? "👎 Negativo" : "😐 Neutro"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Seguimiento — solo para whatsapp, email, linkedin */}
              {(tipo === "whatsapp" || tipo === "email" || tipo === "linkedin") && (
                <div className="space-y-3 pt-1 border-t border-border">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                      📅 Recordarme el (opcional)
                    </label>
                    <input
                      type="date"
                      value={proximoPasoFecha}
                      onChange={(e) => setProximoPasoFecha(e.target.value)}
                      className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                      📝 Qué hacer (opcional)
                    </label>
                    <input
                      type="text"
                      value={proximoPasoTexto}
                      onChange={(e) => setProximoPasoTexto(e.target.value)}
                      placeholder="Ej: Ir a visitar planta, llamar para confirmar reunión..."
                      className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-xl p-3">
                  {error}
                </p>
              )}

              {/* Botones de acción */}
              <div className="flex gap-2 pt-1">
                {tipo === "llamada" && noContesto && (
                  <Button
                    className="flex-1 bg-[#F97316] hover:bg-[#EA580C] text-white h-11 rounded-xl text-sm"
                    onClick={guardarNoContesto}
                    disabled={cargando}
                  >
                    {cargando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                    Registrar llamada
                  </Button>
                )}

                {tipo === "llamada" && !noContesto && (
                  <Button
                    className="flex-1 bg-[#F97316] hover:bg-[#EA580C] text-white h-11 rounded-xl text-sm"
                    onClick={subirYAnalizar}
                    disabled={cargando || !archivo}
                  >
                    {cargando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                    ⚡ Subir y analizar
                  </Button>
                )}

                {tipo === "sin_respuesta" && (
                  <Button
                    className="flex-1 h-11 rounded-xl text-sm"
                    onClick={registrarSinRespuesta}
                    disabled={cargando}
                  >
                    {cargando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                    Registrar
                  </Button>
                )}

                {tipo !== "llamada" && tipo !== "sin_respuesta" && (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1 h-11 rounded-xl text-sm"
                      onClick={guardarSinAnalizar}
                      disabled={cargando}
                    >
                      Guardar
                    </Button>
                    <Button
                      className="flex-1 bg-[#F97316] hover:bg-[#EA580C] text-white h-11 rounded-xl text-sm"
                      onClick={guardarYAnalizar}
                      disabled={cargando}
                    >
                      {cargando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                      ⚡ Guardar y analizar
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── FASE: Transcribiendo/Analizando (llamada larga) ── */}
        {fase === "transcribiendo" && (
          <div className="px-5 py-12 flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FFF7ED] flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-[#F97316] animate-spin" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-semibold text-sm">{mensajeCarga || "Procesando…"}</p>
              <p className="text-xs text-muted-foreground">Esto puede tomar 2-5 minutos</p>
            </div>
            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-xl p-3 text-center">
                {error}
              </p>
            )}
          </div>
        )}

        {/* ── FASE: Éxito ── */}
        {fase === "ok" && (
          <div className="px-5 py-12 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-green-600" />
            </div>
            <p className="font-semibold text-sm text-center">¡Interacción guardada!</p>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
