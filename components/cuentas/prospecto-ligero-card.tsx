import Link from "next/link";
import { Building2, ChevronRight, Globe, Users, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
}

// Tarjeta de la lista "Por calificar": prospecto ligero sin ficha IA.
// Clickable → /cuentas/[id] (la bifurcación a la vista ligera vive en 4b).
export function ProspectoLigeroCard({ empresa, conteo }: ProspectoLigeroCardProps) {
  const iniciales = getIniciales(empresa.nombre);
  const contactos = conteo?.contactos ?? 0;
  const interacciones = conteo?.interacciones ?? 0;

  return (
    <Link href={`/cuentas/${empresa.id}`} className="block">
      <Card className="border hover:border-primary/30 hover:shadow-md transition-all active:scale-[0.98]">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Avatar con iniciales — gris neutro (aún sin investigar) */}
            <div className="h-11 w-11 rounded-2xl bg-muted flex items-center justify-center font-bold text-sm shrink-0 text-muted-foreground">
              {iniciales || <Building2 className="h-5 w-5" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm leading-tight truncate">{empresa.nombre}</p>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              </div>

              {empresa.url && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                  <Globe className="h-3 w-3 shrink-0" />
                  {empresa.url.replace(/^https?:\/\/(www\.)?/, "")}
                </p>
              )}

              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {contactos} {contactos === 1 ? "contacto" : "contactos"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {interacciones} {interacciones === 1 ? "interacción" : "interacciones"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
