"use client";

// Panel genérico para registrar interacciones textuales:
// email, linkedin y whatsapp. La diferencia es el label y el tipo.
// Pega el texto → elige empresa → ⚡ Analizar

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmpresaSelector } from "./empresa-selector";
import type { Empresa, Contacto, ResultadoAnalisis, TipoInteraccion } from "@/lib/types";

interface PanelTextoProps {
  tipo: Extract<TipoInteraccion, "email" | "linkedin" | "whatsapp">;
  empresas: Empresa[];
  onResultado: (resultado: ResultadoAnalisis, empresaId: string, interaccionId: string) => void;
}

const CONFIG: Record<
  Extract<TipoInteraccion, "email" | "linkedin" | "whatsapp">,
  { placeholder: string; labelBoton: string; labelTexto: string; labelAsunto?: string }
> = {
  email: {
    labelTexto: "Pega aquí el correo completo",
    placeholder: "Incluye el texto del correo tal como llegó o lo enviaste...",
    labelBoton: "Analizar correo",
    labelAsunto: "Asunto (opcional)",
  },
  linkedin: {
    labelTexto: "Pega aquí los mensajes de LinkedIn",
    placeholder: "Copia los mensajes del hilo de LinkedIn...",
    labelBoton: "Analizar conversación",
  },
  whatsapp: {
    labelTexto: "Pega aquí la conversación de WhatsApp",
    placeholder: "Copia los mensajes de WhatsApp (con o sin timestamps)...",
    labelBoton: "Analizar conversación WhatsApp",
  },
};

export function PanelTexto({ tipo, empresas, onResultado }: PanelTextoProps) {
  const conf = CONFIG[tipo];
  const [texto, setTexto] = useState("");
  const [asunto, setAsunto] = useState("");
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [contactoId, setContactoId] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeAnalizar = texto.trim().length > 0 && empresa !== null && !analizando;

  function handleContacto(c: Contacto | null) {
    setContactoId(c?.id ?? null);
  }

  async function handleAnalizar() {
    if (!empresa || !texto.trim()) return;
    setError(null);
    setAnalizando(true);
    try {
      const res = await fetch("/api/analizar-interaccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresa.id,
          contacto_id: contactoId ?? undefined,
          tipo,
          texto: texto.trim(),
          ...(tipo === "email" && asunto.trim() ? { asunto: asunto.trim() } : {}),
        }),
      });
      const data = await res.json() as {
        ok?: boolean;
        resultado?: ResultadoAnalisis;
        interaccion_id?: string;
        error?: string;
      };

      if (!res.ok || !data.resultado) {
        throw new Error(data.error ?? "Error al analizar");
      }

      onResultado(data.resultado, empresa.id, data.interaccion_id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAnalizando(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Selector de empresa */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Empresa
        </p>
        <EmpresaSelector
          empresas={empresas}
          onSeleccionar={setEmpresa}
          onContactoSeleccionado={handleContacto}
        />
      </div>

      {/* Campo asunto (solo email) */}
      {tipo === "email" && conf.labelAsunto && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {conf.labelAsunto}
          </p>
          <input
            type="text"
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            placeholder="Asunto del correo..."
            className="w-full h-12 px-4 rounded-xl border border-input bg-background text-sm
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </div>
      )}

      {/* Textarea principal */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          {conf.labelTexto}
        </p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={conf.placeholder}
          rows={8}
          className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm
            focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
            transition-colors resize-none leading-relaxed"
        />
        {texto.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1 text-right">
            {texto.length.toLocaleString("es-CL")} caracteres
          </p>
        )}
      </div>

      {/* Botón de análisis */}
      <Button
        size="lg"
        className="w-full gap-2 h-14 text-base rounded-2xl"
        onClick={handleAnalizar}
        disabled={!puedeAnalizar}
      >
        {analizando ? (
          <>
            <span className="animate-spin">⚡</span>
            Analizando...
          </>
        ) : (
          <>
            <span>⚡</span>
            {conf.labelBoton}
          </>
        )}
      </Button>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">{error}</p>
          <button
            className="text-xs text-destructive/70 hover:text-destructive mt-1 underline"
            onClick={handleAnalizar}
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
