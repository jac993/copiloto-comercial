"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Tag, AlertTriangle, RefreshCw, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { FichaIA, VerificacionContexto, InteligenciaComercial, BusquedaWebRaw } from "@/lib/types";

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

interface TabResumenProps {
  ficha: FichaIA;
  empresaId: string;
  notasVendedor: string | null;
  busquedaWebRaw?: BusquedaWebRaw | null;
}

export function TabResumen({ ficha, empresaId, notasVendedor, busquedaWebRaw }: TabResumenProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Estado local para campos regenerables (se actualizan sin recargar la página)
  const [anguloActual, setAnguloActual] = useState(ficha.angulo_entrada);
  const [razonActual, setRazonActual] = useState(ficha.razon_tecnica);
  const [regenerando, setRegenerando] = useState(false);
  const [errorRegen, setErrorRegen] = useState<string | null>(null);
  const [contextoNuevo, setContextoNuevo] = useState("");

  const regenerar = async () => {
    if (!contextoNuevo.trim()) return;
    setRegenerando(true);
    setErrorRegen(null);
    try {
      const res = await fetch("/api/investigar/regenerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId, contexto_nuevo: contextoNuevo.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; ficha_ia?: FichaIA; error?: string };
      if (!res.ok || !data.ok) {
        setErrorRegen(data.error ?? "Error desconocido");
        return;
      }
      if (data.ficha_ia) {
        setAnguloActual(data.ficha_ia.angulo_entrada);
        setRazonActual(data.ficha_ia.razon_tecnica);
        setContextoNuevo("");
        toast({ title: "Análisis actualizado con tu contexto" });
        // Refresca preguntas_spin en tab Preparación (server component re-render)
        router.refresh();
      }
    } catch {
      setErrorRegen("No se pudo conectar con el servidor");
    } finally {
      setRegenerando(false);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Lo que yo sé — lectura del contexto aportado al investigar */}
      {notasVendedor && (
        <ContextoVerificacion
          notasVendedor={notasVendedor}
          verificacion={ficha.verificacion_contexto ?? []}
        />
      )}

      {/* Resumen ejecutivo — lo primero que ves */}
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

      {/* Inteligencia comercial (Perplexity en ficha) */}
      {ficha.inteligencia_comercial && (
        <InteligenciaComercialCard intel={ficha.inteligencia_comercial} />
      )}

      {/* Encontrado en internet — texto crudo de Perplexity, colapsable */}
      {busquedaWebRaw && (busquedaWebRaw.contactosTexto || busquedaWebRaw.inteligenciaTexto) && (
        <EncontradoEnInternet raw={busquedaWebRaw} />
      )}

      {/* Ángulo de entrada + técnica + botón regenerar */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Ángulo de entrada
            </p>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                TECNICA_COLOR[ficha.tecnica_recomendada] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {ficha.tecnica_recomendada}
            </span>
          </div>

          {regenerando ? (
            <div className="space-y-2.5 py-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                Incorporando tu contexto...
              </div>
              <div className="space-y-1.5 animate-pulse">
                <div className="h-3.5 rounded-full bg-muted w-full" />
                <div className="h-3.5 rounded-full bg-muted w-5/6" />
                <div className="h-3.5 rounded-full bg-muted w-4/6" />
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed">{anguloActual}</p>
              <p className="text-xs text-muted-foreground italic">{razonActual}</p>
            </>
          )}

          {errorRegen && (
            <p className="text-xs text-destructive">{errorRegen}</p>
          )}

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Agrega contexto nuevo
              </label>
              <HelpTooltip
                titulo="¿Cuándo regenerar?"
                explicacion="Úsalo cuando tengas información nueva sobre la empresa que cambia el ángulo de entrada. No lo uses sin escribir contexto nuevo — el botón no hace nada si está vacío."
                ejemplo={"Ej: después de hablar con alguien del mercado que te dio datos internos de la empresa."}
              />
            </div>
            <textarea
              value={contextoNuevo}
              onChange={(e) => setContextoNuevo(e.target.value)}
              placeholder="Ej: hablé con su jefe de calidad, me dijo que tuvieron 3 rechazos este mes, están evaluando cambiar de proveedor..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60"
            />
          </div>

          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1.5 text-xs"
            onClick={regenerar}
            disabled={regenerando || !contextoNuevo.trim()}
          >
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            ⚡ Regenerar con mi contexto
          </Button>
        </CardContent>
      </Card>

      {/* Señales de oportunidad */}
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

      {/* Productos que podemos vender */}
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
                      <span
                        className={`text-xs font-semibold shrink-0 ${URGENCIA_COLOR[prod.urgencia]}`}
                      >
                        {prod.urgencia}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {prod.aplicacion}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Objeciones probables — acordeón */}
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
                        <p className="text-xs font-semibold text-primary mb-1">
                          Cómo responder:
                        </p>
                        <p className="text-xs text-foreground leading-relaxed">
                          {obj.como_responderla}
                        </p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Componente: contexto del vendedor + verificación de la IA ──
function ContextoVerificacion({
  notasVendedor,
  verificacion,
}: {
  notasVendedor: string;
  verificacion: VerificacionContexto[];
}) {
  const alertas = verificacion.filter(
    (v) => v.estado === "inconsistente" || v.estado === "no_verificable"
  );

  return (
    <div className="space-y-2">
      {/* Lo que yo sé — read only */}
      <Card className="border-amber-200 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-900/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-500 uppercase tracking-wide">
              Lo que yo sé
            </p>
            <HelpTooltip
              titulo="¿Para qué sirve este campo?"
              explicacion="Agrega información que solo tú sabes y que no está en internet. La IA la incorpora al análisis para hacerlo más preciso y personalizado."
              ejemplo={"Ej: 'Hablé con alguien del mercado, me dijeron que tuvieron 3 rechazos este mes con su proveedor actual de etiquetas.'"}
            />
          </div>
          <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed whitespace-pre-line">
            {notasVendedor}
          </p>
        </CardContent>
      </Card>

      {/* Verificación — solo inconsistentes y no verificables */}
      {alertas.length > 0 && (
        <div className="space-y-1.5">
          {alertas.map((item, i) => {
            const esInconsistente = item.estado === "inconsistente";
            return (
              <div
                key={i}
                className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs leading-relaxed ${
                  esInconsistente
                    ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30"
                    : "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30"
                }`}
              >
                <span className="shrink-0 mt-0.5">
                  {esInconsistente ? "⚠️" : "❓"}
                </span>
                <div>
                  <span
                    className={`font-semibold ${
                      esInconsistente
                        ? "text-red-700 dark:text-red-400"
                        : "text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {esInconsistente ? "Inconsistencia: " : "No verificable: "}
                  </span>
                  <span
                    className={
                      esInconsistente
                        ? "text-red-700/80 dark:text-red-400/80"
                        : "text-amber-700/80 dark:text-amber-400/80"
                    }
                  >
                    &ldquo;{item.dato_vendedor}&rdquo; — {item.observacion}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Encontrado en internet — texto crudo de Perplexity ───────
function EncontradoEnInternet({ raw }: { raw: BusquedaWebRaw }) {
  return (
    <div>
      <Accordion type="single" collapsible>
        <AccordionItem value="internet" className="border rounded-2xl px-4">
          <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
            <span className="flex items-center gap-2">
              🌐 Encontrado en internet
              {raw.fuentes.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  · {raw.fuentes.length} fuente{raw.fuentes.length !== 1 ? "s" : ""}
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
                  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
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
          {/* Propuesta de valor específica — destacada */}
          {propuesta && !propuesta.toLowerCase().startsWith("sin información") && (
            <div className="bg-[#EDE9FE] border border-violet-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-[#5B21B6] mb-1">Cómo posicionar tu oferta</p>
              <p className="text-xs text-[#4C1D95] leading-relaxed">{propuesta}</p>
            </div>
          )}

          {/* Resto de campos */}
          {filas.map(({ label, valor }) => (
            <div key={label} className="border-b border-border last:border-0 pb-2.5 last:pb-0">
              <p className="text-xs font-semibold text-muted-foreground mb-0.5">{label}</p>
              <p className="text-xs leading-relaxed">{valor}</p>
            </div>
          ))}

          {/* Fuentes */}
          {fuentes.length > 0 && (
            <div className="pt-1">
              <p className="text-xs text-muted-foreground mb-1">Fuentes:</p>
              <div className="flex flex-wrap gap-1.5">
                {fuentes.slice(0, 5).map((url, i) => {
                  let host = url;
                  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
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
