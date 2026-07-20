"use client";

// =============================================================
// Dialog de captura del valor estimado del negocio (CLP).
// Se abre al pasar una empresa a "cotizado" (kanban o análisis
// de llamada) y desde el chip de monto en la ficha. Botones de
// rango de un clic (guardan el punto medio) + monto exacto
// opcional. Nunca bloquea: "Omitir" cierra sin guardar.
// Sin IA — escritura directa vía PATCH /api/empresas/[id]/monto.
// =============================================================

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RANGOS_MONTO, formatCLP } from "@/lib/moneda";

interface MontoDialogProps {
  empresaId: string;
  empresaNombre: string;
  /** Monto actual (para pre-mostrar al editar desde la ficha). */
  montoActual?: number | null;
  open: boolean;
  onClose: () => void;
  /** Se llama con el monto guardado (o null si se quitó). */
  onGuardado: (monto: number | null) => void;
}

export function MontoDialog({
  empresaId,
  empresaNombre,
  montoActual = null,
  open,
  onClose,
  onGuardado,
}: MontoDialogProps) {
  const [exacto, setExacto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(monto: number | null) {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/monto`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor_estimado_clp: monto }),
      });
      if (!res.ok) throw new Error("PATCH fallido");
      onGuardado(monto);
      setExacto("");
      onClose();
    } catch {
      setError("No se pudo guardar el monto. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  // El input acepta "1500000", "1.500.000" o "1,5" (millones no — solo pesos):
  // se limpian separadores de miles antes de parsear.
  function guardarExacto() {
    const limpio = exacto.replace(/\./g, "").replace(/\$/g, "").replace(/\s/g, "").trim();
    const n = Number(limpio);
    if (!limpio || !Number.isFinite(n) || n <= 0) {
      setError("Ingresa un monto válido en pesos, ej: 1.500.000");
      return;
    }
    void guardar(Math.round(n));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>💰 ¿De cuánto es este negocio?</DialogTitle>
          <DialogDescription>
            {empresaNombre}
            {montoActual !== null && (
              <> · actual: <span className="font-semibold">{formatCLP(montoActual)}</span></>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {RANGOS_MONTO.map((r) => (
            <button
              key={r.valor}
              disabled={guardando}
              onClick={() => void guardar(r.valor)}
              className="w-full py-2.5 px-4 rounded-xl border border-border text-sm font-medium
                text-left hover:border-primary/50 hover:bg-primary/5 transition-colors
                disabled:opacity-50"
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Monto exacto opcional */}
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={exacto}
            onChange={(e) => setExacto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") guardarExacto(); }}
            placeholder="Monto exacto (opcional)"
            className="flex-1 h-10 px-3 rounded-xl border border-input bg-background text-sm
              focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            disabled={guardando || !exacto.trim()}
            onClick={guardarExacto}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold
              hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
          </button>
        </div>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={guardando}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Omitir
          </button>
          {montoActual !== null && (
            <button
              onClick={() => void guardar(null)}
              disabled={guardando}
              className="text-sm text-destructive/80 hover:text-destructive transition-colors py-2"
            >
              Quitar monto
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
