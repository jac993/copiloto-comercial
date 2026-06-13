// Forzar render dinámico — la ficha cambia cuando la IA actualiza datos
export const dynamic = "force-dynamic";

// Pantalla de ficha individual de empresa — la más importante del MVP.
// Server Component: fetches data server-side, sin estado en cliente.
import { notFound } from "next/navigation";
import { getEmpresaCompleta, getInteraccionesPorEmpresa } from "@/lib/queries";
import { EmpresaTabs } from "@/components/cuentas/empresa-tabs";

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

  return <EmpresaTabs empresa={empresa} interacciones={interacciones} />;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const empresa = await getEmpresaCompleta(id);
  return {
    title: empresa ? `${empresa.nombre} — Copiloto Comercial` : "Empresa no encontrada",
  };
}
