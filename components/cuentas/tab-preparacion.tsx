"use client";

import { useState } from "react";
import { Copy, CheckCheck, HelpCircle, Clock, MessageSquare } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { FichaIA, Interaccion, Compromiso } from "@/lib/types";

interface TabPreparacionProps {
  ficha: FichaIA;
  ultimaInteraccion: Interaccion | null;
  notasVendedor?: string | null;
}

export function TabPreparacion({ ficha, ultimaInteraccion, notasVendedor }: TabPreparacionProps) {
  const compromisosPendientes =
    (ultimaInteraccion?.compromisos as Compromiso[] | null)?.filter(
      (c) => c.responsable?.toLowerCase().includes("vendedor") ||
             c.responsable?.toLowerCase().includes("nosotros") ||
             c.responsable?.toLowerCase().includes("yo")
    ) ?? [];

  // Borrador de mensaje de apertura basado en el ángulo de entrada.
  // Si hay notas del vendedor, se genera una versión más personalizada.
  const contextoExtra = notasVendedor?.trim()
    ? ` Tengo entendido que ${notasVendedor.split("\n")[0].toLowerCase().replace(/\.$/, "")}.`
    : "";
  const mensajeApertura = `Hola, buenos días. Mi nombre es [Nombre] de [Tu empresa], proveedor de etiquetas autoadhesivas.${contextoExtra} Contacto a ${ficha.nombre} porque ${ficha.angulo_entrada.split(".")[0].toLowerCase()}. ¿Podría hablar con ${ficha.decisores[0]?.cargo ?? "alguien del área de calidad o producción"}?`;

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

      {/* Borrador de mensaje */}
      <div>
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Borrador de apertura
          </p>
          <HelpTooltip
            titulo="¿Cómo usar el borrador?"
            explicacion="Es un mensaje de primer contacto generado por la IA basado en el análisis de la empresa. Úsalo como punto de partida — adáptalo con tu propio estilo antes de enviarlo."
            ejemplo={"Nunca copies y pegues directo. Lee el borrador, personalízalo con algo que solo tú sabes, y envíalo desde tu correo o WhatsApp habitual."}
          />
        </div>
        <Card>
          <CardContent className="pt-4">
            {notasVendedor?.trim() && (
              <div className="mb-3 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
                <span className="text-amber-600 shrink-0 mt-0.5 text-xs">📒</span>
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed line-clamp-2">
                  Tu contexto: {notasVendedor}
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground mb-2 italic">
              Adaptar antes de usar — es un punto de partida
            </p>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-sm leading-relaxed">{mensajeApertura}</p>
            </div>
            <CopiarBoton texto={mensajeApertura} label="Copiar borrador" className="mt-3 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Pregunta con botón de copiar
function PreguntaCopiable({
  label,
  texto,
}: {
  label: string;
  texto: string;
}) {
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
function CopiarBoton({
  texto,
  label,
  className,
}: {
  texto: string;
  label: string;
  className?: string;
}) {
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
