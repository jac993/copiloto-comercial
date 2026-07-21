// Forzar render dinámico — la lista de empresas cambia frecuentemente
export const dynamic = "force-dynamic";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { CuentasClient } from "@/components/cuentas/cuentas-client";
import {
  getEmpresas,
  getInteraccionesConProximoPaso,
  getProspectosLigeros,
  getConteosPorEmpresa,
} from "@/lib/queries";
import type { Empresa } from "@/lib/types";

export default async function CuentasPage() {
  let empresas: Empresa[] = [];
  let empresasVencidasIds: string[] = [];
  let prospectosLigeros: Empresa[] = [];
  let conteos: Record<string, { interacciones: number; contactos: number }> = {};
  let errorCarga: string | null = null;

  try {
    const [emps, interaccionesVencidas, ligeros] = await Promise.all([
      getEmpresas(),
      getInteraccionesConProximoPaso(),
      getProspectosLigeros(),
    ]);
    empresas = emps;
    prospectosLigeros = ligeros;
    // IDs de empresas con al menos un próximo paso vencido
    const idsUnicos = Array.from(new Set(interaccionesVencidas.map((i) => i.empresa_id)));
    empresasVencidasIds = idsUnicos;
    // Map → objeto plano (los Map no serializan de Server a Client Component)
    const conteosMap = await getConteosPorEmpresa(ligeros.map((e) => e.id));
    conteos = Object.fromEntries(conteosMap);
  } catch (err) {
    errorCarga = err instanceof Error ? err.message : "Error desconocido";
    console.error("[cuentas] Error cargando empresas:", errorCarga);
  }

  const activas = empresas.filter((e) => e.estado !== "perdido").length;

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex h-16 items-center justify-between px-5">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#F97316]">Cuentas</h1>
              <HelpTooltip
                titulo="¿Qué son las cuentas?"
                explicacion="Son las empresas que estás prospectando o que ya son tus clientes. Cada cuenta tiene su ficha completa con análisis de IA, decisores y todo el historial de contacto."
                ejemplo={"Agrega una cuenta nueva pegando la URL de la empresa. La IA investiga todo en 30 segundos."}
              />
            </div>
            {empresas.length > 0 && (
              <p className="text-xs text-muted-foreground">{activas} activas</p>
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

      <CuentasClient
        empresas={empresas}
        empresasVencidasIds={empresasVencidasIds}
        prospectosLigeros={prospectosLigeros}
        conteos={conteos}
      />
    </div>
  );
}
