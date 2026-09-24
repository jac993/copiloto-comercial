import { NextRequest } from "next/server";
import { validarApiKey, esRutaPublica } from "./lib/auth-middleware";

const SECRETO = "clave-de-prueba-123";

function req(auth?: string): NextRequest {
  const h = new Headers();
  if (auth) h.set("authorization", auth);
  return new NextRequest("https://x.test/api/metricas/hoy", { headers: h });
}
// Cada caso setea su propio estado de env JUSTO antes de correr.
function conEnv(valor: string | undefined, fn: () => boolean): boolean {
  if (valor === undefined) delete process.env.API_SECRET_KEY;
  else process.env.API_SECRET_KEY = valor;
  return fn();
}

const casos: [string, () => boolean][] = [
  ["sin env var -> pasa (inactivo)", () => conEnv(undefined, () => validarApiKey(req()) === null)],
  ["sin env var + header basura -> pasa", () => conEnv(undefined, () => validarApiKey(req("Bearer x")) === null)],
  ["sin header -> 401", () => conEnv(SECRETO, () => validarApiKey(req())?.status === 401)],
  ["token incorrecto -> 401", () => conEnv(SECRETO, () => validarApiKey(req("Bearer malo"))?.status === 401)],
  ["esquema incorrecto -> 401", () => conEnv(SECRETO, () => validarApiKey(req(`Basic ${SECRETO}`))?.status === 401)],
  ["sin esquema -> 401", () => conEnv(SECRETO, () => validarApiKey(req(SECRETO))?.status === 401)],
  ["token correcto -> pasa", () => conEnv(SECRETO, () => validarApiKey(req(`Bearer ${SECRETO}`)) === null)],
  ["bearer minuscula -> pasa", () => conEnv(SECRETO, () => validarApiKey(req(`bearer ${SECRETO}`)) === null)],
  ["prefijo del token -> 401", () => conEnv(SECRETO, () => validarApiKey(req("Bearer clave-de-prueba-12"))?.status === 401)],
  ["token + extra -> 401", () => conEnv(SECRETO, () => validarApiKey(req(`Bearer ${SECRETO}x`))?.status === 401)],
  ["header WWW-Authenticate en 401", () => conEnv(SECRETO, () => validarApiKey(req())?.headers.get("WWW-Authenticate") === "Bearer")],
  ["gmail/callback es publica", () => esRutaPublica("/api/gmail/callback")],
  ["metricas NO es publica", () => !esRutaPublica("/api/metricas/hoy")],
];

let fallos = 0;
for (const [nombre, fn] of casos) {
  let ok = false;
  try { ok = fn(); } catch { ok = false; }
  if (!ok) fallos++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}`);
}
console.log(`\n${casos.length - fallos}/${casos.length} pasaron`);
process.exit(fallos > 0 ? 1 : 0);
