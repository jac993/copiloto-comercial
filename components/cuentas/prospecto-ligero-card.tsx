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
      <Card
        className={`relative overflow-hidden rounded-2xl border border-white/[0.07] transition-all hover:border-orange-500/40 hover:-translate-y-0.5 hover:shadow-[0_8px_28px_-10px_rgba(255,122,26,0.45)] ${fondo}`}
      >
        {/* Acento lateral en degradado */}
        <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#FF9A4A] via-[#FF7A1A] to-[#B33C00]" />

        <CardContent className="p-4 pl-5">
          <div className="flex items-start gap-3">
            {/* Avatar con iniciales — degradado de marca con halo suave */}
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#FF9A4A] to-[#C2410C] ring-1 ring-orange-300/25 shadow-[0_0_14px_rgba(255,122,26,0.28)] flex items-center justify-center font-bold text-sm shrink-0 text-white">
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

              <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-400/20">
                  <Users className="h-3 w-3" />
                  {contactos} {contactos === 1 ? "contacto" : "contactos"}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-400/20">
                  <MessageSquare className="h-3 w-3" />
                  {interacciones} {interacciones === 1 ? "interacción" : "interacciones"}
                </span>
              </div>

              {tiempos && (
                <p className="text-xs text-muted-foreground mt-2">{tiempos}</p>
              )}
            </div>
          </div>

          {/* Dos acciones explícitas: la tarjeta ya no navega por sí sola.
              min-h-0 en desktop vence el target táctil de 44px del base layer,
              que dejaba el botón desproporcionado frente a su etiqueta. */}
          <div className="flex flex-row items-center gap-2 mt-3.5">
            <Button
              className="h-11 md:h-9 md:min-h-0 px-4 text-sm font-semibold rounded-xl"
              onClick={() => setPanelAbierto(true)}
            >
              Seguimiento contactos
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 md:h-9 md:min-h-0 px-4 text-sm font-medium rounded-xl border-white/10 hover:border-orange-500/40 hover:text-orange-300"
            >
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
