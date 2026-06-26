"use client";

import { useState, Fragment, useCallback, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter } from "next/navigation";
import { Zap, Tag, AlertTriangle, RefreshCw, ExternalLink, Globe, Loader2, ChevronDown } from "lucide-react";
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
import type { FichaIA, VerificacionContexto, InteligenciaComercial, BusquedaWebRaw, MeddicData, MeddicComponente, MeddicSemaforo } from "@/lib/types";

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
  meddic?: MeddicData | null;
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
  meddic: meddicProp,
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

  // MEDDIC — estado local inicializado desde la prop (Supabase)
  const MEDDIC_INICIAL: MeddicData = meddicProp ?? {
    metricas:             { texto: null, semaforo: "rojo" },
    comprador_economico:  { texto: null, semaforo: "rojo" },
    criterios_decision:   { texto: null, semaforo: "rojo" },
    proceso_decision:     { texto: null, semaforo: "rojo" },
    dolor_identificado:   { texto: null, semaforo: "rojo" },
    campeon:              { texto: null, semaforo: "rojo" },
    score: 0,
    valor_estimado: null,
    probabilidad: null,
  };
  const [meddic, setMeddic] = useState<MeddicData>(MEDDIC_INICIAL);
  const [guardandoMeddic, setGuardandoMeddic] = useState(false);

  const guardarMeddic = useCallback(async (data: MeddicData) => {
    setGuardandoMeddic(true);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/meddic`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = (await res.json()) as { ok?: boolean; score?: number; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Error al guardar MEDDIC");
      // Actualizar score calculado por el servidor
      setMeddic((prev) => ({ ...prev, score: json.score ?? prev.score }));
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar MEDDIC",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    } finally {
      setGuardandoMeddic(false);
    }
  }, [empresaId, toast]);

  const actualizarComponenteMeddic = useCallback((
    campo: keyof Pick<MeddicData, "metricas" | "comprador_economico" | "criterios_decision" | "proceso_decision" | "dolor_identificado" | "campeon">,
    valor: Partial<MeddicComponente>
  ) => {
    setMeddic((prev) => {
      const siguiente: MeddicData = {
        ...prev,
        [campo]: { ...prev[campo], ...valor },
      };
      // Recalcular score localmente
      const keys: (keyof Pick<MeddicData, "metricas" | "comprador_economico" | "criterios_decision" | "proceso_decision" | "dolor_identificado" | "campeon">)[] =
        ["metricas", "comprador_economico", "criterios_decision", "proceso_decision", "dolor_identificado", "campeon"];
      siguiente.score = keys.reduce((acc, k) => {
        const s = siguiente[k].semaforo;
        return acc + (s === "verde" ? 2 : s === "amarillo" ? 1 : 0);
      }, 0);
      // Auto-sugerir probabilidad según score si el vendedor no la ha tocado
      if (prev.probabilidad === null || prev.probabilidad === sugerirProbabilidad(prev.score)) {
        siguiente.probabilidad = sugerirProbabilidad(siguiente.score);
      }
      void guardarMeddic(siguiente);
      return siguiente;
    });
  }, [guardarMeddic]);

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

      {/* 3. Calificación MEDDIC */}
      <MeddicCard
        meddic={meddic}
        guardando={guardandoMeddic}
        onComponenteChange={actualizarComponenteMeddic}
        onValorChange={(campo, valor) => {
          const siguiente = { ...meddic, [campo]: valor };
          setMeddic(siguiente);
          void guardarMeddic(siguiente);
        }}
      />

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

// ─── Tooltips de metodología ──────────────────────────────────

const METODOLOGIAS: Record<string, string> = {
  "SPIN": "Técnica de preguntas — Situación, Problema, Implicación, Necesidad",
  "Challenger": "Enseñar algo nuevo al prospecto para romper el status quo",
  "Sandler": "Calificar agresivamente antes de invertir tiempo en propuesta",
  "MEDDIC": "Sistema de diagnóstico para saber si una oportunidad es real",
  "Predictable Revenue": "Secuencia de contactos multicanal para prospección fría",
};

// Términos más largos primero para evitar matches parciales
const PATRON_METODOLOGIA = /(Predictable Revenue|Challenger|MEDDIC|Sandler|SPIN)/g;

function TerminoConTooltip({ termino }: { termino: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        onMouseEnter={() => setAbierto(true)}
        onMouseLeave={() => setAbierto(false)}
        className="border-b border-dotted border-[#7C3AED] text-[#7C3AED] font-semibold cursor-help bg-transparent p-0 text-[length:inherit] leading-[inherit]"
      >
        {termino}
      </button>
      {abierto && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-52 rounded-xl bg-popover text-popover-foreground text-xs px-3 py-2.5 shadow-md border border-border pointer-events-none">
          <strong className="block text-[#7C3AED] font-semibold mb-1">{termino}</strong>
          {METODOLOGIAS[termino]}
        </span>
      )}
    </span>
  );
}

function resaltarTerminos(texto: string): ReactNode[] {
  return texto.split(PATRON_METODOLOGIA).map((parte, i) =>
    METODOLOGIAS[parte] ? <TerminoConTooltip key={i} termino={parte} /> : parte
  );
}

// Divide el markdown en secciones delimitadas por encabezados ##
function parsearSecciones(texto: string): { titulo: string; contenido: string }[] {
  const secciones: { titulo: string; contenido: string }[] = [];
  let tituloActual = "";
  const lineasActuales: string[] = [];

  for (const linea of texto.split("\n")) {
    if (linea.startsWith("## ")) {
      if (tituloActual) {
        secciones.push({ titulo: tituloActual, contenido: lineasActuales.join("\n").trim() });
        lineasActuales.length = 0;
      }
      tituloActual = linea.replace(/^##\s+/, "");
    } else {
      lineasActuales.push(linea);
    }
  }
  if (tituloActual) {
    secciones.push({ titulo: tituloActual, contenido: lineasActuales.join("\n").trim() });
  }
  return secciones;
}

const PROSE_CLS =
  "prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-strong:text-foreground prose-table:text-sm prose-table:border prose-td:border prose-td:px-2 prose-td:py-1 prose-th:border prose-th:px-2 prose-th:py-1 prose-p:my-1.5 prose-li:my-0.5 prose-a:text-[#7C3AED]";

// Sección individual del acordeón con contenido Markdown + tooltips
// destacado=true → fondo violeta para "Cómo posicionar tu oferta"
function SeccionAcordeon({
  titulo,
  contenido,
  abierto,
  onToggle,
  destacado = false,
}: {
  titulo: string;
  contenido: string;
  abierto: boolean;
  onToggle: () => void;
  destacado?: boolean;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between py-3 px-4 text-left transition-colors ${
          destacado
            ? "bg-[#EDE9FE] dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30"
            : "bg-gray-50 dark:bg-muted/30 hover:bg-gray-100 dark:hover:bg-muted/50"
        }`}
      >
        <span
          className={`font-semibold text-sm ${
            destacado ? "text-[#5B21B6] dark:text-violet-300" : "text-[#1F2937] dark:text-foreground"
          }`}
        >
          {titulo}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
            abierto ? "rotate-180" : ""
          } ${destacado ? "text-[#5B21B6] dark:text-violet-300" : "text-[#7C3AED]"}`}
        />
      </button>

      {/* Animación grid para collapse/expand sin calcular altura en JS */}
      <div
        className={`grid transition-all duration-200 ${
          abierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 py-3 [&_table]:overflow-x-auto [&_table]:block [&_table]:rounded-lg [&_table]:border [&_table]:border-border">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              className={PROSE_CLS}
              components={{
                p({ children }) {
                  const nodes = Array.isArray(children) ? children : [children];
                  return (
                    <p>
                      {nodes.map((child, i) =>
                        typeof child === "string" ? (
                          <Fragment key={i}>{resaltarTerminos(child)}</Fragment>
                        ) : (
                          <Fragment key={i}>{child}</Fragment>
                        )
                      )}
                    </p>
                  );
                },
              }}
            >
              {contenido}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

// Estrategia de entrada como acordeón por secciones ##
function EstrategiaTexto({ texto }: { texto: string }) {
  const secciones = parsearSecciones(texto ?? "");
  // Primer acordeón (DECISOR DE ENTRADA) abierto por defecto
  const [abiertos, setAbiertos] = useState<Set<number>>(() => new Set([0]));

  const toggle = (i: number) => {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  if (!texto) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Sin estrategia generada. Usa el botón &ldquo;⚡ Actualizar estrategia&rdquo; para generar una.
      </p>
    );
  }

  // Fallback para texto sin secciones ## (formato legado)
  if (secciones.length === 0) {
    return (
      <div className="[&_table]:overflow-x-auto [&_table]:block [&_table]:rounded-lg [&_table]:border [&_table]:border-border">
        <ReactMarkdown remarkPlugins={[remarkGfm]} className={PROSE_CLS}>
          {texto}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {secciones.map((sec, i) => (
        <SeccionAcordeon
          key={i}
          titulo={sec.titulo}
          contenido={sec.contenido}
          abierto={abiertos.has(i)}
          onToggle={() => toggle(i)}
        />
      ))}
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
  const propuesta = intel.propuesta_valor_especifica;
  const tienePropuesta = !!propuesta && !propuesta.toLowerCase().startsWith("sin información");

  const filas: { titulo: string; contenido: string }[] = [
    { titulo: "Situación actual", contenido: intel.situacion_mercado },
    { titulo: "Prioridades este año", contenido: intel.prioridades_actuales },
    { titulo: "Dolores que resolvemos", contenido: intel.dolores_probables },
    { titulo: "Clientes y exigencias", contenido: intel.clientes_y_exigencias },
    { titulo: "Debilidades proveedor actual", contenido: intel.debilidades_proveedor_actual },
  ].filter((f) => f.contenido && !f.contenido.toLowerCase().startsWith("sin información"));

  const fuentes = (intel.fuentes ?? []).filter(Boolean);

  // Armar la lista de secciones: propuesta primero (destacada), luego filas
  const secciones: { titulo: string; contenido: string; destacado: boolean }[] = [
    ...(tienePropuesta ? [{ titulo: "Cómo posicionar tu oferta", contenido: propuesta!, destacado: true }] : []),
    ...filas.map((f) => ({ ...f, destacado: false })),
  ];

  // Primera sección abierta por defecto
  const [abiertos, setAbiertos] = useState<Set<number>>(() => new Set([0]));

  const toggle = (i: number) => {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  if (secciones.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
        🧠 Inteligencia comercial
      </p>
      <div className="rounded-xl border border-border overflow-hidden">
        {secciones.map((sec, i) => (
          <SeccionAcordeon
            key={sec.titulo}
            titulo={sec.titulo}
            contenido={sec.contenido}
            abierto={abiertos.has(i)}
            onToggle={() => toggle(i)}
            destacado={sec.destacado}
          />
        ))}
      </div>
      {fuentes.length > 0 && (
        <div className="mt-2 px-1 flex flex-wrap gap-1.5">
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
      )}
    </div>
  );
}

// ── MEDDIC ────────────────────────────────────────────────────

// Probabilidad sugerida automáticamente según score
function sugerirProbabilidad(score: number): number {
  if (score <= 4)  return 10;
  if (score <= 7)  return 30;
  if (score <= 10) return 60;
  return 80;
}

const MEDDIC_ITEMS: {
  campo: keyof Pick<MeddicData, "metricas" | "comprador_economico" | "criterios_decision" | "proceso_decision" | "dolor_identificado" | "campeon">;
  letra: string;
  titulo: string;
  descripcion: string;
}[] = [
  { campo: "metricas",             letra: "M", titulo: "Métricas",             descripcion: "¿Qué KPI mide el éxito del cliente? (ej: reducir rechazos de lotes en un X%)" },
  { campo: "comprador_economico",  letra: "E", titulo: "Comprador Económico",  descripcion: "¿Quién aprueba el presupuesto? ¿Ya lo contactaste?" },
  { campo: "criterios_decision",   letra: "D", titulo: "Criterios de Decisión","descripcion": "¿Qué evalúan para elegir proveedor? (precio, calidad, plazo, homologación)" },
  { campo: "proceso_decision",     letra: "D", titulo: "Proceso de Decisión",  descripcion: "¿Quiénes participan y cuáles son los pasos hasta la OC?" },
  { campo: "dolor_identificado",   letra: "I", titulo: "Dolor Identificado",   descripcion: "¿Qué problema concreto tienen hoy que nosotros podemos resolver?" },
  { campo: "campeon",              letra: "C", titulo: "Campeón",              descripcion: "¿Hay alguien interno que quiera que ganemos? ¿Tiene influencia?" },
];

const SEMAFORO_CONFIG: Record<MeddicSemaforo, { emoji: string; label: string; next: MeddicSemaforo }> = {
  rojo:     { emoji: "🔴", label: "Sin info",   next: "amarillo" },
  amarillo: { emoji: "🟡", label: "Parcial",    next: "verde" },
  verde:    { emoji: "🟢", label: "Calificado", next: "rojo" },
};

// Rangos en porcentaje (score máx = 12)
const SCORE_ETIQUETA: { minPct: number; maxPct: number; label: string; color: string; descripcion: string }[] = [
  { minPct: 0,  maxPct: 25,  label: "Débil",              color: "bg-red-500",    descripcion: "No tienes información suficiente. Sigue en discovery antes de proponer." },
  { minPct: 26, maxPct: 50,  label: "En exploración",     color: "bg-orange-500", descripcion: "Tienes algunos datos pero faltan piezas clave. No cotices aún." },
  { minPct: 51, maxPct: 75,  label: "Oportunidad real",   color: "bg-amber-500",  descripcion: "Estás listo para hacer una propuesta con alta probabilidad de éxito." },
  { minPct: 76, maxPct: 100, label: "Listo para cerrar",  color: "bg-green-500",  descripcion: "Tienes todo mapeado. Una propuesta aquí tiene altísima probabilidad de ganar." },
];

function scoreEtiqueta(score: number) {
  const pct = Math.round((score / 12) * 100);
  return SCORE_ETIQUETA.find((e) => pct >= e.minPct && pct <= e.maxPct) ?? SCORE_ETIQUETA[0];
}

function scorePct(score: number) {
  return Math.round((score / 12) * 100);
}

function formatCLP(valor: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(valor);
}

function parseCLP(raw: string): number | null {
  const num = parseInt(raw.replace(/\D/g, ""), 10);
  return isNaN(num) ? null : num;
}

interface MeddicCardProps {
  meddic: MeddicData;
  guardando: boolean;
  onComponenteChange: (
    campo: keyof Pick<MeddicData, "metricas" | "comprador_economico" | "criterios_decision" | "proceso_decision" | "dolor_identificado" | "campeon">,
    valor: Partial<MeddicComponente>
  ) => void;
  onValorChange: (campo: "valor_estimado" | "probabilidad", valor: number | null) => void;
}

function MeddicCard({ meddic, guardando, onComponenteChange, onValorChange }: MeddicCardProps) {
  const etiqueta = scoreEtiqueta(meddic.score);
  const pct = scorePct(meddic.score);
  const [valorRaw, setValorRaw] = useState<string>(
    meddic.valor_estimado != null ? String(meddic.valor_estimado) : ""
  );
  const [editandoTexto, setEditandoTexto] = useState<string | null>(null);
  const [textoLocal, setTextoLocal] = useState<string>("");
  const [mostrarAyuda, setMostrarAyuda] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Calificación MEDDIC
          </p>
          <button
            onClick={() => setMostrarAyuda((v) => !v)}
            className="h-4 w-4 rounded-full border border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center text-[10px] font-bold leading-none"
            title="¿Qué significa este score?"
          >
            ?
          </button>
        </div>
        {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
      </div>

      {/* Panel explicativo de rangos */}
      {mostrarAyuda && (
        <div className="mb-3 rounded-xl border border-border bg-muted/40 p-3 space-y-1.5">
          {SCORE_ETIQUETA.map((e) => (
            <div key={e.label} className="flex items-start gap-2">
              <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${e.color}`} />
              <p className="text-xs text-foreground leading-snug">
                <span className="font-semibold">{e.minPct}–{e.maxPct}% {e.label}:</span>{" "}
                {e.descripcion}
              </p>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-4 pb-4 space-y-4">

          {/* Barra de progreso */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">{etiqueta.label}</span>
              <span className="text-xs font-bold text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${etiqueta.color}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* 6 componentes MEDDIC */}
          <div className="space-y-2">
            {MEDDIC_ITEMS.map((item) => {
              const comp = meddic[item.campo];
              const conf = SEMAFORO_CONFIG[comp.semaforo];
              const estaEditando = editandoTexto === item.campo;

              return (
                <div
                  key={item.campo}
                  className="rounded-xl border border-border p-3 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    {/* Semáforo clickeable */}
                    <button
                      type="button"
                      onClick={() => onComponenteChange(item.campo, { semaforo: conf.next })}
                      className="shrink-0 flex flex-col items-center gap-0.5 min-w-[44px] py-0.5 rounded-lg hover:bg-muted/60 transition-colors"
                      title={`Cambiar estado — ahora: ${conf.label}`}
                    >
                      <span className="text-xl leading-none">{conf.emoji}</span>
                      <span className="text-[10px] text-muted-foreground leading-none">{conf.label}</span>
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#7C3AED]">{item.letra}</span>
                        <p className="text-xs font-semibold text-foreground">{item.titulo}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground/70 leading-snug mt-0.5">
                        {item.descripcion}
                      </p>

                      {/* Texto editable */}
                      {estaEditando ? (
                        <div className="mt-2 space-y-1.5">
                          <Textarea
                            value={textoLocal}
                            onChange={(e) => setTextoLocal(e.target.value)}
                            rows={2}
                            autoFocus
                            className="text-xs resize-none focus-visible:ring-[#7C3AED]"
                            placeholder={`Notas sobre ${item.titulo.toLowerCase()}...`}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onComponenteChange(item.campo, { texto: textoLocal.trim() || null });
                                setEditandoTexto(null);
                              }}
                              className="text-xs font-semibold text-[#7C3AED] hover:underline"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditandoTexto(null)}
                              className="text-xs text-muted-foreground hover:underline"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setTextoLocal(comp.texto ?? "");
                            setEditandoTexto(item.campo);
                          }}
                          className="mt-1.5 w-full text-left text-xs italic text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {comp.texto
                            ? comp.texto
                            : <span className="opacity-60">Toca para agregar notas...</span>}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Valor estimado + probabilidad */}
          <div className="pt-1 border-t border-border space-y-4">

            {/* Valor estimado en CLP */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Valor estimado del negocio (CLP)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={valorRaw ? new Intl.NumberFormat("es-CL").format(parseInt(valorRaw, 10) || 0) : ""}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    setValorRaw(raw);
                  }}
                  onBlur={() => {
                    const val = parseCLP(valorRaw);
                    onValorChange("valor_estimado", val);
                  }}
                  placeholder="0"
                  className="w-full h-10 pl-7 pr-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/60"
                />
              </div>
              {meddic.valor_estimado != null && (
                <p className="text-xs text-muted-foreground">{formatCLP(meddic.valor_estimado)}</p>
              )}
            </div>

            {/* Probabilidad de cierre */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Probabilidad de cierre
                </label>
                <span className={`text-sm font-bold ${
                  (meddic.probabilidad ?? 0) >= 60 ? "text-green-600 dark:text-green-400" :
                  (meddic.probabilidad ?? 0) >= 30 ? "text-amber-600 dark:text-amber-400" :
                  "text-muted-foreground"
                }`}>
                  {meddic.probabilidad ?? sugerirProbabilidad(meddic.score)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={meddic.probabilidad ?? sugerirProbabilidad(meddic.score)}
                onChange={(e) => onValorChange("probabilidad", parseInt(e.target.value, 10))}
                className="w-full h-2 rounded-full appearance-none bg-muted cursor-pointer accent-[#7C3AED]"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Sugerido por MEDDIC: {sugerirProbabilidad(meddic.score)}% · Puedes ajustarlo
              </p>
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}

// ── Tipo solo para verificación de contexto (sin uso en UI) ───
// Se mantiene importado para no romper tipos si otros módulos lo usan.
export type { VerificacionContexto };
