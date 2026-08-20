"use client";

// =============================================================
// Detalle de un prospecto ligero ("Por calificar"): sin ficha IA.
// Permite gestionar contactos libres y registrar interacciones
// (mismo historial que el pipeline), y promover al pipeline
// (regenerar = investigación IA existente → promover = flip).
// =============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Zap, Globe, Loader2, Plus, Pencil, Trash2,
  User, Phone, Mail, Building2, AlertCircle, Snowflake,
  ChevronDown, Copy, Check, Briefcase, ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { TabHistorial } from "@/components/cuentas/tab-historial";
import { hoyCL } from "@/lib/fecha";
import type { EmpresaCompleta, Contacto, Interaccion } from "@/lib/types";

// Suma días calendario a una fecha "YYYY-MM-DD" (aritmética UTC-mediodía, DST-safe)
function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().split("T")[0];
}

// "2026-09-20" → "20 de sep" (zona Chile explícita para que no varíe por dispositivo)
function fechaLegible(fecha: string): string {
  return new Date(fecha + "T12:00:00Z").toLocaleDateString("es-CL", {
    day: "numeric", month: "short", timeZone: "America/Santiago",
  });
}

// Presets de un clic — respeta CERO TIPEO: el vendedor no escribe fechas
const PRESETS_CONGELAR = [
  { label: "1 semana", dias: 7 },
  { label: "1 mes", dias: 30 },
  { label: "3 meses", dias: 90 },
];

interface Props {
  empresa: EmpresaCompleta;
  interacciones: Interaccion[];
}

// Estado del formulario de contacto (alta o edición)
interface FormContacto {
  id: string | null; // null = alta
  nombre: string;
  cargo: string;
  telefono: string;
  email: string;
  linkedin_url: string;
}
const FORM_VACIO: FormContacto = { id: null, nombre: "", cargo: "", telefono: "", email: "", linkedin_url: "" };

export function ProspectoLigeroDetail({ empresa, interacciones }: Props) {
  const router = useRouter();
  // Contactos en estado local (sincroniza el editor y el selector del historial)
  const [contactos, setContactos] = useState<Contacto[]>(empresa.contactos);
  const [form, setForm] = useState<FormContacto | null>(null);
  const [guardandoContacto, setGuardandoContacto] = useState(false);
  const [promoverAbierto, setPromoverAbierto] = useState(false);
  // Contacto expandido (uno a la vez) + feedback del botón copiar
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  // Congelamiento. Solo cuenta como congelado si la fecha es FUTURA —
  // misma semántica que getProspectosCongelados: hasta <= hoy ya está activo.
  const hoy = hoyCL();
  const [congelado, setCongelado] = useState<string | null>(
    empresa.prospecto_congelado_hasta && empresa.prospecto_congelado_hasta > hoy
      ? empresa.prospecto_congelado_hasta
      : null
  );
  const [congelarAbierto, setCongelarAbierto] = useState(false);
  const [descongelando, setDescongelando] = useState(false);

  // ── Contactos: alta / edición ──────────────────────────────
  const guardarContacto = async () => {
    if (!form || !form.nombre.trim()) return;
    setGuardandoContacto(true);
    try {
      if (form.id) {
        const res = await fetch(`/api/contactos/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: form.nombre.trim(), cargo: form.cargo.trim(),
            telefono: form.telefono.trim(), email: form.email.trim(),
            linkedin_url: form.linkedin_url.trim(),
          }),
        });
        const actualizado = (await res.json()) as Contacto;
        if (res.ok) {
          setContactos((prev) => prev.map((c) => (c.id === form.id ? actualizado : c)));
          setForm(null);
          router.refresh();
        }
      } else {
        const res = await fetch("/api/contactos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            empresa_id: empresa.id, nombre: form.nombre.trim(),
            cargo: form.cargo.trim() || undefined, telefono: form.telefono.trim() || undefined,
            email: form.email.trim() || undefined,
            linkedin_url: form.linkedin_url.trim() || undefined,
          }),
        });
        const nuevo = (await res.json()) as Contacto;
        if (res.ok) {
          setContactos((prev) => [...prev, nuevo]);
          setForm(null);
          router.refresh();
        }
      }
    } finally {
      setGuardandoContacto(false);
    }
  };

  const eliminarContacto = async (id: string) => {
    const prev = contactos;
    setContactos((c) => c.filter((x) => x.id !== id)); // optimista
    const res = await fetch(`/api/contactos/${id}`, { method: "DELETE" });
    if (!res.ok) setContactos(prev); // revertir si falla
    else router.refresh();
  };

  const copiarEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiado(email);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Clipboard bloqueado por el navegador: no rompemos nada, solo no hay feedback.
    }
  };

  const descongelar = async () => {
    setDescongelando(true);
    try {
      const res = await fetch(`/api/empresas/${empresa.id}/descongelar`, { method: "PATCH" });
      if (res.ok) {
        setCongelado(null);
        router.refresh();
      }
    } finally {
      setDescongelando(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header neutro (slate) — distinto del violeta del pipeline */}
      <div className="bg-slate-700 dark:bg-slate-800 px-5 pt-4 pb-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => router.push("/cuentas")} className="flex items-center gap-1 text-white/80 hover:text-white text-sm">
            <ArrowLeft className="h-4 w-4" />
            Cuentas
          </button>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white">
            Por calificar
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-white leading-tight">{empresa.nombre}</h1>
        {empresa.url && (
          <a href={empresa.url} target="_blank" rel="noopener noreferrer"
             className="text-white/70 text-sm mt-0.5 inline-flex items-center gap-1 hover:text-white">
            <Globe className="h-3.5 w-3.5" />
            {empresa.url.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        )}
        {/* Acción principal: investigar y pasar al pipeline */}
        <Button
          className="mt-4 w-full gap-2 bg-white text-slate-800 hover:bg-white/90 font-semibold"
          onClick={() => setPromoverAbierto(true)}
        >
          <Zap className="h-4 w-4" />
          Investigar y pasar a pipeline
        </Button>
        <p className="text-xs text-center text-white/60 mt-1.5">⚡ Esta acción usa créditos de IA</p>

        {/* Congelamiento: banner si está congelado, botón si está activo */}
        {congelado ? (
          <div className="mt-3 rounded-xl bg-white/10 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white inline-flex items-center gap-1.5">
                <Snowflake className="h-3.5 w-3.5" /> Congelado
              </p>
              <p className="text-xs text-white/70 mt-0.5">Recontactar el {fechaLegible(congelado)}</p>
            </div>
            <button onClick={descongelar} disabled={descongelando}
              className="shrink-0 text-xs font-semibold px-3 h-8 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50">
              {descongelando && <Loader2 className="h-3 w-3 animate-spin" />}
              Descongelar
            </button>
          </div>
        ) : (
          <button onClick={() => setCongelarAbierto(true)}
            className="mt-3 w-full h-10 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors inline-flex items-center justify-center gap-2">
            <Snowflake className="h-4 w-4" />
            Congelar prospecto
          </button>
        )}
      </div>

      <div className="flex-1 px-4 py-4 space-y-6">
        {/* ── Contactos libres ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Contactos
            </h2>
            {!form && (
              <button onClick={() => setForm(FORM_VACIO)}
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Agregar
              </button>
            )}
          </div>

          {contactos.length === 0 && !form && (
            <p className="text-sm text-muted-foreground py-2">
              Sin contactos aún. Agrégalos a medida que los encuentres.
            </p>
          )}

          <div className="space-y-2">
            {contactos.map((c) =>
              form?.id === c.id ? (
                <ContactoForm key={c.id} form={form} setForm={setForm}
                  onGuardar={guardarContacto} guardando={guardandoContacto} />
              ) : (
                <div key={c.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                  {/* Cabecera clickeable. Es un <div role="button">, NO un <button>:
                      contiene los botones de editar/eliminar y un <button> dentro de
                      otro <button> es HTML inválido → error de hydration de React. */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandidoId(expandidoId === c.id ? null : c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandidoId(expandidoId === c.id ? null : c.id);
                      }
                    }}
                    className="p-3 flex items-start gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-xl bg-[#FFF7ED] dark:bg-[#431407]/50 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-[#F97316]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{c.nombre ?? "Sin nombre"}</p>
                      {c.cargo && <p className="text-xs text-muted-foreground truncate">{c.cargo}</p>}
                      {/* Iconitos de presencia: qué canales tiene, sin gastar espacio */}
                      <div className="flex items-center gap-2 mt-1">
                        {c.telefono && <Phone className="h-3 w-3 text-muted-foreground/60" />}
                        {c.email && <Mail className="h-3 w-3 text-muted-foreground/60" />}
                        {c.linkedin_url && <Briefcase className="h-3 w-3 text-muted-foreground/60" />}
                        {!c.telefono && !c.email && !c.linkedin_url && (
                          <span className="text-xs text-muted-foreground/60">Sin datos de contacto</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setForm({ id: c.id, nombre: c.nombre ?? "", cargo: c.cargo ?? "", telefono: c.telefono ?? "", email: c.email ?? "", linkedin_url: c.linkedin_url ?? "" })}
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted" title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => eliminarContacto(c.id)}
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20" title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 mt-1.5 transition-transform duration-200 ${expandidoId === c.id ? "rotate-180" : ""}`} />
                  </div>

                  {/* Panel expandido — HERMANO de la cabecera, nunca anidado dentro */}
                  {expandidoId === c.id && (
                    <div className="border-t border-border bg-muted/20 px-3 py-2.5 space-y-2">
                      {c.telefono && (
                        <FilaCanal Icon={Phone} valor={c.telefono}>
                          <a href={`tel:${c.telefono.replace(/\s+/g, "")}`} className={CHIP_ACCION}>
                            <Phone className="h-3 w-3" /> Llamar
                          </a>
                        </FilaCanal>
                      )}
                      {c.email && (
                        <FilaCanal Icon={Mail} valor={c.email}>
                          <button onClick={() => copiarEmail(c.email!)} className={CHIP_ACCION}>
                            {copiado === c.email
                              ? <><Check className="h-3 w-3" /> Copiado</>
                              : <><Copy className="h-3 w-3" /> Copiar</>}
                          </button>
                        </FilaCanal>
                      )}
                      {c.linkedin_url && (
                        <FilaCanal Icon={Briefcase} valor={c.linkedin_url.replace(/^https?:\/\/(www\.)?/, "")}>
                          <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className={CHIP_ACCION}>
                            <ExternalLink className="h-3 w-3" /> Abrir
                          </a>
                        </FilaCanal>
                      )}
                      {!c.telefono && !c.email && !c.linkedin_url && (
                        <p className="text-xs text-muted-foreground py-1">
                          Sin teléfono, email ni LinkedIn. Usa el lápiz para agregarlos.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            )}
            {/* Form de alta (cuando form.id === null) */}
            {form && form.id === null && (
              <ContactoForm form={form} setForm={setForm}
                onGuardar={guardarContacto} guardando={guardandoContacto} />
            )}
          </div>
        </section>

        {/* ── Historial (reutiliza el flujo del pipeline) ── */}
        <section>
          <h2 className="font-semibold text-base flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-primary" />
            Seguimiento
          </h2>
          <TabHistorial
            interacciones={interacciones}
            empresaId={empresa.id}
            contactos={contactos}
            conversacionPausadaAt={empresa.conversacion_pausada_at}
          />
        </section>
      </div>

      {promoverAbierto && (
        <PromoverDialog
          empresaId={empresa.id}
          urlInicial={empresa.url ?? ""}
          onClose={() => setPromoverAbierto(false)}
        />
      )}

      {congelarAbierto && (
        <CongelarDialog
          empresaId={empresa.id}
          onClose={() => setCongelarAbierto(false)}
          onCongelado={(hasta) => {
            setCongelado(hasta);
            setCongelarAbierto(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// Chip de acción compartido por las filas del panel expandido
const CHIP_ACCION =
  "shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 h-7 rounded-lg " +
  "bg-[#FFF7ED] text-[#C2410C] hover:bg-[#FFEDD5] dark:bg-[#431407]/40 dark:text-orange-300 " +
  "dark:hover:bg-[#431407]/60 transition-colors";

// Fila de un canal de contacto: icono + valor + acción
function FilaCanal({ Icon, valor, children }: {
  Icon: LucideIcon; valor: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs flex-1 min-w-0 truncate">{valor}</span>
      {children}
    </div>
  );
}

// ── Dialog de congelamiento: presets de un clic + fecha manual ──
function CongelarDialog({ empresaId, onClose, onCongelado }: {
  empresaId: string;
  onClose: () => void;
  onCongelado: (hasta: string) => void;
}) {
  const hoy = hoyCL();
  const [fecha, setFecha] = useState(sumarDias(hoy, 30)); // default: 1 mes
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const congelar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/congelar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hasta: fecha }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "No se pudo congelar.");
      onCongelado(fecha);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al congelar.");
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !guardando) onClose(); }}>
      <DialogContent className="max-w-sm mx-4 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
              <Snowflake className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </div>
            Congelar prospecto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sale de <span className="font-medium text-foreground">Activos</span> y
            vuelve solo cuando llegue la fecha de recontacto.
          </p>

          <div className="grid grid-cols-3 gap-2">
            {PRESETS_CONGELAR.map((p) => {
              const f = sumarDias(hoy, p.dias);
              const activo = fecha === f;
              return (
                <button key={p.dias} onClick={() => setFecha(f)}
                  className={`h-10 rounded-xl text-xs font-semibold border-2 transition-colors ${
                    activo
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}>
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              O elige una fecha exacta
            </label>
            <input type="date" value={fecha} min={sumarDias(hoy, 1)}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border-2 border-gray-200 bg-white dark:bg-gray-950 dark:border-gray-700 text-sm focus:outline-none focus:border-primary transition-colors" />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <Button size="lg" className="w-full gap-2 h-12"
            disabled={!fecha || fecha <= hoy || guardando} onClick={congelar}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Snowflake className="h-4 w-4" />}
            {fecha > hoy ? `Congelar hasta el ${fechaLegible(fecha)}` : "Elige una fecha futura"}
          </Button>
          <p className="text-xs text-center text-muted-foreground">No usa créditos de IA</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Formulario inline de contacto (alta/edición) ───────────────
function ContactoForm({ form, setForm, onGuardar, guardando }: {
  form: FormContacto;
  setForm: (f: FormContacto | null) => void;
  onGuardar: () => void;
  guardando: boolean;
}) {
  const campo = "w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary";
  return (
    <div className="rounded-2xl border border-primary/30 bg-card p-3 space-y-2">
      <input autoFocus placeholder="Nombre *" value={form.nombre} className={campo}
        onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
      <input placeholder="Cargo" value={form.cargo} className={campo}
        onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Teléfono" value={form.telefono} className={campo}
          onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
        <input type="email" placeholder="Email" value={form.email} className={campo}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <input
        type="url"
        placeholder="LinkedIn URL"
        value={form.linkedin_url}
        className={campo}
        onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
      />
      <div className="flex gap-2 pt-1">
        <Button size="sm" className="flex-1 gap-1.5" disabled={!form.nombre.trim() || guardando} onClick={onGuardar}>
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {form.id ? "Guardar" : "Agregar contacto"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setForm(null)} disabled={guardando}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ── Dialog de promoción: regenerar (IA) → promover (flip) ──────
const MENSAJES_PROMO = ["Leyendo el sitio web...", "Buscando decisores...", "Analizando con IA...", "Moviendo al pipeline..."];

function PromoverDialog({ empresaId, urlInicial, onClose }: {
  empresaId: string;
  urlInicial: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(urlInicial);
  const [fase, setFase] = useState<"idle" | "cargando" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [msgIdx, setMsgIdx] = useState(0);

  const promover = async () => {
    const urlFinal = url.trim().split("?")[0].split("#")[0].trim();
    if (!urlFinal) { setError("Ingresa la URL del sitio web para investigar."); return; }
    setFase("cargando");
    setError(null);
    // Mensajes rotativos mientras corre regenerar (no es SSE)
    const timer = setInterval(() => setMsgIdx((i) => (i + 1) % MENSAJES_PROMO.length), 4000);
    try {
      const resReg = await fetch(`/api/empresas/${empresaId}/regenerar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlFinal }),
      });
      const dataReg = (await resReg.json()) as { ok?: boolean; error?: string };
      if (!resReg.ok || dataReg.ok === false) throw new Error(dataReg.error ?? "No se pudo investigar el sitio.");

      const resProm = await fetch(`/api/empresas/${empresaId}/promover`, { method: "PATCH" });
      if (!resProm.ok) {
        const d = (await resProm.json()) as { error?: string };
        throw new Error(d.error ?? "No se pudo mover al pipeline.");
      }
      clearInterval(timer);
      router.push(`/cuentas/${empresaId}`);
      router.refresh();
    } catch (e) {
      clearInterval(timer);
      setError(e instanceof Error ? e.message : "Error al promover.");
      setFase("error");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && fase !== "cargando") onClose(); }}>
      <DialogContent className="max-w-sm mx-4 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            Investigar y pasar a pipeline
          </DialogTitle>
        </DialogHeader>

        {fase === "cargando" ? (
          <div className="py-6 flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-sm font-medium">{MENSAJES_PROMO[msgIdx]}</p>
            <p className="text-xs text-muted-foreground text-center">Esto toma unos segundos. No cierres la ventana.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              La IA investigará la empresa (decisores, dolores, ángulo de entrada) y la moverá al pipeline como <span className="font-medium text-foreground">Prospecto</span>.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Sitio web de la empresa</label>
              <div className="relative">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input type="url" placeholder="https://empresa.cl" value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-gray-200 bg-white dark:bg-gray-950 dark:border-gray-700 text-sm focus:outline-none focus:border-primary transition-colors" />
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}
            <Button size="lg" className="w-full gap-2 h-12" disabled={!url.trim()} onClick={promover}>
              <Zap className="h-4 w-4" />
              Investigar y pasar a pipeline
            </Button>
            <p className="text-xs text-center text-muted-foreground">⚡ Usa créditos de IA</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
