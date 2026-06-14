// =============================================================
// POST /api/notas-vendedor — Guarda las notas privadas del vendedor
// sobre una empresa. No usa IA — solo escribe en Supabase.
// =============================================================

import { guardarNotasVendedor } from "@/lib/queries";

export async function POST(request: Request) {
  const body = (await request.json()) as { empresaId?: string; notas?: string };

  if (!body.empresaId) {
    return Response.json({ error: "empresaId requerido" }, { status: 400 });
  }

  await guardarNotasVendedor(body.empresaId, body.notas ?? null);
  return Response.json({ ok: true });
}
