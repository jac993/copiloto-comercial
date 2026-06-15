"use client";

// Componente cliente principal de /llamadas.
// Gestiona qué panel está activo y el ciclo completo:
// selección de acción → formulario → resultado del análisis.

import { useState } from "react";
import { Phone, Mail, Briefcase, MessageCircle, PhoneOff } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { UploadLlamada } from "./upload-llamada";
import { PanelTexto } from "./panel-texto";
import { SinRespuesta } from "./sin-respuesta";
import { ResultadoAnalisisView } from "./resultado-analisis";
import type { Empresa, ResultadoAnalisis } from "@/lib/types";

type Accion = "llamada" | "email" | "linkedin" | "whatsapp" | "sin_respuesta";

interface Resultado {
  data: ResultadoAnalisis;
  empresaId: string;
  interaccionId: string;
}

const ACCIONES: { id: Accion; emoji: string; label: string; sublabel: string }[] = [
  { id: "llamada",       emoji: "📞", label: "Subir llamada",      sublabel: "Audio MP3/M4A/WAV" },
  { id: "email",         emoji: "📧", label: "Registrar correo",   sublabel: "Pega el email" },
  { id: "linkedin",      emoji: "💼", label: "Registrar LinkedIn", sublabel: "Pega el hilo" },
  { id: "whatsapp",      emoji: "💬", label: "Registrar WhatsApp", sublabel: "Pega la conversación" },
  { id: "sin_respuesta", emoji: "⏰", label: "Sin respuesta",      sublabel: "Sin créditos IA" },
];

interface LlamadasClientProps {
  empresas: Empresa[];
}

export function LlamadasClient({ empresas }: LlamadasClientProps) {
  const [accion, setAccion] = useState<Accion | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  function handleResultado(data: ResultadoAnalisis, empresaId: string, interaccionId: string) {
    setResultado({ data, empresaId, interaccionId });
  }

  function volver() {
    setAccion(null);
    setResultado(null);
  }

  // Pantalla de resultado (post-análisis)
  if (resultado) {
    return (
      <div className="flex flex-col min-h-screen">
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex h-16 items-center justify-between px-5">
            <h1 className="text-lg font-semibold">Resultado</h1>
            <ThemeToggle />
          </div>
        </header>
        <div className="flex-1 px-4 py-5">
          <ResultadoAnalisisView
            resultado={resultado.data}
            empresaId={resultado.empresaId}
            interaccionId={resultado.interaccionId}
            onNuevaInteraccion={volver}
          />
        </div>
      </div>
    );
  }

  // Panel activo (formulario de la acción seleccionada)
  if (accion) {
    const accionConf = ACCIONES.find((a) => a.id === accion)!;
    return (
      <div className="flex flex-col min-h-screen">
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex h-16 items-center gap-3 px-5">
            <button
              onClick={volver}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Volver
            </button>
            <h1 className="text-base font-semibold">
              {accionConf.emoji} {accionConf.label}
            </h1>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
        </header>
        <div className="flex-1 px-4 py-5">
          {accion === "llamada" && (
            <UploadLlamada empresas={empresas} onResultado={handleResultado} />
          )}
          {(accion === "email" || accion === "linkedin" || accion === "whatsapp") && (
            <PanelTexto tipo={accion} empresas={empresas} onResultado={handleResultado} />
          )}
          {accion === "sin_respuesta" && (
            <SinRespuesta empresas={empresas} onRegistrado={volver} />
          )}
        </div>
      </div>
    );
  }

  // Pantalla principal — menú de 5 acciones
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-1.5">
            <h1 className="text-lg font-semibold">Interacciones</h1>
            <HelpTooltip
              titulo="¿Para qué sirve esta sección?"
              explicacion="Aquí registras todas tus interacciones comerciales para que la IA las analice y te dé coaching. Puedes subir llamadas grabadas o pegar conversaciones de correo, WhatsApp y LinkedIn."
              ejemplo={"Después de cada llamada importante, grábala con tu celular y súbela aquí. La IA te dirá qué hiciste bien y qué mejorar."}
            />
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 px-4 py-6 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-4">
          ¿Qué quieres registrar?
        </p>

        {ACCIONES.map(({ id, emoji, label, sublabel }) => (
          <button
            key={id}
            onClick={() => setAccion(id)}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all
              hover:border-primary/40 hover:shadow-sm active:scale-[0.98] text-left
              ${id === "sin_respuesta"
                ? "border-border bg-muted/30"
                : "border-border bg-card hover:bg-primary/5"
              }`}
          >
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 text-xl
              ${id === "sin_respuesta" ? "bg-muted" : "bg-primary/10"}`}>
              {emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">{label}</p>
                {id !== "sin_respuesta" && (
                  <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400
                    px-1.5 py-0.5 rounded-full font-medium">
                    ⚡ usa IA
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
            </div>
            <IconAccion id={id} />
          </button>
        ))}

        {/* Ayuda contextual "Sin respuesta" */}
        <div className="flex items-center gap-1.5 px-1 -mt-1">
          <p className="text-xs text-muted-foreground">¿Para qué registrar sin respuesta?</p>
          <HelpTooltip
            titulo="¿Para qué registrar sin respuesta?"
            explicacion="Cuando mandas un mensaje y no te responden, regístralo aquí. La app crea un recordatorio automático en 5 días hábiles para hacer seguimiento."
            ejemplo={"Le escribiste a Juan por LinkedIn el lunes y no respondió. Registras 'sin respuesta' y el viernes te aparece en la pantalla Hoy: 'Hacer seguimiento a Juan de Coexpan'."}
          />
        </div>

        {/* Explicación breve */}
        <div className="pt-4 pb-2">
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            La IA analiza cada interacción con el contexto completo de la empresa
            y te entrega resumen, coaching y un borrador de respuesta listo para enviar.
          </p>
        </div>
      </div>
    </div>
  );
}

function IconAccion({ id }: { id: Accion }) {
  const cls = "h-5 w-5 text-muted-foreground";
  switch (id) {
    case "llamada":       return <Phone className={cls} />;
    case "email":         return <Mail className={cls} />;
    case "linkedin":      return <Briefcase className={cls} />;
    case "whatsapp":      return <MessageCircle className={cls} />;
    case "sin_respuesta": return <PhoneOff className={cls} />;
  }
}
