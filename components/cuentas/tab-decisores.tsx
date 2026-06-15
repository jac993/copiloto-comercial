"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, UserPlus, User, CheckCircle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Contacto, DecisorIA } from "@/lib/types";

const AREA_LABEL: Record<string, string> = {
  adquisiciones: "Adquisiciones",
  compras: "Compras",
  calidad: "Calidad",
  operaciones: "Operaciones",
  gerencia: "Gerencia",
  otro: "Otro",
};

const AREA_COLOR: Record<string, string> = {
  calidad: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  operaciones: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  adquisiciones: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  compras: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  gerencia: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  otro: "bg-muted text-muted-foreground",
};

interface TabDecisoresProps {
  contactos: Contacto[];
  decisoresIA: DecisorIA[];
  empresaId: string;
}

export function TabDecisores({ contactos, decisoresIA, empresaId }: TabDecisoresProps) {
  const router = useRouter();
  const [actualizando, setActualizando] = useState(false);

  const actualizarDecisores = async () => {
    setActualizando(true);
    try {
      await fetch(`/api/empresas/${empresaId}/regenerar-decisores`, { method: "POST" });
      router.refresh();
    } finally {
      setActualizando(false);
    }
  };

  // Mostrar los contactos ya registrados primero, luego los sugeridos por IA no registrados
  const cargoRegistrado = new Set(contactos.map((c) => c.cargo));
  const decisoresSugeridos = decisoresIA.filter(
    (d) => !cargoRegistrado.has(d.cargo)
  );

  return (
    <div className="space-y-4 pb-6">
      {/* Contactos ya registrados */}
      {contactos.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
            Contactos registrados
          </p>
          <div className="space-y-2">
            {contactos.map((contacto) => (
              <ContactoCard key={contacto.id} contacto={contacto} />
            ))}
          </div>
        </div>
      )}

      {/* Decisores sugeridos por IA (pendientes de encontrar) */}
      {decisoresSugeridos.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
            {contactos.length > 0 ? "Buscar también" : "A quién buscar"}
          </p>
          <div className="space-y-2">
            {decisoresSugeridos.map((decisor, i) => (
              <DecisorSugeridoCard
                key={i}
                decisor={decisor}
                empresaId={empresaId}
              />
            ))}
          </div>
        </div>
      )}

      {contactos.length === 0 && decisoresSugeridos.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <User className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin decisores identificados</p>
        </div>
      )}

      {/* Botón para regenerar los decisores sugeridos con Claude */}
      <button
        onClick={actualizarDecisores}
        disabled={actualizando}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 mx-auto mt-2"
      >
        <RefreshCw className={`h-3 w-3 ${actualizando ? "animate-spin" : ""}`} />
        {actualizando ? "Actualizando decisores..." : "↻ Actualizar decisores"}
      </button>
    </div>
  );
}

function ContactoCard({ contacto }: { contacto: Contacto }) {
  const areaColor = AREA_COLOR[contacto.area ?? "otro"] ?? AREA_COLOR.otro;
  const iniciales = contacto.nombre
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            {iniciales}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">{contacto.nombre}</p>
              {contacto.es_decisor && (
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                  Decisor
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{contacto.cargo}</p>
            {contacto.area && (
              <span
                className={`inline-block mt-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${areaColor}`}
              >
                {AREA_LABEL[contacto.area]}
              </span>
            )}
            {contacto.notas_ia && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {contacto.notas_ia.split("\n")[0]}
              </p>
            )}
          </div>
        </div>

        {/* Acciones de contacto */}
        <div className="flex gap-2 mt-3">
          {contacto.telefono && (
            <Button variant="outline" size="sm" className="flex-1 text-xs" asChild>
              <a href={`tel:${contacto.telefono}`}>📞 {contacto.telefono}</a>
            </Button>
          )}
          {contacto.email && (
            <Button variant="outline" size="sm" className="flex-1 text-xs" asChild>
              <a href={`mailto:${contacto.email}`}>✉️ Email</a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DecisorSugeridoCard({
  decisor,
  empresaId,
}: {
  decisor: DecisorIA;
  empresaId: string;
}) {
  // Lista de contactos ya agregados para este cargo (permite múltiples)
  const [agregados, setAgregados] = useState<string[]>([]);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [mostrando, setMostrando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const areaColor = AREA_COLOR[decisor.area] ?? AREA_COLOR.otro;

  const guardar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    try {
      await fetch("/api/contactos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          nombre: nombre.trim(),
          cargo: decisor.cargo,
          area: decisor.area,
          telefono: telefono.trim() || null,
          es_decisor: true,
          notas_ia: `${decisor.por_que_es_clave}\n\nDolor: ${decisor.dolor_especifico}`,
        }),
      });
      setAgregados((prev) => [...prev, nombre.trim()]);
      setNombre("");
      setTelefono("");
      setMostrando(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card className="border-dashed">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{decisor.cargo}</p>
            <span
              className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${areaColor}`}
            >
              {AREA_LABEL[decisor.area] ?? decisor.area}
            </span>
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
              {decisor.dolor_especifico}
            </p>
          </div>
        </div>

        {/* Contactos ya agregados para este cargo */}
        {agregados.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {agregados.map((n, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400"
              >
                <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{n} agregado</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          {/* Buscar en LinkedIn */}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs gap-1"
            asChild
          >
            <a
              href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(decisor.query_linkedin)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Buscar en LinkedIn
            </a>
          </Button>

          {/* Agregar / Agregar otro — siempre visible */}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs gap-1"
            onClick={() => setMostrando(!mostrando)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            {agregados.length > 0 ? "+ Agregar otro" : "Agregar"}
          </Button>
        </div>

        {/* Mini-form para agregar — solo nombre + teléfono */}
        {mostrando && (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <input
              type="text"
              placeholder="Nombre completo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <input
              type="tel"
              placeholder="Teléfono (opcional)"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              size="sm"
              className="w-full"
              onClick={guardar}
              disabled={!nombre.trim() || guardando}
            >
              {guardando ? "Guardando..." : "Guardar contacto"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
