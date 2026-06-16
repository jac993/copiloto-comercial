"use client";

// =============================================================
// Feed global de actividad — todas las interacciones recientes
// de todas las empresas. Filtros por tipo y badge de estado.
// El registro de nuevas interacciones se hace desde la ficha
// de cada empresa (tab Historial).
// =============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Phone, Mail, MessageCircle, Briefcase, PhoneOff,
  TrendingUp, Minus, Brain, AlertTriangle, CheckCircle2,
  Clock, XCircle, Loader2, RefreshCw,
} from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import type { BadgeEstado, TipoInteraccion } from "@/lib/types";
import type { InteraccionFeed } from "@/app/api/interacciones/feed/route";

// ── Configuraciones ───────────────────────────────────────────

const TIPO_CONF: Record<TipoInteraccion, { emoji: string; label: string; Icon: React.ElementType }> = {
  llamada:       { emoji: "📞", label: "Llamada",     Icon: Phone },
  email:         { emoji: "📧", label: "Correo",      Icon: Mail },
  whatsapp:      { emoji: "💬", label: "WhatsApp",    Icon: MessageCircle },
  linkedin:      { emoji: "💼", label: "LinkedIn",    Icon: Briefcase },
  sin_respuesta: { emoji: "⏰", label: "Sin respuesta", Icon: PhoneOff },
};

const BADGE_CONF: Record<BadgeEstado, { label: string; dot: string; bg: string; text: string; Icon: React.ElementType }> = {
  avanzando:    { label: "Avanzando",       dot: "#22C55E", bg: "bg-green-100 dark:bg-green-900/20",   text: "text-green-700 dark:text-green-400",   Icon: TrendingUp },
  neutral:      { label: "Neutral",         dot: "#F59E0B", bg: "bg-amber-100 dark:bg-amber-900/20",   text: "text-amber-700 dark:text-amber-400",   Icon: Minus },
  evaluando:    { label: "Evaluando",       dot: "#3B82F6", bg: "bg-blue-100 dark:bg-blue-900/20",     text: "text-blue-700 dark:text-blue-400",     Icon: Brain },
  resistente:   { label: "Resistente",      dot: "#F97316", bg: "bg-orange-100 dark:bg-orange-900/20", text: "text-orange-700 dark:text-orange-400", Icon: AlertTriangle },
  senal_cierre: { label: "Señal de cierre", dot: "#DC2626", bg: "bg-red-100 dark:bg-red-900/20",       text: "text-red-600 dark:text-red-400",       Icon: CheckCircle2 },
  sin_respuesta:{ label: "Sin respuesta",   dot: "#6B7280", bg: "bg-gray-100 dark:bg-gray-800",        text: "text-gray-500 dark:text-gray-400",     Icon: Clock },
  rechazado:    { label: "Rechazado",       dot: "#7F1D1D", bg: "bg-red-200 dark:bg-red-950/40",       text: "text-red-900 dark:text-red-300",       Icon: XCircle },
};

function fechaRelativa(iso: string) {
  const ahora = Date.now();
  const diff = ahora - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (h < 1) return "Hace menos de 1 hora";
  if (h < 24) return `Hace ${h}h`;
  if (d === 1) return "Ayer";
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

type FiltroTipo = TipoInteraccion | "todos";
type FiltroBadge = BadgeEstado | "todos";

// ── Componente principal ──────────────────────────────────────

export function LlamadasClient() {
  const [items, setItems] = useState<InteraccionFeed[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [filtroBadge, setFiltroBadge] = useState<FiltroBadge>("todos");

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/interacciones/feed?dias=7");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setItems(data.interacciones ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el feed");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const filtrados = items.filter((i) => {
    if (filtroTipo !== "todos" && i.tipo !== filtroTipo) return false;
    if (filtroBadge !== "todos" && i.badge_estado !== filtroBadge) return false;
    return true;
  });

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex h-16 items-center justify-between px-5">
          <h1 className="text-2xl font-extrabold text-[#7C3AED]">Actividad</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={cargar}
              className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
              aria-label="Recargar"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
            <ThemeToggle />
          </div>
        </div>

        {/* Filtros */}
        <div className="px-4 pb-3 space-y-2">
          {/* Filtro tipo */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {(["todos", "llamada", "email", "whatsapp", "linkedin", "sin_respuesta"] as FiltroTipo[]).map((t) => (
              <button
                key={t}
                onClick={() => setFiltroTipo(t)}
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  filtroTipo === t
                    ? "bg-[#7C3AED] text-white border-[#7C3AED]"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40"
                }`}
              >
                {t === "todos" ? "Todos" : TIPO_CONF[t as TipoInteraccion].emoji + " " + TIPO_CONF[t as TipoInteraccion].label}
              </button>
            ))}
          </div>

          {/* Filtro badge */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {(["todos", "avanzando", "neutral", "evaluando", "resistente", "senal_cierre", "sin_respuesta", "rechazado"] as FiltroBadge[]).map((b) => {
              const conf = b !== "todos" ? BADGE_CONF[b as BadgeEstado] : null;
              return (
                <button
                  key={b}
                  onClick={() => setFiltroBadge(b)}
                  className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                    filtroBadge === b
                      ? "bg-[#7C3AED] text-white border-[#7C3AED]"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  {b === "todos" ? "Todos los estados" : conf?.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Contenido */}
      <div className="flex-1 px-4 py-4">
        {cargando && (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando actividad…</span>
          </div>
        )}

        {!cargando && error && (
          <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive text-center">
            {error}
            <button onClick={cargar} className="block mx-auto mt-2 text-xs underline">
              Reintentar
            </button>
          </div>
        )}

        {!cargando && !error && filtrados.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <Clock className="h-10 w-10 mx-auto text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">Sin actividad reciente</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Ve a la ficha de una empresa y registra tu primera interacción desde el tab Historial.
            </p>
          </div>
        )}

        {!cargando && !error && filtrados.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground px-0.5 mb-3">
              {filtrados.length} interacción{filtrados.length !== 1 ? "es" : ""} en los últimos 7 días
            </p>
            {filtrados.map((item) => (
              <FeedItem key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tarjeta del feed ──────────────────────────────────────────

function FeedItem({ item }: { item: InteraccionFeed }) {
  const tipoConf = TIPO_CONF[item.tipo] ?? TIPO_CONF.llamada;
  const badgeConf = item.badge_estado ? BADGE_CONF[item.badge_estado] : null;

  return (
    <Link
      href={`/cuentas/${item.empresa_id}`}
      className="block rounded-2xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all active:scale-[0.99] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-base"
            style={{ backgroundColor: badgeConf?.dot ? `${badgeConf.dot}22` : "#EDE9FE" }}
          >
            {tipoConf.emoji}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{item.empresa_nombre}</p>
            <p className="text-xs text-muted-foreground">{tipoConf.label} · {fechaRelativa(item.fecha)}</p>
          </div>
        </div>

        {badgeConf && (
          <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${badgeConf.bg} ${badgeConf.text}`}>
            {badgeConf.label}
          </span>
        )}
      </div>

      {item.resumen_ia && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed pl-12">
          {item.resumen_ia}
        </p>
      )}
    </Link>
  );
}
