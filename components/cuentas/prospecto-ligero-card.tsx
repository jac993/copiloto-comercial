"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, Globe, Users, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PanelSeguimientoContactos } from "@/components/cuentas/panel-seguimiento-contactos";
import type { Empresa } from "@/lib/types";
import { hoyCL } from "@/lib/fecha";

// Iniciales de la empresa (máx 2 caracteres)
function getIniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

// Días calendario transcurridos desde la creación (zona Chile)
function diasDesdeCreacion(creadoEn: string): number {
  const fechaCreacion = new Date(creadoEn).toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const hoy = hoyCL();
  return Math.round((Date.parse(hoy) - Date.parse(fechaCreacion)) / 86_400_000);
}

// Color del badge según urgencia: reciente (verde) → atención (ámbar) → acción (naranja/rojo)
function estiloBadgeDias(dias: number): string {
  if (dias <= 3) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  if (dias <= 7) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
}

interface ProspectoLigeroCardProps {
  empresa: Empresa;
  conteo?: { interacciones: number; contactos: number };
}

// Tarjeta de la lista "Por calificar": prospecto ligero sin ficha IA.
// Clickable → /cuentas/[id] (la bifurcación a la vista ligera vive en 4b).
export function ProspectoLigeroCard({ empresa, conteo }: ProspectoLigeroCardProps) {
  const [panelAbierto, setPanelAbierto] = useState(false);
  const iniciales = getIniciales(empresa.nombre);
  const contactos = conteo?.contactos ?? 0;
  const interacciones = conteo?.interacciones ?? 0;
  const dias = diasDesdeCreacion(empresa.creado_en);
  const etiquetaDias = dias === 0 ? "Hoy" : dias === 1 ? "1 día" : `${dias} días`;

  return (
    <>
      <Card className="border border-l-4 border-l-[#F97316] hover:border-primary/30 hover:shadow-md transition-all">
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
                <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${estiloBadgeDias(dias)}`}>
                  {etiquetaDias}
                </span>
              </div>
            </div>
          </div>

          {/* Dos acciones explícitas: la tarjeta ya no navega por sí sola */}
          <div className="flex gap-2 mt-3">
            <Button asChild variant="outline" className="flex-1 h-11 text-xs">
              <Link href={`/cuentas/${empresa.id}`}>Ver empresa</Link>
            </Button>
            <Button className="flex-1 h-11 text-xs" onClick={() => setPanelAbierto(true)}>
              Seguimiento contactos
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
