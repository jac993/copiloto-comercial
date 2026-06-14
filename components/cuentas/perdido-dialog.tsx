"use client";

// =============================================================
// Dialog que se muestra al marcar una empresa como "Perdida".
// Captura la razón y cuándo volver a contactar.
// =============================================================

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Empresa } from "@/lib/types";

const RAZONES = [
  { value: "precio_alto", label: "Precio muy alto" },
  { value: "proveedor_consolidado", label: "Proveedor actual muy consolidado" },
  { value: "no_momento", label: "No era el momento" },
  { value: "no_decisor", label: "No era el decisor correcto" },
  { value: "sin_respuesta", label: "Sin respuesta tras múltiples intentos" },
  { value: "otro", label: "Otro" },
];

const REACTIVACIONES = [
  { value: "3m", label: "En 3 meses" },
  { value: "6m", label: "En 6 meses" },
  { value: "1y", label: "En 1 año" },
  { value: "nunca", label: "No volver a contactar" },
];

function calcularFechaReactivacion(opcion: string): string | null {
  if (opcion === "nunca") return null;
  const d = new Date();
  if (opcion === "3m") d.setMonth(d.getMonth() + 3);
  else if (opcion === "6m") d.setMonth(d.getMonth() + 6);
  else if (opcion === "1y") d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}

interface PerdidoDialogProps {
  empresa: Empresa;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function PerdidoDialog({
  empresa,
  open,
  onClose,
  onConfirm,
}: PerdidoDialogProps) {
  const [razon, setRazon] = useState("no_momento");
  const [razonTexto, setRazonTexto] = useState("");
  const [reactivacion, setReactivacion] = useState("6m");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const razonFinal = razon === "otro" && razonTexto.trim()
        ? razonTexto.trim()
        : RAZONES.find((r) => r.value === razon)?.label ?? razon;

      const res = await fetch(`/api/empresas/${empresa.id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: "perdido",
          razon_perdido: razonFinal,
          fecha_reactivacion: calcularFechaReactivacion(reactivacion),
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Error al guardar");
      }

      onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent className="max-w-sm mx-4 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            Marcar como perdido
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{empresa.nombre}</span> pasará a perdido. Esto ayuda a la IA a aprender de tus patrones de venta.
          </p>

          {/* Pregunta 1: razón */}
          <div>
            <p className="text-sm font-medium mb-2">¿Por qué se perdió?</p>
            <div className="space-y-1.5">
              {RAZONES.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                    razon === r.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="razon"
                    value={r.value}
                    checked={razon === r.value}
                    onChange={() => setRazon(r.value)}
                    className="accent-primary"
                  />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
              {razon === "otro" && (
                <input
                  type="text"
                  placeholder="Describe brevemente..."
                  value={razonTexto}
                  onChange={(e) => setRazonTexto(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              )}
            </div>
          </div>

          {/* Pregunta 2: cuándo volver */}
          <div>
            <p className="text-sm font-medium mb-2">¿Cuándo volver a contactar?</p>
            <div className="grid grid-cols-2 gap-1.5">
              {REACTIVACIONES.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                    reactivacion === r.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="reactivacion"
                    value={r.value}
                    checked={reactivacion === r.value}
                    onChange={() => setReactivacion(r.value)}
                    className="accent-primary"
                  />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={confirmar}
              disabled={guardando || (razon === "otro" && !razonTexto.trim())}
            >
              {guardando ? "Guardando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
