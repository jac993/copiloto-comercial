"use client";

// =============================================================
// Vista Kanban del pipeline comercial con drag & drop entre columnas.
// Drag: @dnd-kit/core — cada tarjeta es draggable, cada columna es droppable.
// Al soltar en columna distinta → PATCH optimista + revert si falla.
// =============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronLeft, X, Trophy } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { PerdidoDialog } from "@/components/cuentas/perdido-dialog";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { construirBorradorCaso, BORRADOR_CASO_STORAGE_KEY } from "@/lib/borradorCaso";
import type { Empresa, EstadoEmpresa } from "@/lib/types";

// Columnas visibles en orden (excluye "perdido" — tiene sección aparte)
const COLUMNAS: { id: EstadoEmpresa; label: string; accentColor: string }[] = [
  { id: "prospecto",        label: "Prospecto",         accentColor: "bg-gray-400" },
  { id: "contactado",       label: "Contactado",         accentColor: "bg-blue-500" },
  { id: "en_conversacion",  label: "En conversación",    accentColor: "bg-indigo-500" },
  { id: "reunion_agendada", label: "Reunión agendada",   accentColor: "bg-amber-500" },
  { id: "cotizado",         label: "Cotizado",           accentColor: "bg-purple-500" },
  { id: "ganado",           label: "Ganado",             accentColor: "bg-green-500" },
];

const TECNICA_DOT: Record<string, string> = {
  SPIN:       "bg-[#F97316]",
  consultiva: "bg-[#22C55E]",
  relacional: "bg-blue-500",
  challenger: "bg-[#F97316]",
};

function labelReactivacion(
  fechaStr: string | null
): { texto: string; vencida: boolean } | null {
  if (!fechaStr) return null;
  const [y, m, d] = fechaStr.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vencida = fecha <= hoy;
  const texto = fecha.toLocaleDateString("es-CL", { month: "short", year: "numeric" });
  return { texto: vencida ? "Reactivar ahora" : `Reactivar en ${texto}`, vencida };
}

interface VistaKanbanProps {
  empresas: Empresa[];
  empresasVencidasIds: string[];
}

export function VistaKanban({ empresas: empresasInit, empresasVencidasIds }: VistaKanbanProps) {
  const router = useRouter();
  // Estado local para actualización optimista al hacer drag
  const [empresas, setEmpresas] = useState<Empresa[]>(empresasInit);
  const [perdidoExpanded, setPerdidoExpanded] = useState(false);
  const [dialogEmpresa, setDialogEmpresa] = useState<Empresa | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Empresa recién movida a "ganado" → sugerencia no bloqueante de agregar caso
  const [sugerenciaCaso, setSugerenciaCaso] = useState<Empresa | null>(null);

  const vencidasSet = new Set(empresasVencidasIds);

  // Agrupar por estado
  const porEstado = new Map<EstadoEmpresa, Empresa[]>();
  for (const col of COLUMNAS) porEstado.set(col.id, []);
  porEstado.set("perdido", []);
  for (const e of empresas) {
    const lista = porEstado.get(e.estado);
    if (lista) lista.push(e);
  }
  const perdidas = porEstado.get("perdido") ?? [];

  // Sensor con umbral de 8px para no interferir con clicks
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = event;
    if (!over) return;

    const empresaId = active.id as string;
    const nuevoEstado = over.id as EstadoEmpresa;
    const empresa = empresas.find((e) => e.id === empresaId);
    if (!empresa || empresa.estado === nuevoEstado) return;

    // No permitir arrastrar a "perdido" — esa acción va por el botón ×
    if (nuevoEstado === "perdido") return;

    const estadoAnterior = empresa.estado;

    // Actualización optimista
    setEmpresas((prev) =>
      prev.map((e) => (e.id === empresaId ? { ...e, estado: nuevoEstado } : e))
    );

    try {
      const res = await fetch(`/api/empresas/${empresaId}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (!res.ok) throw new Error("PATCH fallido");
      // Al cerrar un negocio, sugerir (sin forzar) documentarlo como caso
      if (nuevoEstado === "ganado") setSugerenciaCaso(empresa);
    } catch {
      // Revertir si falla
      setEmpresas((prev) =>
        prev.map((e) => (e.id === empresaId ? { ...e, estado: estadoAnterior } : e))
      );
    }
  }

  // "Revisar": deja el borrador pre-llenado en sessionStorage y abre Casos
  const revisarCaso = () => {
    if (!sugerenciaCaso) return;
    try {
      sessionStorage.setItem(
        BORRADOR_CASO_STORAGE_KEY,
        JSON.stringify(construirBorradorCaso(sugerenciaCaso))
      );
    } catch { /* sessionStorage no disponible — se abre el form vacío igual */ }
    setSugerenciaCaso(null);
    router.push("/casos");
  };

  const handleConfirmPerdido = () => {
    setDialogEmpresa(null);
    router.refresh();
  };

  const draggingEmpresa = draggingId ? empresas.find((e) => e.id === draggingId) : null;

  return (
    <>
      <div className="flex items-center gap-1.5 px-5 pt-4 pb-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pipeline de ventas</p>
        <HelpTooltip
          titulo="¿Cómo funciona el pipeline?"
          explicacion="Muestra en qué etapa está cada empresa del proceso de venta. Arrastra las tarjetas entre columnas para cambiar la etapa, o usa la ficha de la empresa."
          ejemplo={"Prospecto → la investigaste.\nContactado → hiciste el primer contacto.\nEn conversación → hay intercambio activo.\nReunión agendada → confirmaron reunión.\nCotizado → enviaste propuesta.\nGanado → cerraste el negocio."}
        />
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          className="flex gap-3 px-4 pt-2 pb-6 overflow-x-auto"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Columnas principales */}
          {COLUMNAS.map((col) => {
            const items = porEstado.get(col.id) ?? [];
            return (
              <KanbanColumna
                key={col.id}
                colId={col.id}
                label={col.label}
                accentColor={col.accentColor}
                items={items}
                vencidasSet={vencidasSet}
                draggingId={draggingId}
                onMarcarPerdido={setDialogEmpresa}
              />
            );
          })}

          {/* Columna Perdido — colapsable, sin droppable */}
          <div className="flex-none w-[220px]">
            <button
              onClick={() => setPerdidoExpanded((v) => !v)}
              className="flex items-center gap-2 w-full mb-3 group"
            >
              <div className="h-2.5 w-2.5 rounded-full bg-red-400 shrink-0" />
              <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                Perdidos ({perdidas.length})
              </span>
              {perdidoExpanded ? (
                <ChevronLeft className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>

            {perdidoExpanded && (
              <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-1 pb-2">
                {perdidas.length === 0 && <ColumnaVacia />}
                {perdidas.map((empresa) => (
                  <KanbanCardStatic
                    key={empresa.id}
                    empresa={empresa}
                    vencida={vencidasSet.has(empresa.id)}
                    esPerdido
                    onMarcarPerdido={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tarjeta flotante durante el drag */}
        <DragOverlay dropAnimation={null}>
          {draggingEmpresa ? (
            <KanbanCardStatic
              empresa={draggingEmpresa}
              vencida={vencidasSet.has(draggingEmpresa.id)}
              esPerdido={false}
              onMarcarPerdido={() => {}}
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {dialogEmpresa && (
        <PerdidoDialog
          empresa={dialogEmpresa}
          open={!!dialogEmpresa}
          onClose={() => setDialogEmpresa(null)}
          onConfirm={handleConfirmPerdido}
        />
      )}

      {/* Sugerencia no bloqueante de documentar el negocio ganado como caso */}
      {sugerenciaCaso && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
          <div className="flex items-start gap-3 rounded-2xl border border-green-200 dark:border-green-800/40 bg-white dark:bg-card shadow-lg p-4">
            <div className="h-9 w-9 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <Trophy className="h-5 w-5 text-[#22C55E]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                📋 ¡Ganaste {sugerenciaCaso.nombre}!
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                ¿Agregar este negocio a tu base de casos? La IA lo usará como referencia real.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={revisarCaso}
                  className="flex-1 py-2 rounded-lg bg-[#22C55E] hover:bg-[#16a34a] text-white text-xs font-semibold transition-colors"
                >
                  Revisar
                </button>
                <button
                  onClick={() => setSugerenciaCaso(null)}
                  className="py-2 px-3 rounded-lg border border-border text-muted-foreground text-xs font-medium hover:bg-muted transition-colors"
                >
                  Descartar
                </button>
              </div>
            </div>
            <button
              onClick={() => setSugerenciaCaso(null)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Columna droppable ───────────────────────────────────────────

function KanbanColumna({
  colId,
  label,
  accentColor,
  items,
  vencidasSet,
  draggingId,
  onMarcarPerdido,
}: {
  colId: EstadoEmpresa;
  label: string;
  accentColor: string;
  items: Empresa[];
  vencidasSet: Set<string>;
  draggingId: string | null;
  onMarcarPerdido: (e: Empresa) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colId });

  return (
    <div className="flex-none w-[220px]">
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${accentColor}`} />
        <span className="text-xs font-semibold text-foreground leading-none">{label}</span>
        <span className="ml-auto text-xs font-bold text-muted-foreground">{items.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={`space-y-2 min-h-[60px] max-h-[calc(100vh-200px)] overflow-y-auto pr-1 pb-2 rounded-xl transition-colors ${
          isOver ? "bg-primary/5 ring-1 ring-primary/20" : ""
        }`}
      >
        {items.length === 0 && !isOver && <ColumnaVacia />}
        {items.map((empresa) => (
          <KanbanCardDraggable
            key={empresa.id}
            empresa={empresa}
            vencida={vencidasSet.has(empresa.id)}
            isDraggingThis={draggingId === empresa.id}
            onMarcarPerdido={() => onMarcarPerdido(empresa)}
          />
        ))}
      </div>
    </div>
  );
}

function ColumnaVacia() {
  return <div className="h-16 rounded-xl border-2 border-dashed border-border/50" />;
}

// ── Tarjeta draggable ───────────────────────────────────────────

function KanbanCardDraggable({
  empresa,
  vencida,
  isDraggingThis,
  onMarcarPerdido,
}: {
  empresa: Empresa;
  vencida: boolean;
  isDraggingThis: boolean;
  onMarcarPerdido: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: empresa.id });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`transition-opacity ${isDraggingThis ? "opacity-30" : "opacity-100"}`}
    >
      <KanbanCardStatic
        empresa={empresa}
        vencida={vencida}
        esPerdido={false}
        onMarcarPerdido={onMarcarPerdido}
      />
    </div>
  );
}

// ── Tarjeta visual (sin lógica DnD) ────────────────────────────

function KanbanCardStatic({
  empresa,
  vencida,
  esPerdido,
  onMarcarPerdido,
  isOverlay = false,
}: {
  empresa: Empresa;
  vencida: boolean;
  esPerdido: boolean;
  onMarcarPerdido: () => void;
  isOverlay?: boolean;
}) {
  const router = useRouter();
  const tecnica = empresa.ficha_ia?.tecnica_recomendada;
  const dotColor = tecnica ? (TECNICA_DOT[tecnica] ?? "bg-gray-300") : "bg-gray-300";
  const reac = esPerdido ? labelReactivacion(empresa.fecha_reactivacion) : null;

  return (
    <div
      className={`relative group rounded-xl border bg-card p-3 cursor-pointer
        hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.98]
        ${vencida ? "border-red-300 dark:border-red-800/50" : "border-border"}
        ${isOverlay ? "shadow-lg rotate-1 scale-105" : ""}`}
      onClick={() => !isOverlay && router.push(`/cuentas/${empresa.id}`)}
    >
      <div className="flex items-start gap-2">
        <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
        <p className="font-semibold text-sm leading-tight line-clamp-2 pr-4">
          {empresa.nombre}
        </p>
      </div>

      {empresa.industria && (
        <p className="text-xs text-muted-foreground mt-1 pl-4 line-clamp-1">
          {empresa.industria}
        </p>
      )}

      {reac && (
        <div
          className={`mt-2 pl-4 inline-flex items-center gap-1 text-xs font-medium ${
            reac.vencida
              ? "text-red-600 dark:text-red-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          🔄 {reac.texto}
        </div>
      )}

      {!esPerdido && !isOverlay && (
        <button
          className="absolute top-2 right-2 h-5 w-5 rounded-full bg-background border border-border
            flex items-center justify-center opacity-0 group-hover:opacity-100
            hover:bg-red-50 hover:border-red-300 hover:text-red-600
            dark:hover:bg-red-900/20 transition-all"
          onClick={(e) => {
            e.stopPropagation();
            onMarcarPerdido();
          }}
          title="Marcar como perdido"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
