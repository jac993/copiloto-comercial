// PATCH /api/empresas/[id]/congelar — Congela un prospecto ligero hasta una
// fecha de recontacto. Sale de "Activos" y aparece en "Congelados" hasta que
// llegue la fecha. No usa IA: es una decisión del vendedor, cero créditos.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hoyCL } from "@/lib/fecha";
import { getEmpresaById } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const body = await req.json() as { hasta?: string };
  const hasta = body.hasta?.trim() ?? "";
  const hoy = hoyCL();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ error: "Fecha inválida. Formato esperado: YYYY-MM-DD" }, { status: 400 });
  }
  // Congelar hasta hoy o al pasado no tiene efecto: el filtro de Activos usa
  // <= hoy, así que reaparecería de inmediato. Se rechaza para no confundir.
  if (hasta <= hoy) {
    return NextResponse.json({ error: "La fecha de recontacto debe ser posterior a hoy" }, { status: 400 });
  }
  // Techo defensivo (~2 años): descarta años mal tipeados tipo 2226.
  // Mismo criterio que el techo de resolverFechaSeguimiento en lib/fecha.ts.
  const techo = `${Number(hoy.slice(0, 4)) + 2}${hoy.slice(4)}`;
  if (hasta > techo) {
    return NextResponse.json({ error: "La fecha de recontacto es demasiado lejana (máximo 2 años)" }, { status: 400 });
  }

  const empresa = await getEmpresaById(params.id);
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  if (empresa.tipo_registro !== "ligero") {
    return NextResponse.json({ error: "Solo se pueden congelar prospectos por calificar" }, { status: 409 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data, error } = await supabase
    .from("empresas")
    .update({ prospecto_congelado_hasta: hasta })
    .eq("id", params.id)
    .select("id, nombre, prospecto_congelado_hasta")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, empresa: data });
}
