"use client";

// =============================================================
// Pantalla Panorama — tabla compacta de todos los prospectos
// activos con semáforo de atención. Sin IA: solo lectura de
// datos existentes vía /api/panorama.
// =============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { LayoutGrid, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import type { PanoramaFila, EstadoEmpresa, TipoInteraccion } from "@/lib/types";

// ── Config de presentación ───────────────────────────────────

const ESTADO_CONFIG: Record<EstadoEmpresa, { label: string; className: string; orden: number }> = {
  prospecto:        { label: "Prospecto",        className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", orden: 0 },
  contactado:       { label: "Contactado",       className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", orden: 1 },
  en_conversacion:  { label: "En conversación",  className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400", orden: 2 },
  reunion_agendada: { label: "Reunión agendada", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", orden: 3 },
  cotizado:         { label: "Cotizado",         className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", orden: 4 },
  ganado:           { label: "Ganado",           className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", orden: 5 },
  perdido:          { label: "Perdido",          className: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400", orden: 6 },
};

const TIPO_LABEL: Record<TipoInteraccion, string> = {
  llamada: "llamada",
  email: "email",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  reunion: "reunión",
  sin_respuesta: "sin respuesta",
};

const SEMAFORO_ORDEN = { rojo: 0, amarillo: 1, verde: 2 } as const;
const SEMAFORO_COLOR = {
  rojo: "bg-red-500",
  amarillo: "bg-amber-400",
  verde: "bg-green-500",
} as const;

type ColumnaOrden = "semaforo" | "nombre" | "estado" | "meddic" | "contacto" | "proxima";

// ── Helpers ──────────────────────────────────────────────────

function textoUltimoContacto(f: PanoramaFila): string {
  if (!f.ultima_interaccion || f.dias_sin_contacto === null) return "Sin contacto aún";
  const dias = f.dias_sin_contacto;
  const cuando = dias === 0 ? "hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  const tipo = TIPO_LABEL[f.ultima_interaccion.tipo] ?? f.ultima_interaccion.tipo;
  const con = f.ultima_interaccion.contacto_nombre ? ` con ${f.ultima_interaccion.contacto_nombre}` : "";
  return `${cuando} · ${tipo}${con}`;
}

function fechaCorta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${parseInt(dia)} ${meses[parseInt(mes) - 1]}`;
}

// ── Componente principal ─────────────────────────────────────

export default function PanoramaPage() {
  const [filas, setFilas] = useState<PanoramaFila[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<{ col: ColumnaOrden; asc: boolean }>({ col: "semaforo", asc: true });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/panorama", { cache: "no-store" });
      if (!res.ok) throw new Error("Error al cargar el panorama");
      const data = await res.json() as { filas: PanoramaFila[] };
      setFilas(data.filas);
    } catch {
      setError("No se pudo cargar el panorama. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Clic en encabezado: misma columna invierte dirección; columna nueva parte ascendente
  const clickColumna = (col: ColumnaOrden) => {
    setOrden((prev) => (prev.col === col ? { col, asc: !prev.asc } : { col, asc: true }));
  };

  const filasOrdenadas = useMemo(() => {
    if (!filas) return [];
    const dir = orden.asc ? 1 : -1;
    const comparar = (a: PanoramaFila, b: PanoramaFila): number => {
      switch (orden.col) {
        case "semaforo": {
          const d = SEMAFORO_ORDEN[a.semaforo] - SEMAFORO_ORDEN[b.semaforo];
          if (d !== 0) return d * dir;
          // Dentro de cada color: más días sin contacto primero (null = infinito)
          const da = a.dias_sin_contacto ?? Infinity;
          const db = b.dias_sin_contacto ?? Infinity;
          return db - da;
        }
        case "nombre":
          return a.nombre.localeCompare(b.nombre, "es") * dir;
        case "estado":
          return (ESTADO_CONFIG[a.estado].orden - ESTADO_CONFIG[b.estado].orden) * dir;
        case "meddic":
          return ((b.score_meddic ?? -1) - (a.score_meddic ?? -1)) * dir;
        case "contacto": {
          const da = a.dias_sin_contacto ?? Infinity;
          const db = b.dias_sin_contacto ?? Infinity;
          return (db - da) * dir;
        }
        case "proxima": {
          const fa = a.proxima_tarea?.fecha ?? "9999-12-31";
          const fb = b.proxima_tarea?.fecha ?? "9999-12-31";
          return fa.localeCompare(fb) * dir;
        }
      }
    };
    return [...filas].sort(comparar);
  }, [filas, orden]);

  const flecha = (col: ColumnaOrden) =>
    orden.col === col ? (orden.asc ? " ▲" : " ▼") : "";

  const thClass = "px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap";

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] px-5 pt-10 pb-7 md:pt-8">
        <p className="text-white/70 text-sm font-medium">Vista general</p>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-white text-2xl md:text-3xl font-extrabold">Panorama</h1>
          <HelpTooltip
            titulo="¿Para qué sirve esta pantalla?"
            explicacion="Muestra todos tus prospectos activos en una sola tabla con un semáforo de atención: rojo = necesita acción urgente (sin respuesta >48h o tarea vencida), amarillo = atención pronto (tarea hoy/mañana o más de 7 días sin contacto), verde = al día."
            ejemplo={"Toca el encabezado de una columna para reordenar la tabla."}
          />
        </div>
      </header>

      {/* Contenido */}
      <div className="flex-1 px-3 py-4 md:px-4">
        {cargando ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-11 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
            <Button variant="outline" size="sm" onClick={() => void cargar()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Reintentar
            </Button>
          </div>
        ) : (filas ?? []).length === 0 ? (
          <div className="flex flex-col items-center text-center gap-3 py-12">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
              <LayoutGrid className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-1 max-w-xs">
              <p className="font-semibold">Sin prospectos activos</p>
              <p className="text-sm text-muted-foreground">
                Agrega empresas en la sección Cuentas y aparecerán aquí con su semáforo de atención.
              </p>
            </div>
            <Link href="/cuentas">
              <Button size="sm">Ir a Cuentas</Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className={thClass} onClick={() => clickColumna("semaforo")} title="Semáforo">
                    ●{flecha("semaforo")}
                  </th>
                  <th className={thClass} onClick={() => clickColumna("nombre")}>
                    Empresa{flecha("nombre")}
                  </th>
                  <th className={`${thClass} hidden md:table-cell`} onClick={() => clickColumna("estado")}>
                    Etapa{flecha("estado")}
                  </th>
                  <th className={`${thClass} hidden md:table-cell`} onClick={() => clickColumna("meddic")}>
                    MEDDIC{flecha("meddic")}
                  </th>
                  <th className={`${thClass} hidden md:table-cell`} onClick={() => clickColumna("contacto")}>
                    Último contacto{flecha("contacto")}
                  </th>
                  <th className={thClass} onClick={() => clickColumna("proxima")}>
                    Próxima acción{flecha("proxima")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filasOrdenadas.map((f) => {
                  const estado = ESTADO_CONFIG[f.estado];
                  return (
                    <tr key={f.empresa_id} className="hover:bg-muted/30 transition-colors">
                      {/* Semáforo */}
                      <td className="px-2 py-2.5">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${SEMAFORO_COLOR[f.semaforo]}`}
                          title={f.semaforo}
                        />
                      </td>
                      {/* Empresa */}
                      <td className="px-2 py-2.5 max-w-[140px] md:max-w-[220px]">
                        <Link
                          href={`/cuentas/${f.empresa_id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors truncate block"
                        >
                          {f.nombre}
                        </Link>
                      </td>
                      {/* Etapa */}
                      <td className="px-2 py-2.5 hidden md:table-cell">
                        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${estado.className}`}>
                          {estado.label}
                        </span>
                      </td>
                      {/* MEDDIC */}
                      <td className="px-2 py-2.5 hidden md:table-cell text-muted-foreground whitespace-nowrap">
                        {f.score_meddic !== null ? `${Math.round((f.score_meddic / 12) * 100)}%` : "—"}
                      </td>
                      {/* Último contacto */}
                      <td className="px-2 py-2.5 hidden md:table-cell text-muted-foreground max-w-[240px]">
                        <span className="truncate block">{textoUltimoContacto(f)}</span>
                      </td>
                      {/* Próxima acción */}
                      <td className="px-2 py-2.5 max-w-[160px] md:max-w-[260px]">
                        {f.proxima_tarea ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate text-foreground/90">{f.proxima_tarea.texto}</span>
                            <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
                              {fechaCorta(f.proxima_tarea.fecha)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Leyenda del semáforo */}
        {!cargando && !error && (filas ?? []).length > 0 && (
          <div className="flex items-center gap-4 mt-3 px-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500 inline-block" /> Acción urgente
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> Atención pronto
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500 inline-block" /> Al día
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
