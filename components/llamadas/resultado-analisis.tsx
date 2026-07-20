"use client";

// Muestra el resultado del análisis de IA en 4 tabs:
// Resumen | Coaching | Próximo paso | Borrador
// Si estado_sugerido != null muestra banner con botones de confirmación.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, Copy, Check, ChevronRight,
  TrendingUp, MessageSquare, Calendar, FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MontoDialog } from "@/components/cuentas/monto-dialog";
import type { ResultadoAnalisis } from "@/lib/types";

const SENTIMIENTO_CONFIG = {
  positivo:     { label: "Positivo", className: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400" },
  neutro:       { label: "Neutro",   className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  negativo:     { label: "Negativo", className: "bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400" },
  sin_respuesta:{ label: "Sin respuesta", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" },
};

type Tab = "resumen" | "coaching" | "proximo" | "borrador";

interface ResultadoAnalisisProps {
  resultado: ResultadoAnalisis;
  empresaId: string;
  interaccionId: string;
  onNuevaInteraccion: () => void;
}

export function ResultadoAnalisisView({
  resultado,
  empresaId,
  onNuevaInteraccion,
}: ResultadoAnalisisProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("resumen");
  const [copiado, setCopiado] = useState(false);
  const [confirmandoEstado, setConfirmandoEstado] = useState(false);
  const [estadoConfirmado, setEstadoConfirmado] = useState(false);
  const [estadoDescartado, setEstadoDescartado] = useState(false);
  // Al confirmar el paso a "cotizado" → capturar el valor del negocio
  const [capturandoMonto, setCapturandoMonto] = useState(false);

  const sentConf = SENTIMIENTO_CONFIG[resultado.sentimiento_prospecto] ?? SENTIMIENTO_CONFIG.neutro;

  async function copiarBorrador() {
    await navigator.clipboard.writeText(resultado.borrador_respuesta);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  async function confirmarEstado() {
    if (!resultado.estado_sugerido) return;
    setConfirmandoEstado(true);
    try {
      await fetch(`/api/empresas/${empresaId}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: resultado.estado_sugerido.estado }),
      });
      setEstadoConfirmado(true);
      // Al cotizar, preguntar el valor del negocio (un clic, nunca bloquea)
      if (resultado.estado_sugerido.estado === "cotizado") setCapturandoMonto(true);
      router.refresh();
    } finally {
      setConfirmandoEstado(false);
    }
  }

  const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: "resumen",  label: "Resumen",      Icon: FileText },
    { id: "coaching", label: "Coaching",     Icon: TrendingUp },
    { id: "proximo",  label: "Próximo paso", Icon: Calendar },
    { id: "borrador", label: "Borrador",     Icon: MessageSquare },
  ];

  return (
    <div className="space-y-4">
      {/* Encabezado de éxito */}
      <div className="flex items-center gap-3 px-1">
        <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
        <div>
          <p className="font-semibold text-sm">Análisis completado</p>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sentConf.className}`}>
            {sentConf.label}
          </span>
        </div>
      </div>

      {/* Banner de estado sugerido */}
      {resultado.estado_sugerido && !estadoConfirmado && !estadoDescartado && (
        <Card className="border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
              La IA sugiere cambiar el estado
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-300 mb-3">
              <span className="font-semibold capitalize">{resultado.estado_sugerido.estado.replace(/_/g, " ")}</span>
              {" — "}{resultado.estado_sugerido.razon}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                onClick={confirmarEstado}
                disabled={confirmandoEstado}
              >
                {confirmandoEstado ? "Guardando..." : "✓ Confirmar"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs border-amber-300"
                onClick={() => setEstadoDescartado(true)}
              >
                ✗ Mantener actual
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {estadoConfirmado && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <p className="text-xs font-medium text-green-700 dark:text-green-400">Estado actualizado correctamente</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium border-b-2 transition-colors ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Contenido de tabs */}
      <div className="pb-6">
        {tab === "resumen" && (
          <div className="space-y-3">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm leading-relaxed whitespace-pre-line">{resultado.resumen}</p>
              </CardContent>
            </Card>

            {resultado.senales_detectadas.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                  Señales detectadas
                </p>
                <div className="space-y-1.5">
                  {resultado.senales_detectadas.map((s, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50">
                      <ChevronRight className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 capitalize">
                          {s.tipo.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-amber-700/80 dark:text-amber-400/80">{s.descripcion}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resultado.compromisos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                  Compromisos
                </p>
                <div className="space-y-1.5">
                  {resultado.compromisos.map((c, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/50 border border-border">
                      <span className="text-xs font-bold text-primary shrink-0 mt-0.5">
                        {c.quien === "vendedor" ? "Yo" : c.quien === "prospecto" ? "Él/Ella" : "Ambos"}
                      </span>
                      <div>
                        <p className="text-xs">{c.que}</p>
                        {c.cuando !== "sin fecha definida" && (
                          <p className="text-xs text-muted-foreground mt-0.5">{c.cuando}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "coaching" && (
          <div className="space-y-3">
            <Card className="border-green-200 dark:border-green-800/30 bg-green-50/50 dark:bg-green-900/5">
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1.5">✓ Lo que hiciste bien</p>
                <p className="text-sm leading-relaxed">{resultado.coaching.bien}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-200 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-900/5">
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">↑ Qué mejorar</p>
                <p className="text-sm leading-relaxed">{resultado.coaching.mejorar}</p>
              </CardContent>
            </Card>
            <Card className="border-red-200 dark:border-red-800/30 bg-red-50/50 dark:bg-red-900/5">
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1.5">✗ Oportunidad perdida</p>
                <p className="text-sm leading-relaxed">{resultado.coaching.oportunidad_perdida}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Qué no respondió
                </p>
                <p className="text-sm leading-relaxed italic text-muted-foreground">
                  {resultado.lo_que_no_respondio}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "proximo" && (
          <div className="space-y-3">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
                  Técnica recomendada
                </p>
                <p className="font-semibold">{resultado.tecnica_recomendada}</p>
                <p className="text-sm text-muted-foreground mt-1">{resultado.razon_tecnica}</p>
              </CardContent>
            </Card>
            {resultado.compromisos.length > 0 && (
              <div className="space-y-2">
                {resultado.compromisos.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      c.quien === "vendedor"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {c.quien === "vendedor" ? "Yo" : "El"}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{c.que}</p>
                      {c.cuando !== "sin fecha definida" && (
                        <p className="text-xs text-muted-foreground mt-0.5">{c.cuando}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "borrador" && (
          <div className="space-y-3">
            <div className="relative">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap font-mono text-xs">
                    {resultado.borrador_respuesta}
                  </p>
                </CardContent>
              </Card>
            </div>
            <Button
              className="w-full gap-2"
              variant={copiado ? "outline" : "default"}
              onClick={copiarBorrador}
            >
              {copiado ? (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-green-600">¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copiar borrador
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Pega este texto en tu canal habitual y ajusta si es necesario.
            </p>
          </div>
        )}
      </div>

      {/* Botón nueva interacción */}
      <div className="border-t border-border pt-4">
        <Button variant="outline" className="w-full" onClick={onNuevaInteraccion}>
          ← Nueva interacción
        </Button>
      </div>

      {/* Captura del valor del negocio al confirmar el paso a "cotizado" */}
      <MontoDialog
        empresaId={empresaId}
        empresaNombre="Negocio cotizado"
        open={capturandoMonto}
        onClose={() => setCapturandoMonto(false)}
        onGuardado={() => router.refresh()}
      />
    </div>
  );
}
