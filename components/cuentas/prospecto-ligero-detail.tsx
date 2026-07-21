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
  User, Phone, Mail, Building2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { TabHistorial } from "@/components/cuentas/tab-historial";
import type { EmpresaCompleta, Contacto, Interaccion } from "@/lib/types";

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
}
const FORM_VACIO: FormContacto = { id: null, nombre: "", cargo: "", telefono: "", email: "" };

export function ProspectoLigeroDetail({ empresa, interacciones }: Props) {
  const router = useRouter();
  // Contactos en estado local (sincroniza el editor y el selector del historial)
  const [contactos, setContactos] = useState<Contacto[]>(empresa.contactos);
  const [form, setForm] = useState<FormContacto | null>(null);
  const [guardandoContacto, setGuardandoContacto] = useState(false);
  const [promoverAbierto, setPromoverAbierto] = useState(false);

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
          }),
        });
        const actualizado = (await res.json()) as Contacto;
        if (res.ok) {
          setContactos((prev) => prev.map((c) => (c.id === form.id ? actualizado : c)));
          setForm(null);
        }
      } else {
        const res = await fetch("/api/contactos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            empresa_id: empresa.id, nombre: form.nombre.trim(),
            cargo: form.cargo.trim() || undefined, telefono: form.telefono.trim() || undefined,
            email: form.email.trim() || undefined,
          }),
        });
        const nuevo = (await res.json()) as Contacto;
        if (res.ok) {
          setContactos((prev) => [...prev, nuevo]);
          setForm(null);
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
                <div key={c.id} className="rounded-2xl border border-border bg-card p-3 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{c.nombre ?? "Sin nombre"}</p>
                    {c.cargo && <p className="text-xs text-muted-foreground truncate">{c.cargo}</p>}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {c.telefono && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.telefono}</span>}
                      {c.email && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setForm({ id: c.id, nombre: c.nombre ?? "", cargo: c.cargo ?? "", telefono: c.telefono ?? "", email: c.email ?? "" })}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted" title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => eliminarContacto(c.id)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20" title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
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
    </div>
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
        <input placeholder="Email" value={form.email} className={campo}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
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
