// Pantalla "Hoy" — punto de entrada diario del vendedor.
// Toda la lógica de datos está en HoyClient (componente cliente)
// para habilitar fetch al montar, refresh en foco y confeti.
import { HoyClient } from "@/components/hoy/hoy-client";

export default function HoyPage() {
  return <HoyClient />;
}
