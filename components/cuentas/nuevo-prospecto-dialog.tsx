"use client";

// =============================================================
// Dialog de alta rápida de un prospecto ligero ("Por calificar").
// Solo nombre (obligatorio) + URL (opcional). CERO IA — no gasta
// créditos. Al crear, refresca la lista (Server Component) y cierra.
// =============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Globe, Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface NuevoProspectoDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NuevoProspectoDialog({ open, onClose }: NuevoProspectoDialogProps) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [url, setUrl] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cerrar = () => {
    if (guardando) return;
    setNombre("");
    setUrl("");
    setError(null);
    onClose();
  };

  const crear = async () => {
    const n = nombre.trim();
    if (!n) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/prospectos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: n, url: url.trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "No se pudo crear el prospecto");
      setNombre("");
      setUrl("");
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-sm mx-4 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            Nuevo prospecto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Guarda una empresa para hacerle seguimiento sin gastar créditos. Cuando
            valga la pena, la investigas y pasa al pipeline.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Nombre de la empresa
            </label>
            <input
              type="text"
              placeholder="Ej: Etiquetas del Sur"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && nombre.trim() && crear()}
              autoFocus
              className="w-full h-12 px-3.5 rounded-xl border-2 border-gray-200 bg-white dark:bg-gray-950 dark:border-gray-700 text-sm font-medium placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Sitio web <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <div className="relative">
              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="url"
                placeholder="https://empresa.cl"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && nombre.trim() && crear()}
                className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-gray-200 bg-white dark:bg-gray-950 dark:border-gray-700 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <p className="text-xs text-gray-400">
              Si lo tienes, agiliza la investigación más adelante.
            </p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            size="lg"
            className="w-full gap-2 h-12"
            disabled={!nombre.trim() || guardando}
            onClick={crear}
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crear prospecto
          </Button>
          <p className="text-xs text-center text-muted-foreground">No usa créditos de IA</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
