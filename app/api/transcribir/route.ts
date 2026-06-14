// =============================================================
// POST /api/transcribir
// Recibe un archivo de audio como FormData, lo sube al bucket
// "Llamadas" en Supabase Storage y lo transcribe con Whisper.
// Requiere: SUPABASE_SERVICE_ROLE_KEY y OPENAI_API_KEY en .env.local
// Límite práctico: ~25 MB (MP3/M4A). WAV no recomendado por tamaño.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

// Todos los formatos que acepta Whisper
const EXTENSIONES_PERMITIDAS = ["mp3", "mp4", "m4a", "wav", "mpeg", "mpga", "oga", "ogg", "flac", "webm"];

// Siempre forzar tipos de audio — WhatsApp envía mp4 con tipo "video/mp4" que Whisper rechaza
const MIME_POR_EXT: Record<string, string> = {
  mp3:  "audio/mpeg",
  mpeg: "audio/mpeg",
  mpga: "audio/mpeg",
  mp4:  "audio/mp4",
  m4a:  "audio/mp4",
  wav:  "audio/wav",
  ogg:  "audio/ogg",
  oga:  "audio/ogg",
  flac: "audio/flac",
  webm: "audio/webm",
};

export async function POST(req: NextRequest) {
  try {
    // Verificar que las API keys estén configuradas
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY no está configurada en .env.local" },
        { status: 500 }
      );
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY no está configurada en .env.local" },
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
        { error: "Formato no soportado. Usa MP3, M4A, WAV o MP4." },
        { status: 400 }
      );
    }

    // Cliente admin con service role para el bucket privado
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Nombre único en Storage: timestamp + nombre sanitizado
    const timestamp = Date.now();
    const nombreSeguro = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathStorage = `${timestamp}_${nombreSeguro}`;

    // Para .mp4 forzar siempre audio/mp4 — WhatsApp entrega video/mp4 que Whisper rechaza
    const mimeType = ext === "mp4" ? "audio/mp4" : (MIME_POR_EXT[ext] ?? "audio/mpeg");

    // Subir al bucket "Llamadas" con el nombre original
    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from("Llamadas")
      .upload(pathStorage, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (storageError) {
      throw new Error(`Error al subir el audio: ${storageError.message}`);
    }

    // Transcribir con Whisper usando el buffer ya en memoria.
    // Los .mp4 de WhatsApp se renombran a .m4a — Whisper los acepta mejor
    // con esa extensión aunque el contenido sea idéntico.
    const nombreParaWhisper = ext === "mp4"
      ? pathStorage.replace(/\.mp4$/i, ".m4a")
      : pathStorage;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const audioFile = await toFile(buffer, nombreParaWhisper, { type: "audio/mp4" });

    // response_format "text" devuelve string directamente
    const transcripcionRaw = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "es",
      response_format: "text",
    });

    // El SDK tipifica esto como objeto pero con format "text" es un string
    const transcripcion = transcripcionRaw as unknown as string;

    return NextResponse.json({
      ok: true,
      transcripcion,
      audio_url: storageData.path, // path dentro del bucket, no URL completa
    });

  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
