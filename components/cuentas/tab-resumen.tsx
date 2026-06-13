"use client";

import { Zap, Tag, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { FichaIA } from "@/lib/types";

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
}

export function TabResumen({ ficha }: TabResumenProps) {
  return (
    <div className="space-y-4 pb-6">
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

      {/* Ángulo de entrada + técnica */}
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
          <p className="text-sm leading-relaxed">{ficha.angulo_entrada}</p>
          <p className="text-xs text-muted-foreground italic">
            {ficha.razon_tecnica}
          </p>
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
