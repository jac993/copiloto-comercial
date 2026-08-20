// PATCH /api/empresas/[id]/descongelar — Vuelve un prospecto congelado a
// "Activos" antes de su fecha de recontacto. Sin body, sin IA.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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
    return NextResponse.json({ error: "Solo aplica a prospectos por calificar" }, { status: 409 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  // Idempotente: si ya estaba activo, setear null de nuevo no rompe nada.
  const { data, error } = await supabase
    .from("empresas")
    .update({ prospecto_congelado_hasta: null })
    .eq("id", params.id)
    .select("id, nombre, prospecto_congelado_hasta")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, empresa: data });
}
