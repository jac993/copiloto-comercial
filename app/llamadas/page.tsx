// Pantalla de interacciones — Server Component que precarga las empresas
// y pasa la lista al Client Component para el selector de búsqueda.
import { getEmpresas } from "@/lib/queries";
import { LlamadasClient } from "@/components/llamadas/llamadas-client";

export const dynamic = "force-dynamic";

export default async function LlamadasPage() {
  const empresas = await getEmpresas();
  return <LlamadasClient empresas={empresas} />;
}
