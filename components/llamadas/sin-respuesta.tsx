"use client";

// Panel para registrar un intento de contacto sin respuesta.
// NO gasta créditos — solo inserta en DB y programa recordatorio en 5 días hábiles.

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmpresaSelector } from "./empresa-selector";
import type { Empresa, TipoInteraccion } from "@/lib/types";

type CanalSinRespuesta = Extract<TipoInteraccion, "llamada" | "email" | "linkedin" | "whatsapp">;

const CANALES: { value: CanalSinRespuesta; label: string }[] = [
  { value: "llamada",  label: "📞 Llamada" },
  { value: "email",    label: "📧 Email" },
  { value: "linkedin", label: "💼 LinkedIn" },
  { value: "whatsapp", label: "💬 WhatsApp" },
];

interface SinRespuestaProps {
  empresas: Empresa[];
  onRegistrado: () => void;
}

export function SinRespuesta({ empresas, onRegistrado }: SinRespuestaProps) {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [contactoId, setContactoId] = useState<string | null>(null);
  const [canal, setCanal] = useState<CanalSinRespuesta>("llamada");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegistrar() {
    if (!empresa) return;
    setError(null);
    setGuardando(true);
    try {
      const res = await fetch("/api/analizar-interaccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresa.id,
          contacto_id: contactoId ?? undefined,
          tipo: "sin_respuesta",
          // El canal se guarda en notas dentro del resumen_ia en el endpoint
          texto: `Canal intentado: ${canal}`,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error al registrar");

      setGuardado(true);
      setTimeout(() => {
        setGuardado(false);
        onRegistrado();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardando(false);
    }
  }

  if (guardado) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <p className="font-semibold">Registrado</p>
        <p className="text-sm text-muted-foreground text-center">
          Recordatorio programado para dentro de 5 días hábiles
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-muted/50 border border-border">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Registra el intento sin cobrar créditos de IA.
          La app creará un recordatorio automático en <strong>5 días hábiles</strong> que aparecerá en la pantalla Hoy.
        </p>
      </div>

      {/* Empresa */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Empresa
        </p>
        <EmpresaSelector
          empresas={empresas}
          onSeleccionar={setEmpresa}
          onContactoSeleccionado={(c) => setContactoId(c?.id ?? null)}
        />
      </div>

      {/* Canal */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          ¿Por qué canal intentaste contactarlos?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CANALES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCanal(c.value)}
              className={`h-12 rounded-xl border text-sm font-medium transition-colors ${
                canal === c.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-foreground hover:border-primary/40"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Botón */}
      <Button
        size="lg"
        variant="outline"
        className="w-full h-14 rounded-2xl text-base"
        onClick={handleRegistrar}
        disabled={!empresa || guardando}
      >
        {guardando ? "Registrando..." : "Registrar sin respuesta"}
      </Button>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
    </div>
  );
}
