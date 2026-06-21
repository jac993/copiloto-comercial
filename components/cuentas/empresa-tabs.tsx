"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, Users, Clock, Clipboard, MessageSquare,
  ArrowLeft, Zap, Pencil, Globe, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { TabResumen } from "@/components/cuentas/tab-resumen";
import { TabDecisores } from "@/components/cuentas/tab-decisores";
import { TabHistorial } from "@/components/cuentas/tab-historial";
import { TabPreparacion } from "@/components/cuentas/tab-preparacion";
import { TabChat } from "@/components/cuentas/tab-chat";
import type { EmpresaCompleta, EstadoEmpresa, Interaccion, Contacto } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "resumen", label: "Resumen", Icon: FileText },
  { id: "decisores", label: "Decisores", Icon: Users },
  { id: "historial", label: "Historial", Icon: Clock },
  { id: "preparacion", label: "Preparación", Icon: Clipboard },
  { id: "chat", label: "Consultar", Icon: MessageSquare },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ESTADO_BADGE: Record<EstadoEmpresa, { label: string; className: string }> = {
  prospecto: { label: "Prospecto", className: "bg-white/20 text-white" },
  contactado: { label: "Contactado", className: "bg-blue-500/30 text-white" },
  en_conversacion: { label: "En conversación", className: "bg-indigo-500/30 text-white" },
  reunion_agendada: { label: "Reunión agendada", className: "bg-amber-500/30 text-white" },
  cotizado: { label: "Cotizado", className: "bg-purple-500/30 text-white" },
  ganado: { label: "Ganado ✓", className: "bg-green-500/30 text-white" },
  perdido: { label: "Perdido", className: "bg-red-500/30 text-white" },
};

interface EmpresaTabsProps {
  empresa: EmpresaCompleta;
  interacciones: Interaccion[];
}

export function EmpresaTabs({ empresa, interacciones }: EmpresaTabsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [tabActivo, setTabActivo] = useState<TabId>("resumen");
  const [sheetAbierto, setSheetAbierto] = useState(false);

  // Campos del Sheet de edición — pre-llenados con los datos actuales
  const [editUrl, setEditUrl] = useState(empresa.url ?? "");
  const [editRazonSocial, setEditRazonSocial] = useState(empresa.razon_social ?? "");
  const [editRut, setEditRut] = useState(empresa.rut ?? "");
  const [editCiudad, setEditCiudad] = useState("");
  const [editRubro, setEditRubro] = useState("");
  const [editNotas, setEditNotas] = useState(empresa.notas_vendedor ?? "");
  const [analizando, setAnalizando] = useState(false);
  const [errorSheet, setErrorSheet] = useState<string | null>(null);

  const ficha = empresa.ficha_ia;
  const estadoBadge = ESTADO_BADGE[empresa.estado];
  const tecnica = ficha?.tecnica_recomendada;

  const abrirSheet = () => {
    setEditUrl(empresa.url ?? "");
    setEditRazonSocial(empresa.razon_social ?? "");
    setEditRut(empresa.rut ?? "");
    setEditCiudad("");
    setEditRubro("");
    setEditNotas(empresa.notas_vendedor ?? "");
    setErrorSheet(null);
    setSheetAbierto(true);
  };

  const analizarDeNuevo = async () => {
    const urlFinal = editUrl.trim().split("?")[0].split("#")[0].trim();
    if (!urlFinal) {
      setErrorSheet("Ingresa la URL del sitio web de la empresa antes de analizar.");
      return;
    }
    setAnalizando(true);
    setErrorSheet(null);
    try {
      console.log("[analizarDeNuevo] iniciando para empresa", empresa.id, "url:", urlFinal);
      const res = await fetch(`/api/empresas/${empresa.id}/regenerar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlFinal,
          razon_social: editRazonSocial.trim() || undefined,
          rut: editRut.trim() || undefined,
          ciudad: editCiudad.trim() || undefined,
          rubro: editRubro.trim() || undefined,
          notas_vendedor: editNotas.trim() || undefined,
        }),
      });
      console.log("[analizarDeNuevo] respuesta HTTP:", res.status);
      const data = await res.json() as { ok: boolean; error?: string };
      console.log("[analizarDeNuevo] body:", data);
      if (!data.ok) throw new Error(data.error ?? "Error desconocido");
      toast({ title: "✅ Ficha actualizada", description: "La empresa fue reinvestigada con éxito." });
      setSheetAbierto(false);
      // router.push al mismo path fuerza remount del Server Component con datos frescos.
      // revalidatePath en el endpoint garantiza que no se sirva caché.
      router.push(`/cuentas/${empresa.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      console.error("[analizarDeNuevo] error:", msg, e);
      setErrorSheet(msg);
      toast({ variant: "destructive", title: "Error al analizar", description: msg });
    } finally {
      setAnalizando(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header con gradiente */}
      <div className="gradient-hoy px-5 pt-4 pb-6 relative">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-white/80 hover:text-white text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Cuentas
          </button>
          {/* Botón editar — abre Sheet */}
          <button
            onClick={abrirSheet}
            className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </button>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-white leading-tight">
              {empresa.nombre}
            </h1>
            {empresa.industria && (
              <p className="text-white/70 text-sm mt-0.5">{empresa.industria}</p>
            )}
          </div>

          {/* Badges de estado y técnica */}
          <div className="flex flex-col gap-1.5 items-end shrink-0">
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${estadoBadge.className}`}
            >
              {estadoBadge.label}
            </span>
            {tecnica && (
              <span className="text-xs font-medium bg-white/20 text-white px-2.5 py-1 rounded-full">
                {tecnica}
              </span>
            )}
          </div>
        </div>

        {/* Score */}
        <div className="mt-4">
          <div className="flex justify-between text-white/70 text-xs mb-1">
            <span>Score de prioridad</span>
            <span className="text-white font-semibold">
              {empresa.score_prioridad}/100
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${empresa.score_prioridad}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tabs de navegación */}
      <div className="sticky top-0 z-30 bg-background border-b border-border">
        <div className="flex">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTabActivo(id)}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors border-b-2",
                tabActivo === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido del tab activo */}
      <div className="flex-1 px-4 pt-4">
        {tabActivo === "resumen" && ficha && (
          <TabResumen
            ficha={ficha}
            empresaId={empresa.id}
            notasVendedor={empresa.notas_vendedor}
            busquedaWebRaw={empresa.busqueda_web_raw}
          />
        )}
        {tabActivo === "resumen" && !ficha && <SinFicha />}

        {tabActivo === "decisores" && (
          <TabDecisores
            contactos={empresa.contactos}
            decisoresIA={ficha?.decisores ?? []}
            empresaId={empresa.id}
            nombreBusqueda={empresa.nombre_comercial ?? empresa.nombre}
          />
        )}

        {tabActivo === "historial" && (
          <TabHistorial
            interacciones={interacciones}
            empresaId={empresa.id}
            contactos={empresa.contactos as Contacto[]}
          />
        )}

        {tabActivo === "preparacion" && ficha && (
          <TabPreparacion
            ficha={ficha}
            ultimaInteraccion={empresa.ultima_interaccion}
            notasVendedor={empresa.notas_vendedor}
            empresaId={empresa.id}
            nombreEmpresa={empresa.nombre_comercial ?? empresa.nombre}
            industria={empresa.industria}
            interacciones={interacciones}
            contactos={empresa.contactos as Contacto[]}
          />
        )}
        {tabActivo === "preparacion" && !ficha && <SinFicha />}

        {tabActivo === "chat" && (
          <TabChat
            empresaId={empresa.id}
            empresaNombre={empresa.nombre}
          />
        )}
      </div>

      {/* Sheet: editar datos y reinvestigar */}
      <Sheet open={sheetAbierto} onOpenChange={setSheetAbierto}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Editar y reinvestigar</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-3 px-5 py-4 overflow-y-auto flex-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                URL del sitio web
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="https://empresa.cl"
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Razón social <span className="font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={editRazonSocial}
                onChange={(e) => setEditRazonSocial(e.target.value)}
                placeholder="Nombre legal de la empresa"
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                RUT <span className="font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={editRut}
                onChange={(e) => setEditRut(e.target.value)}
                placeholder="76.123.456-7"
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Ciudad / Región <span className="font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={editCiudad}
                onChange={(e) => setEditCiudad(e.target.value)}
                placeholder="Santiago, RM"
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Rubro <span className="font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={editRubro}
                onChange={(e) => setEditRubro(e.target.value)}
                placeholder="Ej: alimentos, químicos, cosmética"
                className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Lo que sé y cómo quiero entrar
              </label>
              <textarea
                value={editNotas}
                onChange={(e) => setEditNotas(e.target.value)}
                placeholder={`Ej: Sé que fabrican potes para el sector lácteo.\nEl jefe de planta se llama Rodrigo y tiene presión por cumplimiento normativo.\nQuiero entrar por Calidad usando el lanzamiento de su nuevo envase como excusa.`}
                rows={4}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          <div className="px-5 pb-6 pt-2 border-t border-border space-y-2 flex-shrink-0">
            {errorSheet && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {errorSheet}
              </p>
            )}
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={analizarDeNuevo}
              disabled={analizando}
            >
              {analizando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analizando...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  ⚡ Analizar de nuevo
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Usa créditos de IA — scraping + Perplexity + Claude
            </p>
            <SheetClose asChild>
              <button className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                Cancelar
              </button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SinFicha() {
  return (
    <div className="text-center py-10 space-y-3">
      <Zap className="h-10 w-10 mx-auto text-muted-foreground opacity-30" />
      <p className="text-sm text-muted-foreground">
        Esta empresa aún no tiene ficha de IA
      </p>
    </div>
  );
}
