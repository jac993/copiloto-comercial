# Vercel Deployment Protection

Poner la app detrás de la autenticación de Vercel. Nadie sin tu sesión de
Vercel puede abrir la URL, ni la app ni sus rutas `/api`.

Para esta app —un solo usuario, sin login propio— **este es el perímetro de
seguridad principal**. El Bearer token de `middleware.ts` es una segunda
capa que solo cubre clientes servidor-a-servidor, porque el navegador no
puede guardar un secreto.

Es configuración en la UI de Vercel. No requiere tocar código.

---

## 1. Habilitar la protección

1. Entra a [vercel.com/dashboard](https://vercel.com/dashboard) y abre el
   proyecto **copiloto-comercial**.
2. **Settings** (barra superior) → **Deployment Protection** (menú lateral).
3. Busca **Vercel Authentication** y ponlo en **Enabled**.
4. En el selector de alcance elige **All Deployments**.
   - *Standard Protection* deja el dominio de producción abierto y solo
     protege las preview. Para esta app no sirve: producción es justamente
     lo que contiene tu CRM.
5. **Save**.

Desde ahora, abrir la URL sin sesión de Vercel devuelve una pantalla de
login en vez de la app.

> **Plan requerido:** proteger *All Deployments* está disponible en Hobby.
> Si el panel te ofrece solo *Standard Protection* en gris, tu plan no lo
> cubre y tendrás que apoyarte en el Bearer token del Paso 2 más una
> rotación de claves.

---

## 2. Generar un token de bypass

El token sirve para que un cliente automatizado (un cron, un script tuyo,
un webhook) entre sin pasar por el login.

**No lo necesitas para usar la app desde tu navegador.** Si solo la abres tú
a mano, salta al punto 4 y déjalo sin crear: un token menos es una
superficie menos.

1. En la misma pantalla **Deployment Protection**, baja hasta
   **Protection Bypass for Automation**.
2. Clic en **Add Secret**. Vercel genera un valor de 32 caracteres.
3. Cópialo ahora: **no se vuelve a mostrar**.
4. **Save**.

---

## 3. Dónde guardarlo en tu máquina

En `.env.local`, que ya está en `.gitignore` (línea `.env*.local`):

```bash
VERCEL_AUTOMATION_BYPASS_SECRET=el_valor_que_copiaste
```

Reglas:

- **Nunca** en `.env.local.example` — ese sí se commitea.
- **Nunca** en `.claude/settings.local.json`. Ese archivo ya te filtró la
  `service_role` de Supabase a 256 commits (ver
  `GIT_CLEANUP_INSTRUCTIONS.md`).
- Si lo quieres fuera del proyecto, el gestor de contraseñas del sistema es
  mejor que un archivo suelto.

Para verificar que no se escapó:

```bash
git check-ignore -v .env.local
```

Si imprime la regla que lo ignora, está a salvo. Si no imprime nada, el
archivo **no** está ignorado: no commitees hasta arreglarlo.

---

## 4. Probar que funciona

### 4.1 La protección bloquea

Desde una terminal, sin cookies de Vercel:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://TU-APP.vercel.app/api/metricas/hoy
```

- **401** o **403** → correcto, está protegido.
- **200** → **no** está protegido. Revisa que el alcance sea *All
  Deployments* y que el deploy que estás probando sea posterior al cambio.

La forma más limpia de confirmarlo en el navegador es una ventana de
incógnito: debe aparecer el login de Vercel, no tu app.

### 4.2 El bypass pasa

Solo si creaste el token en el paso 2:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "x-vercel-protection-bypass: TU_TOKEN" \
  https://TU-APP.vercel.app/api/metricas/hoy
```

Debe dar **200**.

> Si además activaste `API_SECRET_KEY` (Paso 2), esta request necesita
> *también* el header `Authorization: Bearer <API_SECRET_KEY>`. Son dos
> capas independientes y se acumulan.

### 4.3 Que tu navegador siga entrando

Abre la app logueado en Vercel con la misma cuenta dueña del proyecto.
Debe cargar normal. Si te pide login en loop, estás con otra cuenta.

---

## Qué NO resuelve esto

Deployment Protection controla **quién llega a la app**. No cambia nada de
lo que ya se filtró.

La `service_role` de Supabase que está en el historial de git sigue siendo
válida y da control total de la base **saltándose RLS**, sin pasar por
Vercel. Protegerla con esto es cerrar la puerta dejando la llave afuera:
hay que **rotarla**. Ver `GIT_CLEANUP_INSTRUCTIONS.md`, sección 1.
