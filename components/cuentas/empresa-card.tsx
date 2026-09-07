"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { PanelSeguimientoContactos } from "@/components/cuentas/panel-seguimiento-contactos";
import { fondoUrgencia, lineaTiempos } from "@/lib/urgencia-visual";
import type { Empresa, EstadoEmpresa, MeddicData } from "@/lib/types";

// Colores semánticos por estado — reflejan la etapa del pipeline
const ESTADO_CONFIG: Record<
  EstadoEmpresa,
  { label: string; className: string }
> = {
  prospecto: {
    label: "Prospecto",
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
  contactado: {
    label: "Contactado",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  en_conversacion: {
    label: "En conversación",
    className:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  },
  reunion_agendada: {
    label: "Reunión agendada",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  cotizado: {
    label: "Cotizado",
    className:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
  ganado: {
    label: "Ganado",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  perdido: {
    label: "Perdido",
    className: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  },
};

// Tiempo relativo legible en español
function tiempoRelativo(fechaStr: string): string {
  const diff = Date.now() - new Date(fechaStr).getTime();
  const min = Math.floor(diff / 60_000);
  const hrs = Math.floor(min / 60);
  const dias = Math.floor(hrs / 24);
  const sem = Math.floor(dias / 7);

  if (min < 60) return `hace ${min} min`;
  if (hrs < 24) return `hace ${hrs}h`;
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  if (sem === 1) return "hace 1 semana";
  return `hace ${sem} semanas`;
}

// Iniciales de la empresa (máx 2 caracteres)
function getIniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

// Color del avatar basado en el score
function getAvatarColor(score: number): string {
  if (score >= 70) return "bg-primary/15 text-primary";
  if (score >= 40) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}

interface EmpresaCardProps {
  empresa: Empresa;
  // Días hábiles sin interacción real. null = sin interacciones registradas.
  dias: number | null;
  // Tiene al menos una tarea con próximo paso vencido.
  vencida: boolean;
}

export function EmpresaCard({ empresa, dias, vencida }: EmpresaCardProps) {
  const [panelAbierto, setPanelAbierto] = useState(false);
  const estadoConf = ESTADO_CONFIG[empresa.estado];
  const iniciales = getIniciales(empresa.nombre);
  const avatarColor = getAvatarColor(empresa.score_prioridad);

  const cardBorderFondo =
    empresa.estado === "ganado"
      ? "border-l-[3px] border-l-[#22C55E] hover:border-l-[#22C55E]"
      : empresa.estado === "perdido"
      ? "border-l-[3px] border-l-gray-300 dark:border-l-gray-600 opacity-75 hover:border-l-gray-300"
      : "";

  const fondo = fondoUrgencia(empresa, dias, vencida);
  // Formato largo: acá hay ancho completo, a diferencia del kanban.
  const tiempos = lineaTiempos(empresa.estado_desde, dias, false);

  return (
    <>
      {/* Card compone su className con cn(), así que twMerge resuelve solo
          el choque entre su bg-card y el bg-* de urgencia. */}
      <Card className={`border hover:border-primary/30 hover:shadow-md transition-all ${cardBorderFondo} ${fondo}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Avatar con iniciales */}
            <div
              className={`h-12 w-12 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${avatarColor}`}
            >
              {iniciales || <Building2 className="h-5 w-5" />}
            </div>

            <div className="flex-1 min-w-0">
              {/* Nombre + badge estado */}
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm leading-tight truncate">
                  {empresa.nombre}
                </p>
                <span
                  className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${estadoConf.className}`}
                >
                  {estadoConf.label}
                </span>
              </div>

              {/* Industria */}
              {empresa.industria && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {empresa.industria}
                </p>
              )}

              {tiempos && (
                <p className="text-xs text-muted-foreground mt-0.5">{tiempos}</p>
              )}

              {/* Barra de score */}
              <div className="mt-2.5">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Prioridad</span>
                    <HelpTooltip
                      titulo="Score de prioridad"
                      explicacion="La IA calcula qué tan urgente es contactar esta empresa hoy. Considera señales recientes, tiempo sin contacto y compromisos pendientes."
                      ejemplo={"Score 90-100: contactar hoy.\nScore 50-70: esta semana.\nScore menor a 50: puede esperar."}
                    />
                  </div>
                  <span className="text-xs font-semibold text-foreground">
                    {empresa.score_prioridad}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${empresa.score_prioridad}%`,
                      background:
                        empresa.score_prioridad >= 70
                          ? "#F97316"
                          : empresa.score_prioridad >= 40
                          ? "#F59E0B"
                          : "#9CA3AF",
                    }}
                  />
                </div>
              </div>

              {/* Badge MEDDIC */}
              {empresa.meddic && <MeddicBadge meddic={empresa.meddic} />}

              {/* Próximo paso + último contacto */}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                {empresa.razon_de_contacto_actual ? (
                  <p className="text-xs text-muted-foreground line-clamp-1 flex-1">
                    → {empresa.razon_de_contacto_actual}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Sin próximo paso
                  </p>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {tiempoRelativo(empresa.actualizado_en)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Dos acciones explícitas: la tarjeta ya no navega por sí sola */}
          {/* En fila: acá hay ancho completo, así que las etiquetas largas
              entran sin acortar (a diferencia del kanban de 220px). */}
          <div className="flex flex-row gap-2 mt-3">
            <Button className="flex-1 h-11 text-xs" onClick={() => setPanelAbierto(true)}>
              Seguimiento contactos
            </Button>
            <Button asChild variant="outline" className="flex-1 h-11 text-xs">
              <Link href={`/cuentas/${empresa.id}`}>Detalle empresa</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <PanelSeguimientoContactos
        empresaId={empresa.id}
        empresaNombre={empresa.nombre}
        abierto={panelAbierto}
        onCerrar={() => setPanelAbierto(false)}
      />
    </>
  );
}

// Badge compacto con score MEDDIC y semáforo de color
function MeddicBadge({ meddic }: { meddic: MeddicData }) {
  const score = meddic.score;
  let colorClass: string;
  let emoji: string;
  if (score >= 11)      { colorClass = "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"; emoji = "⭐"; }
  else if (score >= 8)  { colorClass = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";    emoji = "🟢"; }
  else if (score >= 5)  { colorClass = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";    emoji = "🟡"; }
  else                  { colorClass = "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";            emoji = "🔴"; }

  return (
    <span className={`mt-2 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>
      {emoji} MEDDIC {score}/12
    </span>
  );
}
