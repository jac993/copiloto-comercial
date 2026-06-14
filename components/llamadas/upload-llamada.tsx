"use client";

// Panel para subir y transcribir una llamada de audio.
// Flujo: seleccionar archivo → elegir empresa → "⚡ Transcribir y analizar"
// El archivo se envía al servidor (límite recomendado ~25 MB en MP3/M4A).

import { useState, useRef } from "react";
import { Mic, Upload, FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmpresaSelector } from "./empresa-selector";
import type { Empresa, Contacto, ResultadoAnalisis } from "@/lib/types";

type Etapa =
  | "subiendo"
  | "transcribiendo"
  | "analizando"
  | "listo";

const ETAPA_LABEL: Record<Etapa, string> = {
  subiendo:      "Subiendo audio...",
  transcribiendo:"Transcribiendo con Whisper...",
  analizando:    "Analizando con IA...",
  listo:         "¡Listo!",
};

interface UploadLlamadaProps {
  empresas: Empresa[];
  onResultado: (resultado: ResultadoAnalisis, empresaId: string, interaccionId: string) => void;
}

export function UploadLlamada({ empresas, onResultado }: UploadLlamadaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [contactoId, setContactoId] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<Etapa | null>(null);
  const [error, setError] = useState<string | null>(null);

  const procesando = etapa !== null && etapa !== "listo";

  function handleArchivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setArchivo(f);
    setError(null);
  }

  function handleContacto(c: Contacto | null) {
    setContactoId(c?.id ?? null);
  }

  async function handleAnalizar() {
    if (!archivo || !empresa) return;
    setError(null);

    try {
      // 1. Subir y transcribir
      setEtapa("subiendo");
      const formData = new FormData();
      formData.append("file", archivo);

      const resTranscribir = await fetch("/api/transcribir", {
        method: "POST",
        body: formData,
      });
      const dataTranscribir = await resTranscribir.json() as {
        ok?: boolean;
        transcripcion?: string;
        audio_url?: string;
        error?: string;
      };

      if (!resTranscribir.ok || !dataTranscribir.transcripcion) {
        throw new Error(dataTranscribir.error ?? "Error al transcribir");
      }

      setEtapa("transcribiendo");
      // Breve pausa visual para que el usuario vea el cambio de estado
      await new Promise((r) => setTimeout(r, 400));

      // 2. Analizar con IA
      setEtapa("analizando");
      const resAnalizar = await fetch("/api/analizar-interaccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresa.id,
          contacto_id: contactoId ?? undefined,
          tipo: "llamada",
          texto: dataTranscribir.transcripcion,
          audio_url: dataTranscribir.audio_url,
        }),
      });
      const dataAnalizar = await resAnalizar.json() as {
        ok?: boolean;
        resultado?: ResultadoAnalisis;
        interaccion_id?: string;
        error?: string;
      };

      if (!resAnalizar.ok || !dataAnalizar.resultado) {
        throw new Error(dataAnalizar.error ?? "Error al analizar");
      }

      setEtapa("listo");
      onResultado(dataAnalizar.resultado, empresa.id, dataAnalizar.interaccion_id ?? "");

    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setEtapa(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Zona de archivo */}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.m4a,.wav,.mp4"
          className="hidden"
          onChange={handleArchivoChange}
        />
        {!archivo ? (
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center gap-3
              hover:border-primary/50 hover:bg-primary/5 transition-colors"
          >
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Upload className="h-7 w-7 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm">Selecciona el audio</p>
              <p className="text-xs text-muted-foreground mt-0.5">MP3, M4A, WAV o MP4 · máx ~25 MB</p>
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-muted/30">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <FileAudio className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{archivo.name}</p>
              <p className="text-xs text-muted-foreground">
                {(archivo.size / 1_048_576).toFixed(1)} MB
              </p>
            </div>
            <button
              onClick={() => { setArchivo(null); if (inputRef.current) inputRef.current.value = ""; }}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Cambiar
            </button>
          </div>
        )}
      </div>

      {/* Selector de empresa */}
      {archivo && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            ¿Con qué empresa fue esta llamada?
          </p>
          <EmpresaSelector
            empresas={empresas}
            onSeleccionar={setEmpresa}
            onContactoSeleccionado={handleContacto}
          />
        </div>
      )}

      {/* Progreso o botón */}
      {etapa && etapa !== "listo" ? (
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-3">
            <Mic className="h-5 w-5 text-primary animate-pulse shrink-0" />
            <p className="text-sm font-medium text-primary">{ETAPA_LABEL[etapa]}</p>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700"
              style={{
                width: etapa === "subiendo" ? "30%" : etapa === "transcribiendo" ? "60%" : "85%",
              }}
            />
          </div>
        </div>
      ) : (
        archivo && empresa && (
          <Button
            size="lg"
            className="w-full gap-2 h-14 text-base rounded-2xl"
            onClick={handleAnalizar}
            disabled={procesando}
          >
            <span>⚡</span>
            Transcribir y analizar
          </Button>
        )
      )}

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
