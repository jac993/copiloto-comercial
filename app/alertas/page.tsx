"use client";

// =============================================================
// /alertas — Lista global de interacciones con plazo vencido.
// Muestra whatsapp/email/linkedin con > 48h sin respuesta,
// agrupados por empresa, con los 3 botones de resolución.
// =============================================================

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Mail, MessageCircle, Briefcase,
  Loader2, ArrowLeft, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InteraccionVencida } from "@/lib/types";

const TIPO_CONF: Record<string, { emoji: string; label: string; Icon: React.ElementType }> = {
  whatsapp: { emoji: "💬", label: "WhatsApp", Icon: MessageCircle },
  email:    { emoji: "📧", label: "Correo",   Icon: Mail },
  linkedin: { emoji: "💼", label: "LinkedIn", Icon: Briefcase },
};

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function AlertasPage() {
  const router = useRouter();
  const [vencidas, setVencidas] = useState<InteraccionVencida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [resueltosIds, setResueltosIds] = useState<Set<string>>(new Set());
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/interacciones/vencidas")
      .then((r) => r.json())
      .then((d) => setVencidas(d.vencidas ?? []))
      .catch(() => {/* silent */})
      .finally(() => setCargando(false));
  }, []);

  async function resolver(
    v: InteraccionVencida,
    resumen: string,
    sentimiento: "positivo" | "negativo"
  ) {
    setResolviendoId(v.id);
    try {
      await fetch(`/api/interacciones/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resuelta: true }),
      });
      await fetch("/api/interacciones/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: v.empresa_id,
          tipo: v.tipo,
          contacto_id: v.contacto_id ?? undefined,
          texto: resumen,
          sentimiento,
          fecha: new Date().toISOString(),
        }),
      });
      setResueltosIds((prev) => new Set(Array.from(prev).concat(v.id)));
    } catch {
      // silent — si falla, el botón vuelve a estar disponible
    } finally {
      setResolviendoId(null);
    }
  }

  const activas = vencidas.filter((v) => !resueltosIds.has(v.id));

  // Agrupar por empresa
  const porEmpresa: Record<string, { nombre: string; items: InteraccionVencida[] }> = {};
  for (const v of activas) {
    if (!porEmpresa[v.empresa_id]) {
      porEmpresa[v.empresa_id] = { nombre: v.empresa_nombre, items: [] };
    }
    porEmpresa[v.empresa_id].items.push(v);
  }
  const grupos = Object.entries(porEmpresa);

  return (
    <div className="max-w-lg mx-auto px-4 pt-5 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-lg font-extrabold">Interacciones sin respuesta</h1>
          <p className="text-xs text-muted-foreground">
            Más de 48h sin respuesta — WhatsApp, correo y LinkedIn
          </p>
        </div>
      </div>

      {cargando && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      )}

      {!cargando && grupos.length === 0 && (
        <div className="text-center py-14 space-y-3">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 opacity-60" />
          <p className="text-sm font-semibold">Todo al día</p>
          <p className="text-xs text-muted-foreground">No hay interacciones pendientes de respuesta</p>
        </div>
      )}

      <div className="space-y-6">
        {grupos.map(([empresaId, { nombre, items }]) => (
          <section key={empresaId}>
            <div className="flex items-center justify-between mb-2.5">
              <button
                onClick={() => router.push(`/cuentas/${empresaId}`)}
                className="text-sm font-extrabold text-foreground hover:text-primary transition-colors"
              >
                {nombre} →
              </button>
              <span className="text-xs text-muted-foreground">{items.length} pendiente{items.length > 1 ? "s" : ""}</span>
            </div>

            <div className="space-y-3">
              {items.map((v) => {
                const conf = TIPO_CONF[v.tipo];
                const resolviendo = resolviendoId === v.id;
                return (
                  <div key={v.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{conf?.emoji} {conf?.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{fechaCorta(v.fecha)}</p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 shrink-0">
                        Vencida
                      </span>
                    </div>

                    {v.transcripcion && (
                      <p className="text-xs text-foreground/70 line-clamp-2 leading-relaxed">
                        {v.transcripcion}
                      </p>
                    )}

                    <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                      ⚠️ Sin respuesta — ¿contestó?
                    </p>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9 text-xs rounded-xl bg-green-50 border-green-200 text-green-700 hover:bg-green-100 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400"
                        disabled={resolviendo}
                        onClick={() => resolver(v, "Respondió al contacto", "positivo")}
                      >
                        {resolviendo ? <Loader2 className="h-3 w-3 animate-spin" /> : "✅ Sí contestó"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9 text-xs rounded-xl bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-900/20 dark:border-gray-700 dark:text-gray-400"
                        disabled={resolviendo}
                        onClick={() => resolver(v, "Sin respuesta tras 48h", "negativo")}
                      >
                        {resolviendo ? <Loader2 className="h-3 w-3 animate-spin" /> : "❌ No contestó"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
