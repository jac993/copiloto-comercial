// POST /api/empresas/[id]/limpiar-contactos
// Elimina de la tabla contactos los registros sin nombre real
// (nombre null, "Desconocido", o cargo con "Desconocido").
// Usado para limpiar contactos falsos generados antes del filtro estricto.

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabaseServer();

    // Buscar contactos candidatos a eliminar para esta empresa
    const { data: candidatos, error: fetchError } = await supabase
      .from("contactos")
      .select("id, nombre, cargo")
      .eq("empresa_id", params.id);

    if (fetchError) {
      return Response.json({ error: fetchError.message }, { status: 500 });
    }

    const ids = (candidatos ?? [])
      .filter((c) =>
        !c.nombre ||
        c.nombre.trim() === "" ||
        c.nombre === "Desconocido" ||
        (c.cargo ?? "").includes("Desconocido")
      )
      .map((c) => c.id as string);

    if (ids.length === 0) {
      return Response.json({ ok: true, eliminados: 0 });
    }

    const { error: deleteError } = await supabase
      .from("contactos")
      .delete()
      .in("id", ids);

    if (deleteError) {
      return Response.json({ error: deleteError.message }, { status: 500 });
    }

    return Response.json({ ok: true, eliminados: ids.length });

  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
