"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, Globe, Users, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PanelSeguimientoContactos } from "@/components/cuentas/panel-seguimiento-contactos";
import { fondoUrgencia, lineaTiempos } from "@/lib/urgencia-visual";
import type { Empresa } from "@/lib/types";

// Iniciales de la empresa (máx 2 caracteres)
function getIniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

interface ProspectoLigeroCardProps {
  empresa: Empresa;
  conteo?: { interacciones: number; contactos: number };
  // Días hábiles sin interacción real. null = sin interacciones registradas.
  dias: number | null;
}

// Tarjeta de la lista "Por calificar": prospecto ligero sin ficha IA.
// Clickable → /cuentas/[id] (la bifurcación a la vista ligera vive en 4b).
export function ProspectoLigeroCard({ empresa, conteo, dias }: ProspectoLigeroCardProps) {
  const [panelAbierto, setPanelAbierto] = useState(false);
  const iniciales = getIniciales(empresa.nombre);
  const contactos = conteo?.contactos ?? 0;
  const interacciones = conteo?.interacciones ?? 0;
  // `vencida` va fijo en false: un ligero todavía no está calificado, así que
  // la señal de "tarea vencida" del pipeline no se le aplica.
  // OJO — esto NO es porque el dato no exista: `empresasVencidasIds` sale de
  // getInteraccionesConProximoPaso(), que NO filtra por tipo_registro (a
  // diferencia de /api/interacciones/vencidas, que sí excluye ligeros). Hoy
  // hay 2 ligeros con tarea vencida en BD; es una decisión, no una limitación.
  // El umbral sale solo: todos se crean con estado='prospecto', que en
  // UMBRAL_ENFRIAMIENTO ya vale 7. Los congelados quedan sin teñir.
  const fondo = fondoUrgencia(empresa, dias, false);
  // estadoDesde en null → lineaTiempos devuelve solo el último contacto. En un
  // ligero estado_desde no significa nada: nunca entró al pipeline.
  const tiempos = lineaTiempos(null, dias, false);

  return (
    <>
      <Card className={`border border-l-4 border-l-[#F97316] hover:border-primary/30 hover:shadow-md transition-all ${fondo}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Avatar con iniciales — naranja suave, coherente con el brand */}
            <div className="h-11 w-11 rounded-2xl bg-[#FFF7ED] dark:bg-[#431407]/50 flex items-center justify-center font-bold text-sm shrink-0 text-[#F97316]">
              {iniciales || <Building2 className="h-5 w-5" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-base leading-tight truncate text-foreground">{empresa.nombre}</p>
              </div>

              {empresa.url && (
                <p className="text-xs text-muted-foreground/70 mt-0.5 truncate flex items-center gap-1">
                  <Globe className="h-3 w-3 shrink-0" />
                  {empresa.url.replace(/^https?:\/\/(www\.)?/, "")}
                </p>
              )}

              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[#FFF7ED] text-[#C2410C] dark:bg-[#431407]/40 dark:text-orange-300">
                  <Users className="h-3 w-3" />
                  {contactos} {contactos === 1 ? "contacto" : "contactos"}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[#FFF7ED] text-[#C2410C] dark:bg-[#431407]/40 dark:text-orange-300">
                  <MessageSquare className="h-3 w-3" />
                  {interacciones} {interacciones === 1 ? "interacción" : "interacciones"}
                </span>
              </div>

              {tiempos && (
                <p className="text-xs text-muted-foreground mt-1.5">{tiempos}</p>
              )}
            </div>
          </div>

          {/* Dos acciones explícitas: la tarjeta ya no navega por sí sola */}
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
