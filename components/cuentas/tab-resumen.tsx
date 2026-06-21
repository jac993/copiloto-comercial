"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Tag, AlertTriangle, RefreshCw, ExternalLink, Globe, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { FichaIA, VerificacionContexto, InteligenciaComercial, BusquedaWebRaw } from "@/lib/types";

// ─── Mapas de color ───────────────────────────────────────────

const TECNICA_COLOR: Record<string, string> = {
  SPIN: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  consultiva: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  relacional: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  challenger: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

const URGENCIA_COLOR: Record<string, string> = {
  alta: "text-red-600 dark:text-red-400",
  media: "text-amber-600 dark:text-amber-400",
  baja: "text-muted-foreground",
};

// ─── Props ────────────────────────────────────────────────────

interface TabResumenProps {
  ficha: FichaIA;
  empresaId: string;
  notasVendedor: string | null;
  busquedaWebRaw?: BusquedaWebRaw | null;
  // Datos generales de la empresa (del objeto Empresa, no de ficha_ia)
  nombre: string;
  industria: string | null;
  region: string | null;
  rut: string | null;
}

// ─── Componente principal ─────────────────────────────────────

export function TabResumen({
  ficha,
  empresaId,
  notasVendedor,
  busquedaWebRaw,
  nombre,
  industria,
  region,
  rut,
}: TabResumenProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Estrategia de entrada (actualizable sin recargar)
  const [estrategiaActual, setEstrategiaActual] = useState(ficha.angulo_entrada);
  const [actualizandoEstrategia, setActualizandoEstrategia] = useState(false);

  // Campo "Lo que sé y cómo quiero entrar" integrado en la sección Estrategia
  const [notasLocal, setNotasLocal] = useState(notasVendedor ?? "");
  const [guardandoNotas, setGuardandoNotas] = useState(false);

  // Reinvestigar empresa
  const [reinvestigando, setReinvestigando] = useState(false);
  const [confirmarReinvestigar, setConfirmarReinvestigar] = useState(false);

  // Guarda notas y luego dispara actualización de estrategia automáticamente
  const guardarYActualizar = async () => {
    setGuardandoNotas(true);
    try {
      const res = await fetch(`/api/empresas/${empresaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notas_vendedor: notasLocal.trim() || null }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error al guardar");
      toast({ title: "Contexto guardado — actualizando estrategia..." });
      // Dispara actualización automática tras guardar
      await actualizarEstrategia();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    } finally {
      setGuardandoNotas(false);
    }
  };

  const actualizarEstrategia = async () => {
    setActualizandoEstrategia(true);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/actualizar-angulo`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; angulo_entrada?: string; error?: string };
      if (!data.ok || !data.angulo_entrada) throw new Error(data.error ?? "Error desconocido");
      setEstrategiaActual(data.angulo_entrada);
      toast({ title: "Estrategia de entrada actualizada ✓" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo actualizar la estrategia",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    } finally {
      setActualizandoEstrategia(false);
    }
  };

  const reinvestigar = async () => {
    setReinvestigando(true);
    setConfirmarReinvestigar(false);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/regenerar`, { method: "POST" });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Error desconocido");
      toast({ title: "✅ Ficha actualizada", description: "La ficha se reinvestigó con éxito." });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Error al reinvestigar", description: e instanceof Error ? e.message : "Error desconocido" });
    } finally {
      setReinvestigando(false);
    }
  };

  return (
    <div className="space-y-4 pb-6">

      {/* 1. Datos generales */}
      <DatosGenerales
        nombre={nombre}
        industria={industria ?? ficha.industria ?? null}
        region={region ?? ficha.region ?? null}
        rut={rut}
      />

      {/* 2. Resumen ejecutivo */}
      <Card className="border-0 bg-primary/5 dark:bg-primary/10">
        <CardContent className="pt-5">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
            Resumen ejecutivo
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {ficha.resumen_ejecutivo}
          </p>
        </CardContent>
      </Card>

      {/* Inteligencia comercial */}
      {ficha.inteligencia_comercial && (
        <InteligenciaComercialCard intel={ficha.inteligencia_comercial} />
      )}

      {/* Encontrado en internet */}
      {busquedaWebRaw && (busquedaWebRaw.contactosTexto || busquedaWebRaw.inteligenciaTexto) && (
        <EncontradoEnInternet raw={busquedaWebRaw} />
      )}

      {/* 3. Estrategia de entrada */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Encabezado */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Estrategia de entrada
              </p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Guía interna — no es un mensaje para enviar
              </p>
            </div>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                TECNICA_COLOR[ficha.tecnica_recomendada] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {ficha.tecnica_recomendada}
            </span>
          </div>

          {/* Texto de la estrategia */}
          {actualizandoEstrategia ? (
            <div className="space-y-2.5 py-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                Actualizando estrategia...
              </div>
              <div className="space-y-1.5 animate-pulse">
                <div className="h-3.5 rounded-full bg-muted w-full" />
                <div className="h-3.5 rounded-full bg-muted w-5/6" />
                <div className="h-3.5 rounded-full bg-muted w-4/6" />
                <div className="h-3.5 rounded-full bg-muted w-full" />
                <div className="h-3.5 rounded-full bg-muted w-3/4" />
              </div>
            </div>
          ) : (
            <EstrategiaTexto texto={estrategiaActual} />
          )}

          {/* Separador */}
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Lo que sé y cómo quiero entrar
              </label>
              <HelpTooltip
                titulo="¿Para qué sirve este campo?"
                explicacion="Escribe lo que sabes de la empresa y tu estrategia de entrada. Al guardar, la IA actualiza automáticamente la estrategia de los 5 puntos con tu contexto."
                ejemplo={"Ej: 'Hablé con Andrés González en septiembre, me dijo que avisaría cuando tuvieran requerimiento...'"}
              />
            </div>
            <Textarea
              value={notasLocal}
              onChange={(e) => setNotasLocal(e.target.value)}
              rows={3}
              placeholder="Ej: hablé con Andrés González en septiembre, me dijo que avisaría cuando tuvieran requerimiento..."
              className="text-sm resize-none focus-visible:ring-[#7C3AED]"
              disabled={guardandoNotas || actualizandoEstrategia}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={guardarYActualizar}
                disabled={guardandoNotas || actualizandoEstrategia}
                className="bg-[#7C3AED] hover:bg-[#6d28d9] text-white h-8 text-xs gap-1.5"
              >
                {guardandoNotas ? (
                  <><Loader2 className="h-3 w-3 animate-spin" />Guardando...</>
                ) : (
                  "Guardar y actualizar"
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={actualizarEstrategia}
                disabled={actualizandoEstrategia || guardandoNotas}
                className="h-8 text-xs gap-1.5"
              >
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                {actualizandoEstrategia ? "Actualizando..." : "⚡ Actualizar estrategia"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Señales de oportunidad */}
      {ficha.senales_oportunidad.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
            Señales detectadas
          </p>
          <div className="space-y-2">
            {ficha.senales_oportunidad.map((senal, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30"
              >
                <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 capitalize">
                    {senal.tipo.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                    {senal.descripcion}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Qué les podemos vender */}
      {ficha.productos_etiquetas.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
            Qué les podemos vender
          </p>
          <Card>
            <CardContent className="pt-4 pb-2">
              {ficha.productos_etiquetas.map((prod, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 py-2.5 border-b border-border last:border-0"
                >
                  <Tag className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{prod.tipo}</p>
                      <span className={`text-xs font-semibold shrink-0 ${URGENCIA_COLOR[prod.urgencia]}`}>
                        {prod.urgencia}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{prod.aplicacion}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 6. Objeciones */}
      {ficha.objeciones_probables.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Objeciones y cómo responderlas
          </p>
          <Card>
            <CardContent className="pt-2 pb-2 px-4">
              <Accordion type="single" collapsible>
                {ficha.objeciones_probables.map((obj, i) => (
                  <AccordionItem key={i} value={`obj-${i}`}>
                    <AccordionTrigger className="text-sm text-left">
                      &ldquo;{obj.objecion}&rdquo;
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="bg-primary/5 rounded-xl p-3">
                        <p className="text-xs font-semibold text-primary mb-1">Cómo responder:</p>
                        <p className="text-xs text-foreground leading-relaxed">{obj.como_responderla}</p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Botón Reinvestigar empresa */}
      <div className="pt-2">
        {!confirmarReinvestigar ? (
          <button
            onClick={() => setConfirmarReinvestigar(true)}
            disabled={reinvestigando}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reinvestigando ? "animate-spin" : ""}`} />
            {reinvestigando ? "Reinvestigando empresa..." : "↻ Reinvestigar empresa"}
          </button>
        ) : (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800/30 bg-amber-50/60 dark:bg-amber-900/10 p-4 space-y-3">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              ¿Reinvestigar esta empresa? Se actualizará toda la ficha con la información más reciente del sitio web.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmarReinvestigar(false)}
                className="flex-1 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={reinvestigar}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors"
              >
                <Zap className="h-3.5 w-3.5" />
                Sí, reinvestigar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Renderiza el texto de estrategia con los 5 puntos ─────────
// Detecta líneas "N. TÍTULO: texto" y las formatea con label en negrita
function EstrategiaTexto({ texto }: { texto: string }) {
  if (!texto) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Sin estrategia generada. Usa el botón &ldquo;⚡ Actualizar estrategia&rdquo; para generar una.
      </p>
    );
  }

  const lineas = texto.split("\n").filter((l) => l.trim());
  const PATRON = /^(\d+\.\s+[A-ZÁÉÍÓÚÑ\s]+):\s*(.+)$/;

  return (
    <div className="space-y-2">
      {lineas.map((linea, i) => {
        const match = linea.match(PATRON);
        if (match) {
          return (
            <div key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className="font-semibold text-primary shrink-0 whitespace-nowrap">
                {match[1]}:
              </span>
              <span>{match[2]}</span>
            </div>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-muted-foreground">
            {linea}
          </p>
        );
      })}
    </div>
  );
}

// ── Datos generales ───────────────────────────────────────────
function DatosGenerales({
  nombre,
  industria,
  region,
  rut,
}: {
  nombre: string;
  industria: string | null;
  region: string | null;
  rut: string | null;
}) {
  const items = [
    { label: "Empresa", valor: nombre },
    { label: "Rubro", valor: industria },
    { label: "Ciudad / Región", valor: region },
    { label: "RUT", valor: rut },
  ].filter((i): i is { label: string; valor: string } => !!i.valor);

  if (items.length === 0) return null;

  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {items.map(({ label, valor }) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-medium truncate">{valor}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Encontrado en internet ────────────────────────────────────
function EncontradoEnInternet({ raw }: { raw: BusquedaWebRaw }) {
  const tieneDatos = !!(raw.contactosTexto || raw.inteligenciaTexto);
  return (
    <div>
      <Accordion type="single" collapsible>
        <AccordionItem value="internet" className="border rounded-2xl px-4">
          <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
            <span className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              Encontrado en internet
              {tieneDatos ? (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Datos ✓
                </span>
              ) : (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  Sin datos
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-4">
            {raw.contactosTexto && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Personas y contactos
                </p>
                <div className="max-h-40 overflow-y-auto rounded-xl bg-muted/40 p-3">
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {raw.contactosTexto}
                  </p>
                </div>
              </div>
            )}
            {raw.inteligenciaTexto && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Noticias e inteligencia comercial
                </p>
                <div className="max-h-40 overflow-y-auto rounded-xl bg-muted/40 p-3">
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {raw.inteligenciaTexto}
                  </p>
                </div>
              </div>
            )}
            {raw.fuentes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {raw.fuentes.slice(0, 6).map((url, i) => {
                  let host = url;
                  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* mantener url original */ }
                  return (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {host}
                    </a>
                  );
                })}
              </div>
            )}
            {raw.buscado_en && (
              <p className="text-xs text-muted-foreground/60">
                Buscado el{" "}
                {new Intl.DateTimeFormat("es-CL", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                }).format(new Date(raw.buscado_en))}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

// ── Inteligencia comercial de Perplexity ──────────────────────
function InteligenciaComercialCard({ intel }: { intel: InteligenciaComercial }) {
  const filas: { label: string; valor: string }[] = [
    { label: "Situación actual", valor: intel.situacion_mercado },
    { label: "Prioridades este año", valor: intel.prioridades_actuales },
    { label: "Dolores que resolvemos", valor: intel.dolores_probables },
    { label: "Clientes y exigencias", valor: intel.clientes_y_exigencias },
    { label: "Debilidades proveedor actual", valor: intel.debilidades_proveedor_actual },
  ].filter((f) => f.valor && !f.valor.toLowerCase().startsWith("sin información"));

  const propuesta = intel.propuesta_valor_especifica;
  const fuentes = (intel.fuentes ?? []).filter(Boolean);

  if (filas.length === 0 && !propuesta) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1 flex items-center gap-1.5">
        🧠 Inteligencia comercial
      </p>
      <Card className="overflow-hidden">
        <CardContent className="pt-4 pb-4 space-y-3">
          {propuesta && !propuesta.toLowerCase().startsWith("sin información") && (
            <div className="bg-[#EDE9FE] border border-violet-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-[#5B21B6] mb-1">Cómo posicionar tu oferta</p>
              <p className="text-xs text-[#4C1D95] leading-relaxed">{propuesta}</p>
            </div>
          )}
          {filas.map(({ label, valor }) => (
            <div key={label} className="border-b border-border last:border-0 pb-2.5 last:pb-0">
              <p className="text-xs font-semibold text-muted-foreground mb-0.5">{label}</p>
              <p className="text-xs leading-relaxed">{valor}</p>
            </div>
          ))}
          {fuentes.length > 0 && (
            <div className="pt-1">
              <p className="text-xs text-muted-foreground mb-1">Fuentes:</p>
              <div className="flex flex-wrap gap-1.5">
                {fuentes.slice(0, 5).map((url, i) => {
                  let host = url;
                  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* mantener url original */ }
                  return (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {host}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tipo solo para verificación de contexto (sin uso en UI) ───
// Se mantiene importado para no romper tipos si otros módulos lo usan.
export type { VerificacionContexto };
