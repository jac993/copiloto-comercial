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

    // Construir FormData con Blob explícito para garantizar tipo audio/mp4.
    // Usar fetch directo en vez del SDK — evita que toFile reinterprete el tipo.
    const blob = new Blob([buffer], { type: mimeType });
    const whisperForm = new FormData();
    whisperForm.append("file", blob, ext === "mp4" ? "audio.m4a" : `audio.${ext}`);
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "es");
    whisperForm.append("response_format", "text");

    const nombreWhisper = ext === "mp4" ? "audio.m4a" : `audio.${ext}`;
    console.log("[transcribir] Enviando a Whisper:", {
      nombre: nombreWhisper,
      tipo: mimeType,
      tamaño_bytes: buffer.length,
      ext_original: ext,
    });

    const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
      body: whisperForm,
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error("[transcribir] Whisper error completo:", {
        status: whisperResponse.status,
        statusText: whisperResponse.statusText,
        body: errorText,
      });
      throw new Error(`Whisper ${whisperResponse.status}: ${errorText}`);
    }

    const transcripcion = await whisperResponse.text();

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
