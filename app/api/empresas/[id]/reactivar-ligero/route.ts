// PATCH /api/empresas/[id]/reactivar-ligero
// Deshace el descarte: el prospecto vuelve a Activos.
//
// Endpoint aparte de .../descongelar a propósito: son intenciones distintas
// sobre columnas distintas (una deshace un congelamiento, la otra un descarte),
// y no quiero que "descongelar" pueda resucitar un descartado como efecto
// secundario. No necesita tocar prospecto_congelado_hasta porque
// marcar-perdido-ligero ya lo dejó en null.
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
    return NextResponse.json(
      { error: "Este flujo es solo para prospectos por calificar" },
      { status: 409 }
    );
  }
  // No es idempotente a propósito: estado_desde no debe moverse en una llamada
  // que no cambia nada. La UI solo muestra "Reactivar" cuando está descartado.
  if (empresa.estado !== "perdido") {
    return NextResponse.json(
      { error: "El prospecto no está descartado" },
      { status: 409 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data, error } = await supabase
    .from("empresas")
    .update({
      estado: "prospecto",
      prospecto_ligero_perdido_razon: null,
      estado_desde: hoyCL(),
    })
    .eq("id", params.id)
    .select("id, nombre, estado, prospecto_ligero_perdido_razon")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, empresa: data });
}
