// POST /api/prospectos — Alta rápida de un prospecto ligero ("Por calificar").
// Solo nombre (obligatorio) + URL (opcional). CERO IA: no llama a Perplexity
// ni a Claude. El resto de campos quedan null hasta investigar y promover.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hoyCL } from "@/lib/fecha";
import type { EmpresaInsert } from "@/lib/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const body = (await request.json()) as { nombre?: string; url?: string };
  const nombre = body.nombre?.trim();
  if (!nombre) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }
  const url = body.url?.trim().split("?")[0].split("#")[0].trim() || null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Alta ligera: entra a "prospecto" pero tipo_registro='ligero' la mantiene
  // fuera del pipeline hasta que el vendedor investigue y promueva.
  const nueva: EmpresaInsert = {
    nombre,
    url,
    tipo_registro: "ligero",
    estado: "prospecto",
    estado_desde: hoyCL(),
    score_prioridad: 0,
    razon_social: null,
    nombre_comercial: null,
    rut: null,
    industria: null,
    descripcion_ia: null,
    productos_que_compraria: null,
    tamano_estimado: null,
    region: null,
    razon_de_contacto_actual: null,
    ficha_ia: null,
    notas_vendedor: null,
    borradores: null,
    meddic: null,
    razon_perdido: null,
    fecha_reactivacion: null,
    valor_estimado_clp: null,
    conversacion_pausada_at: null,
    busqueda_web_raw: null,
    busqueda_web_analisis: null,
  };

  const { data, error } = await supabase
    .from("empresas")
    .insert(nueva as unknown as Record<string, unknown>)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, empresa: data }, { status: 201 });
}
