// El monitor de costos se plegó dentro de Configuración ("Costos y uso").
// Mantenemos esta ruta viva por si algo la referencia directamente.
import { redirect } from "next/navigation";

export default function CostosRedirect() {
  redirect("/configuracion");
}
