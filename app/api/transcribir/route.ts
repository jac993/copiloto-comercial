// =============================================================
// POST /api/transcribir
// Convierte CUALQUIER formato de audio a MP3 con ffmpeg antes de
// enviarlo a Whisper — resuelve el 400 con .mp4 de WhatsApp y
// cualquier otro formato raro.
// Flujo: recibe archivo → guarda en /tmp → convierte a mp3 →
//        envía a Whisper → sube original a Supabase → limpia /tmp
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import * as fs from "fs";
import * as path from "path";

export const maxDuration = 300;

// Todos los formatos que acepta el pipeline (ffmpeg los convierte todos)
const EXTENSIONES_PERMITIDAS = [
  "mp3", "mp4", "m4a", "wav", "mpeg", "mpga", "oga", "ogg", "flac", "webm",
];

// Configura el path del binario de ffmpeg
if (ffmpegPath) Ffmpeg.setFfmpegPath(ffmpegPath);

// Convuelve la conversión de fluent-ffmpeg en una Promise
function convertirAMp3(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Ffmpeg(inputPath)
      .noVideo()                  // -vn: ignorar pista de video
      .audioCodec("libmp3lame")   // -acodec mp3
      .audioFrequency(16000)      // -ar 16000: sample rate óptimo para Whisper
      .audioChannels(1)           // -ac 1: mono
      .audioBitrate("64k")        // -ab 64k: bitrate suficiente para voz
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .run();
  });
}

export async function POST(req: NextRequest) {
  const timestamp = Date.now();
  const inputPath  = path.join("/tmp", `input_${timestamp}`);
  const outputPath = path.join("/tmp", `output_${timestamp}.mp3`);

  try {
    // ── Verificar API keys ──────────────────────────────────────
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

    // ── Leer archivo del request ────────────────────────────────
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

    // ── Guardar en /tmp con extensión original ──────────────────
    const inputPathConExt = `${inputPath}.${ext}`;
    fs.writeFileSync(inputPathConExt, buffer);

    console.log("[transcribir] Archivo guardado en /tmp:", {
      nombre: file.name,
      ext,
      tamaño_bytes: buffer.length,
    });

    // ── Convertir a MP3 con ffmpeg ──────────────────────────────
    await convertirAMp3(inputPathConExt, outputPath);

    const mp3Buffer = fs.readFileSync(outputPath);

    console.log("[transcribir] Convertido a MP3:", {
      tamaño_mp3_bytes: mp3Buffer.length,
    });

    // ── Enviar MP3 a Whisper ────────────────────────────────────
    const whisperForm = new FormData();
    const mp3Blob = new Blob([mp3Buffer], { type: "audio/mpeg" });
    whisperForm.append("file", mp3Blob, "audio.mp3");
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "es");
    whisperForm.append("response_format", "text");

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

    // ── Subir archivo ORIGINAL a Supabase Storage ───────────────
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const nombreSeguro = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathStorage  = `${timestamp}_${nombreSeguro}`;
    const mimeOriginal = ext === "mp4" || ext === "m4a" ? "audio/mp4" : "audio/mpeg";

    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from("Llamadas")
      .upload(pathStorage, buffer, { contentType: mimeOriginal, upsert: false });

    if (storageError) {
      // El audio ya está transcrito — solo loguear, no bloquear
      console.error("[transcribir] Error al subir a Storage (no crítico):", storageError.message);
    }

    return NextResponse.json({
      ok: true,
      transcripcion,
      audio_url: storageData?.path ?? null,
    });

  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[transcribir] Error general:", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  } finally {
    // Limpiar archivos temporales — best-effort, no bloquea la respuesta
    try {
      for (const f of fs.readdirSync("/tmp")) {
        if (f.startsWith(`input_${timestamp}`) || f.startsWith(`output_${timestamp}`)) {
          fs.unlinkSync(path.join("/tmp", f));
        }
      }
    } catch { /* ignorar errores de limpieza */ }
  }
}
