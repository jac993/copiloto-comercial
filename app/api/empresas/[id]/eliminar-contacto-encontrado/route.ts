// POST /api/empresas/[id]/eliminar-contacto-encontrado
// Recibe { cargo: string }, encuentra el decisor con ese cargo en ficha_ia
// y pone persona_encontrada = null.

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import type { FichaIA, DecisorIA } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { cargo } = (await req.json()) as { cargo: string };

    if (!cargo) {
      return Response.json({ error: "cargo requerido" }, { status: 400 });
    }

    const supabase = await getSupabaseServer();

    const { data: row, error: fetchError } = await supabase
      .from("empresas")
      .select("ficha_ia")
      .eq("id", params.id)
      .single();

    if (fetchError || !row) {
      return Response.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const ficha = row.ficha_ia as FichaIA;
    if (!ficha?.decisores) {
      return Response.json({ error: "Sin decisores en ficha" }, { status: 422 });
    }

    const decisoresActualizados: DecisorIA[] = ficha.decisores.map((d) =>
      d.cargo === cargo ? { ...d, persona_encontrada: null } : d
    );

    const { error: updateError } = await supabase
      .from("empresas")
      .update({ ficha_ia: { ...ficha, decisores: decisoresActualizados } } as unknown as Record<string, unknown>)
      .eq("id", params.id);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    return Response.json({ ok: true });

  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
