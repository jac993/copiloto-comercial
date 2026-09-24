// =============================================================
// Helpers para la integración con Gmail via OAuth2.
// Usa fetch nativo — sin dependencia googleapis.
// =============================================================

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
// gmail.send permite enviar correos que el vendedor ya aprobó (modo copiloto).
// Ojo: los tokens emitidos antes de agregar este scope NO lo incluyen; hay que
// reconectar Gmail desde Configuración para que Google pida el permiso nuevo.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

// ── Tipos ─────────────────────────────────────────────────────

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface GmailMessageMeta {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

// ── OAuth2 ────────────────────────────────────────────────────

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/gmail/callback`,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/gmail/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error al intercambiar código OAuth: ${err}`);
  }
  return res.json() as Promise<GoogleTokens>;
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Error al refrescar token de Gmail");
  const data = await res.json() as { access_token: string; expires_in: number };
  return data;
}

// ── Gmail API ─────────────────────────────────────────────────

// Extrae el dominio de una URL de empresa
export function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    const hostname = new URL(normalized).hostname;
    return hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// Extrae el dominio de un header "From" de Gmail
// Ej: "Juan <juan@empresa.cl>" → "empresa.cl"
export function extractSenderDomain(from: string): string | null {
  const match = from.match(/@([^>"\s]+)/);
  if (!match) return null;
  // Ignorar dominios genéricos (Gmail, Outlook, etc.)
  const domain = match[1].toLowerCase();
  const ignorados = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "live.com"];
  return ignorados.includes(domain) ? null : domain;
}

// Busca mensajes recibidos en las últimas N horas
export async function getRecentMessages(
  accessToken: string,
  horasAtras = 48
): Promise<GmailMessageMeta[]> {
  const timestamp = Math.floor((Date.now() - horasAtras * 3600 * 1000) / 1000);
  const query = `after:${timestamp} in:inbox`;

  const listRes = await fetch(
    `${GMAIL_API_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!listRes.ok) throw new Error("Error al listar mensajes de Gmail");

  const listData = await listRes.json() as { messages?: Array<{ id: string; threadId: string }> };
  const messages = listData.messages ?? [];

  // Obtener metadata de cada mensaje en paralelo (máx 50 para no saturar)
  const batch = messages.slice(0, 50);
  const details = await Promise.allSettled(
    batch.map((m) => getMessageMeta(accessToken, m.id))
  );

  return details
    .filter((r): r is PromiseFulfilledResult<GmailMessageMeta> => r.status === "fulfilled")
    .map((r) => r.value);
}

async function getMessageMeta(
  accessToken: string,
  messageId: string
): Promise<GmailMessageMeta> {
  const res = await fetch(
    `${GMAIL_API_BASE}/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Error al obtener mensaje ${messageId}`);

  const data = await res.json() as {
    id: string;
    threadId: string;
    snippet: string;
    payload: { headers: Array<{ name: string; value: string }> };
  };

  const header = (name: string) =>
    data.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  return {
    id: data.id,
    threadId: data.threadId,
    from: header("From"),
    subject: header("Subject"),
    date: header("Date"),
    snippet: data.snippet ?? "",
  };
}

// Obtiene el email de la cuenta autenticada
export async function getAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch(`${GMAIL_API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "desconocido";
  const data = await res.json() as { emailAddress: string };
  return data.emailAddress;
}

// ── Envío de correos ──────────────────────────────────────────
// Solo se llama desde /api/gmail/send, después de que el vendedor aprobó el
// mensaje con un clic. Nunca se usa para envíos automáticos.

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  from?: string;
}

// Quita saltos de línea de valores que van en headers: sin esto, un asunto o
// destinatario con "\r\n" podría inyectar headers extra (Bcc, etc.).
function limpiarHeader(valor: string): string {
  return valor.replace(/[\r\n]+/g, " ").trim();
}

// RFC 2047: los headers MIME solo admiten ASCII; un asunto con tildes o ñ
// se codifica como =?UTF-8?B?...?= para que llegue legible.
function codificarHeader(valor: string): string {
  if (/^[\x20-\x7E]*$/.test(valor)) return valor;
  return `=?UTF-8?B?${Buffer.from(valor, "utf-8").toString("base64")}?=`;
}

// Construye el mensaje RFC 2822 y lo codifica en base64url (lo que exige el
// campo "raw" de la Gmail API). El cuerpo va en base64 para no depender de
// que el texto sea ASCII ni del largo de las líneas.
function construirMensajeRaw({ to, subject, body, from }: SendEmailParams): string {
  const cuerpoBase64 = Buffer.from(body, "utf-8")
    .toString("base64")
    .replace(/.{76}/g, "$&\r\n");
  const headers = [
    ...(from ? [`From: ${limpiarHeader(from)}`] : []),
    `To: ${limpiarHeader(to)}`,
    `Subject: ${codificarHeader(limpiarHeader(subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const mensaje = `${headers.join("\r\n")}\r\n\r\n${cuerpoBase64}`;
  return Buffer.from(mensaje, "utf-8").toString("base64url");
}

// Envía un correo desde la cuenta autenticada. Si viene threadId, Gmail lo
// agrupa en ese hilo (el asunto debe coincidir, p. ej. "Re: ...").
export async function sendEmail(
  accessToken: string,
  params: SendEmailParams
): Promise<{ messageId: string; threadId: string }> {
  if (!params.to.trim()) throw new Error("Falta el destinatario del correo");
  if (!params.subject.trim()) throw new Error("Falta el asunto del correo");

  const payload: { raw: string; threadId?: string } = { raw: construirMensajeRaw(params) };
  if (params.threadId) payload.threadId = params.threadId;

  const res = await fetch(`${GMAIL_API_BASE}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detalle = await res.text();
    // 403 con "insufficient" = el token es anterior al scope gmail.send.
    if (res.status === 403 && detalle.toLowerCase().includes("insufficient")) {
      throw new Error(
        "Gmail no tiene permiso para enviar correos. Reconecta Gmail desde Configuración para autorizar el envío."
      );
    }
    throw new Error(`Error al enviar correo por Gmail (${res.status}): ${detalle}`);
  }

  const data = await res.json() as { id: string; threadId: string };
  return { messageId: data.id, threadId: data.threadId };
}
