// Forzar render dinámico — los casos los gestiona el vendedor manualmente
export const dynamic = "force-dynamic";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { CasosClient } from "@/components/casos/casos-client";
import { getCasos } from "@/lib/queries";
import type { Caso } from "@/lib/types";

export default async function CasosPage() {
  let casos: Caso[] = [];
  let errorCarga: string | null = null;

  try {
    casos = await getCasos();
  } catch (err) {
    errorCarga = err instanceof Error ? err.message : "Error desconocido";
    console.error("[casos] Error cargando casos:", errorCarga);
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex h-16 items-center justify-between px-5">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#F97316]">Casos</h1>
              <HelpTooltip
                titulo="¿Para qué sirven los casos?"
                explicacion="Son ventas reales de One Label que documentas aquí. La IA los usa automáticamente como referencia al preparar borradores y análisis, para no inventar ejemplos ficticios."
                ejemplo={"Agrega casos con sector, problema, solución y resultado medido. Cuantos más casos, más específica y creíble será la IA."}
              />
            </div>
            {casos.length > 0 && (
              <p className="text-xs text-muted-foreground">{casos.length} documentados</p>
            )}
          </div>
          <ThemeToggle />
        </div>
      </header>

      {errorCarga && (
        <div className="mx-4 mt-4 p-3 rounded-xl bg-destructive/10 text-destructive text-xs">
          Error: {errorCarga}
        </div>
      )}

      <CasosClient casosIniciales={casos} />
    </div>
  );
}
