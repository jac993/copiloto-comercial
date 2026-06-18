import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Precios por API (tokens en millones, audio en segundos)
const PRECIOS: Record<string, { input: number; output: number; audio?: number }> = {
  "claude-sonnet-4-6":       { input: 3,    output: 15  },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4   },
  "perplexity":              { input: 1,    output: 1   },
  "assemblyai":              { input: 0,    output: 0,  audio: 0.00011 },
  "whisper":                 { input: 0,    output: 0,  audio: 0.0001  },
};

function calcularCosto(
  api: string,
  endpoint: string | undefined,
  input_tokens: number | undefined,
  output_tokens: number | undefined,
  audio_seconds: number | undefined
): number {
  // Para Claude usamos el model name como clave; para el resto usamos api directamente
  const clave = api === "claude" ? (endpoint ?? "claude-sonnet-4-6") : api;
  const precio = PRECIOS[clave] ?? PRECIOS["claude-sonnet-4-6"];

  let costo = 0;
  if (input_tokens)   costo += (input_tokens  / 1_000_000) * precio.input;
  if (output_tokens)  costo += (output_tokens / 1_000_000) * precio.output;
  if (audio_seconds && precio.audio) costo += audio_seconds * precio.audio;
  return Math.round(costo * 1_000_000) / 1_000_000; // 6 decimales
}

export interface RegistroUsoParams {
  api: string;
  endpoint?: string;
  input_tokens?: number;
  output_tokens?: number;
  audio_seconds?: number;
  empresa_id?: string;
}

// Fire-and-forget — no bloquea el flujo principal. Llamar con void.
export function registrarUso(params: RegistroUsoParams): void {
  const costo_usd = calcularCosto(
    params.api,
    params.endpoint,
    params.input_tokens,
    params.output_tokens,
    params.audio_seconds
  );

  void getAdmin()
    .from("api_usage")
    .insert({
      api:           params.api,
      endpoint:      params.endpoint      ?? null,
      input_tokens:  params.input_tokens  ?? null,
      output_tokens: params.output_tokens ?? null,
      audio_seconds: params.audio_seconds ?? null,
      costo_usd,
      empresa_id:    params.empresa_id    ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[registrarUso] error:", error.message);
    });
}
