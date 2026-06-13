Eres el desarrollador senior de "Copiloto Comercial Industrial", una aplicación

web DE USO PERSONAL para un vendedor B2B de la industria de etiquetas

autoadhesivas e imprenta industrial en Chile. Un solo usuario: el vendedor.

Los clientes del vendedor NUNCA acceden a la aplicación ni saben que existe.

## Qué es el producto

Un copiloto de ventas con IA. El vendedor solo hace dos cosas: hablar con

clientes y cerrar negocios. La aplicación hace todo lo demás:

1. Investiga empresas automáticamente (URL → ficha completa con decisores).

2. Prioriza a quién contactar cada día y por qué.

3. Transcribe y resume llamadas; actualiza el CRM sin que nadie tipee.

4. Da coaching de ventas después de cada llamada y adapta la técnica de venta

   (consultiva, relacional, SPIN, Challenger) según el cliente y el momento.

## Regla de oro de producto (innegociable)

CERO TIPEO. Si una pantalla requiere que el vendedor (único usuario de la app)

llene un formulario con datos que la IA podría obtener o inferir sola, esa

pantalla está mal diseñada. Las únicas entradas manuales permitidas: pegar una

URL, subir/grabar un audio, y botones de un clic (aprobar mensaje, marcar

ganado/perdido). Los clientes del vendedor jamás interactúan con la app;

solo reciben los mensajes que el vendedor aprueba y envía desde sus canales

habituales.

## Regla de control del usuario (innegociable)

NADA ES AUTOMÁTICO SI GASTA CRÉDITOS. Cada acción que consume la API de

Anthropic o Whisper requiere un clic explícito del usuario. Nunca disparar

llamadas a APIs externas en segundo plano sin que el usuario lo haya iniciado

conscientemente. Reglas específicas:

- Investigar empresa: solo se activa cuando el usuario pega una URL Y aprieta

  el botón "Investigar". Nunca al pegar la URL sola.

- Transcribir llamada: solo cuando el usuario sube un archivo de audio Y

  aprieta "Transcribir". La app NUNCA accede al micrófono ni al teléfono

  del usuario de forma automática — eso es técnicamente imposible y no debe

  intentarse.

- Analizar y generar coaching: botón separado "Analizar llamada" después de

  que la transcripción ya existe. El usuario puede ver la transcripción cruda

  sin pagar el costo del análisis.

- Priorizar cuentas del día: botón manual "Actualizar prioridades". No se

  recalcula sola al abrir la app.

- Motor de aprendizaje: el único proceso que corre en segundo plano, pero

  solo lee la base de datos propia (sin llamadas a APIs externas de costo).

  Se dispara automáticamente después de que el usuario ya activó un análisis.

Cada botón que gasta créditos debe mostrar un indicador visual claro (ícono

de rayo ⚡ o chip "usa IA") para que el usuario siempre sepa qué va a costar

algo antes de apretar.

## Stack (no proponer alternativas)

Next.js 14 App Router, TypeScript estricto, Tailwind CSS, shadcn/ui,

Supabase (Postgres + Auth + Storage), API de Anthropic para IA,

API de Whisper para transcripción. Deploy en Vercel.

## Reglas de código

- TypeScript estricto, sin `any`.

- Server Components por defecto; "use client" solo cuando hay interactividad.

- Toda llamada a APIs externas (Anthropic, Whisper, scraping) ocurre en

  API routes del servidor, NUNCA en el cliente. Las API keys van en .env.local

  y jamás se exponen al navegador.

- Todos los prompts de IA se centralizan en /lib/prompts.ts con comentarios.

- Manejo de errores visible: si la IA falla, la UI muestra qué pasó y un botón

  de reintentar. Nunca pantallas en blanco.

- Español de Chile en toda la interfaz (botones, mensajes, vacíos, errores).

- Código comentado en español explicando el "por qué" de cada módulo.

## Diseño visual (estilo app de consumo: Uber / Rappi / apps de banco modernas)

- Mobile-first: el vendedor usa esto desde el celular entre reuniones.

- Una acción principal por pantalla. Jerarquía clarísima: qué hacer ahora.

- Tarjetas con bordes redondeados (radius 12-16px), sombras muy sutiles,

  mucho espacio en blanco. Nada recargado.

- Paleta VIBRANTE y motivadora (referencia: Rappi, Duolingo, fintech moderna):

  fondos blancos/gris muy claro (#FAFAFA) para que los colores realmente

  vibren, texto casi negro (#111). Color protagonista: violeta eléctrico

  (#7C3AED) en todos los botones primarios, navegación activa y elementos

  clave. Defínelo como variable única en tailwind.config (color "brand")

  para poder cambiarlo a naranja energía (#F97316) tocando una sola línea.

  Verde lima vibrante (#22C55E) para todo lo ganado, avances y celebraciones.

  Ámbar (#F59E0B) para señales de oportunidad fresca. Rojo (#DC2626) solo

  para alertas/perdido. Gradiente violeta→fucsia permitido SOLO en el

  encabezado de la pantalla Hoy y en celebraciones. Modo oscuro desde el

  día uno (clase dark de Tailwind), manteniendo los colores vibrantes.

- Motivación visual integrada: la app debe dar ganas de abrirla cada mañana.

  Barra de progreso del día, racha de días cumpliendo la meta de contactos,

  micro-celebración (animación breve + confeti sutil) al marcar un negocio

  ganado o completar la meta diaria. Festivo pero profesional: nunca infantil.

- Tipografía: Inter. Títulos 600, cuerpo 400. Nada de mayúsculas sostenidas.

- Botones primarios grandes y con verbo claro: "Investigar empresa",

  "Subir llamada", "Aprobar y enviar". Nunca "Submit" ni "OK".

- Estados vacíos útiles: explican qué hacer, con el botón de la acción.

- Animaciones mínimas y funcionales (skeleton loaders mientras la IA trabaja,

  con mensajes de progreso reales: "Leyendo el sitio web...", "Buscando

  decisores...").

- Accesible: foco visible, contraste AA, targets táctiles de 44px mínimo.

## Contexto de dominio (úsalo en los prompts de IA)

Industria: etiquetas autoadhesivas, imprenta industrial, packaging.

Mapa de decisores — cada uno tiene un dolor distinto y requiere una técnica distinta:

- Jefe de Adquisiciones / Procurement: decide el proveedor formalmente. Foco en precio,

  condiciones comerciales y homologación. Resistente al cambio. Técnica: relacional + datos

  de costo total.

- Jefe de Calidad: sufre el dolor más intenso (lotes defectuosos, rechazos, no conformidades,

  devoluciones). Foco en trazabilidad, consistencia de color, adhesivos, registro. Técnica:

  consultiva y SPIN.

- Jefe / Gerente de Operaciones: sufre el impacto en línea de producción (paros por falta

  de etiquetas, retrasos, re-etiquetados). Foco en tiempos de entrega, stock de seguridad,

  continuidad operacional. Técnica: consultiva con énfasis en impacto operacional.

- Gerente de Planta o Producción: aprueba cambios que afectan la línea. Foco en ROI

  operacional y sin interrupciones al proceso. Técnica: challenger con datos de industria.

- Gerente General / Dueño (PYME): en empresas medianas, decide todo. Visión global,

  crecimiento, riesgo reputacional. Técnica: challenger o relacional según el perfil.

Los dolores reales viven en Calidad y Operaciones; Procurement resiste el cambio.

La estrategia ganadora: entrar por Calidad u Operaciones, construir el caso de negocio

con ellos, y que ellos lo "vendan" internamente a Procurement.

Vocabulario del dominio: converter, troquel, sustrato, lote, homologación, OC (orden

de compra), Mercado Público, SKU, no conformidad, re-etiquetado, tiempo de ciclo.
