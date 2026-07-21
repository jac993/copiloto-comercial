"use client";

import { useState, useEffect } from "react";
import { Zap, Building2, Search, List, Columns3, Plus, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { EmpresaCard } from "@/components/cuentas/empresa-card";
import { VistaKanban } from "@/components/cuentas/vista-kanban";
import { InvestigarDialog } from "@/components/cuentas/investigar-dialog";
import { NuevoProspectoDialog } from "@/components/cuentas/nuevo-prospecto-dialog";
import { ProspectoLigeroCard } from "@/components/cuentas/prospecto-ligero-card";
import type { Empresa } from "@/lib/types";

type Vista = "lista" | "pipeline";
type Seccion = "pipeline" | "por_calificar";

interface CuentasClientProps {
  empresas: Empresa[];
  empresasVencidasIds: string[];
  prospectosLigeros: Empresa[];
  conteos: Record<string, { interacciones: number; contactos: number }>;
}

export function CuentasClient({
  empresas,
  empresasVencidasIds,
  prospectosLigeros,
  conteos,
}: CuentasClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogProspecto, setDialogProspecto] = useState(false);
  const [vista, setVista] = useState<Vista>("lista");
  const [seccion, setSeccion] = useState<Seccion>("pipeline");

  // Cargar preferencia desde localStorage al montar
  useEffect(() => {
    const saved = localStorage.getItem("copiloto_vista") as Vista | null;
    if (saved === "lista" || saved === "pipeline") setVista(saved);
  }, []);

  const cambiarVista = (v: Vista) => {
    setVista(v);
    localStorage.setItem("copiloto_vista", v);
  };

  return (
    <div className="relative pb-24">
      {/* Toggle de sección: Pipeline | Por calificar (siempre visible) */}
      <div className="px-4 pt-4">
        <div className="inline-flex items-center border border-input rounded-xl overflow-hidden text-sm font-semibold">
          <button
            onClick={() => setSeccion("pipeline")}
            className={`px-4 h-9 transition-colors ${
              seccion === "pipeline"
                ? "bg-primary text-white"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            Pipeline
          </button>
          <button
            onClick={() => setSeccion("por_calificar")}
            className={`px-4 h-9 transition-colors ${
              seccion === "por_calificar"
                ? "bg-primary text-white"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            Por calificar{prospectosLigeros.length > 0 ? ` (${prospectosLigeros.length})` : ""}
          </button>
        </div>
      </div>

      {seccion === "pipeline" ? (
        empresas.length === 0 ? (
          <EstadoVacio onAgregarClick={() => setDialogOpen(true)} />
        ) : (
          <>
            {/* Barra de controles: buscador + toggle de vista */}
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              {/* Buscador */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Buscar empresa..."
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Toggle lista / pipeline */}
              <div className="flex items-center gap-1.5 shrink-0">
                <HelpTooltip
                  titulo="¿Cómo funciona el pipeline?"
                  explicacion="Muestra en qué etapa está cada empresa. Cambia el estado desde la ficha de cada empresa según cómo avanza la conversación."
                  ejemplo={"Prospecto → la contactaste por primera vez.\nContactado → respondió.\nEn conversación → hay intercambio activo.\nCotizado → enviaste propuesta."}
                />
                <div className="flex items-center border border-input rounded-xl overflow-hidden">
                  <button
                    onClick={() => cambiarVista("lista")}
                    className={`h-10 w-10 flex items-center justify-center transition-colors ${
                      vista === "lista"
                        ? "bg-primary text-white"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                    title="Vista lista"
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => cambiarVista("pipeline")}
                    className={`h-10 w-10 flex items-center justify-center transition-colors ${
                      vista === "pipeline"
                        ? "bg-primary text-white"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                    title="Vista pipeline"
                  >
                    <Columns3 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Conteo — solo en lista */}
            {vista === "lista" && (
              <p className="text-xs text-muted-foreground font-medium px-5 pb-2">
                {empresas.length} {empresas.length === 1 ? "empresa" : "empresas"}
              </p>
            )}

            {/* Vista lista */}
            {vista === "lista" && (
              <div className="px-4 space-y-3">
                {empresas.map((empresa) => (
                  <EmpresaCard key={empresa.id} empresa={empresa} />
                ))}
              </div>
            )}

            {/* Vista pipeline (Kanban) */}
            {vista === "pipeline" && (
              <VistaKanban
                empresas={empresas}
                empresasVencidasIds={empresasVencidasIds}
              />
            )}
          </>
        )
      ) : prospectosLigeros.length === 0 ? (
        <EstadoVacioLigero onNuevo={() => setDialogProspecto(true)} />
      ) : (
        <div className="px-4 pt-3 space-y-3">
          <p className="text-xs text-muted-foreground font-medium px-1">
            {prospectosLigeros.length} por calificar · sin investigar aún
          </p>
          {prospectosLigeros.map((p) => (
            <ProspectoLigeroCard key={p.id} empresa={p} conteo={conteos[p.id]} />
          ))}
        </div>
      )}

      {/* Botón flotante — cambia según la sección */}
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40">
        {seccion === "pipeline" ? (
          <Button
            size="lg"
            className="rounded-2xl shadow-xl shadow-primary/30 gap-2 pr-5 h-14"
            onClick={() => setDialogOpen(true)}
          >
            <Zap className="h-5 w-5" />
            Investigar empresa
          </Button>
        ) : (
          <Button
            size="lg"
            className="rounded-2xl shadow-xl shadow-primary/30 gap-2 pr-5 h-14"
            onClick={() => setDialogProspecto(true)}
          >
            <Plus className="h-5 w-5" />
            Nuevo prospecto
          </Button>
        )}
      </div>

      <InvestigarDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <NuevoProspectoDialog open={dialogProspecto} onClose={() => setDialogProspecto(false)} />
    </div>
  );
}

// Estado vacío de la sección "Por calificar"
function EstadoVacioLigero({ onNuevo }: { onNuevo: () => void }) {
  return (
    <div className="px-4 py-6">
      <div className="flex flex-col items-center text-center gap-5 p-8 rounded-2xl border-2 border-dashed border-border">
        <div className="h-20 w-20 rounded-3xl bg-muted flex items-center justify-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="space-y-2 max-w-xs">
          <p className="font-semibold text-lg">Nada por calificar aún</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Guarda empresas que todavía no vale la pena investigar. Registra
            contactos e interacciones, y cuando estén listas las pasas al pipeline.
          </p>
        </div>
        <Button size="lg" className="gap-2 w-full max-w-xs" onClick={onNuevo}>
          <Plus className="h-4 w-4" />
          Nuevo prospecto
        </Button>
        <p className="text-xs text-muted-foreground">No usa créditos de IA</p>
      </div>
    </div>
  );
}

function EstadoVacio({ onAgregarClick }: { onAgregarClick: () => void }) {
  return (
    <div className="px-4 py-6">
      <div className="flex flex-col items-center text-center gap-5 p-8 rounded-2xl border-2 border-dashed border-border">
        <div className="relative">
          <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-10 w-10 text-primary" />
          </div>
        </div>
        <div className="space-y-2 max-w-xs">
          <p className="font-semibold text-lg">Sin cuentas todavía</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Pega la URL de una empresa y la IA construirá la ficha completa:
            decisores, dolores, señales de compra y el ángulo de entrada ideal.
          </p>
        </div>
        <Button size="lg" className="gap-2 w-full max-w-xs" onClick={onAgregarClick}>
          <Zap className="h-4 w-4" />
          Investigar primera empresa
        </Button>
        <p className="text-xs text-muted-foreground">
          ⚡ Usa créditos de IA · Solo al apretar el botón
        </p>
      </div>
    </div>
  );
}
