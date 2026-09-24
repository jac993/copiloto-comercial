# Auditoría de seguridad — Copiloto Comercial Industrial

**Repositorio:** [jac993/copiloto-comercial](https://github.com/jac993/copiloto-comercial) (público en GitHub)
**Fecha:** 2026-09-16
**Alcance:** revisión de solo lectura del código fuente, historial de git e infraestructura declarada (Supabase, Vercel). No se modificó ningún archivo.
**Metodología:** grep de secretos y patrones sensibles, revisión de `git log`/`git show` en commits que mencionan "key/secret/password", lectura de las 44 API routes en `app/api/**`, esquema SQL de Supabase, configuración de `.gitignore`, `middleware.ts`, clientes de Supabase (browser/server), y `npm audit`.

---

## Resumen ejecutivo

La aplicación fue diseñada explícitamente (ver `CLAUDE.md` y `supabase/schema.sql`) como una app de un solo usuario, sin login, con RLS deshabilitado y con la key `service_role` de Supabase usada en casi todas las API routes. Esa es una decisión de producto razonable **solo si el despliegue está protegido de otra forma** (por ejemplo, con Vercel Deployment Protection o una capa de auth). Hoy no existe ninguna de esas protecciones, así que el diseño "un solo usuario" no se está cumpliendo en la práctica: **cualquier persona en internet que descubra la URL de Vercel puede leer y escribir todo el CRM** (empresas, contactos, transcripciones de llamadas, notas comerciales) y **disparar llamadas pagadas** a Anthropic, Perplexity, AssemblyAI/Whisper sin restricción.

A esto se suma un hallazgo histórico ya remediado a medias: una key `service_role` real quedó expuesta en texto plano en 3 commits de `origin/main` (repo público) dentro de `.claude/settings.local.json`. Fue rotada, por lo que la key concreta ya no sirve, pero el valor sigue siendo visible para siempre en el historial de un repositorio público, y el problema de fondo (permitir que un archivo de configuración de Claude Code termine con secretos, y no reescribir el historial tras el incidente) no está resuelto.

| Severidad | Cantidad |
|---|---|
| 🔴 CRÍTICO | 3 |
| 🟠 ALTO | 4 |
| 🟡 MEDIO | 5 |
| 🟢 BAJO | 4 |

Las tres prioridades inmediatas, en orden:
1. Activar **Vercel Deployment Protection** (o alguna capa de auth) — sin esto, todos los demás hallazgos son explotables por cualquier desconocido.
2. Revisar si además de rotar la `service_role` key, conviene **reescribir el historial de git** (BFG/`git filter-repo`) para que la key expuesta ya no sea legible en `origin/main`, dado que el repo es público.
3. Confirmar que las tablas con datos sensibles (`integraciones`, con tokens OAuth de Gmail en texto plano) no queden expuestas si en algún momento se reintroduce el uso de la key pública (`anon`/`publishable`) para leerlas directamente vía REST de Supabase.

---

## 1. Secretos expuestos

### 🔴 CRÍTICO — `service_role` key de Supabase expuesta en git history (repo público)
- **Ubicación:** commits `03bbcc2`, `3102048`, `d7ff832` en `.claude/settings.local.json` (permiso de Bash con un `curl` que incluye la key completa como header `apikey`/`Authorization`). Estos commits están en `origin/main`, y el repositorio es **público**.
- **Detalle:** la key JWT `service_role` (`...4TDa_ZUR`) para el proyecto Supabase `bxevihqkutmsxicfbjod` quedó registrada en texto plano. Fue rotada el 20-ago-2026 (documentado en `ESTADO_SESION.md:845-869`), por lo que el valor concreto ya **no es válido**. `.claude/settings.local.json` está en `.gitignore` desde el commit `a8dae31`, así que no puede volver a filtrarse por este mecanismo.
- **Riesgo residual:** el valor sigue siendo legible por cualquiera en `github.com/jac993/copiloto-comercial` (historial completo, no solo HEAD). Aunque hoy no es explotable (key revocada), es una mala práctica dejarlo así: da pistas del proyecto Supabase, entrena a un atacante sobre patrones de configuración, y si alguna vez se "revierte" una rotación por error, el riesgo reaparece.
- **Recomendación:** reescribir el historial (`git filter-repo` o BFG Repo-Cleaner) para eliminar esas 3 revisiones del contenido sensible, forzar push, y coordinar con cualquier colaborador para que re-clone. Alternativamente, si reescribir el historial es muy costoso, al menos documentar el riesgo aceptado explícitamente.

### 🟠 ALTO — Tokens OAuth de Gmail almacenados en texto plano en Supabase
- **Ubicación:** [app/api/gmail/callback/route.ts:37-44](app/api/gmail/callback/route.ts:37)
- **Detalle:** `access_token` y `refresh_token` de la cuenta Gmail del vendedor se guardan sin cifrar en la tabla `integraciones`. Con RLS deshabilitado en todo el esquema (ver hallazgo #6.1) y sin capa de auth en la app, cualquier consulta directa a la REST API de Supabase con la key pública podría alcanzar esa tabla si en algún momento se usa esa key para leerla (hoy el código solo la lee server-side con `service_role`, pero no hay ninguna barrera de RLS que lo impida a nivel de base de datos).
- **Riesgo:** un refresh_token de Gmail filtrado da acceso persistente al correo del vendedor (lectura de correspondencia con clientes, posible suplantación si el scope incluye envío).
- **Recomendación:** cifrar `access_token`/`refresh_token` en reposo (o usar Supabase Vault / `pgsodium`), y en cualquier caso habilitar RLS en `integraciones` con una política que niegue todo acceso salvo `service_role`.

### 🟢 BAJO — Ningún secreto real trackeado en el working tree actual
- Se confirmó que `.env.local` (con valores reales) **no** está trackeado y nunca apareció en el historial (`git log --all --diff-filter=A --name-only` solo muestra `.env.local.example`).
- `.env.local.example` correctamente usa placeholders (`sk-ant-api03-...`, `eyJhbGci...`) y no contiene secretos reales.
- No se encontraron API keys, contraseñas ni tokens hardcodeados en `app/`, `lib/`, `components/`, `hooks/`, `scripts/` (búsqueda por patrones `sk-ant-`, `sk-proj-`, `sb_publishable_`, `sb_secret_`, JWT `eyJhbGci`).

---

## 2. Variables de entorno

| Variable | En `.env.local.example` | Usada en código | En `.gitignore` |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | ✅ (vía `.env*.local`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | ✅ | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | ✅ |
| `ANTHROPIC_API_KEY` | ✅ | ✅ | ✅ |
| `OPENAI_API_KEY` | ✅ (documentada) | ❌ (no se usa en el código actual) | ✅ |
| `ASSEMBLYAI_API_KEY` | ❌ **falta** | ✅ ([app/api/transcribir/route.ts:27](app/api/transcribir/route.ts:27)) | ✅ |
| `PERPLEXITY_API_KEY` | ❌ **falta** | ✅ (`lib/scraper.ts`) | ✅ |
| `GOOGLE_CLIENT_ID` | ❌ **falta** | ✅ (`lib/gmail.ts`, `app/api/gmail/auth`) | ✅ |
| `GOOGLE_CLIENT_SECRET` | ❌ **falta** | ✅ (`lib/gmail.ts`) | ✅ |
| `NEXTAUTH_URL` | ❌ **falta** | ✅ (callbacks OAuth de Gmail) | ✅ |

### 🟡 MEDIO — `.env.local.example` desactualizado
- Documenta `OPENAI_API_KEY` (Whisper vía API de OpenAI), pero el código de transcripción real usa **AssemblyAI** (`ASSEMBLYAI_API_KEY`), no OpenAI. El proyecto migró de proveedor de transcripción y el ejemplo no se actualizó — esto es inconsistente con `CLAUDE.md`, que declara "API de Whisper" como stack fijo.
- Faltan por completo `ASSEMBLYAI_API_KEY`, `PERPLEXITY_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL` — cualquiera que clone el repo y siga el `.env.local.example` tendrá un deploy roto en investigación (Perplexity), transcripción y sync de Gmail sin ningún error claro hasta que falle en runtime.
- **Recomendación:** actualizar `.env.local.example` con todas las variables realmente consumidas (confirmado por grep de `process.env.*` en `app/`, `lib/`, `utils/`, `scripts/`).

### 🟢 BAJO — Todas las variables sensibles están correctamente en `.gitignore`
`.env*.local` cubre `.env.local`. No hay archivo `.env` (sin sufijo) en el repo que quedaría fuera de ese patrón.

---

## 3. Autenticación y autorización en API routes (`/app/api/**`)

### 🔴 CRÍTICO — Cero autenticación en las 44 API routes
- **Ubicación:** [middleware.ts](middleware.ts) — el middleware existe pero solo hace `return NextResponse.next()`, comentado explícitamente como "App de un solo usuario sin auth".
- Ninguna ruta bajo `app/api/**` valida sesión, header, cookie de auth ni ningún tipo de token. Rutas como `POST /api/investigar`, `POST /api/transcribir`, `POST /api/interacciones/crear`, `POST /api/rendimiento/evaluar` son alcanzables por cualquier request HTTP sin credenciales.
- **Impacto concreto:**
  - Lectura/escritura completa del CRM (datos de clientes reales del vendedor: empresas, contactos, transcripciones de llamadas, notas comerciales) por cualquier tercero que conozca o adivine la URL de producción.
  - Abuso de costos: cada llamada no autenticada a `/api/investigar`, `/api/transcribir`, `/api/rendimiento/evaluar`, etc. consume créditos reales de Anthropic/Perplexity/AssemblyAI. Esto contradice directamente la regla de producto "NADA ES AUTOMÁTICO SI GASTA CRÉDITOS" — la regla protege al usuario de sí mismo (evita clics accidentales) pero no protege contra un tercero que llame el endpoint directamente por HTTP.
- **Recomendación (la más urgente de todo el informe):** activar **Vercel Deployment Protection** (password o Vercel Authentication) a nivel de plataforma — es la opción de menor esfuerzo dado que es una app de un solo usuario sin necesidad de login propio. Alternativa: agregar un secreto compartido simple (header `x-app-secret` validado en middleware) si Deployment Protection no es viable con el flujo actual (ej. streaming SSE en `/api/investigar`).

### 🟠 ALTO — Sin rate limiting en ningún endpoint
- No existe ningún mecanismo de rate limiting (ni por IP, ni por sesión) en ninguna ruta. Combinado con la falta de auth, un script puede disparar `/api/investigar` en loop y agotar el budget de Anthropic/Perplexity en minutos, o saturar `/api/transcribir` (hasta 300s de `maxDuration` cada una).
- **Recomendación:** una vez resuelta la autenticación (hallazgo anterior), esto baja de severidad. Si se opta por no autenticar, es indispensable un rate limit (Vercel Edge Config / Upstash Ratelimit) como mínimo.

### 🟡 MEDIO — Validación de input inconsistente entre rutas
- Rutas como [app/api/investigar/route.ts:138](app/api/investigar/route.ts:138) validan que `url` no esté vacío, pero no validan formato de URL antes de pasarla a `scrapeEmpresa` (fetch a URL arbitraria — ver hallazgo SSRF más abajo).
- [app/api/transcribir/route.ts:36-48](app/api/transcribir/route.ts:36) valida `storagePath` solo por extensión de archivo, no por prefijo/propietario — cualquier ruta dentro del bucket `Llamadas` puede pedirse una signed URL para ella con solo conocer el path (baja explotabilidad práctica porque además no hay auth para llegar aquí de todas formas).
- La mayoría de las rutas hacen `await request.json()` con cast `as {...}` de TypeScript sin validación de runtime (sin Zod ni similar) — si el body no es JSON válido, la ruta puede lanzar una excepción no controlada antes de los `try/catch` internos.

### 🟡 MEDIO — SSRF potencial en el flujo de scraping
- **Ubicación:** `lib/scraper.ts` (`scrapeEmpresa`, `normalizarUrl`), invocado desde `/api/investigar` y `/api/investigar/regenerar`.
- El servidor hace `fetch()` a cualquier URL que el usuario pegue, sin lista de bloqueo de rangos privados/localhost/metadata (`169.254.169.254`, `localhost`, RFC1918). Es el comportamiento esperado del producto (investigar el sitio de un cliente), pero como no hay autenticación en el endpoint (hallazgo crítico #1), un tercero podría usar `/api/investigar` como un fetcher SSRF genérico contra la red interna de Vercel/Supabase.
- **Recomendación:** de baja prioridad si se resuelve la autenticación; si no, agregar validación de que el host resuelto no sea una IP privada/loopback/link-local antes de hacer el fetch.

### 🟢 BAJO — Manejo de errores es consistente con la regla del proyecto
- Todas las rutas revisadas devuelven `Response.json({ error: ... }, { status })` en vez de dejar excepciones sin capturar, cumpliendo la regla de "nunca pantallas en blanco" de `CLAUDE.md`.

---

## 4. Llamadas a servicios externos

### Supabase
- **Cliente browser** ([utils/supabase/client.ts](utils/supabase/client.ts)): usa `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (key `anon`, pensada para ser pública) — correcto en principio, pero ver hallazgo crítico #6.1 sobre RLS deshabilitado, que la vuelve equivalente a una key de administrador de facto para lectura/escritura de todas las tablas.
- **Cliente servidor** ([utils/supabase/server.ts](utils/supabase/server.ts)): también usa la key pública + cookies de sesión (aunque no hay sesión real, dado que no hay Supabase Auth en uso).
- **`service_role`** ([lib/queries.ts:16-25](lib/queries.ts:16)): se usa en 30+ API routes (grep completo en la sección 6) para bypassear RLS explícitamente. Está correctamente confinada al servidor (nunca en un archivo `"use client"` ni en variable `NEXT_PUBLIC_*`).

### Anthropic
- Key server-side únicamente (`ANTHROPIC_API_KEY`, sin prefijo `NEXT_PUBLIC_`), instanciada por request en cada ruta. No hay validación de tamaño de input antes de enviarlo al modelo (se trunca con `sanitizarTexto(texto, 15000)` en `/api/investigar`, lo cual es razonable para evitar prompts excesivos).

### Perplexity
- **Ubicación:** `lib/scraper.ts` (`buscarConPerplexity`). Envía nombre de dominio y datos que el vendedor ingresó (razón social, RUT, ciudad) a la API de Perplexity para enriquecer la búsqueda — es información de la empresa investigada (dato público/B2B), no de clientes finales del vendedor ni PII sensible de personas naturales.

### AssemblyAI (transcripción)
- **Ubicación:** [app/api/transcribir/route.ts](app/api/transcribir/route.ts). El audio nunca pasa por el servidor de Next.js: se sube directo del cliente a Supabase Storage y luego se genera una **signed URL de 1 hora** que se entrega a AssemblyAI para que la descargue. Diseño correcto — evita mover el archivo de audio dos veces y limita la ventana de exposición de la URL firmada.
- La transcripción (que puede contener datos de conversaciones con clientes) se guarda luego en Supabase sin cifrado adicional a nivel de aplicación — coherente con el resto del esquema (sin RLS), ver hallazgo #6.1.

---

## 5. Frontend

### 🟢 BAJO — Sin datos sensibles en `localStorage`/`sessionStorage`
- Uso encontrado: preferencia de vista Kanban/lista (`copiloto_vista`), fecha de último auto-cálculo de prioridades (`prioridades_auto_fecha`), y un borrador de formulario de caso pasado entre pantallas vía `sessionStorage` (`components/casos/casos-client.tsx`, `components/cuentas/vista-kanban.tsx`). Ninguno contiene tokens, keys ni PII de clientes.

### 🟡 MEDIO — XSS: renderizado de Markdown generado por IA
- La app usa `react-markdown` + `remark-gfm` para renderizar contenido generado por Claude (fichas de empresa, coaching, chat). `react-markdown` no ejecuta HTML embebido por defecto (a diferencia de `dangerouslySetInnerHTML` directo), lo cual mitiga XSS clásico, pero no se verificó si algún componente pasa `rehype-raw` o similar que permitiría HTML crudo. **No se encontró uso de `dangerouslySetInnerHTML` en el código revisado** — punto positivo. Se recomienda mantenerlo así y no agregar plugins que habiliten HTML crudo en el markdown de IA, dado que ese contenido depende de texto scrapeado de sitios web de terceros (superficie de inyección indirecta).

### 🟢 BAJO — CSRF
- Al no existir autenticación por cookie/sesión real (no hay Supabase Auth activo, no hay login), no hay un esquema de sesión que un atacante pueda "montar" vía CSRF clásico. El riesgo real no es CSRF sino la falta total de autenticación (ver hallazgo crítico #3.1) — una vez se agregue autenticación, habrá que revisar CSRF de nuevo según el mecanismo elegido.

### 🟡 MEDIO — Flujo OAuth de Gmail sin parámetro `state`
- **Ubicación:** [app/api/gmail/auth/route.ts](app/api/gmail/auth/route.ts) y [app/api/gmail/callback/route.ts](app/api/gmail/callback/route.ts).
- El flujo de autorización OAuth2 con Google no genera ni valida un parámetro `state`, que es la protección estándar contra CSRF en flujos OAuth (forzar que la víctima autorice una cuenta atacante). Dado que la app no tiene sesiones de usuario, el impacto práctico es limitado, pero sigue siendo una desviación de la práctica recomendada por Google/OAuth2 RFC 6749 §10.12.

---

## 6. Supabase — RLS y permisos

### 🔴 CRÍTICO — Row Level Security deshabilitado en todas las tablas
- **Ubicación:** [supabase/schema.sql](supabase/schema.sql) — línea 4: `-- RLS desactivado: app de uso personal, un solo usuario`, y explícitamente `alter table <tabla> disable row level security;` en: `empresas` (L54), `contactos` (L82), `interacciones` (L116), `senales` (L136), `aprendizajes` (L167), `patrones_conversion` (L188), `metricas_diarias` (L203), `contexto_exportable` (L221). Las migraciones posteriores (tabla `cadencias`, `integraciones`, `prioridades_diarias`, etc.) tampoco tienen políticas RLS.
- **Riesgo real:** la key `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (key `anon`) está, por diseño, embebida en el bundle de JavaScript que llega al navegador de **cualquier visitante** de la app. Con RLS deshabilitado, esa key por sí sola permite hacer `GET/POST/PATCH/DELETE` directo contra `https://bxevihqkutmsxicfbjod.supabase.co/rest/v1/<tabla>` para **todas** las tablas, sin pasar por ninguna API route de Next.js ni por el middleware. Esto es independiente del hallazgo de "cero auth en API routes": incluso si se arregla el middleware, este vector de acceso directo a Supabase REST seguiría abierto.
- **Recomendación:** habilitar RLS en todas las tablas y agregar una política mínima que niegue todo a `anon`/`authenticated` (deny-all), dejando que solo `service_role` (usada exclusivamente server-side) pueda operar. Esto no rompe el flujo actual porque el cliente browser (`utils/supabase/client.ts`) no parece usarse hoy para queries directas a tablas de negocio (a confirmar con búsqueda adicional si hay `createBrowserClient().from(...)` en componentes cliente).

### 🟠 ALTO — Uso extendido de `service_role` como patrón por defecto
- 30+ API routes usan `service_role` vía `getSupabase()` en `lib/queries.ts`. Es el patrón correcto **dado que RLS está deshabilitado y no hay Auth de Supabase activo** (no hay JWT de usuario que autenticar), pero perpetúa la dependencia total en "nadie más puede llegar a estas rutas" — que hoy es falso (hallazgo #3.1). Si se agrega autenticación de app en el futuro, este patrón debería revisarse para no seguir bypassando RLS innecesariamente.

### 🟡 MEDIO — Tabla `integraciones` sin ninguna restricción de acceso
- Ya cubierto en la sección 1 (tokens Gmail en texto plano). Se repite aquí porque es, en términos de RLS, la tabla de mayor impacto si se explota el hallazgo crítico de RLS deshabilitado: expone credenciales de una cuenta de correo real, no solo datos de negocio.

---

## 7. Dependencias (`npm audit`)

`npm audit --omit=dev` reporta **3 vulnerabilidades (2 altas, 1 crítica)**, todas por versión desactualizada de `next` (14.2.35):

| Paquete | Severidad | Resumen |
|---|---|---|
| `next` 14.2.35 | 🔴 Crítica | Rango vulnerable incluye, entre ~17 avisos: RCE no autenticado en Windows-hosted servers ([GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36)), RCE no autenticado en Image Optimization API con AVIF ([GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4)), SSRF en Server Actions y rewrites, DoS en Server Components, cache poisoning, exposición de endpoints internos de Server Functions. |
| `postcss` (transitivo vía `next`) | 🟠 Alta | XSS vía `</style>` sin escapar en el output; lectura arbitraria de archivos vía `sourceMappingURL` manipulado. |
| `nanoid` (transitivo) | 🟠 Alta | Generadores no seguros pueden loopear indefinidamente con `size` negativo o cero (DoS menor). |

- **Nota de contexto:** varios de esos CVEs de Next.js (RCE en Windows, Image Optimization) requieren configuraciones específicas (self-hosted en Windows, `next/image` con `remotePatterns`) que pueden no aplicar al despliegue en Vercel — Vercel gestiona su propio runtime y suele mitigar clases enteras de estos avisos a nivel de plataforma. Aun así, el fix es directo.
- **Recomendación:** actualizar a la última versión estable de Next.js 14.x que incluya los parches (`npm audit fix`, sin `--force` primero, para evitar el salto mayor a Next 16 que reporta el propio audit). Verificar breaking changes de App Router antes de saltar de versión mayor.

---

## 8. Git / Deployment

### `.gitignore`
- Cubre correctamente: `node_modules`, `.next`, `.env*.local`, `*.pem`, `.vercel`, `.claude/settings.local.json` (agregado tras el incidente de la key expuesta, commit `a8dae31`).
- No hay archivos de credenciales actualmente trackeados fuera de `.env.local.example` (con placeholders).

### Vercel
- No se encontró en el repo ninguna referencia a **Vercel Deployment Protection**, contraseña de preview, ni ningún mecanismo de gate de acceso a nivel de plataforma. Esto es consistente con el hallazgo crítico #3.1: nada, ni a nivel de Next.js ni a nivel de Vercel, impide que un tercero acceda a la app en producción.
- No fue posible verificar desde el repo si las env vars de Vercel están configuradas correctamente (eso vive en el dashboard de Vercel, fuera del alcance de una revisión de solo lectura del código). Se recomienda confirmar manualmente que ninguna de las keys reales quedó además pegada en algún comentario de un Pull Request o en logs de build públicos.

### Historial de commits
- Confirmado (sección 1): la única exposición real de secretos en el historial es la `service_role` key ya rotada, en 3 commits específicos. No se encontraron otros secretos (`ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`, `ASSEMBLYAI_API_KEY`, credenciales de Gmail OAuth) en ningún commit histórico buscado.
- El repositorio es **público** en GitHub (confirmado navegando a `github.com/jac993/copiloto-comercial`), lo que amplifica la severidad de cualquier secreto en el historial: es visible para cualquiera, no solo para colaboradores.

---

## Tabla consolidada de hallazgos

| # | Severidad | Hallazgo | Ubicación |
|---|---|---|---|
| 1 | 🔴 CRÍTICO | `service_role` key real expuesta en 3 commits de un repo público (ya rotada, pero sigue en el historial) | `.claude/settings.local.json` @ `03bbcc2`, `3102048`, `d7ff832` |
| 2 | 🔴 CRÍTICO | Cero autenticación en las 44 API routes — cualquiera en internet puede leer/escribir el CRM y gastar créditos de IA | `middleware.ts`, `app/api/**` |
| 3 | 🔴 CRÍTICO | RLS deshabilitado en todas las tablas — la key pública (`anon`) embebida en el navegador permite acceso REST directo a Supabase sin pasar por la app | `supabase/schema.sql` |
| 4 | 🟠 ALTO | Tokens OAuth de Gmail (access + refresh) guardados sin cifrar | `app/api/gmail/callback/route.ts` |
| 5 | 🟠 ALTO | Sin rate limiting en ningún endpoint | `app/api/**` |
| 6 | 🟠 ALTO | Uso generalizado de `service_role` como compensación de no tener RLS/Auth | `lib/queries.ts`, 30+ rutas |
| 7 | 🟠 ALTO (dependencias) | Next.js 14.2.35 con vulnerabilidad crítica (RCE) y varias altas sin parchear | `package.json` |
| 8 | 🟡 MEDIO | `.env.local.example` desactualizado (falta `ASSEMBLYAI_API_KEY`, `PERPLEXITY_API_KEY`, `GOOGLE_CLIENT_*`, `NEXTAUTH_URL`; sobra `OPENAI_API_KEY`) | `.env.local.example` |
| 9 | 🟡 MEDIO | Validación de input inconsistente (sin Zod, sin chequeo de propietario de `storagePath`) | varias rutas |
| 10 | 🟡 MEDIO | SSRF potencial en scraping de URL arbitraria sin bloqueo de rangos privados | `lib/scraper.ts` |
| 11 | 🟡 MEDIO | Markdown de IA renderizado sin verificación explícita de que no se habilite HTML crudo | componentes que usan `react-markdown` |
| 12 | 🟡 MEDIO | Flujo OAuth de Gmail sin parámetro `state` (protección CSRF estándar de OAuth2) | `app/api/gmail/auth`, `app/api/gmail/callback` |
| 13 | 🟢 BAJO | Ningún secreto real trackeado en el working tree ni en el resto del historial | — |
| 14 | 🟢 BAJO | Todas las variables sensibles cubiertas por `.gitignore` | `.gitignore` |
| 15 | 🟢 BAJO | Manejo de errores consistente (nunca pantallas en blanco) | `app/api/**` |
| 16 | 🟢 BAJO | Sin datos sensibles en `localStorage`/`sessionStorage` | frontend |

---

*Auditoría de solo lectura — no se realizó ningún cambio en el código ni en la infraestructura durante esta revisión.*
