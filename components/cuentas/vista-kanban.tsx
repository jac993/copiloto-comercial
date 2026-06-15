"use client";

// =============================================================
// Vista Kanban del pipeline comercial.
// 6 columnas visibles + "Perdidos" colapsable.
// Clic en tarjeta → navega a la ficha. × → marcar como perdido.
// =============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronLeft, X } from "lucide-react";
import { PerdidoDialog } from "@/components/cuentas/perdido-dialog";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import type { Empresa, EstadoEmpresa } from "@/lib/types";

// Columnas visibles en orden
const COLUMNAS: { id: EstadoEmpresa; label: string; accentColor: string }[] = [
  { id: "prospecto",      label: "Prospecto",        accentColor: "bg-gray-400" },
  { id: "contactado",     label: "Contactado",        accentColor: "bg-blue-500" },
  { id: "en_conversacion",label: "En conversación",   accentColor: "bg-indigo-500" },
  { id: "reunion_agendada", label: "Reunión agendada",  accentColor: "bg-amber-500" },
  { id: "cotizado",         label: "Cotizado",          accentColor: "bg-purple-500" },
  { id: "ganado",           label: "Ganado",            accentColor: "bg-green-500" },
];

// Puntos de color por técnica recomendada
const TECNICA_DOT: Record<string, string> = {
  SPIN:       "bg-[#7C3AED]",   // violeta
  consultiva: "bg-[#22C55E]",   // verde
  relacional: "bg-blue-500",    // azul
  challenger: "bg-[#F97316]",   // naranja
};

function labelReactivacion(
  fechaStr: string | null
): { texto: string; vencida: boolean } | null {
  if (!fechaStr) return null;
  // Forzar interpretación como fecha local para evitar off-by-one de TZ
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
  empresasVencidasIds: string[]; // IDs con próximo paso vencido
}

export function VistaKanban({ empresas, empresasVencidasIds }: VistaKanbanProps) {
  const router = useRouter();
  const [perdidoExpanded, setPerdidoExpanded] = useState(false);
  const [dialogEmpresa, setDialogEmpresa] = useState<Empresa | null>(null);

  const vencidasSet = new Set(empresasVencidasIds);

  // Agrupar empresas por estado
  const porEstado = new Map<EstadoEmpresa, Empresa[]>();
  for (const col of COLUMNAS) {
    porEstado.set(col.id, []);
  }
  porEstado.set("perdido", []);
  for (const e of empresas) {
    const lista = porEstado.get(e.estado);
    if (lista) lista.push(e);
  }

  const perdidas = porEstado.get("perdido") ?? [];

  const handleConfirmPerdido = () => {
    setDialogEmpresa(null);
    router.refresh(); // recarga datos del servidor sin full reload
  };

  return (
    <>
      {/* Encabezado del pipeline con ayuda contextual */}
      <div className="flex items-center gap-1.5 px-5 pt-4 pb-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pipeline de ventas</p>
        <HelpTooltip
          titulo="¿Cómo funciona el pipeline?"
          explicacion="Muestra en qué etapa está cada empresa del proceso de venta. El estado cambia automáticamente cuando la IA detecta avances en tus interacciones, o puedes cambiarlo tú manualmente desde la ficha."
          ejemplo={"Prospecto → la investigaste.\nContactado → hiciste el primer contacto.\nEn conversación → hay intercambio activo.\nReunión agendada → confirmaron reunión.\nCotizado → enviaste propuesta.\nGanado → cerraste el negocio."}
        />
      </div>

      {/* Tablero con scroll horizontal en móvil */}
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
              label={col.label}
              accentColor={col.accentColor}
              items={items}
              vencidasSet={vencidasSet}
              onMarcarPerdido={setDialogEmpresa}
            />
          );
        })}

        {/* Columna Perdido — colapsable */}
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
                <KanbanCard
                  key={empresa.id}
                  empresa={empresa}
                  vencida={vencidasSet.has(empresa.id)}
                  esPerdido
                  onMarcarPerdido={() => {}} // ya está perdido
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialog de perdido */}
      {dialogEmpresa && (
        <PerdidoDialog
          empresa={dialogEmpresa}
          open={!!dialogEmpresa}
          onClose={() => setDialogEmpresa(null)}
          onConfirm={handleConfirmPerdido}
        />
      )}
    </>
  );
}

// ── Columna individual ──────────────────────────────────────────

function KanbanColumna({
  label,
  accentColor,
  items,
  vencidasSet,
  onMarcarPerdido,
}: {
  label: string;
  accentColor: string;
  items: Empresa[];
  vencidasSet: Set<string>;
  onMarcarPerdido: (e: Empresa) => void;
}) {
  return (
    <div className="flex-none w-[220px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${accentColor}`} />
        <span className="text-xs font-semibold text-foreground leading-none">{label}</span>
        <span className="ml-auto text-xs font-bold text-muted-foreground">{items.length}</span>
      </div>

      {/* Cards */}
      <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-1 pb-2">
        {items.length === 0 && <ColumnaVacia />}
        {items.map((empresa) => (
          <KanbanCard
            key={empresa.id}
            empresa={empresa}
            vencida={vencidasSet.has(empresa.id)}
            esPerdido={false}
            onMarcarPerdido={() => onMarcarPerdido(empresa)}
          />
        ))}
      </div>
    </div>
  );
}

function ColumnaVacia() {
  return (
    <div className="h-16 rounded-xl border-2 border-dashed border-border/50" />
  );
}

// ── Tarjeta individual ──────────────────────────────────────────

function KanbanCard({
  empresa,
  vencida,
  esPerdido,
  onMarcarPerdido,
}: {
  empresa: Empresa;
  vencida: boolean;
  esPerdido: boolean;
  onMarcarPerdido: () => void;
}) {
  const router = useRouter();
  const tecnica = empresa.ficha_ia?.tecnica_recomendada;
  const dotColor = tecnica ? (TECNICA_DOT[tecnica] ?? "bg-gray-300") : "bg-gray-300";
  const reac = esPerdido ? labelReactivacion(empresa.fecha_reactivacion) : null;

  return (
    <div
      className={`relative group rounded-xl border bg-card p-3 cursor-pointer
        hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.98]
        ${vencida ? "border-red-300 dark:border-red-800/50" : "border-border"}`}
      onClick={() => router.push(`/cuentas/${empresa.id}`)}
    >
      {/* Técnica + nombre */}
      <div className="flex items-start gap-2">
        <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
        <p className="font-semibold text-sm leading-tight line-clamp-2 pr-4">
          {empresa.nombre}
        </p>
      </div>

      {/* Industria */}
      {empresa.industria && (
        <p className="text-xs text-muted-foreground mt-1 pl-4 line-clamp-1">
          {empresa.industria}
        </p>
      )}

      {/* Chip de reactivación (solo en columna perdido) */}
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

      {/* Botón × para marcar como perdido (solo columnas activas) */}
      {!esPerdido && (
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
