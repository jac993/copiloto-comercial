"use client";

import { useState } from "react";
import { Zap, Building2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmpresaCard } from "@/components/cuentas/empresa-card";
import { InvestigarDialog } from "@/components/cuentas/investigar-dialog";
import type { Empresa } from "@/lib/types";

interface CuentasClientProps {
  empresas: Empresa[];
}

export function CuentasClient({ empresas }: CuentasClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="relative pb-24">
      {/* Lista de empresas */}
      {empresas.length === 0 ? (
        <EstadoVacio onAgregarClick={() => setDialogOpen(true)} />
      ) : (
        <div className="px-4 py-4 space-y-3">
          {/* Buscador simple (visual por ahora) */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Buscar empresa..."
              className="w-full h-11 pl-10 pr-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Conteo */}
          <p className="text-xs text-muted-foreground font-medium px-1">
            {empresas.length} {empresas.length === 1 ? "empresa" : "empresas"}
          </p>

          {empresas.map((empresa) => (
            <EmpresaCard key={empresa.id} empresa={empresa} />
          ))}
        </div>
      )}

      {/* Botón flotante — acción principal de esta pantalla */}
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40">
        <Button
          size="lg"
          className="rounded-2xl shadow-xl shadow-primary/30 gap-2 pr-5 h-14"
          onClick={() => setDialogOpen(true)}
        >
          <Zap className="h-5 w-5" />
          Investigar empresa
        </Button>
      </div>

      <InvestigarDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}

// Estado vacío cuando no hay empresas
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
