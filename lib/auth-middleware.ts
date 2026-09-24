// =============================================================
// Validación de Bearer token para las rutas /api/**.
//
// Corre en el Edge Runtime (lo invoca middleware.ts), así que NO puede
// importar node:crypto. Por eso la comparación en tiempo constante está
// escrita a mano más abajo en vez de usar crypto.timingSafeEqual.
//
// OJO — límite real de este mecanismo: solo protege a quien PUEDE guardar
// un secreto, o sea otro servidor. El navegador no puede: cualquier clave
// que le pongas al frontend viaja en el bundle y queda a la vista. Para el
// tráfico que nace en el navegador el perímetro es Vercel Deployment
// Protection (ver DEPLOYMENT_PROTECTION_SETUP.md), no este token.
// =============================================================

import { NextResponse, type NextRequest } from "next/server";

// Rutas que NO pueden llevar Authorization porque las llama un tercero.
// Google redirige el navegador del usuario a la callback de OAuth: no hay
// forma de inyectarle un header. Exigirlo acá rompe el login de Gmail de
// forma permanente, sin mensaje de error entendible.
const RUTAS_PUBLICAS = ["/api/gmail/callback"];

export function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((ruta) => pathname.startsWith(ruta));
}

// Comparación en tiempo constante: recorre SIEMPRE el largo completo y
// acumula diferencias con XOR, en vez de cortar en el primer carácter
// distinto. Un === normal sale antes con claves que difieren al inicio, y
// esa diferencia de milisegundos permite adivinar el token carácter por
// carácter. Se comparan los largos aparte porque JS no deja evitar que el
// largo se filtre.
function comparaSegura(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// 401 sin pistas: no distingue "falta el header" de "el token está malo".
// Decirlo le confirmaría a quien sondea que el endpoint existe y que su
// formato de token es el correcto.
function noAutorizado(): NextResponse {
  return NextResponse.json(
    { error: "No autorizado" },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
  );
}

// Devuelve null si la request puede seguir; una respuesta 401 si no.
export function validarApiKey(request: NextRequest): NextResponse | null {
  const secreto = process.env.API_SECRET_KEY;

  // Sin API_SECRET_KEY configurada la validación queda inactiva y se deja
  // pasar. Es deliberado: fallar cerrado acá dejaría la app entera en 401
  // ante un deploy al que se le olvidó la variable, y como el frontend hace
  // 92 llamadas a /api desde el navegador, eso es una caída total. El
  // perímetro real de esta app es Deployment Protection; este token es una
  // segunda capa para clientes servidor-a-servidor.
  if (!secreto) return null;

  const header = request.headers.get("authorization");
  if (!header) return noAutorizado();

  // Se exige exactamente "Bearer <token>": el prefijo se compara sin
  // distinguir mayúsculas porque el RFC 7235 así lo define.
  const [esquema, token] = header.split(" ");
  if (!esquema || esquema.toLowerCase() !== "bearer" || !token) {
    return noAutorizado();
  }

  if (!comparaSegura(token, secreto)) return noAutorizado();

  return null;
}
