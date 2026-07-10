// =============================================================
// Tipos TypeScript — espejo exacto del esquema de Supabase
// Cada tipo refleja una tabla; los campos opcionales (?) mapean
// columnas que pueden ser NULL en la base de datos.
// =============================================================

import type { Cadencia } from "@/lib/cadencia";

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

export interface PersonaEncontrada {
  nombre: string | null;
  linkedin_url: string | null;
  fuente: string | null;
  confianza: "alta" | "media" | "baja" | null;
}

export interface DecisorIA {
  cargo: string;
  area: string;
  por_que_es_clave: string;
  dolor_especifico: string;
  tecnica_recomendada?: string;
  persona_encontrada?: PersonaEncontrada | null;
  query_linkedin: string;
  linkedin_url?: string | null;
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

// Contacto real encontrado en internet por Perplexity
export interface ContactoReal {
  nombre: string | null;
  cargo: string | null;
  email: string | null;
  telefono: string | null;
  linkedin_url: string | null;
  como_contactar: string;
  fuente: string;
  confianza: "alta" | "media" | "baja";
  relevancia_venta: "alta" | "media" | "baja";
}

// Inteligencia comercial obtenida de búsqueda web con Perplexity
export interface InteligenciaComercial {
  situacion_mercado: string;
  prioridades_actuales: string;
  dolores_probables: string;
  clientes_y_exigencias: string;
  debilidades_proveedor_actual: string;
  propuesta_valor_especifica: string;
  fuentes: string[];
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
  preguntas_spin: string[];
  objeciones_probables: ObjecionProbable[];
  resumen_ejecutivo: string;
  verificacion_contexto: VerificacionContexto[];
  // Campos enriquecidos con Perplexity (opcionales — fichas antiguas no los tienen)
  contactos_reales?: ContactoReal[];
  inteligencia_comercial?: InteligenciaComercial | null;
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
  proximo_paso?: string;
  badge_estado?: BadgeEstado | null;
  decision_sugerida?: string | null;
}

// Análisis completo de la conversación con una empresa (todos los contactos)
export interface MomentoClave {
  fecha: string;
  descripcion: string;
  impacto: "positivo" | "negativo";
}

export interface AnalisisConversacion {
  evolucion: string;
  momentos_clave: MomentoClave[];
  patron_prospecto: string;
  estado_actual_real: string;
  probabilidad_cierre: "alta" | "media" | "baja";
  justificacion_probabilidad: string;
  estrategia_recomendada: string;
  proximos_3_pasos: [string, string, string];
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
  | "reunion"
  | "sin_respuesta";

export type SentimientoInteraccion =
  | "positivo"
  | "neutro"
  | "negativo"
  | "sin_respuesta";

// Los 7 estados de diagnóstico que la IA asigna a cada interacción
export type BadgeEstado =
  | "avanzando"
  | "neutral"
  | "evaluando"
  | "resistente"
  | "senal_cierre"
  | "sin_respuesta"
  | "rechazado";

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

// ─── BÚSQUEDA WEB (tab Búsqueda Web) ─────────────────────────

// Resultado crudo de Perplexity guardado en empresas.busqueda_web_raw
export interface BusquedaWebRaw {
  contactosTexto: string;
  inteligenciaTexto: string;
  fuentes: string[];
  buscado_en: string; // ISO timestamp
}

// Persona real encontrada por Perplexity + Claude en la búsqueda web
export interface PersonaWebEncontrada {
  nombre: string;
  cargo: string;
  linkedin_url: string | null;
  email: string | null;
  telefono: string | null;
  fuente: string;
  confianza: "alta" | "media" | "baja";
}

export interface InteligenciaComercialWeb {
  situacion_actual: string;
  noticias_relevantes: string[];
  licitaciones: string[];
  oportunidad_detectada: string;
}

// Análisis de Claude sobre los resultados de Perplexity
export interface AnalisisWeb {
  personas_encontradas: PersonaWebEncontrada[];
  inteligencia_comercial: InteligenciaComercialWeb;
  recomendacion_accion: string;
}

// ─── TABLA: empresas ─────────────────────────────────────────

// ─── MEDDIC ──────────────────────────────────────────────────

export type MeddicSemaforo = "rojo" | "amarillo" | "verde";

export interface MeddicComponente {
  texto: string | null;
  semaforo: MeddicSemaforo;
}

// Calificación MEDDIC completa por empresa
// Columnas ya existentes en Supabase: meddic_metricas, meddic_comprador_economico,
// meddic_criterios_decision, meddic_proceso_decision, meddic_dolor_identificado,
// meddic_campeon, meddic_score, meddic_valor_estimado, meddic_probabilidad
export interface MeddicData {
  metricas: MeddicComponente;
  comprador_economico: MeddicComponente;
  criterios_decision: MeddicComponente;
  proceso_decision: MeddicComponente;
  dolor_identificado: MeddicComponente;
  campeon: MeddicComponente;
  score: number;               // 0-12 (rojo=0, amarillo=1, verde=2 por cada uno)
  valor_estimado: number | null; // CLP
  probabilidad: number | null;   // 0-100
}

// ─── BORRADORES ───────────────────────────────────────────────

// Borradores de mensajes guardados por empresa → decisor → canal
// La clave del Record es contactoId (UUID) para contactos reales, o "ia-{cargo}" para sugeridos por IA
export interface BorradorCanal {
  texto?: string;        // para whatsapp y linkedin
  asunto?: string;       // para correo
  cuerpo?: string;       // para correo
  // para llamada (pitch telefónico estructurado por secciones)
  apertura?: string;
  gancho?: string;
  si_positivo?: string;
  si_negativo?: string;
  cierre?: string;
  generado_at: string;   // ISO date de cuando se generó
}
export type BorradoresContacto = {
  whatsapp?: BorradorCanal;
  correo?: BorradorCanal;
  linkedin?: BorradorCanal;
  llamada?: BorradorCanal;
};
export type BorradoresGuardados = Record<string, BorradoresContacto>;

export interface Empresa {
  id: string;
  nombre: string;
  razon_social: string | null;
  nombre_comercial: string | null;
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
  borradores: BorradoresGuardados | null;
  meddic: MeddicData | null;
  razon_perdido: string | null;
  fecha_reactivacion: string | null;
  conversacion_pausada_at: string | null; // ISO timestamp — null = activa
  busqueda_web_raw: BusquedaWebRaw | null;
  busqueda_web_analisis: AnalisisWeb | null;
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
  nombre: string | null; // null = sugerido sin persona real confirmada aún
  cargo: string | null;
  area: AreaContacto | null;
  email: string | null;
  telefono: string | null;
  linkedin_url: string | null;
  notas_ia: string | null;
  es_decisor: boolean;
  verificado: boolean; // false = nombre sugerido por IA, no confirmado por el vendedor
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
  parent_id: string | null;
  remitente: string | null;
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
  badge_estado: BadgeEstado | null;
  decision_sugerida: string | null;
  resuelta: boolean;
  no_realizada: boolean;
  creado_en: string;
  actualizado_en: string;
}

export type InteraccionInsert = Omit<Interaccion, "id" | "creado_en" | "actualizado_en">;
export type InteraccionUpdate = Partial<InteraccionInsert>;

// Tarea pendiente: interacción con proximo_paso_fecha <= hoy — usada por pantalla Hoy
export interface TareaPendiente {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  contacto_nombre: string | null;
  proximo_paso: string;
  proximo_paso_fecha: string; // YYYY-MM-DD
  // 'ia' cuando proviene de prioridades_diarias (vencida sin ejecutar);
  // undefined para tareas manuales normales.
  origen?: "ia";
}

// ─── PANORAMA ─────────────────────────────────────────────────
// Fila de la tabla /panorama: estado consolidado de cada prospecto
// activo, calculado sin IA desde datos existentes.
export interface PanoramaFila {
  empresa_id: string;
  nombre: string;
  estado: EstadoEmpresa;
  score_meddic: number | null; // 0-12, null si no hay calificación
  ultima_interaccion: {
    fecha: string;
    tipo: TipoInteraccion;
    contacto_nombre: string | null;
  } | null;
  dias_sin_contacto: number | null; // null = nunca contactada
  proxima_tarea: {
    texto: string;
    fecha: string; // YYYY-MM-DD
  } | null;
  semaforo: "rojo" | "amarillo" | "verde";
}

// Interacción cuyo plazo de respuesta de 48h ya venció — usada por la API /vencidas
export interface InteraccionVencida {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  tipo: Extract<TipoInteraccion, "whatsapp" | "email" | "linkedin">;
  fecha: string;
  transcripcion: string | null;
  contacto_id: string | null;
  // Estado de cadencia de seguimiento del contacto (touch actual, canal sugerido…).
  // Calculado en el servidor; null si no hay contacto o historial suficiente.
  cadencia?: Cadencia | null;
}

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

// Item de prioridad guardado en cache (sin el objeto empresa completo)
export interface PrioridadCacheItem {
  empresa_id: string;
  nombre_empresa: string;
  industria: string | null;
  score: number;
  razon: string;
  accion_sugerida: string;
  urgencia: "alta" | "media" | "baja";
}

export interface MetricaDiaria {
  fecha: string;                          // "YYYY-MM-DD" — es la PK
  contactos_hechos: number;
  reuniones_logradas: number;
  cotizaciones_enviadas: number;
  negocios_ganados: number;
  meta_cumplida: boolean;
  racha_dias: number;
  notas_dia: string | null;
  prioridades_cache: PrioridadCacheItem[] | null;
  prioridades_generadas_en: string | null; // ISO timestamp
}

export type MetricaDiariaInsert = MetricaDiaria;
export type MetricaDiariaUpdate = Partial<Omit<MetricaDiaria, "fecha">>;

// ─── TABLA: chat_empresa ──────────────────────────────────────

export interface ChatEmpresa {
  id: string;
  empresa_id: string;
  pregunta: string;
  respuesta: string;
  creado_en: string;
}

export type ChatEmpresaInsert = Omit<ChatEmpresa, "id" | "creado_en">;

// ─── TABLA: prioridades_diarias ──────────────────────────────

export interface PrioridadDiaria {
  id: string;
  fecha: string;            // "YYYY-MM-DD"
  empresa_id: string;
  nombre_empresa: string;
  industria: string | null;
  score: number;
  razon: string;
  accion_sugerida: string;
  urgencia: "alta" | "media" | "baja";
  completada: boolean;
  completada_en: string | null;
  no_realizada: boolean;
  interaccion_id: string | null;
  creado_en: string;
}

export type PrioridadDiariaInsert = Omit<
  PrioridadDiaria,
  "id" | "creado_en" | "completada" | "completada_en" | "interaccion_id"
>;

// ─── TABLA: misiones_diarias ──────────────────────────────────

export type ResultadoMision = "completada" | "parcial" | "no_ejecutada";

export interface MisionDiaria {
  id: string;
  empresa_id: string;
  fecha: string;                  // "YYYY-MM-DD"
  accion_sugerida: string;
  resultado: ResultadoMision | null;
  detalle_vendedor: string | null;
  feedback_ia: string | null;
  creado_en: string;
}

export type MisionDiariaInsert = Omit<MisionDiaria, "id" | "creado_en">;
export type MisionDiariaUpdate = Partial<Omit<MisionDiaria, "id" | "empresa_id" | "creado_en">>;

// ─── TABLA: evaluaciones_semanales ───────────────────────────

export interface EvaluacionSemanal {
  id: string;
  semana_inicio: string;          // "YYYY-MM-DD"
  semana_fin: string;             // "YYYY-MM-DD"
  resumen_ia: string | null;
  tasa_cumplimiento: number | null;
  tasa_conversion: number | null;
  fortalezas: string | null;
  areas_mejora: string | null;
  recomendaciones: Record<string, unknown>[] | null;
  creado_en: string;
}

export type EvaluacionSemanalInsert = Omit<EvaluacionSemanal, "id" | "creado_en">;

// ─── TABLA: rendimiento_ejecutivo ────────────────────────────

export interface RendimientoEjecutivo {
  id: 1;                          // siempre 1 — fila única
  score_actual: number;
  racha_record: number;
  tasa_cumplimiento_historica: number;
  tasa_conversion_historica: number;
  canal_mas_efectivo: string | null;
  tecnica_mas_efectiva: string | null;
  ultimo_calculo: string | null;  // ISO timestamp
}

export type RendimientoEjecutivoUpdate = Partial<Omit<RendimientoEjecutivo, "id">>;

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

// ─── TABLA: integraciones ─────────────────────────────────────

export interface Integracion {
  id: string;
  tipo: string;                  // "gmail"
  access_token: string;
  refresh_token: string | null;
  email: string | null;
  activo: boolean;
  expira_en: string | null;      // ISO timestamp
  creado_en: string;
  actualizado_en: string;
}

// ─── TABLA: casos ────────────────────────────────────────────
// Base de casos reales de One Label que la IA usa como referencia

export type TecnicaCaso = "SPIN" | "Challenger" | "Sandler" | "Consultiva" | "Otra";
export type TamanoCaso = "grande" | "mediana" | "pequeña";
export type CanalCaso = "llamada" | "email" | "LinkedIn" | "referido" | "visita";

export interface Caso {
  id: string;
  sector: string;
  tamano_empresa: TamanoCaso | null;
  cargo_decisor: string | null;
  problema: string;
  proveedor_anterior: string | null;
  solucion: string;
  tipo_etiqueta: string | null;
  resultado: string;
  objecion_vencida: string | null;
  canal_entrada: CanalCaso | null;
  tecnica_venta: TecnicaCaso | null;
  tiempo_cierre: string | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export type CasoInsert = Omit<Caso, "id" | "creado_en" | "actualizado_en">;
export type CasoUpdate = Partial<CasoInsert>;

// ─── TABLA: borradores_feedback ──────────────────────────────

export type EvaluacionFeedback = "positivo" | "negativo";

export interface BorradorFeedback {
  id: string;
  creado_en: string;
  empresa_id: string | null;
  contacto_id: string | null;
  canal: string;
  tipo_borrador: string | null;
  borrador_ia: string;
  evaluacion: EvaluacionFeedback | null;
  version_vendedor: string | null;
  notas: string | null;
}

export interface BorradorFeedbackInsert {
  empresa_id: string;
  contacto_id?: string | null;
  canal: string;
  tipo_borrador?: string | null;
  borrador_ia: string;
  evaluacion: EvaluacionFeedback;
  version_vendedor?: string | null;
  notas?: string | null;
}

// ─── TABLA: borradores ────────────────────────────────────────
// Persiste borradores generados por canal+contacto para no regenerar
// en cada apertura. El campo usado=true indica que ya fue enviado.

export interface BorradorGuardado {
  id: string;
  empresa_id: string;
  contacto_id: string | null;
  canal: string;
  contenido: string;
  tipo: string;
  usado: boolean;
  creado_en: string;
}

// ─── TABLA: correos_detectados ────────────────────────────────

export interface CorreoDetectado {
  id: string;
  empresa_id: string;
  gmail_thread_id: string;
  gmail_message_id: string;
  asunto: string | null;
  remitente: string | null;
  fecha: string;                 // ISO timestamp
  snippet: string | null;
  analizado: boolean;
  creado_en: string;
}
