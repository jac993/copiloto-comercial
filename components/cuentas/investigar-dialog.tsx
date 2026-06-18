"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Globe, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
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
  const [contexto, setContexto] = useState("");
  const [estado, setEstado] = useState<EstadoDialog>({ fase: "idle" });
  const [mostrarExtra, setMostrarExtra] = useState(false);
  const [razonSocial, setRazonSocial] = useState("");
  const [nombreComercial, setNombreComercial] = useState("");
  const [rut, setRut] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [rubro, setRubro] = useState("");

  const investigar = async () => {
    const urlLimpia = url.trim().split("?")[0].split("#")[0].trim();
    if (!urlLimpia) return;

    setEstado({ fase: "cargando", mensaje: "Iniciando...", pasoActual: 0 });

    const abortCtrl = new AbortController();

    // Timeout de seguridad: 150 segundos
    const timeoutId = setTimeout(() => abortCtrl.abort("timeout"), 150_000);

    try {
      const response = await fetch("/api/investigar", {
        method: "POST",
        signal: abortCtrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlLimpia,
          contexto_vendedor: contexto.trim() || undefined,
          razon_social: razonSocial.trim() || undefined,
          nombre_comercial: nombreComercial.trim() || undefined,
          rut: rut.trim() || undefined,
          ciudad: ciudad.trim() || undefined,
          rubro: rubro.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Error del servidor (${response.status})`);
      }

      if (!response.body) throw new Error("Sin respuesta del servidor");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // Rastrear si ya recibimos resultado/error para validar al cerrar
      let finalizado = false;

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
              setEstado((prev) =>
                prev.fase === "cargando"
                  ? { fase: "cargando", mensaje: data.mensaje!, pasoActual: pasoActual >= 0 ? pasoActual : prev.pasoActual }
                  : prev
              );
            } else if (data.type === "resultado" && data.empresaId && data.nombre) {
              finalizado = true;
              setEstado({ fase: "exito", empresaId: data.empresaId, nombre: data.nombre });
            } else if (data.type === "error" && data.mensaje) {
              finalizado = true;
              setEstado({ fase: "error", mensaje: data.mensaje });
            } else if (data.type === "done") {
              // El servidor cerró el stream limpiamente — salimos del loop
              finalizado = true;
            }
          } catch (parseErr) {
            console.error("[investigar] error parseando línea SSE:", parseErr, "línea:", linea);
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) procesarLineas(buffer);
          break;
        }

        // Si ya recibimos "done" del servidor, no seguimos bloqueando en read()
        if (finalizado) {
          reader.cancel().catch(() => {});
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lineas = buffer.split("\n");
        buffer = lineas.pop() ?? "";
        procesarLineas(lineas.join("\n"));
      }

      // Si el stream se cerró sin entregar resultado ni error, mostramos error claro
      if (!finalizado) {
        setEstado({
          fase: "error",
          mensaje: "La investigación no retornó resultado. El servidor puede haber tardado demasiado. Intenta de nuevo.",
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setEstado({
          fase: "error",
          mensaje: "La investigación está tardando más de lo esperado. Intenta de nuevo.",
        });
      } else {
        setEstado({
          fase: "error",
          mensaje: err instanceof Error ? err.message : "Error de conexión. Intenta de nuevo.",
        });
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const verFicha = () => {
    if (estado.fase === "exito") {
      router.push(`/cuentas/${estado.empresaId}`);
      handleClose();
    }
  };

  const handleClose = () => {
    if (estado.fase === "cargando") return;
    setUrl("");
    setContexto("");
    setRazonSocial("");
    setNombreComercial("");
    setRut("");
    setCiudad("");
    setRubro("");
    setMostrarExtra(false);
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
                <div className="flex items-center gap-1.5 mb-3">
                  <p className="text-sm text-muted-foreground">
                    Pega la URL del sitio web de la empresa. La IA construirá
                    la ficha completa con decisores, dolores y ángulo de entrada.
                  </p>
                  <HelpTooltip
                    titulo="¿Para qué sirve investigar?"
                    explicacion="La IA lee el sitio web de la empresa y te prepara una ficha completa: qué les puedes vender, quiénes son los decisores clave y cómo abordarlos."
                    ejemplo={"Pega la URL: www.coexpan.cl y en 30 segundos tendrás todo lo que necesitas saber antes de llamar."}
                  />
                </div>
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
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Lo que ya sé sobre esta empresa{" "}
                    <span className="font-normal">(opcional)</span>
                  </label>
                  <HelpTooltip
                    titulo="¿Para qué sirve este campo?"
                    explicacion="Agrega información que solo tú sabes y que no está en internet. La IA la incorpora al análisis para hacerlo más preciso y personalizado."
                    ejemplo={"Ej: 'Hablé con alguien del mercado, me dijeron que tuvieron 3 rechazos este mes con su proveedor actual de etiquetas.'"}
                  />
                </div>
                <textarea
                  value={contexto}
                  onChange={(e) => setContexto(e.target.value)}
                  placeholder="Ej: fabrican envases para lácteos, conozco al jefe de calidad, tuvieron problemas con etiquetas en enero, están evaluando proveedores..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60"
                />
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  La IA contrastará tu información con lo que encuentre en internet y te avisará si detecta alguna inconsistencia.
                </p>
              </div>
              {/* Sección colapsable — datos opcionales para mejorar la búsqueda */}
              <div>
                <button
                  type="button"
                  onClick={() => setMostrarExtra(!mostrarExtra)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1"
                >
                  {mostrarExtra ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  + Agregar más datos{mostrarExtra ? "" : " (mejora la búsqueda)"}
                </button>

                {mostrarExtra && (
                  <div className="mt-2 space-y-2 rounded-xl border border-dashed border-border p-3">
                    <p className="text-xs text-muted-foreground mb-2">
                      Perplexity usa estos datos para búsquedas más precisas. Todos opcionales.
                    </p>
                    <div>
                      <input
                        type="text"
                        placeholder="Nombre comercial — Ej: Essity, Coexpan, Soprole"
                        value={nombreComercial}
                        onChange={(e) => setNombreComercial(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <p className="text-xs text-muted-foreground mt-1 pl-1">
                        Como aparece en el mercado, no la razón social legal
                      </p>
                    </div>
                    <input
                      type="text"
                      placeholder="Razón social / Nombre legal"
                      value={razonSocial}
                      onChange={(e) => setRazonSocial(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      type="text"
                      placeholder="RUT (ej: 76.123.456-7)"
                      value={rut}
                      onChange={(e) => setRut(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      type="text"
                      placeholder="Ciudad / Región (ej: Santiago, RM)"
                      value={ciudad}
                      onChange={(e) => setCiudad(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      type="text"
                      placeholder="Rubro principal (ej: alimentos, químicos)"
                      value={rubro}
                      onChange={(e) => setRubro(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}
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
