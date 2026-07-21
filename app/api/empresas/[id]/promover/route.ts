// PATCH /api/empresas/[id]/promover — Mueve un prospecto ligero al pipeline.
// Endpoint MÍNIMO: solo cambia el flag. La investigación (ficha IA) la dispara
// el cliente llamando antes a /api/empresas/[id]/regenerar (que ya existe).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hoyCL } from "@/lib/fecha";
import { getEmpresaById } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const empresa = await getEmpresaById(params.id);
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  if (empresa.tipo_registro !== "ligero") {
    return NextResponse.json({ error: "La empresa ya está en el pipeline" }, { status: 409 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  // estado_desde = hoy → "días en etapa" arranca en la promoción.
  const { data, error } = await supabase
    .from("empresas")
    .update({ tipo_registro: "completo", estado: "prospecto", estado_desde: hoyCL() })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, empresa: data });
}
