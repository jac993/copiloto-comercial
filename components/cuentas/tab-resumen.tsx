"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Tag, AlertTriangle, BookOpen, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  empresaId: string;
  notasVendedor: string | null;
}

export function TabResumen({ ficha, empresaId, notasVendedor }: TabResumenProps) {
  const router = useRouter();

  // Estado local para notas del vendedor
  const [nota, setNota] = useState(notasVendedor ?? "");
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [notaGuardada, setNotaGuardada] = useState(false);

  // Estado local para campos regenerables (se actualizan sin recargar la página)
  const [anguloActual, setAnguloActual] = useState(ficha.angulo_entrada);
  const [razonActual, setRazonActual] = useState(ficha.razon_tecnica);
  const [regenerando, setRegenerando] = useState(false);
  const [errorRegen, setErrorRegen] = useState<string | null>(null);

  const guardarNota = async () => {
    setGuardandoNota(true);
    try {
      await fetch("/api/notas-vendedor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId, notas: nota }),
      });
      setNotaGuardada(true);
      setTimeout(() => setNotaGuardada(false), 2500);
    } finally {
      setGuardandoNota(false);
    }
  };

  const regenerar = async () => {
    setRegenerando(true);
    setErrorRegen(null);
    try {
      const res = await fetch("/api/investigar/regenerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId }),
      });
      const data = (await res.json()) as { ok: boolean; ficha_ia?: FichaIA; error?: string };
      if (!res.ok || !data.ok) {
        setErrorRegen(data.error ?? "Error desconocido");
        return;
      }
      if (data.ficha_ia) {
        setAnguloActual(data.ficha_ia.angulo_entrada);
        setRazonActual(data.ficha_ia.razon_tecnica);
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
      {/* LO QUE YO SÉ — notas privadas del vendedor */}
      <Card className="border-amber-200 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-900/5">
        <CardContent className="pt-5">
          <div className="flex items-center gap-1.5 mb-3">
            <BookOpen className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500" />
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-500 uppercase tracking-wide">
              Lo que yo sé
            </p>
          </div>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Agrega contexto que solo tú sabes: contactos internos, situaciones recientes, referencias, información del mercado..."
            className="w-full min-h-[96px] px-3 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800/30 bg-white dark:bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-muted-foreground/60"
            rows={4}
          />
          <Button
            size="sm"
            variant="outline"
            className="mt-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/20"
            onClick={guardarNota}
            disabled={guardandoNota}
          >
            {guardandoNota ? "Guardando..." : notaGuardada ? "✓ Nota guardada" : "Guardar nota"}
          </Button>
        </CardContent>
      </Card>

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

          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1.5 text-xs"
            onClick={regenerar}
            disabled={regenerando}
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
