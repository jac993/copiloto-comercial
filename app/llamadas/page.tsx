// Feed global de actividad — Server Component mínimo.
// La carga real ocurre en el Client Component vía fetch.
import { LlamadasClient } from "@/components/llamadas/llamadas-client";

export const dynamic = "force-dynamic";

export default function LlamadasPage() {
  return <LlamadasClient />;
}
