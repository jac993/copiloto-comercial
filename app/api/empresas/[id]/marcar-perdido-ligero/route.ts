// PATCH /api/empresas/[id]/marcar-perdido-ligero
// Descarta un prospecto ligero arriba del embudo, con razón.
// NO toca el flujo de perdido del pipeline (empresas.razon_perdido +
// PerdidoDialog): allá se pierde un negocio competido, acá se descarta un
// prospecto que nunca se calificó.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hoyCL } from "@/lib/fecha";
import { getEmpresaById } from "@/lib/queries";
import { SLUGS_PERDIDA_LIGERO } from "@/lib/prospecto-ligero";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const body = await req.json() as { razon?: string };
  const razon = body.razon?.trim() ?? "";
  if (!razon) {
    return NextResponse.json({ error: "Falta la razón del descarte" }, { status: 400 });
  }
  // La columna es TEXT sin check constraint a propósito, así que la validación
  // del conjunto válido vive acá.
  if (!SLUGS_PERDIDA_LIGERO.has(razon)) {
    return NextResponse.json({ error: `Razón desconocida: ${razon}` }, { status: 400 });
  }

  const empresa = await getEmpresaById(params.id);
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  if (empresa.tipo_registro !== "ligero") {
    return NextResponse.json(
      { error: "Este flujo es solo para prospectos por calificar" },
      { status: 409 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  // Se limpia el congelamiento: un descartado no debe arrastrar fecha de
  // recontacto, y si se reactiva vuelve a Activos limpio.
  const { data, error } = await supabase
    .from("empresas")
    .update({
      estado: "perdido",
      prospecto_ligero_perdido_razon: razon,
      prospecto_congelado_hasta: null,
      estado_desde: hoyCL(),
    })
    .eq("id", params.id)
    .select("id, nombre, estado, prospecto_ligero_perdido_razon")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, empresa: data });
}
