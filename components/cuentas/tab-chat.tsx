"use client";

// =============================================================
// Tab "Consultar IA" — chat contextual por empresa.
// El historial vive solo en memoria de sesión (no se persiste).
// El vendedor puede preguntar cualquier cosa sobre la cuenta
// y recibir respuestas específicas basadas en el contexto real.
// =============================================================

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Send, Trash2, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Mensaje {
  rol: "user" | "ia";
  texto: string;
}

interface TabChatProps {
  empresaId: string;
  empresaNombre: string;
}

const PREGUNTAS_RAPIDAS = [
  "¿Cuál es mi mejor ángulo de entrada ahora?",
  "¿Vale la pena seguir con esta cuenta?",
  "¿Cómo manejo la objeción de precio?",
  "¿Qué haría diferente en la próxima llamada?",
];

export function TabChat({ empresaId, empresaNombre }: TabChatProps) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll al fondo cuando llega un mensaje nuevo
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, cargando]);

  const enviar = async (texto?: string) => {
    const msgTexto = (texto ?? input).trim();
    if (!msgTexto || cargando) return;

    const mensajeUsuario: Mensaje = { rol: "user", texto: msgTexto };
    const nuevosMensajes = [...mensajes, mensajeUsuario];
    setMensajes(nuevosMensajes);
    setInput("");
    setCargando(true);

    try {
      const res = await fetch(`/api/empresas/${empresaId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensaje: msgTexto,
          historial: mensajes, // historial previo (sin el mensaje actual)
        }),
      });

      if (!res.ok) throw new Error("Error al consultar la IA");
      const data = (await res.json()) as { respuesta: string };
      setMensajes([...nuevosMensajes, { rol: "ia", texto: data.respuesta }]);
    } catch {
      setMensajes([
        ...nuevosMensajes,
        { rol: "ia", texto: "Hubo un error al consultar la IA. Intenta de nuevo." },
      ]);
    } finally {
      setCargando(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  const limpiar = () => {
    setMensajes([]);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[400px] pb-4">
      {/* Barra superior con botón limpiar */}
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-xs text-muted-foreground">
          Contexto completo de{" "}
          <span className="font-medium text-foreground">{empresaNombre}</span>{" "}
          cargado
        </p>
        {mensajes.length > 0 && (
          <button
            onClick={limpiar}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            Limpiar
          </button>
        )}
      </div>

      {/* Área de mensajes */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {mensajes.length === 0 && (
          <EstadoVacio
            empresaNombre={empresaNombre}
            onPregunta={(p) => enviar(p)}
          />
        )}

        {mensajes.map((msg, i) => (
          <BurbujaMensaje key={i} mensaje={msg} />
        ))}

        {/* Skeleton mientras carga */}
        {cargando && (
          <div className="flex items-start gap-2.5">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-1.5 flex-1 max-w-[80%]">
              <div className="h-3.5 bg-muted rounded-full animate-pulse w-3/4" />
              <div className="h-3.5 bg-muted rounded-full animate-pulse w-1/2" />
              <div className="h-3.5 bg-muted rounded-full animate-pulse w-2/3" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2 items-end border border-border rounded-2xl p-2 bg-background focus-within:border-primary transition-colors">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Pregúntame algo sobre ${empresaNombre}...`}
          rows={1}
          disabled={cargando}
          className={cn(
            "flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground",
            "focus:outline-none leading-relaxed max-h-32 overflow-y-auto py-1 px-2",
            "disabled:opacity-50"
          )}
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <Button
          size="sm"
          onClick={() => enviar()}
          disabled={!input.trim() || cargando}
          className="rounded-xl h-8 w-8 p-0 shrink-0"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground text-center mt-1.5">
        Enter para enviar · Shift+Enter para nueva línea
      </p>
    </div>
  );
}

// ── Burbuja de mensaje ───────────────────────────────────────

function BurbujaMensaje({ mensaje }: { mensaje: Mensaje }) {
  const esUsuario = mensaje.rol === "user";

  return (
    <div className={cn("flex items-start gap-2.5", esUsuario && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
          esUsuario ? "bg-primary/15" : "bg-muted"
        )}
      >
        {esUsuario ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Burbuja */}
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
          esUsuario
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm"
        )}
      >
        {mensaje.texto}
      </div>
    </div>
  );
}

// ── Estado vacío con preguntas rápidas ───────────────────────

function EstadoVacio({
  empresaNombre,
  onPregunta,
}: {
  empresaNombre: string;
  onPregunta: (p: string) => void;
}) {
  return (
    <div className="flex flex-col items-center py-6 gap-5">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Bot className="h-7 w-7 text-primary" />
      </div>
      <div className="text-center space-y-1 px-4">
        <p className="font-semibold text-sm">Consulta sobre {empresaNombre}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Tengo el contexto completo de esta cuenta. Pregúntame lo que necesites.
        </p>
      </div>

      {/* Preguntas rápidas */}
      <div className="w-full space-y-2 px-1">
        <p className="text-xs font-medium text-muted-foreground px-1">Preguntas frecuentes:</p>
        {PREGUNTAS_RAPIDAS.map((p) => (
          <button
            key={p}
            onClick={() => onPregunta(p)}
            className="w-full text-left text-xs px-3.5 py-2.5 rounded-xl border border-border
              hover:border-primary/40 hover:bg-primary/5 transition-all active:scale-[0.98]"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
