import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Empresa, EstadoEmpresa } from "@/lib/types";

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
  reunion: {
    label: "En reunión",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  cotizado: {
    label: "Cotizado",
    className:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
  cliente: {
    label: "Cliente",
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
}

export function EmpresaCard({ empresa }: EmpresaCardProps) {
  const estadoConf = ESTADO_CONFIG[empresa.estado];
  const iniciales = getIniciales(empresa.nombre);
  const avatarColor = getAvatarColor(empresa.score_prioridad);

  return (
    <Link href={`/cuentas/${empresa.id}`} className="block">
      <Card className="border hover:border-primary/30 hover:shadow-md transition-all active:scale-[0.98]">
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

              {/* Barra de score */}
              <div className="mt-2.5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-muted-foreground">
                    Prioridad
                  </span>
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
                          ? "#7C3AED"
                          : empresa.score_prioridad >= 40
                          ? "#F59E0B"
                          : "#9CA3AF",
                    }}
                  />
                </div>
              </div>

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
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
