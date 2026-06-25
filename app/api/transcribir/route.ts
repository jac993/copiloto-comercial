// =============================================================
// POST /api/transcribir
// Recibe el storagePath de un audio ya subido a Supabase Storage,
// genera una signed URL y la pasa a AssemblyAI para transcripción.
// El audio NUNCA pasa por Vercel — el cliente lo sube directo a Storage.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AssemblyAI } from "assemblyai";
import { registrarUso } from "@/lib/registrarUso";

export const maxDuration = 300;

const EXTENSIONES_PERMITIDAS = [
  "mp3", "mp4", "m4a", "wav", "mpeg", "mpga", "oga", "ogg", "flac", "webm",
];

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY no está configurada en .env.local" },
        { status: 500 }
      );
    }
    if (!process.env.ASSEMBLYAI_API_KEY) {
      return NextResponse.json(
        { error: "ASSEMBLYAI_API_KEY no está configurada en .env.local" },
        { status: 500 }
      );
    }

    const { storagePath } = await req.json() as { storagePath?: string };

    if (!storagePath) {
      return NextResponse.json({ error: "storagePath requerido" }, { status: 400 });
    }
    console.log('[TRANSCRIBIR] storagePath recibido:', storagePath)

    // Validar extensión desde el nombre del archivo en el path
    const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
    if (!EXTENSIONES_PERMITIDAS.includes(ext)) {
      return NextResponse.json(
        { error: `Formato no soportado: .${ext}. Usa MP3, M4A, MP4, WAV, OGG, FLAC o WEBM.` },
        { status: 400 }
      );
    }

    // ── Generar signed URL (1 hora) para que AssemblyAI descargue el audio ──
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from("Llamadas")
      .createSignedUrl(storagePath, 3600);

    console.log('[TRANSCRIBIR] signedUrl generada:', signedData?.signedUrl?.substring(0, 80))
    if (signedError || !signedData?.signedUrl) {
      console.error("[transcribir] Error generando signed URL:", signedError?.message);
      return NextResponse.json(
        { error: `Error generando URL de acceso al audio: ${signedError?.message ?? "sin respuesta"}` },
        { status: 500 }
      );
    }

    // ── Transcribir con AssemblyAI usando la URL firmada ───────────
    const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });

    console.log("[transcribir] Enviando a AssemblyAI:", {
      ext,
      storagePath,
    });

    console.log('[ASSEMBLYAI] Iniciando transcripción:', {
      url: signedData.signedUrl.substring(0, 100),
      modelo: 'universal-2',
      timestamp: new Date().toISOString()
    })
    const transcript = await Promise.race([
      client.transcripts.transcribe({
        audio: signedData.signedUrl,
        language_code: "es",
        speech_models: ["universal-2"],
        punctuate: true,
        format_text: true,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AssemblyAI timeout: transcripción tardó más de 4 minutos")), 270000)
      )
    ]);

    if (transcript.status === "error") {
      console.error("[transcribir] AssemblyAI error:", transcript.error);
      throw new Error(`AssemblyAI: ${transcript.error ?? "Error desconocido"}`);
    }

    const transcripcion = transcript.text ?? "";
    // audio_duration es en ms → convertir a segundos
    const audioSegundos = transcript.audio_duration ? transcript.audio_duration / 1000 : undefined;
    registrarUso({ api: "assemblyai", endpoint: "transcribe", audio_seconds: audioSegundos });

    console.log("[transcribir] Transcripción completada:", {
      palabras: transcript.words?.length ?? 0,
      duración_ms: transcript.audio_duration,
    });

    return NextResponse.json({
      ok: true,
      transcripcion,
      audio_url: storagePath,
    });

  } catch (err) {
    console.error('[TRANSCRIBIR_ERROR]', err)
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[transcribir] Error general:", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
