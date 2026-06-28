"use client";

// =============================================================
// Tab "Consultar IA" — chat contextual persistente por empresa.
// El historial se guarda en la tabla chat_empresa y se recupera
// al abrir el tab. Limpiar borra el historial del servidor.
// =============================================================

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { Send, Trash2, Bot, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatEmpresa } from "@/lib/types";
import ReactMarkdown from "react-markdown";

interface TabChatProps {
  empresaId: string;
  empresaNombre: string;
}

const PREGUNTAS_RAPIDAS = [
  "🎯 Prepararme para visita",
  "¿Cuál es mi mejor ángulo de entrada ahora?",
  "¿Vale la pena seguir con esta cuenta?",
  "¿Cómo manejo la objeción de precio?",
  "¿Qué haría diferente en la próxima llamada?",
];

const PREGUNTA_MENSAJE: Record<string, string> = {
  "🎯 Prepararme para visita":
    "Voy a visitar esta empresa. Dame un briefing completo con: (1) lo que sé de ellos, (2) los gaps de información que tengo, (3) 3 preguntas SPIN concretas para esta visita basadas en su situación real, y (4) qué criterios MEDDIC me faltan cubrir.",
};

function fechaHora(isoStr: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoStr));
}

export function TabChat({ empresaId, empresaNombre }: TabChatProps) {
  const [historial, setHistorial] = useState<ChatEmpresa[]>([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [limpiando, setLimpiando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Cargar historial persistido al montar el tab
  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch(`/api/empresas/${empresaId}/chat`);
        if (res.ok) {
          const data = await res.json() as { historial: ChatEmpresa[] };
          setHistorial(data.historial);
        }
      } finally {
        setCargandoHistorial(false);
      }
    }
    cargar();
  }, [empresaId]);

  // Scroll al fondo cuando llegan mensajes nuevos
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [historial, cargando]);

  const enviar = async (texto?: string) => {
    const msgTexto = (texto ?? input).trim();
    if (!msgTexto || cargando) return;

    setInput("");
    setCargando(true);

    // Mensaje optimista temporal para UX inmediata
    const tempId = `temp-${Date.now()}`;
    const mensajeTemp: ChatEmpresa = {
      id: tempId,
      empresa_id: empresaId,
      pregunta: msgTexto,
      respuesta: "",
      creado_en: new Date().toISOString(),
    };
    setHistorial((prev) => [...prev, mensajeTemp]);

    try {
      const res = await fetch(`/api/empresas/${empresaId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: msgTexto }),
      });

      if (!res.ok) throw new Error("Error al consultar la IA");
      const data = await res.json() as { respuesta: string };

      // Reemplazar el temp con la respuesta real
      setHistorial((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, respuesta: data.respuesta } : m
        )
      );
    } catch {
      setHistorial((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, respuesta: "Hubo un error. Intenta de nuevo." }
            : m
        )
      );
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

  const limpiar = async () => {
    if (!confirm("¿Borrar todo el historial de esta cuenta?")) return;
    setLimpiando(true);
    try {
      await fetch(`/api/empresas/${empresaId}/chat`, { method: "DELETE" });
      setHistorial([]);
    } finally {
      setLimpiando(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[400px] pb-4">
      {/* Barra superior */}
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-xs text-muted-foreground">
          Contexto de{" "}
          <span className="font-medium text-foreground">{empresaNombre}</span>{" "}
          cargado · historial guardado
        </p>
        {historial.length > 0 && (
          <button
            onClick={limpiar}
            disabled={limpiando}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
          >
            {limpiando ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Limpiar
          </button>
        )}
      </div>

      {/* Área de mensajes */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {cargandoHistorial ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : historial.length === 0 ? (
          <EstadoVacio empresaNombre={empresaNombre} onPregunta={enviar} />
        ) : (
          historial.map((item) => (
            <ParMensajes key={item.id} item={item} cargando={!item.respuesta && cargando} />
          ))
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
          placeholder={`Pregúntame sobre ${empresaNombre}...`}
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
          {cargando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground text-center mt-1.5">
        Enter para enviar · Shift+Enter para nueva línea
      </p>
    </div>
  );
}

// ── Par pregunta / respuesta ─────────────────────────────────

function ParMensajes({
  item,
  cargando,
}: {
  item: ChatEmpresa;
  cargando: boolean;
}) {
  return (
    <div className="space-y-2">
      {/* Pregunta del vendedor */}
      <div className="flex items-start gap-2.5 flex-row-reverse">
        <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <User className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="max-w-[82%]">
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm leading-relaxed">
            {item.pregunta}
          </div>
          <p className="text-[10px] text-muted-foreground text-right mt-0.5 pr-1">
            {fechaHora(item.creado_en)}
          </p>
        </div>
      </div>

      {/* Respuesta de la IA */}
      <div className="flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="max-w-[82%]">
          {cargando || !item.respuesta ? (
            <div className="bg-muted rounded-2xl rounded-tl-sm px-3.5 py-3 space-y-1.5">
              <div className="h-3 bg-muted-foreground/20 rounded-full animate-pulse w-3/4" />
              <div className="h-3 bg-muted-foreground/20 rounded-full animate-pulse w-1/2" />
              <div className="h-3 bg-muted-foreground/20 rounded-full animate-pulse w-2/3" />
            </div>
          ) : (
            <div className="bg-muted text-foreground rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1">{children}</p>,
                  h2: ({ children }) => <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1">{children}</p>,
                  h3: ({ children }) => <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-2 mb-1">{children}</p>,
                  hr: () => null,
                  table: ({ children }) => <table className="text-xs w-full border-collapse my-2">{children}</table>,
                  th: ({ children }) => <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs font-semibold bg-gray-50 dark:bg-gray-800 text-left">{children}</th>,
                  td: ({ children }) => <td className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs">{children}</td>,
                  p: ({ children }) => <p className="my-1">{children}</p>,
                  ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
                  li: ({ children }) => <li className="text-sm">{children}</li>,
                }}
              >{item.respuesta}</ReactMarkdown>
            </div>
          )}
        </div>
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
          Tengo el contexto completo de esta cuenta. El historial queda guardado.
        </p>
      </div>
      <div className="w-full space-y-2 px-1">
        <p className="text-xs font-medium text-muted-foreground px-1">Preguntas frecuentes:</p>
        {PREGUNTAS_RAPIDAS.map((p) => (
          <button
            key={p}
            onClick={() => onPregunta(PREGUNTA_MENSAJE[p] ?? p)}
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
