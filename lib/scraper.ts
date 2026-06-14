// =============================================================
// Scraper web — recolecta texto del sitio de una empresa
// Con Vercel Pro (300s) podemos ser más exhaustivos.
// Solo se usa en API routes (servidor). Nunca en el cliente.
// =============================================================

const FETCH_TIMEOUT_MS = 7_000;
const SCRAPE_TIMEOUT_MS = 40_000; // hard cap 40s → deja ~55s para Claude
const MAX_CHARS_TOTAL = 18_000;

const SUBPATHS = [
  "/nosotros", "/quienes-somos", "/about", "/about-us", "/empresa",
  "/productos", "/servicios", "/products", "/services",
  "/clientes", "/portfolio", "/historia",
];

export function normalizarUrl(url: string): string {
  const trimmed = url.trim().replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function domainToName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    return "";
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
      },
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("html")) return "";

    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extraerNombreEmpresa(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].split(/[-|–]/)[0].trim();
  }
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  return "";
}

async function buscarNoticias(query: string): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  if (!html) return "";

  const snippets: string[] = [];
  const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = snippetRegex.exec(html)) !== null) {
    const text = stripHtml(match[1]);
    if (text.length > 20) snippets.push(text);
    if (snippets.length >= 5) break;
  }

  return snippets.join(" ");
}

export async function scrapeEmpresa(
  url: string,
  onProgress: (msg: string) => void
): Promise<{ texto: string; nombreDetectado: string }> {
  const baseUrl = normalizarUrl(url);

  const resultado = await Promise.race([
    scraperInterno(baseUrl, onProgress),
    new Promise<{ texto: string; nombreDetectado: string }>((resolve) =>
      setTimeout(
        () => resolve({ texto: `Sitio web: ${baseUrl}`, nombreDetectado: domainToName(baseUrl) }),
        SCRAPE_TIMEOUT_MS
      )
    ),
  ]);

  return resultado;
}

async function scraperInterno(
  baseUrl: string,
  onProgress: (msg: string) => void
): Promise<{ texto: string; nombreDetectado: string }> {
  const partes: string[] = [];
  let nombreDetectado = "";

  // PASO 1: Página principal
  onProgress("Leyendo el sitio web...");
  const mainHtml = await fetchHtml(baseUrl);

  if (mainHtml) {
    partes.push(stripHtml(mainHtml));
    nombreDetectado = extraerNombreEmpresa(mainHtml) || domainToName(baseUrl);
  } else {
    nombreDetectado = domainToName(baseUrl);
    partes.push(`Sitio web: ${baseUrl}`);
  }

  // PASO 2: 3 subpáginas en paralelo
  onProgress("Explorando páginas internas...");
  const subResultados = await Promise.allSettled(
    SUBPATHS.slice(0, 3).map((path) => fetchHtml(baseUrl + path))
  );

  for (const r of subResultados) {
    if (r.status === "fulfilled" && r.value) {
      partes.push(stripHtml(r.value));
    }
  }

  // PASO 3: Noticias y ejecutivos via DuckDuckGo
  onProgress("Buscando noticias y ejecutivos...");
  try {
    const snippets = await buscarNoticias(`${nombreDetectado} Chile`);
    if (snippets) partes.push(`NOTICIAS ENCONTRADAS:\n${snippets}`);
  } catch {
    // Opcional — si falla no interrumpe
  }

  const textoCompleto = partes.join("\n\n");
  return {
    texto: textoCompleto.slice(0, MAX_CHARS_TOTAL),
    nombreDetectado,
  };
}
