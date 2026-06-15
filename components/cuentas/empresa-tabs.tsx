"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, Users, Clock, Clipboard, MessageSquare,
  ArrowLeft, Zap, Phone, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabResumen } from "@/components/cuentas/tab-resumen";
import { TabDecisores } from "@/components/cuentas/tab-decisores";
import { TabHistorial } from "@/components/cuentas/tab-historial";
import { TabPreparacion } from "@/components/cuentas/tab-preparacion";
import { TabChat } from "@/components/cuentas/tab-chat";
import type { EmpresaCompleta, EstadoEmpresa, Interaccion } from "@/lib/types";
import { cn } from "@/lib/utils";

// Acción flotante según la etapa del pipeline
const ACCION_POR_ESTADO: Record<
  EstadoEmpresa,
  { label: string; Icon: React.ElementType }
> = {
  prospecto: { label: "Registrar primer contacto", Icon: Phone },
  contactado: { label: "Registrar seguimiento", Icon: Phone },
  en_conversacion: { label: "Registrar seguimiento", Icon: Phone },
  reunion_agendada: { label: "Subir grabación de reunión", Icon: Upload },
  cotizado: { label: "Registrar respuesta", Icon: Phone },
  ganado: { label: "Ver historial completo", Icon: Clock },
  perdido: { label: "Ver historial completo", Icon: Clock },
};

const TABS = [
  { id: "resumen", label: "Resumen", Icon: FileText },
  { id: "decisores", label: "Decisores", Icon: Users },
  { id: "historial", label: "Historial", Icon: Clock },
  { id: "preparacion", label: "Preparación", Icon: Clipboard },
  { id: "chat", label: "Consultar", Icon: MessageSquare },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ESTADO_BADGE: Record<EstadoEmpresa, { label: string; className: string }> = {
  prospecto: { label: "Prospecto", className: "bg-white/20 text-white" },
  contactado: { label: "Contactado", className: "bg-blue-500/30 text-white" },
  en_conversacion: { label: "En conversación", className: "bg-indigo-500/30 text-white" },
  reunion_agendada: { label: "Reunión agendada", className: "bg-amber-500/30 text-white" },
  cotizado: { label: "Cotizado", className: "bg-purple-500/30 text-white" },
  ganado: { label: "Ganado ✓", className: "bg-green-500/30 text-white" },
  perdido: { label: "Perdido", className: "bg-red-500/30 text-white" },
};

interface EmpresaTabsProps {
  empresa: EmpresaCompleta;
  interacciones: Interaccion[];
}

export function EmpresaTabs({ empresa, interacciones }: EmpresaTabsProps) {
  const router = useRouter();
  const [tabActivo, setTabActivo] = useState<TabId>("resumen");

  const ficha = empresa.ficha_ia;
  const accion = ACCION_POR_ESTADO[empresa.estado];
  const estadoBadge = ESTADO_BADGE[empresa.estado];
  const tecnica = ficha?.tecnica_recomendada;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header con gradiente */}
      <div className="gradient-hoy px-5 pt-4 pb-6 relative">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-white/80 hover:text-white text-sm mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Cuentas
        </button>

        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-white leading-tight">
              {empresa.nombre}
            </h1>
            {empresa.industria && (
              <p className="text-white/70 text-sm mt-0.5">{empresa.industria}</p>
            )}
          </div>

          {/* Badges de estado y técnica */}
          <div className="flex flex-col gap-1.5 items-end shrink-0">
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${estadoBadge.className}`}
            >
              {estadoBadge.label}
            </span>
            {tecnica && (
              <span className="text-xs font-medium bg-white/20 text-white px-2.5 py-1 rounded-full">
                {tecnica}
              </span>
            )}
          </div>
        </div>

        {/* Score */}
        <div className="mt-4">
          <div className="flex justify-between text-white/70 text-xs mb-1">
            <span>Score de prioridad</span>
            <span className="text-white font-semibold">
              {empresa.score_prioridad}/100
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${empresa.score_prioridad}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tabs de navegación */}
      <div className="sticky top-0 z-30 bg-background border-b border-border">
        <div className="flex">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTabActivo(id)}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors border-b-2",
                tabActivo === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido del tab activo */}
      <div className="flex-1 px-4 pt-4">
        {tabActivo === "resumen" && ficha && (
          <TabResumen
            ficha={ficha}
            empresaId={empresa.id}
            notasVendedor={empresa.notas_vendedor}
          />
        )}
        {tabActivo === "resumen" && !ficha && <SinFicha />}

        {tabActivo === "decisores" && (
          <TabDecisores
            contactos={empresa.contactos}
            decisoresIA={ficha?.decisores ?? []}
            empresaId={empresa.id}
          />
        )}

        {tabActivo === "historial" && (
          <TabHistorial
            interacciones={interacciones}
            empresaId={empresa.id}
          />
        )}

        {tabActivo === "preparacion" && ficha && (
          <TabPreparacion
            ficha={ficha}
            ultimaInteraccion={empresa.ultima_interaccion}
            notasVendedor={empresa.notas_vendedor}
          />
        )}
        {tabActivo === "preparacion" && !ficha && <SinFicha />}

        {tabActivo === "chat" && (
          <TabChat
            empresaId={empresa.id}
            empresaNombre={empresa.nombre}
          />
        )}
      </div>

      {/* Botón flotante de acción principal — oculto en chat para no tapar el input */}
      {tabActivo !== "historial" && tabActivo !== "chat" && (
        <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40">
          <Button
            size="lg"
            className="rounded-2xl shadow-xl shadow-primary/30 gap-2 pr-5 h-14"
            onClick={() => router.push(`/llamadas?empresa=${empresa.id}`)}
          >
            <accion.Icon className="h-5 w-5" />
            <span className="max-w-[160px] truncate">{accion.label}</span>
          </Button>
        </div>
      )}
    </div>
  );
}

function SinFicha() {
  return (
    <div className="text-center py-10 space-y-3">
      <Zap className="h-10 w-10 mx-auto text-muted-foreground opacity-30" />
      <p className="text-sm text-muted-foreground">
        Esta empresa aún no tiene ficha de IA
      </p>
    </div>
  );
}
