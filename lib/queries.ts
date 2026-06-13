// =============================================================
// Funciones de acceso a Supabase — todas las queries de la app
// pasan por aquí. Nunca escribir queries inline en componentes.
// Solo se usa en API routes (servidor); nunca en el cliente.
// =============================================================

import { createClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";

// Crea un cliente fresco en cada llamada para evitar que Next.js cachee los fetch internos de Supabase
function getSupabase() {
  noStore();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }) } }
  );
}
import type {
  Empresa,
  EmpresaInsert,
  EmpresaUpdate,
  EmpresaCompleta,
  FichaIA,
  Contacto,
  ContactoInsert,
  ContactoUpdate,
  Interaccion,
  InteraccionInsert,
  InteraccionUpdate,
  Senal,
  SenalInsert,
  Aprendizaje,
  AprendizajeInsert,
  AprendizajeUpdate,
  PatronConversion,
  PatronConversionInsert,
  MetricaDiaria,
  MetricaDiariaUpdate,
  ContextoExportable,
  ResumenContexto,
} from "@/lib/types";

// ─── EMPRESAS ────────────────────────────────────────────────

export async function getEmpresas(): Promise<Empresa[]> {
  const { data, error } = await getSupabase()
    .from("empresas")
    .select("*")
    .order("score_prioridad", { ascending: false });

  if (error) throw new Error(`getEmpresas: ${error.message}`);
  return data ?? [];
}

export async function getEmpresaById(id: string): Promise<Empresa | null> {
  const { data, error } = await getSupabase()
    .from("empresas")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(`getEmpresaById: ${error.message}`);
  return data;
}

// Ficha completa: empresa + contactos + señales + última interacción
export async function getEmpresaCompleta(id: string): Promise<EmpresaCompleta | null> {
  const [empresaResult, contactosResult, senalesResult, interaccionResult] =
    await Promise.all([
      getSupabase().from("empresas").select("*").eq("id", id).single(),
      getSupabase().from("contactos").select("*").eq("empresa_id", id).order("es_decisor", { ascending: false }),
      getSupabase().from("senales").select("*").eq("empresa_id", id).eq("usada", false).order("detectada_en", { ascending: false }),
      getSupabase().from("interacciones").select("*").eq("empresa_id", id).order("fecha", { ascending: false }).limit(1).maybeSingle(),
    ]);

  if (empresaResult.error) throw new Error(`getEmpresaCompleta: ${empresaResult.error.message}`);
  if (!empresaResult.data) return null;

  return {
    ...empresaResult.data,
    contactos: contactosResult.data ?? [],
    senales: senalesResult.data ?? [],
    ultima_interaccion: interaccionResult.data ?? null,
  };
}

export async function insertEmpresa(empresa: EmpresaInsert): Promise<Empresa> {
  const { data, error } = await getSupabase()
    .from("empresas")
    .insert(empresa)
    .select()
    .single();

  if (error) throw new Error(`insertEmpresa: ${error.message}`);
  return data;
}

export async function updateEmpresa(id: string, cambios: EmpresaUpdate): Promise<Empresa> {
  const { data, error } = await getSupabase()
    .from("empresas")
    .update(cambios)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateEmpresa: ${error.message}`);
  return data;
}

export async function deleteEmpresa(id: string): Promise<void> {
  const { error } = await getSupabase().from("empresas").delete().eq("id", id);
  if (error) throw new Error(`deleteEmpresa: ${error.message}`);
}

// Empresas ordenadas por score para la pantalla "Hoy"
export async function getEmpresasPriorizadas(limite = 10): Promise<Empresa[]> {
  const { data, error } = await getSupabase()
    .from("empresas")
    .select("*")
    .not("estado", "eq", "perdido")
    .not("estado", "eq", "cliente")
    .order("score_prioridad", { ascending: false })
    .limit(limite);

  if (error) throw new Error(`getEmpresasPriorizadas: ${error.message}`);
  return data ?? [];
}

// ─── CONTACTOS ───────────────────────────────────────────────

export async function getContactosPorEmpresa(empresaId: string): Promise<Contacto[]> {
  const { data, error } = await getSupabase()
    .from("contactos")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("es_decisor", { ascending: false });

  if (error) throw new Error(`getContactosPorEmpresa: ${error.message}`);
  return data ?? [];
}

export async function insertContacto(contacto: ContactoInsert): Promise<Contacto> {
  const { data, error } = await getSupabase()
    .from("contactos")
    .insert(contacto)
    .select()
    .single();

  if (error) throw new Error(`insertContacto: ${error.message}`);
  return data;
}

export async function updateContacto(id: string, cambios: ContactoUpdate): Promise<Contacto> {
  const { data, error } = await getSupabase()
    .from("contactos")
    .update(cambios)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateContacto: ${error.message}`);
  return data;
}

// ─── INTERACCIONES ───────────────────────────────────────────

export async function getInteraccionesPorEmpresa(empresaId: string): Promise<Interaccion[]> {
  const { data, error } = await getSupabase()
    .from("interacciones")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("fecha", { ascending: false });

  if (error) throw new Error(`getInteraccionesPorEmpresa: ${error.message}`);
  return data ?? [];
}

export async function getInteraccionById(id: string): Promise<Interaccion | null> {
  const { data, error } = await getSupabase()
    .from("interacciones")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(`getInteraccionById: ${error.message}`);
  return data;
}

export async function insertInteraccion(interaccion: InteraccionInsert): Promise<Interaccion> {
  const { data, error } = await getSupabase()
    .from("interacciones")
    .insert(interaccion)
    .select()
    .single();

  if (error) throw new Error(`insertInteraccion: ${error.message}`);
  return data;
}

export async function updateInteraccion(id: string, cambios: InteraccionUpdate): Promise<Interaccion> {
  const { data, error } = await getSupabase()
    .from("interacciones")
    .update(cambios)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateInteraccion: ${error.message}`);
  return data;
}

// Interacciones con próximo paso vencido o próximo — para alertas en "Hoy"
export async function getInteraccionesConProximoPaso(): Promise<Interaccion[]> {
  const en7dias = new Date();
  en7dias.setDate(en7dias.getDate() + 7);

  const { data, error } = await getSupabase()
    .from("interacciones")
    .select("*")
    .not("proximo_paso_fecha", "is", null)
    .lte("proximo_paso_fecha", en7dias.toISOString().split("T")[0])
    .order("proximo_paso_fecha", { ascending: true });

  if (error) throw new Error(`getInteraccionesConProximoPaso: ${error.message}`);
  return data ?? [];
}

// ─── SEÑALES ─────────────────────────────────────────────────

export async function getSenalesPorEmpresa(empresaId: string): Promise<Senal[]> {
  const { data, error } = await getSupabase()
    .from("senales")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("detectada_en", { ascending: false });

  if (error) throw new Error(`getSenalesPorEmpresa: ${error.message}`);
  return data ?? [];
}

export async function insertSenal(senal: SenalInsert): Promise<Senal> {
  const { data, error } = await getSupabase()
    .from("senales")
    .insert(senal)
    .select()
    .single();

  if (error) throw new Error(`insertSenal: ${error.message}`);
  return data;
}

export async function marcarSenalUsada(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("senales")
    .update({ usada: true })
    .eq("id", id);

  if (error) throw new Error(`marcarSenalUsada: ${error.message}`);
}

// ─── APRENDIZAJES ────────────────────────────────────────────

export async function getAprendizajesActivos(): Promise<Aprendizaje[]> {
  const { data, error } = await getSupabase()
    .from("aprendizajes")
    .select("*")
    .eq("activo", true)
    .order("veces_confirmado", { ascending: false });

  if (error) throw new Error(`getAprendizajesActivos: ${error.message}`);
  return data ?? [];
}

// Aprendizajes relevantes para un cargo específico — se inyectan en los prompts de IA
export async function getAprendizajesPorCargo(cargo: string): Promise<Aprendizaje[]> {
  const { data, error } = await getSupabase()
    .from("aprendizajes")
    .select("*")
    .eq("activo", true)
    .or(`cargo_contacto.eq.${cargo},cargo_contacto.is.null`)
    .order("veces_confirmado", { ascending: false })
    .limit(10);

  if (error) throw new Error(`getAprendizajesPorCargo: ${error.message}`);
  return data ?? [];
}

export async function insertAprendizaje(aprendizaje: AprendizajeInsert): Promise<Aprendizaje> {
  const { data, error } = await getSupabase()
    .from("aprendizajes")
    .insert(aprendizaje)
    .select()
    .single();

  if (error) throw new Error(`insertAprendizaje: ${error.message}`);
  return data;
}

export async function updateAprendizaje(id: string, cambios: AprendizajeUpdate): Promise<Aprendizaje> {
  const { data, error } = await getSupabase()
    .from("aprendizajes")
    .update(cambios)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateAprendizaje: ${error.message}`);
  return data;
}

// Incrementa el contador de confirmaciones cuando un nuevo caso valida el aprendizaje
export async function confirmarAprendizaje(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("confirmar_aprendizaje", { aprendizaje_id: id });
  if (error) {
    // Fallback manual si la RPC no existe aún
    const actual = await getSupabase().from("aprendizajes").select("veces_confirmado").eq("id", id).single();
    if (actual.data) {
      await getSupabase().from("aprendizajes").update({
        veces_confirmado: actual.data.veces_confirmado + 1,
      }).eq("id", id);
    }
  }
}

// ─── PATRONES DE CONVERSIÓN ──────────────────────────────────

export async function getPatronesConversion(): Promise<PatronConversion[]> {
  const { data, error } = await getSupabase()
    .from("patrones_conversion")
    .select("*")
    .order("tasa_conversion", { ascending: false });

  if (error) throw new Error(`getPatronesConversion: ${error.message}`);
  return data ?? [];
}

export async function upsertPatronConversion(patron: PatronConversionInsert): Promise<PatronConversion> {
  const { data, error } = await getSupabase()
    .from("patrones_conversion")
    .upsert(patron)
    .select()
    .single();

  if (error) throw new Error(`upsertPatronConversion: ${error.message}`);
  return data;
}

// ─── MÉTRICAS DIARIAS ────────────────────────────────────────

export async function getMetricaHoy(): Promise<MetricaDiaria | null> {
  const hoy = new Date().toISOString().split("T")[0];
  const { data, error } = await getSupabase()
    .from("metricas_diarias")
    .select("*")
    .eq("fecha", hoy)
    .maybeSingle();

  if (error) throw new Error(`getMetricaHoy: ${error.message}`);
  return data;
}

export async function getMetricasUltimos30Dias(): Promise<MetricaDiaria[]> {
  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 30);

  const { data, error } = await getSupabase()
    .from("metricas_diarias")
    .select("*")
    .gte("fecha", hace30.toISOString().split("T")[0])
    .order("fecha", { ascending: false });

  if (error) throw new Error(`getMetricasUltimos30Dias: ${error.message}`);
  return data ?? [];
}

// Crea la fila del día si no existe, o actualiza si ya existe
export async function upsertMetricaHoy(cambios: MetricaDiariaUpdate): Promise<MetricaDiaria> {
  const hoy = new Date().toISOString().split("T")[0];
  const { data, error } = await getSupabase()
    .from("metricas_diarias")
    .upsert({ fecha: hoy, ...cambios })
    .select()
    .single();

  if (error) throw new Error(`upsertMetricaHoy: ${error.message}`);
  return data;
}

// ─── CONTEXTO EXPORTABLE ─────────────────────────────────────

export async function getContextoExportable(): Promise<ContextoExportable | null> {
  const { data, error } = await getSupabase()
    .from("contexto_exportable")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) throw new Error(`getContextoExportable: ${error.message}`);
  return data;
}

// Regenera el snapshot completo — se llama desde la API route de "exportar contexto"
export async function regenerarContexto(): Promise<ContextoExportable> {
  const [empresas, aprendizajes, patrones, metrica] = await Promise.all([
    getSupabase().from("empresas").select("id, nombre, estado, score_prioridad").order("score_prioridad", { ascending: false }).limit(30),
    getSupabase().from("aprendizajes").select("tipo, descripcion, veces_confirmado").eq("activo", true).order("veces_confirmado", { ascending: false }).limit(20),
    getSupabase().from("patrones_conversion").select("etapa_origen, etapa_destino, tasa_conversion, n_casos").order("tasa_conversion", { ascending: false }),
    getSupabase().from("metricas_diarias").select("*").order("fecha", { ascending: false }).limit(7),
  ]);

  const resumen: ResumenContexto = {
    empresas: empresas.data ?? [],
    aprendizajes: aprendizajes.data ?? [],
    patrones: patrones.data ?? [],
    metricas: metrica.data?.[0] ?? {},
  };

  const { data, error } = await getSupabase()
    .from("contexto_exportable")
    .update({ resumen_json: resumen, generado_en: new Date().toISOString() })
    .eq("id", 1)
    .select()
    .single();

  if (error) throw new Error(`regenerarContexto: ${error.message}`);
  return data;
}

// ─── GUARDAR EMPRESA DESDE FICHA IA ──────────────────────────
// Llamado por POST /api/investigar al terminar el análisis.
// Upsert por URL para evitar duplicados.
export async function guardarEmpresaDesdeFicha(
  ficha: FichaIA,
  url: string
): Promise<Empresa> {
  // Calcular score basado en urgencia y señales detectadas
  const urgencias = ficha.productos_etiquetas.map((p) => p.urgencia);
  const urgenciaScore = urgencias.includes("alta")
    ? 30
    : urgencias.includes("media")
    ? 20
    : 10;
  const senalScore = Math.min(ficha.senales_oportunidad.length * 15, 45);
  const score = Math.min(100, 25 + urgenciaScore + senalScore);

  // Upsert empresa — si ya existe con esta URL, actualiza la ficha
  const empresaData: EmpresaInsert = {
    nombre: ficha.nombre,
    rut: null,
    url,
    industria: ficha.industria,
    descripcion_ia: ficha.descripcion,
    productos_que_compraria: ficha.que_fabrican_o_venden,
    tamano_estimado: ficha.tamano_estimado,
    region: ficha.region,
    estado: "prospecto",
    razon_de_contacto_actual: ficha.angulo_entrada,
    score_prioridad: score,
    ficha_ia: ficha,
  };

  // Buscar si ya existe una empresa con esta URL
  const { data: existente } = await getSupabase()
    .from("empresas")
    .select("id")
    .eq("url", url)
    .maybeSingle();

  let empresa;
  if (existente?.id) {
    // Actualizar la existente
    const { data, error } = await getSupabase()
      .from("empresas")
      .update(empresaData as unknown as Record<string, unknown>)
      .eq("id", existente.id)
      .select()
      .single();
    if (error) throw new Error(`guardarEmpresa: ${error.message}`);
    empresa = data;
  } else {
    // Insertar nueva
    const { data, error } = await getSupabase()
      .from("empresas")
      .insert(empresaData as unknown as Record<string, unknown>)
      .select()
      .single();
    if (error) throw new Error(`guardarEmpresa: ${error.message}`);
    empresa = data;
  }

  // Insertar decisores como contactos (ignorar si ya existen por nombre + empresa)
  if (ficha.decisores.length > 0) {
    const contactos = ficha.decisores.map((d) => ({
      empresa_id: empresa.id,
      nombre: d.cargo, // nombre provisional hasta que el vendedor lo encuentre en LinkedIn
      cargo: d.cargo,
      area: d.area as "adquisiciones" | "calidad" | "operaciones" | "gerencia" | "otro",
      notas_ia: `${d.por_que_es_clave}\n\nDolor específico: ${d.dolor_especifico}\n\nBuscar en LinkedIn: ${d.query_linkedin}`,
      es_decisor: true,
    }));

    await getSupabase().from("contactos").upsert(contactos, {
      onConflict: "empresa_id,cargo",
      ignoreDuplicates: true,
    });
  }

  // Insertar señales de oportunidad detectadas
  if (ficha.senales_oportunidad.length > 0) {
    const senales = ficha.senales_oportunidad.map((s) => ({
      empresa_id: empresa.id,
      tipo: s.tipo as "lanzamiento_producto" | "cambio_ejecutivo" | "importacion" | "licitacion" | "otro",
      descripcion: s.descripcion,
      fuente_url: s.fuente || null,
      usada: false,
    }));

    await getSupabase().from("senales").insert(senales);
  }

  return empresa;
}
