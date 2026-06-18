// =============================================================
// POST /api/transcribir
// Recibe archivo de audio, lo sube a Supabase Storage y lo
// transcribe con AssemblyAI (reemplaza Whisper).
// AssemblyAI acepta mp4/m4a de WhatsApp sin conversión.
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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Archivo de audio requerido" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EXTENSIONES_PERMITIDAS.includes(ext)) {
      return NextResponse.json(
        { error: `Formato no soportado: .${ext}. Usa MP3, M4A, MP4, WAV, OGG, FLAC o WEBM.` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // ── Subir a Supabase Storage ────────────────────────────────
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const timestamp = Date.now();
    const nombreSeguro = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathStorage = `${timestamp}_${nombreSeguro}`;

    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from("Llamadas")
      .upload(pathStorage, buffer, { contentType: "audio/mp4", upsert: false });

    if (storageError) {
      console.error("[transcribir] Error Storage (no crítico):", storageError.message);
    }

    // ── Transcribir con AssemblyAI ──────────────────────────────
    // AssemblyAI recibe el buffer directamente — no necesita URL pública
    const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });

    console.log("[transcribir] Enviando a AssemblyAI:", {
      ext,
      tamaño_bytes: buffer.length,
    });

    const transcript = await client.transcripts.transcribe({
      audio: buffer,
      language_code: "es",
    });

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
      audio_url: storageData?.path ?? null,
    });

  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[transcribir] Error general:", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
