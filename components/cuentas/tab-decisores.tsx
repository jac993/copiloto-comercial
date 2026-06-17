"use client";

import { useState } from "react";
import { ExternalLink, UserPlus, User, CheckCircle, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/help-tooltip";
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

const CONFIANZA_BADGE: Record<string, { label: string; cls: string }> = {
  alta:  { label: "Alta confianza",  cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  media: { label: "Confianza media", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  baja:  { label: "Baja confianza",  cls: "bg-muted text-muted-foreground" },
};

interface TabDecisoresProps {
  contactos: Contacto[];
  decisoresIA: DecisorIA[];
  empresaId: string;
}

export function TabDecisores({ contactos, decisoresIA, empresaId }: TabDecisoresProps) {
  // Estado local para gestionar persona_encontrada sin recargar la página
  const [decisoresLocales, setDecisoresLocales] = useState<DecisorIA[]>(decisoresIA);

  const eliminarPersonaDecisor = (index: number) => {
    setDecisoresLocales((prev) =>
      prev.map((d, i) => i === index ? { ...d, persona_encontrada: null } : d)
    );
  };

  const cargoRegistrado = new Set(contactos.map((c) => c.cargo));
  const decisoresSugeridos = decisoresLocales.filter(
    (d) => !cargoRegistrado.has(d.cargo)
  );

  const personasIdentificadas = decisoresLocales.filter(
    (d) => d.persona_encontrada?.nombre != null
  ).length;

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
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {contactos.length > 0 ? "Buscar también" : "Decisores clave"}
            </p>
            {/* Contador de personas identificadas */}
            {personasIdentificadas > 0 && (
              <span className="text-xs text-[#7C3AED] font-semibold">
                [{personasIdentificadas}/{decisoresLocales.length} identificados]
              </span>
            )}
            <HelpTooltip
              titulo="¿Para qué sirven los decisores?"
              explicacion="Son las personas clave dentro de la empresa a las que debes contactar. Cada cargo tiene un dolor diferente — hablarle al de Calidad es muy distinto que hablarle al de Compras."
              ejemplo={"Busca primero al Jefe de Calidad u Operaciones — ellos sienten el dolor real. Compras decide formalmente pero no impulsa el cambio."}
            />
          </div>
          <div className="space-y-2">
            {decisoresSugeridos.map((decisor, i) => (
              <DecisorSugeridoCard
                key={i}
                decisor={decisor}
                empresaId={empresaId}
                onPersonaEliminada={() => {
                  // Encontrar índice real en decisoresLocales (no en la lista filtrada)
                  const idxReal = decisoresLocales.findIndex((d) => d.cargo === decisor.cargo);
                  if (idxReal >= 0) eliminarPersonaDecisor(idxReal);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {contactos.length === 0 && decisoresSugeridos.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <User className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin decisores identificados</p>
          <p className="text-xs mt-1 opacity-70">Pulsa &ldquo;⚡ Reinvestigar empresa&rdquo; para generar la ficha</p>
        </div>
      )}
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
  onPersonaEliminada,
}: {
  decisor: DecisorIA;
  empresaId: string;
  onPersonaEliminada: () => void;
}) {
  // Lista de contactos ya agregados para este cargo (permite múltiples)
  const [agregados, setAgregados] = useState<string[]>([]);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [mostrando, setMostrando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const areaColor = AREA_COLOR[decisor.area] ?? AREA_COLOR.otro;
  const persona = decisor.persona_encontrada;
  const tienePersona = persona != null && persona.nombre != null;

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

  // Eliminar persona_encontrada: actualiza estado local y llama al API en background
  const eliminarPersona = async () => {
    // 1. Actualizar estado local inmediatamente (optimistic update)
    onPersonaEliminada();
    // 2. Llamar al API en background
    try {
      await fetch(`/api/empresas/${empresaId}/eliminar-contacto-encontrado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cargo: decisor.cargo }),
      });
    } catch (err) {
      console.error("Error al eliminar persona:", err);
    }
  };

  return (
    <Card className="border-dashed">
      <CardContent className="pt-4 pb-4">
        {/* Encabezado: área badge + cargo */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${areaColor}`}>
                {AREA_LABEL[decisor.area] ?? decisor.area}
              </span>
            </div>
            <p className="font-semibold text-sm">{decisor.cargo}</p>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {decisor.dolor_especifico}
            </p>
          </div>
        </div>

        {/* Persona encontrada (si existe) */}
        {tienePersona && persona ? (
          <div className="bg-violet-50 dark:bg-violet-900/10 rounded-lg p-3 mb-3 space-y-2">
            <div className="flex items-center gap-2.5">
              {/* Avatar con iniciales */}
              <div className="h-9 w-9 rounded-full bg-[#7C3AED]/15 flex items-center justify-center text-xs font-bold text-[#7C3AED] shrink-0">
                {(persona.nombre ?? "?")
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{persona.nombre}</p>
                {persona.confianza && (
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${(CONFIANZA_BADGE[persona.confianza] ?? CONFIANZA_BADGE.baja).cls}`}>
                    {(CONFIANZA_BADGE[persona.confianza] ?? CONFIANZA_BADGE.baja).label}
                  </span>
                )}
              </div>
            </div>
            {/* LinkedIn si existe */}
            {persona.linkedin_url && (
              <a
                href={persona.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[#7C3AED] hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Ver perfil LinkedIn
              </a>
            )}
            {/* Fuente */}
            {persona.fuente && (
              <p className="text-xs text-muted-foreground">Fuente: {persona.fuente}</p>
            )}
          </div>
        ) : (
          /* Sin persona encontrada */
          <div className="flex items-center gap-2 mb-3 py-2 px-3 bg-muted/50 rounded-lg">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              No se encontró persona pública para este cargo
            </p>
          </div>
        )}

        {/* Contactos ya agregados para este cargo */}
        {agregados.length > 0 && (
          <div className="mb-3 space-y-1.5">
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

        {/* Separador */}
        <div className="border-t border-dashed border-border mb-3" />

        {/* Acciones */}
        <div className="flex gap-2">
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

          {/* Eliminar persona (solo si hay persona) */}
          {tienePersona && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1 text-muted-foreground hover:text-destructive"
              onClick={eliminarPersona}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Botón Agregar manualmente */}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs gap-1 mt-2"
          onClick={() => setMostrando(!mostrando)}
        >
          <UserPlus className="h-3.5 w-3.5" />
          {agregados.length > 0 ? "+ Agregar otro" : "Agregar manualmente"}
        </Button>

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
