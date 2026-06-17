// DIAGNÓSTICO TEMPORAL — solo llama Perplexity y devuelve texto crudo
import { getEmpresaById } from "@/lib/queries";
import { NextRequest } from "next/server";

export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const empresa = await getEmpresaById(params.id);
    if (!empresa) {
      return Response.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const nombre = empresa.nombre;
    const dominio = empresa.url
      ?.replace(/https?:\/\//, "")
      ?.split("/")[0] ?? "";

    const { buscarConPerplexity } = await import("@/lib/scraper");

    const resultado = await buscarConPerplexity(nombre, dominio, "Chile");

    return Response.json({
      ok: true,
      contactosTexto: resultado.contactosTexto?.slice(0, 1000),
      inteligenciaTexto: resultado.inteligenciaTexto?.slice(0, 1000),
      fuentes: resultado.fuentes,
    });

  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
