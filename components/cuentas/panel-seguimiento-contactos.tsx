"use client";

// =============================================================
// Panel lateral "Seguimiento contactos" — se abre desde las tarjetas de
// empresa (pipeline y "Por calificar"). Muestra cada contacto con una barra
// de actividad (qué tan reciente fue el último contacto con ESA persona) y
// sus datos de contacto al expandir.
//
// Los datos se cargan al ABRIR, no antes: son dos GET a la BD propia (cero
// créditos de IA), pero no tiene sentido traerlos para las 15 tarjetas de la
// lista cuando el vendedor va a abrir una.
// =============================================================

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ChevronDown, Phone, Mail, Copy, Check, ExternalLink,
  Briefcase, Users, AlertCircle, ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { hoyCL, diasHabilesEntre } from "@/lib/fecha";
import { hrefLinkedIn } from "@/lib/utils";
import { TIPO_CONF } from "@/lib/interaccion-meta";
import type { Contacto, Interaccion, TipoInteraccion } from "@/lib/types";

// Semáforo de actividad POR CONTACTO, en días hábiles desde su última
// interacción. Umbrales de persona: UMBRAL_ENFRIAMIENTO de lib/enfriamiento.ts
// mide la empresa completa por etapa, que es otra cosa.
const NIVELES_ACTIVIDAD = [
  { max: 5,        label: "Activo",      barra: "bg-[#22C55E]", pct: 100 },
  { max: 10,       label: "Enfriándose", barra: "bg-[#F59E0B]", pct: 55  },
  { max: Infinity, label: "Frío",        barra: "bg-[#DC2626]", pct: 20  },
];
const nivelActividad = (d: number) => NIVELES_ACTIVIDAD.find((n) => d <= n.max)!;

// Fecha ISO → día calendario chileno "YYYY-MM-DD" (diasHabilesEntre opera así)
const diaChile = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

const iniciales = (c: Contacto) =>
  (c.nombre?.trim() || c.cargo?.trim() || "?")
    .split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();

const tieneNombre = (c: Contacto) => c.nombre != null && c.nombre.trim() !== "";

const CHIP =
  "shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 h-7 rounded-lg " +
  "bg-[#FFF7ED] text-[#C2410C] hover:bg-[#FFEDD5] dark:bg-[#431407]/40 " +
  "dark:text-orange-300 dark:hover:bg-[#431407]/60 transition-colors";

type Estado = "idle" | "cargando" | "listo" | "error";

interface Props {
  empresaId: string;
  empresaNombre: string;
  abierto: boolean;
  onCerrar: () => void;
}

export function PanelSeguimientoContactos({
  empresaId, empresaNombre, abierto, onCerrar,
}: Props) {
  const [estado, setEstado] = useState<Estado>("idle");
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [interacciones, setInteracciones] = useState<Interaccion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  // Carga al abrir. AbortController: si el usuario cierra antes de que
  // respondan, se cancelan las dos peticiones sin setear estado muerto.
  useEffect(() => {
    if (!abierto) return;
    const ac = new AbortController();
    (async () => {
      setEstado("cargando");
      setError(null);
      try {
        const [rc, ri] = await Promise.all([
          fetch(`/api/contactos?empresa_id=${empresaId}`, { signal: ac.signal }),
          fetch(`/api/interacciones/empresa/${empresaId}`, { signal: ac.signal }),
        ]);
        if (!rc.ok || !ri.ok) throw new Error("No se pudieron cargar los contactos.");
        const dc = (await rc.json()) as { contactos?: Contacto[]; error?: string };
        const di = (await ri.json()) as { interacciones?: Interaccion[]; error?: string };
        if (dc.error || di.error) throw new Error(dc.error ?? di.error);
        setContactos(dc.contactos ?? []);
        setInteracciones(di.interacciones ?? []);
        setEstado("listo");
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Error al cargar los contactos.");
        setEstado("error");
      }
    })();
    return () => ac.abort();
  }, [abierto, empresaId, intento]);

  // contacto_id → fecha ISO y tipo de su última interacción. Las interacciones
  // sin contacto_id se ignoran: son stubs de sistema, no conversaciones.
  const ultimaActividad = useMemo(() => {
    const m = new Map<string, { fecha: string; tipo: TipoInteraccion }>();
    for (const i of interacciones) {
      if (!i.contacto_id) continue;
      const prev = m.get(i.contacto_id);
      if (!prev || Date.parse(i.fecha) > Date.parse(prev.fecha)) {
        m.set(i.contacto_id, { fecha: i.fecha, tipo: i.tipo });
      }
    }
    return m;
  }, [interacciones]);

  // Corte por actividad. No se filtra por es_decisor: ese flag es false en el
  // 100% de los contactos de prospectos ligeros y el panel saldría vacío ahí.
  const conActividad = useMemo(
    () => contactos
      .filter((c) => ultimaActividad.has(c.id))
      .sort((a, b) =>
        Date.parse(ultimaActividad.get(b.id)!.fecha) - Date.parse(ultimaActividad.get(a.id)!.fecha)),
    [contactos, ultimaActividad]
  );
  const sinContactar = useMemo(
    () => contactos
      .filter((c) => !ultimaActividad.has(c.id))
      .sort((a, b) => (tieneNombre(a) ? 0 : 1) - (tieneNombre(b) ? 0 : 1)),
    [contactos, ultimaActividad]
  );

  const copiarEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiado(email);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Clipboard bloqueado por el navegador: el mailto sigue disponible.
    }
  };

  return (
    <Sheet open={abierto} onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <SheetContent>
        {/* pr-10 para que el título no quede bajo la ✕ absoluta del SheetContent */}
        <SheetHeader className="pr-10">
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Seguimiento de contactos
          </SheetTitle>
          <SheetDescription className="truncate">{empresaNombre}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {estado === "cargando" && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-2xl border border-border p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-xl" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          )}

          {estado === "error" && (
            <div className="space-y-3 py-4">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
              <Button
                variant="outline" size="sm" className="w-full"
                onClick={() => setIntento((n) => n + 1)}
              >
                Reintentar
              </Button>
            </div>
          )}

          {estado === "listo" && contactos.length === 0 && (
            <div className="text-center py-10 space-y-2">
              <Users className="h-9 w-9 mx-auto text-muted-foreground opacity-30" />
              <p className="text-sm font-medium">Sin contactos registrados</p>
              <p className="text-xs text-muted-foreground leading-relaxed px-4">
                Agrega contactos desde la ficha de la empresa para poder seguir
                su actividad acá.
              </p>
            </div>
          )}

          {estado === "listo" && contactos.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground px-1">
                {conActividad.length} con actividad · {sinContactar.length} sin contactar
              </p>

              {conActividad.length > 0 && (
                <section>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                    Con actividad
                  </p>
                  <div className="space-y-2">
                    {conActividad.map((c) => (
                      <FilaContacto
                        key={c.id} contacto={c}
                        ultima={ultimaActividad.get(c.id) ?? null}
                        expandido={expandidoId === c.id}
                        onToggle={() => setExpandidoId(expandidoId === c.id ? null : c.id)}
                        copiado={copiado} onCopiar={copiarEmail}
                      />
                    ))}
                  </div>
                </section>
              )}

              {sinContactar.length > 0 && (
                <section>
                  <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide mb-2 px-1">
                    Sin contactar aún
                  </p>
                  <div className="space-y-2 opacity-60">
                    {sinContactar.map((c) => (
                      <FilaContacto
                        key={c.id} contacto={c} ultima={null}
                        expandido={expandidoId === c.id}
                        onToggle={() => setExpandidoId(expandidoId === c.id ? null : c.id)}
                        copiado={copiado} onCopiar={copiarEmail}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Pie fijo, fuera del scroll */}
        <div className="border-t border-border px-4 py-3">
          <Button asChild className="w-full gap-1.5">
            <Link href={`/cuentas/${empresaId}`}>
              Ver empresa completa
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Fila de contacto: cabecera con barra de actividad + detalle al expandir ──
function FilaContacto({
  contacto, ultima, expandido, onToggle, copiado, onCopiar,
}: {
  contacto: Contacto;
  ultima: { fecha: string; tipo: TipoInteraccion } | null;
  expandido: boolean;
  onToggle: () => void;
  copiado: string | null;
  onCopiar: (email: string) => void;
}) {
  const dias = ultima ? diasHabilesEntre(diaChile(ultima.fecha), hoyCL()) : null;
  const nivel = dias === null ? null : nivelActividad(dias);
  const conf = ultima ? TIPO_CONF[ultima.tipo] : null;
  const sinCanales = !contacto.telefono && !contacto.email && !contacto.linkedin_url;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Cabecera como <button> real: acá SÍ puede serlo porque no contiene
          otros interactivos — el detalle expandido es hermano, no hijo. */}
      <button
        onClick={onToggle}
        className="w-full text-left p-3 flex items-start gap-3 hover:bg-muted/30 transition-colors"
      >
        <div className="h-9 w-9 rounded-xl bg-[#FFF7ED] dark:bg-[#431407]/50 flex items-center justify-center text-xs font-bold text-[#F97316] shrink-0">
          {iniciales(contacto)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">
            {contacto.nombre ?? contacto.cargo ?? "Sin nombre"}
          </p>
          {contacto.nombre && contacto.cargo && (
            <p className="text-xs text-muted-foreground truncate">{contacto.cargo}</p>
          )}
          <div className="mt-1.5">
            {nivel && dias !== null ? (
              <>
                <div className="flex justify-between items-center mb-1 gap-2">
                  <span className="text-xs text-muted-foreground truncate">
                    {conf && `${conf.emoji} ${conf.label} · `}
                    {dias === 0
                      ? "Contactado hoy"
                      : `Hace ${dias} ${dias === 1 ? "día hábil" : "días hábiles"}`}
                  </span>
                  <span className="text-xs font-semibold shrink-0">{nivel.label}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${nivel.barra}`}
                    style={{ width: `${nivel.pct}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground italic">Sin contactar aún</p>
            )}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform duration-200 ${expandido ? "rotate-180" : ""}`}
        />
      </button>

      {expandido && (
        <div className="border-t border-border bg-muted/20 px-3 py-2.5 space-y-2">
          {contacto.telefono && (
            <Canal Icon={Phone} valor={contacto.telefono}>
              <a href={`tel:${contacto.telefono.replace(/\s+/g, "")}`} className={CHIP}>
                <Phone className="h-3 w-3" /> Llamar
              </a>
            </Canal>
          )}
          {contacto.email && (
            <Canal Icon={Mail} valor={contacto.email}>
              <a href={`mailto:${contacto.email}`} className={CHIP}>
                <Mail className="h-3 w-3" /> Email
              </a>
              <button
                onClick={() => onCopiar(contacto.email!)}
                className={CHIP}
                title={`Copiar ${contacto.email}`}
              >
                {copiado === contacto.email
                  ? <Check className="h-3 w-3" />
                  : <Copy className="h-3 w-3" />}
              </button>
            </Canal>
          )}
          {contacto.linkedin_url && (
            <Canal
              Icon={Briefcase}
              valor={contacto.linkedin_url.replace(/^https?:\/\/(www\.)?/, "")}
            >
              <a
                href={hrefLinkedIn(contacto.linkedin_url)}
                target="_blank" rel="noopener noreferrer" className={CHIP}
              >
                <ExternalLink className="h-3 w-3" /> Abrir
              </a>
            </Canal>
          )}
          {sinCanales && (
            <p className="text-xs text-muted-foreground py-0.5">
              Sin teléfono, email ni LinkedIn registrados.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Fila de un canal de contacto: icono + valor + acciones
function Canal({ Icon, valor, children }: {
  Icon: LucideIcon; valor: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs flex-1 min-w-0 truncate">{valor}</span>
      <div className="flex gap-1 shrink-0">{children}</div>
    </div>
  );
}
