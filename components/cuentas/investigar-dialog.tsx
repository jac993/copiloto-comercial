"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Globe, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Pasos de progreso que muestra la IA al investigar
const PASOS_PROGRESO = [
  "Leyendo el sitio web...",
  "Explorando páginas internas...",
  "Buscando noticias y ejecutivos...",
  "Analizando con IA...",
  "Guardando ficha en tu base de datos...",
];

type EstadoDialog =
  | { fase: "idle" }
  | { fase: "cargando"; mensaje: string; pasoActual: number }
  | { fase: "exito"; empresaId: string; nombre: string }
  | { fase: "error"; mensaje: string };

interface InvestigarDialogProps {
  open: boolean;
  onClose: () => void;
}

export function InvestigarDialog({ open, onClose }: InvestigarDialogProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [estado, setEstado] = useState<EstadoDialog>({ fase: "idle" });

  const investigar = async () => {
    const urlLimpia = url.trim();
    if (!urlLimpia) return;

    setEstado({ fase: "cargando", mensaje: "Iniciando...", pasoActual: 0 });

    try {
      const response = await fetch("/api/investigar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlLimpia }),
      });

      if (!response.body) throw new Error("Sin respuesta del servidor");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const procesarLineas = (texto: string) => {
        const lineas = texto.split("\n");
        for (const linea of lineas) {
          if (!linea.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(linea.slice(6)) as {
              type: string;
              mensaje?: string;
              empresaId?: string;
              nombre?: string;
            };

            if (data.type === "progreso" && data.mensaje) {
              const pasoActual = PASOS_PROGRESO.findIndex((p) =>
                p.includes(data.mensaje!.split(" ")[0])
              );
              setEstado({
                fase: "cargando",
                mensaje: data.mensaje,
                pasoActual: pasoActual >= 0 ? pasoActual : 0,
              });
            } else if (data.type === "resultado" && data.empresaId && data.nombre) {
              setEstado({
                fase: "exito",
                empresaId: data.empresaId,
                nombre: data.nombre,
              });
            } else if (data.type === "error" && data.mensaje) {
              setEstado({ fase: "error", mensaje: data.mensaje });
            }
          } catch {}
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Procesar lo que queda en el buffer al cerrar el stream
          if (buffer.trim()) procesarLineas(buffer);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lineas = buffer.split("\n");
        buffer = lineas.pop() ?? "";
        procesarLineas(lineas.join("\n"));
      }
    } catch (err) {
      setEstado({
        fase: "error",
        mensaje:
          err instanceof Error ? err.message : "Error de conexión. Intenta de nuevo.",
      });
    }
  };

  const verFicha = () => {
    if (estado.fase === "exito") {
      router.push(`/cuentas/${estado.empresaId}`);
      handleClose();
    }
  };

  const handleClose = () => {
    if (estado.fase === "cargando") return; // No cerrar mientras carga
    setUrl("");
    setEstado({ fase: "idle" });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm mx-4 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            Investigar empresa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Estado: idle ── */}
          {estado.fase === "idle" && (
            <>
              <div>
                <p className="text-sm text-muted-foreground mb-3">
                  Pega la URL del sitio web de la empresa. La IA construirá
                  la ficha completa con decisores, dolores y ángulo de entrada.
                </p>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="url"
                    placeholder="https://empresa.cl"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && url.trim() && investigar()}
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                  />
                </div>
              </div>
              <Button
                size="lg"
                className="w-full gap-2"
                disabled={!url.trim()}
                onClick={investigar}
              >
                <Zap className="h-4 w-4" />
                Investigar empresa
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                ⚡ Esta acción usa créditos de IA
              </p>
            </>
          )}

          {/* ── Estado: cargando ── */}
          {estado.fase === "cargando" && (
            <div className="py-4 space-y-5">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
                <p className="text-sm font-medium text-center">
                  {estado.mensaje}
                </p>
              </div>

              {/* Barra de pasos */}
              <div className="space-y-2">
                {PASOS_PROGRESO.map((paso, i) => (
                  <div key={paso} className="flex items-center gap-2.5">
                    <div
                      className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
                        i < estado.pasoActual
                          ? "bg-primary text-white"
                          : i === estado.pasoActual
                          ? "bg-primary/20 text-primary ring-2 ring-primary/30"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {i < estado.pasoActual ? "✓" : i + 1}
                    </div>
                    <span
                      className={`text-xs ${
                        i <= estado.pasoActual
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {paso}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Estado: éxito ── */}
          {estado.fase === "exito" && (
            <div className="py-4 space-y-4">
              <div className="flex flex-col items-center gap-2 text-center">
                <CheckCircle className="h-12 w-12 text-[#22C55E]" />
                <p className="font-semibold">¡Ficha lista!</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {estado.nombre}
                  </span>{" "}
                  fue investigada con éxito.
                </p>
              </div>
              <Button size="lg" className="w-full" onClick={verFicha}>
                Ver ficha completa →
              </Button>
            </div>
          )}

          {/* ── Estado: error ── */}
          {estado.fase === "error" && (
            <div className="py-2 space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    No se pudo investigar
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {estado.mensaje}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEstado({ fase: "idle" })}
                >
                  Cambiar URL
                </Button>
                <Button className="flex-1 gap-1" onClick={investigar}>
                  <Zap className="h-3.5 w-3.5" /> Reintentar
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
