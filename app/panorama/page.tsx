"use client";

// =============================================================
// Ruta /panorama — wrapper delgado sobre PanoramaSeccion.
//
// Panorama vive ahora como tab dentro de Cuentas; esta ruta se
// mantiene para no romper favoritos ni enlaces existentes. Todo
// el contenido está en components/cuentas/panorama-seccion.tsx,
// así que las dos entradas muestran exactamente lo mismo.
// =============================================================

import { useRouter } from "next/navigation";
import { PanoramaSeccion } from "@/components/cuentas/panorama-seccion";

export default function PanoramaPage() {
  const router = useRouter();
  return (
    <div className="max-w-[900px] mx-auto p-4">
      {/* Acá sí lleva título: es una pantalla propia, no un tab.
          Dentro de Cuentas el <h1> se omite porque esa pantalla
          ya tiene el suyo. */}
      <h1 className="text-2xl font-extrabold mb-3">📡 Panorama</h1>
      {/* En la ruta suelta, "Ver pipeline" navega a Cuentas. */}
      <PanoramaSeccion onVerPipeline={() => router.push("/cuentas")} />
    </div>
  );
}
