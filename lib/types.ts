// =============================================================
// Tipos TypeScript — espejo exacto del esquema de Supabase
// Cada tipo refleja una tabla; los campos opcionales (?) mapean
// columnas que pueden ser NULL en la base de datos.
// =============================================================

// ─── TIPOS DE IA ─────────────────────────────────────────────

export type TecnicaVenta = "consultiva" | "relacional" | "SPIN" | "challenger";

export interface ProductoEtiqueta {
  tipo: string;
  aplicacion: string;
  volumen_estimado: string;
  urgencia: "alta" | "media" | "baja";
}

export interface SenalOportunidadIA {
  tipo: string;
  descripcion: string;
  fuente: string;
}

export interface DecisorIA {
  cargo: string;
  area: string;
  por_que_es_clave: string;
  dolor_especifico: string;
  query_linkedin: string;
}

export interface ObjecionProbable {
  objecion: string;
  como_responderla: string;
}

export interface VerificacionContexto {
  dato_vendedor: string;
  estado: "confirmado" | "inconsistente" | "no_verificable";
  observacion: string;
}

// Respuesta completa del PROMPT_INVESTIGADOR — se guarda en empresas.ficha_ia
export interface FichaIA {
  nombre: string;
  industria: string;
  descripcion: string;
  que_fabrican_o_venden: string;
  por_que_necesitan_etiquetas: string;
  productos_etiquetas: ProductoEtiqueta[];
  tamano_estimado: "pequeña" | "mediana" | "grande";
  region: string;
  senales_oportunidad: SenalOportunidadIA[];
  decisores: DecisorIA[];
  angulo_entrada: string;
  tecnica_recomendada: TecnicaVenta;
  razon_tecnica: string;
  preguntas_spin: [string, string, string];
  objeciones_probables: ObjecionProbable[];
  resumen_ejecutivo: string;
  verificacion_contexto: VerificacionContexto[];
}

// Resultado del análisis de IA para cualquier tipo de interacción
export interface CoachingIA {
  bien: string;
  mejorar: string;
  oportunidad_perdida: string;
}

export interface EstadoSugerido {
  estado: EstadoEmpresa;
  razon: string;
}

export interface ResultadoAnalisis {
  resumen: string;
  sentimiento_prospecto: SentimientoInteraccion;
  senales_detectadas: { tipo: string; descripcion: string }[];
  compromisos: { quien: string; que: string; cuando: string }[];
  lo_que_no_respondio: string;
  tecnica_recomendada: string;
  razon_tecnica: string;
  coaching: CoachingIA;
  estado_sugerido: EstadoSugerido | null;
  borrador_respuesta: string;
}

// ─── ENUMS ────────────────────────────────────────────────────

export type EstadoEmpresa =
  | "prospecto"
  | "contactado"
  | "en_conversacion"
  | "reunion_agendada"
  | "cotizado"
  | "ganado"
  | "perdido";

export type AreaContacto =
  | "adquisiciones"
  | "compras"
  | "calidad"
  | "operaciones"
  | "gerencia"
  | "otro";

export type TipoInteraccion =
  | "llamada"
  | "email"
  | "linkedin"
  | "whatsapp"
  | "sin_respuesta";

export type SentimientoInteraccion =
  | "positivo"
  | "neutro"
  | "negativo"
  | "sin_respuesta";

export type TipoSenal =
  | "lanzamiento_producto"
  | "cambio_ejecutivo"
  | "importacion"
  | "licitacion"
  | "otro";

export type TipoAprendizaje =
  | "tecnica_exitosa"
  | "objecion_frecuente"
  | "mensaje_efectivo"
  | "perfil_cliente"
  | "patron_conversion";

// ─── TABLA: empresas ─────────────────────────────────────────

export interface Empresa {
  id: string;
  nombre: string;
  rut: string | null;
  url: string | null;
  industria: string | null;
  descripcion_ia: string | null;
  productos_que_compraria: string | null;
  tamano_estimado: string | null;
  region: string | null;
  estado: EstadoEmpresa;
  razon_de_contacto_actual: string | null;
  score_prioridad: number;
  ficha_ia: FichaIA | null;
  notas_vendedor: string | null;
  razon_perdido: string | null;
  fecha_reactivacion: string | null;
  creado_en: string;
  actualizado_en: string;
}

// Para insertar — id y timestamps los genera la DB
export type EmpresaInsert = Omit<Empresa, "id" | "creado_en" | "actualizado_en">;
export type EmpresaUpdate = Partial<EmpresaInsert>;

// ─── TABLA: contactos ────────────────────────────────────────

export interface Contacto {
  id: string;
  empresa_id: string;
  nombre: string;
  cargo: string | null;
  area: AreaContacto | null;
  email: string | null;
  telefono: string | null;
  linkedin_url: string | null;
  notas_ia: string | null;
  es_decisor: boolean;
  creado_en: string;
  actualizado_en: string;
}

export type ContactoInsert = Omit<Contacto, "id" | "creado_en" | "actualizado_en">;
export type ContactoUpdate = Partial<ContactoInsert>;

// ─── TABLA: interacciones ────────────────────────────────────

export interface Compromiso {
  descripcion: string;
  responsable: string;
  fecha: string | null;
}

export interface Interaccion {
  id: string;
  empresa_id: string;
  contacto_id: string | null;
  tipo: TipoInteraccion;
  fecha: string;
  audio_url: string | null;
  transcripcion: string | null;
  resumen_ia: string | null;
  compromisos: Compromiso[] | null;
  sentimiento: SentimientoInteraccion | null;
  tecnica_usada: string | null;
  coaching_ia: string | null;
  proximo_paso: string | null;
  proximo_paso_fecha: string | null;
  creado_en: string;
  actualizado_en: string;
}

export type InteraccionInsert = Omit<Interaccion, "id" | "creado_en" | "actualizado_en">;
export type InteraccionUpdate = Partial<InteraccionInsert>;

// ─── TABLA: senales ──────────────────────────────────────────

export interface Senal {
  id: string;
  empresa_id: string;
  tipo: TipoSenal;
  descripcion: string;
  fuente_url: string | null;
  detectada_en: string;
  usada: boolean;
}

export type SenalInsert = Omit<Senal, "id" | "detectada_en">;
export type SenalUpdate = Partial<SenalInsert>;

// ─── TABLA: aprendizajes ─────────────────────────────────────

export interface Aprendizaje {
  id: string;
  tipo: TipoAprendizaje;
  descripcion: string;
  evidencia: string | null;
  industria_cliente: string | null;
  cargo_contacto: string | null;
  tecnica_asociada: string | null;
  veces_confirmado: number;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export type AprendizajeInsert = Omit<Aprendizaje, "id" | "creado_en" | "actualizado_en">;
export type AprendizajeUpdate = Partial<AprendizajeInsert>;

// ─── TABLA: patrones_conversion ──────────────────────────────

export interface PatronConversion {
  id: string;
  etapa_origen: EstadoEmpresa;
  etapa_destino: EstadoEmpresa;
  tasa_conversion: number | null;
  tecnica_usada: string | null;
  industria: string | null;
  cargo_contacto: string | null;
  n_casos: number;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  actualizado_en: string;
}

export type PatronConversionInsert = Omit<PatronConversion, "id" | "actualizado_en">;
export type PatronConversionUpdate = Partial<PatronConversionInsert>;

// ─── TABLA: metricas_diarias ─────────────────────────────────

export interface MetricaDiaria {
  fecha: string;                   // "YYYY-MM-DD" — es la PK
  contactos_hechos: number;
  reuniones_logradas: number;
  cotizaciones_enviadas: number;
  negocios_ganados: number;
  meta_cumplida: boolean;
  racha_dias: number;
  notas_dia: string | null;
}

export type MetricaDiariaInsert = MetricaDiaria;
export type MetricaDiariaUpdate = Partial<Omit<MetricaDiaria, "fecha">>;

// ─── TABLA: contexto_exportable ──────────────────────────────

export interface ResumenContexto {
  empresas: Pick<Empresa, "id" | "nombre" | "estado" | "score_prioridad">[];
  aprendizajes: Pick<Aprendizaje, "tipo" | "descripcion" | "veces_confirmado">[];
  patrones: Pick<PatronConversion, "etapa_origen" | "etapa_destino" | "tasa_conversion" | "n_casos">[];
  metricas: Partial<MetricaDiaria>;
}

export interface ContextoExportable {
  id: 1;
  generado_en: string;
  resumen_json: ResumenContexto;
}

// ─── VISTAS COMPUESTAS (para la UI) ──────────────────────────

// Empresa con sus contactos y señales recientes — útil para la ficha
export interface EmpresaCompleta extends Empresa {
  contactos: Contacto[];
  senales: Senal[];
  ultima_interaccion: Interaccion | null;
}

// Empresa enriquecida con conteo de interacciones — para listados
export interface EmpresaResumen extends Empresa {
  total_interacciones: number;
  senales_activas: number;
}
