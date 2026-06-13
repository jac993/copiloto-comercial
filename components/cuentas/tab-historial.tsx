"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Phone, Users, Mail, MessageCircle,
  ChevronDown, ChevronUp, Upload, Zap, Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Interaccion } from "@/lib/types";

const TIPO_CONFIG: Record<
  string,
  { label: string; Icon: React.ElementType; color: string }
> = {
  llamada: { label: "Llamada", Icon: Phone, color: "text-blue-600 dark:text-blue-400" },
  reunion: { label: "Reunión", Icon: Users, color: "text-purple-600 dark:text-purple-400" },
  email: { label: "Email", Icon: Mail, color: "text-amber-600 dark:text-amber-400" },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle, color: "text-green-600 dark:text-green-400" },
};

const SENTIMIENTO_BORDE: Record<string, string> = {
  positivo: "border-l-4 border-l-[#22C55E]",
  neutro: "border-l-4 border-l-gray-300 dark:border-l-gray-600",
  negativo: "border-l-4 border-l-destructive",
};

function fechaLegible(fechaStr: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(fechaStr));
}

interface TabHistorialProps {
  interacciones: Interaccion[];
  empresaId: string;
}

export function TabHistorial({ interacciones, empresaId }: TabHistorialProps) {
  const router = useRouter();

  return (
    <div className="space-y-3 pb-24">
      {interacciones.length === 0 ? (
        <div className="text-center py-10 space-y-3">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">Sin interacciones aún</p>
          <p className="text-xs text-muted-foreground">
            Registra tu primera llamada o reunión
          </p>
        </div>
      ) : (
        interacciones.map((interaccion) => (
          <EntradaTimeline key={interaccion.id} interaccion={interaccion} />
        ))
      )}

      {/* Botón flotante para subir nueva llamada */}
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40">
        <Button
          size="lg"
          className="rounded-2xl shadow-xl shadow-primary/30 gap-2 pr-5 h-14"
          onClick={() => router.push(`/llamadas?empresa=${empresaId}`)}
        >
          <Upload className="h-5 w-5" />
          Subir llamada
        </Button>
      </div>
    </div>
  );
}

function EntradaTimeline({ interaccion }: { interaccion: Interaccion }) {
  const [expandida, setExpandida] = useState(false);
  const tipoConf = TIPO_CONFIG[interaccion.tipo] ?? TIPO_CONFIG.llamada;
  const Icon = tipoConf.Icon;
  const bordeSentimiento =
    interaccion.sentimiento
      ? SENTIMIENTO_BORDE[interaccion.sentimiento]
      : "border-l-4 border-l-gray-200";

  return (
    <Card className={`overflow-hidden ${bordeSentimiento}`}>
      <CardContent className="pt-4 pb-3">
        {/* Cabecera de la entrada */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <Icon className={`h-4 w-4 ${tipoConf.color}`} />
            </div>
            <div>
              <p className="text-sm font-semibold">{tipoConf.label}</p>
              <p className="text-xs text-muted-foreground">
                {fechaLegible(interaccion.fecha)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {interaccion.tecnica_usada && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                {interaccion.tecnica_usada}
              </span>
            )}
            <button
              onClick={() => setExpandida(!expandida)}
              className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
            >
              {expandida ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>

        {/* Resumen breve siempre visible */}
        {interaccion.resumen_ia && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
            {interaccion.resumen_ia}
          </p>
        )}

        {/* Próximo paso */}
        {interaccion.proximo_paso && (
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <span className="text-primary font-medium">→ Próximo paso:</span>
            <span className="text-foreground">{interaccion.proximo_paso}</span>
            {interaccion.proximo_paso_fecha && (
              <span className="text-muted-foreground ml-1">
                ({interaccion.proximo_paso_fecha})
              </span>
            )}
          </div>
        )}

        {/* Contenido expandido */}
        {expandida && (
          <div className="mt-4 space-y-3 border-t border-border pt-3">
            {/* Transcripción */}
            {interaccion.transcripcion && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                  Transcripción
                </p>
                <div className="bg-muted/50 rounded-xl p-3 max-h-48 overflow-y-auto">
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">
                    {interaccion.transcripcion}
                  </p>
                </div>
              </div>
            )}

            {/* Coaching de IA */}
            {interaccion.coaching_ia && (
              <div>
                <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Coaching
                </p>
                <div className="bg-primary/5 rounded-xl p-3">
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">
                    {interaccion.coaching_ia}
                  </p>
                </div>
              </div>
            )}

            {/* Compromisos detectados */}
            {interaccion.compromisos && interaccion.compromisos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                  Compromisos
                </p>
                <div className="space-y-1.5">
                  {interaccion.compromisos.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span className="text-primary mt-0.5">✓</span>
                      <div>
                        <span className="font-medium">{c.responsable}:</span>{" "}
                        {c.descripcion}
                        {c.fecha && (
                          <span className="text-muted-foreground"> · {c.fecha}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
