// Forzar render dinámico — la ficha cambia cuando la IA actualiza datos.
// fetchCache es obligatorio además de dynamic: sin él el Data Cache de Next
// sirve filas viejas de supabase-js y los decisores o interacciones recién
// agregados desaparecen al recargar, aunque estén guardados en BD.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Pantalla de ficha individual de empresa — la más importante del MVP.
// Server Component: fetches data server-side, sin estado en cliente.
import { notFound } from "next/navigation";
import { getEmpresaCompleta, getInteraccionesPorEmpresa } from "@/lib/queries";
import { EmpresaTabs } from "@/components/cuentas/empresa-tabs";
import { ProspectoLigeroDetail } from "@/components/cuentas/prospecto-ligero-detail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EmpresaPage({ params }: PageProps) {
  const { id } = await params;

  const [empresa, interacciones] = await Promise.all([
    getEmpresaCompleta(id),
    getInteraccionesPorEmpresa(id),
  ]);

  if (!empresa) notFound();

  // Prospecto ligero ("Por calificar") → vista liviana sin ficha IA.
  if (empresa.tipo_registro === "ligero") {
    return <ProspectoLigeroDetail empresa={empresa} interacciones={interacciones} />;
  }

  return <EmpresaTabs empresa={empresa} interacciones={interacciones} />;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const empresa = await getEmpresaCompleta(id);
  return {
    title: empresa ? `${empresa.nombre} — Copiloto Comercial` : "Empresa no encontrada",
  };
}
