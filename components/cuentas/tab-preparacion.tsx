"use client";

import { useState } from "react";
import {
  Copy, CheckCheck, HelpCircle, Clock, MessageSquare, Zap,
  RefreshCw, Loader2, Mail, ExternalLink, AlertCircle,
} from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FichaIA, Interaccion, Compromiso, Contacto } from "@/lib/types";
import type { BorradoresApertura } from "@/app/api/preparacion/route";

interface TabPreparacionProps {
  ficha: FichaIA;
  ultimaInteraccion: Interaccion | null;
  notasVendedor?: string | null;
  // Datos adicionales para generar borradores
  empresaId: string;
  nombreEmpresa: string;
  industria?: string | null;
  interacciones: Interaccion[];
  contactos: Contacto[];
}

type CanalBorrador = "whatsapp" | "correo" | "linkedin";

const CANAL_CONFIG: Record<CanalBorrador, { label: string; icon: React.ReactNode; color: string }> = {
  whatsapp: {
    label: "WhatsApp",
    icon: <MessageSquare className="h-3.5 w-3.5" />,
    color: "text-[#22C55E]",
  },
  correo: {
    label: "Correo",
    icon: <Mail className="h-3.5 w-3.5" />,
    color: "text-blue-500",
  },
  linkedin: {
    label: "LinkedIn",
    icon: <ExternalLink className="h-3.5 w-3.5" />,
    color: "text-[#0077B5]",
  },
};

export function TabPreparacion({
  ficha,
  ultimaInteraccion,
  notasVendedor,
  empresaId,
  nombreEmpresa,
  industria,
  interacciones,
  contactos,
}: TabPreparacionProps) {
  const compromisosPendientes =
    (ultimaInteraccion?.compromisos as Compromiso[] | null)?.filter(
      (c) => c.responsable?.toLowerCase().includes("vendedor") ||
             c.responsable?.toLowerCase().includes("nosotros") ||
             c.responsable?.toLowerCase().includes("yo")
    ) ?? [];

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borradores, setBorradores] = useState<BorradoresApertura | null>(null);
  const [tabCanal, setTabCanal] = useState<CanalBorrador>("whatsapp");

  const generarBorradores = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/preparacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresaId,
          nombreEmpresa,
          industria,
          notasVendedor,
          ficha,
          interacciones: interacciones.slice(0, 5), // últimas 5 para contexto
          contactos,
        }),
      });
      const data = await res.json() as { ok: boolean; borradores?: BorradoresApertura; error?: string };
      if (!data.ok || !data.borradores) throw new Error(data.error ?? "Error al generar borradores");
      setBorradores(data.borradores);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCargando(false);
    }
  };

  const textoCanalActivo = borradores
    ? tabCanal === "correo"
      ? `Asunto: ${borradores.correo.asunto}\n\n${borradores.correo.cuerpo}`
      : tabCanal === "whatsapp"
      ? borradores.whatsapp
      : borradores.linkedin
    : "";

  return (
    <div className="space-y-4 pb-6">
      {/* Preguntas SPIN */}
      <div>
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Preguntas SPIN para esta empresa
          </p>
          <HelpTooltip
            titulo="¿Cómo usar estas preguntas?"
            explicacion="Son preguntas diseñadas para que el cliente descubra solo que tiene un problema. No las leas literalmente — úsalas como guía para la conversación."
            ejemplo={"En vez de decir 'tenemos etiquetas de mejor calidad', pregunta:\n'¿Con qué frecuencia les ocurre que rechazan un lote por problemas de etiquetado?'"}
          />
        </div>
        <Card>
          <CardContent className="pt-4 pb-2">
            {ficha.preguntas_spin.map((pregunta, i) => {
              const labels = ["Situación", "Problema", "Implicación"];
              return (
                <PreguntaCopiable
                  key={i}
                  label={labels[i] ?? `Pregunta ${i + 1}`}
                  texto={pregunta}
                />
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Resumen última conversación */}
      {ultimaInteraccion?.resumen_ia && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Última conversación
          </p>
          <Card className="border-0 bg-muted/50">
            <CardContent className="pt-4">
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {ultimaInteraccion.resumen_ia}
              </p>
              {ultimaInteraccion.proximo_paso && (
                <div className="mt-3 flex items-start gap-2 text-xs border-t border-border pt-3">
                  <span className="text-primary font-semibold shrink-0">→</span>
                  <span>{ultimaInteraccion.proximo_paso}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Compromisos pendientes */}
      {compromisosPendientes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
            Compromisos pendientes tuyos
          </p>
          <Card className="border-amber-200 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-900/5">
            <CardContent className="pt-4 space-y-2">
              {compromisosPendientes.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-amber-600 shrink-0 mt-0.5">⚠️</span>
                  <div>
                    <p>{c.descripcion}</p>
                    {c.fecha && (
                      <p className="text-xs text-muted-foreground">Para: {c.fecha}</p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Borradores de apertura — por canal */}
      <div>
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Borradores de apertura
          </p>
          <HelpTooltip
            titulo="¿Cómo usar los borradores?"
            explicacion="La IA genera un mensaje personalizado por canal usando técnica SPIN basada en el decisor principal y el historial de la empresa. Adáptalo con tu estilo antes de enviar."
            ejemplo={"Lee el borrador, añade algo que solo tú sabes, y envíalo desde tu WhatsApp o correo habitual."}
          />
        </div>

        {/* Estado: sin generar */}
        {!borradores && !cargando && (
          <Card>
            <CardContent className="pt-5 pb-5 flex flex-col items-center gap-3 text-center">
              {notasVendedor?.trim() && (
                <div className="w-full mb-1 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
                  <span className="text-amber-600 shrink-0 text-xs">📒</span>
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed line-clamp-2 text-left">
                    Tu contexto: {notasVendedor}
                  </p>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Genera borradores personalizados para WhatsApp, correo y LinkedIn
                usando la técnica SPIN y el perfil del decisor principal.
              </p>
              {error && (
                <div className="w-full flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-left">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive leading-relaxed">{error}</p>
                </div>
              )}
              <Button size="lg" className="gap-2 w-full" onClick={generarBorradores}>
                <Zap className="h-4 w-4" />
                ⚡ Generar borradores
              </Button>
              <p className="text-xs text-muted-foreground">Usa créditos de IA — Claude Haiku</p>
            </CardContent>
          </Card>
        )}

        {/* Estado: cargando */}
        {cargando && (
          <Card>
            <CardContent className="pt-6 pb-6 flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Redactando borradores con SPIN...</p>
            </CardContent>
          </Card>
        )}

        {/* Estado: borradores listos */}
        {borradores && !cargando && (
          <Card>
            <CardContent className="pt-4 pb-4">
              {/* Selector de canal */}
              <div className="flex gap-1 p-1 bg-muted rounded-xl mb-4">
                {(Object.keys(CANAL_CONFIG) as CanalBorrador[]).map((canal) => {
                  const cfg = CANAL_CONFIG[canal];
                  return (
                    <button
                      key={canal}
                      onClick={() => setTabCanal(canal)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all",
                        tabCanal === canal
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className={cn(tabCanal === canal ? cfg.color : "")}>
                        {cfg.icon}
                      </span>
                      {cfg.label}
                    </button>
                  );
                })}
              </div>

              {/* Contenido del canal activo */}
              {tabCanal === "correo" && (
                <div className="mb-3 flex items-center gap-2 p-2.5 rounded-lg bg-muted/60 border border-border">
                  <span className="text-xs font-semibold text-muted-foreground shrink-0">Asunto:</span>
                  <span className="text-xs font-medium">{borradores.correo.asunto}</span>
                </div>
              )}

              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {tabCanal === "whatsapp"
                    ? borradores.whatsapp
                    : tabCanal === "correo"
                    ? borradores.correo.cuerpo
                    : borradores.linkedin}
                </p>
              </div>

              <div className="flex gap-2 mt-3">
                <CopiarBoton texto={textoCanalActivo} label="Copiar" className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={generarBorradores}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2 italic">
                Adapta con tu estilo antes de enviar
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// Pregunta con botón de copiar
function PreguntaCopiable({ label, texto }: { label: string; texto: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <span className="text-xs font-semibold text-primary">{label}</span>
          <p className="text-sm mt-0.5 leading-relaxed">{texto}</p>
        </div>
        <button
          onClick={copiar}
          className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors shrink-0"
        >
          {copiado ? (
            <CheckCheck className="h-4 w-4 text-[#22C55E]" />
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}

// Botón de copiar reutilizable
function CopiarBoton({ texto, label, className }: { texto: string; label: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className={`gap-1.5 ${className ?? ""}`}
      onClick={copiar}
    >
      {copiado ? (
        <>
          <CheckCheck className="h-3.5 w-3.5 text-[#22C55E]" /> Copiado
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> {label}
        </>
      )}
    </Button>
  );
}
