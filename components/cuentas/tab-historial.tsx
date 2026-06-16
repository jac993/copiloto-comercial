"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Phone, Users, Mail, MessageCircle,
  ChevronDown, ChevronUp, Upload, Zap, Clock, Trash2,
} from "lucide-react";
import type { CorreoDetectado } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

export function TabHistorial({ interacciones: interaccionesIniciales, empresaId }: TabHistorialProps) {
  const router = useRouter();
  const [lista, setLista] = useState(interaccionesIniciales);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [correos, setCorreos] = useState<CorreoDetectado[]>([]);

  useEffect(() => {
    fetch(`/api/correos/${empresaId}`)
      .then((r) => r.json())
      .then((d) => setCorreos(d.correos ?? []))
      .catch(() => {/* ignorar silenciosamente */});
  }, [empresaId]);

  const eliminar = async () => {
    if (!confirmandoId) return;
    setEliminandoId(confirmandoId);
    setConfirmandoId(null);
    try {
      await fetch(`/api/interacciones/${confirmandoId}`, { method: "DELETE" });
      setLista((prev) => prev.filter((i) => i.id !== confirmandoId));
    } finally {
      setEliminandoId(null);
    }
  };

  return (
    <div className="space-y-3 pb-24">
      {/* Banner correos detectados por Gmail */}
      {correos.length > 0 && (
        <div className="bg-[#FFFBEB] border border-amber-200 rounded-xl p-3 space-y-1.5">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            {correos.length} correo{correos.length > 1 ? "s" : ""} detectado{correos.length > 1 ? "s" : ""} en Gmail
          </p>
          {correos.slice(0, 3).map((c) => (
            <div key={c.id} className="text-xs text-amber-800 pl-5">
              <span className="font-medium">{c.asunto ?? "(sin asunto)"}</span>
              {c.snippet && <span className="text-amber-600 ml-1">— {c.snippet.slice(0, 80)}</span>}
            </div>
          ))}
          {correos.length > 3 && (
            <p className="text-xs text-amber-600 pl-5">+{correos.length - 3} más</p>
          )}
        </div>
      )}

      {/* Encabezado con ayuda */}
      <div className="flex items-center gap-1.5 px-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Historial de interacciones</p>
        <HelpTooltip
          titulo="¿Qué es el historial?"
          explicacion="Registro cronológico de todas tus interacciones con esta empresa. Cada llamada, correo, WhatsApp o LinkedIn que analices queda guardado aquí con su transcripción, coaching y próximo paso."
          ejemplo={"Antes de llamar, revisa el historial para recordar qué se habló en la última conversación y qué comprometiste."}
        />
      </div>

      {lista.length === 0 ? (
        <div className="text-center py-10 space-y-3">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">Sin interacciones aún</p>
          <p className="text-xs text-muted-foreground">
            Registra tu primera llamada o reunión
          </p>
        </div>
      ) : (
        lista.map((interaccion) => (
          <EntradaTimeline
            key={interaccion.id}
            interaccion={interaccion}
            eliminando={eliminandoId === interaccion.id}
            onEliminar={() => setConfirmandoId(interaccion.id)}
          />
        ))
      )}

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={confirmandoId !== null} onOpenChange={(open: boolean) => { if (!open) setConfirmandoId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta interacción?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={eliminar}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

function EntradaTimeline({
  interaccion,
  eliminando,
  onEliminar,
}: {
  interaccion: Interaccion;
  eliminando: boolean;
  onEliminar: () => void;
}) {
  const [expandida, setExpandida] = useState(false);
  const tipoConf = TIPO_CONFIG[interaccion.tipo] ?? TIPO_CONFIG.llamada;
  const Icon = tipoConf.Icon;
  const bordeSentimiento =
    interaccion.sentimiento
      ? SENTIMIENTO_BORDE[interaccion.sentimiento]
      : "border-l-4 border-l-gray-200";

  return (
    <Card className={`overflow-hidden transition-opacity ${eliminando ? "opacity-40 pointer-events-none" : ""} ${bordeSentimiento}`}>
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
              onClick={onEliminar}
              className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-destructive/10 transition-colors"
              aria-label="Eliminar interacción"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive/60 hover:text-destructive transition-colors" />
            </button>
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
