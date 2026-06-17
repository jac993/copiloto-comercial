"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, UserPlus, User, CheckCircle, RefreshCw, Copy, Phone, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import type { Contacto, DecisorIA, ContactoReal } from "@/lib/types";

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
  contactosReales?: ContactoReal[];
}

export function TabDecisores({ contactos, decisoresIA, empresaId, contactosReales = [] }: TabDecisoresProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [actualizando, setActualizando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  // Estado local para permitir eliminar contactos sin recargar la página
  const [contactosVisibles, setContactosVisibles] = useState<typeof contactosReales>(contactosReales);

  const eliminarContactoLocal = (index: number) => {
    setContactosVisibles((prev) => prev.filter((_, i) => i !== index));
  };

  const actualizarDecisores = async () => {
    setActualizando(true);
    try {
      const res = await fetch(
        `/api/empresas/${empresaId}/regenerar-decisores`,
        { method: "POST" }
      );
      const data = await res.json() as {
        ok: boolean;
        error?: string;
        totalContactos?: number;
        noEncontrados?: string | null;
      };

      if (!data.ok) {
        toast({
          variant: "destructive",
          title: "No se pudo actualizar",
          description: data.error ?? "Error desconocido",
        });
        return;
      }

      if (data.noEncontrados) {
        toast({
          title: "Búsqueda completada",
          description: data.noEncontrados,
        });
      } else {
        toast({
          title: "¡Actualizado con Perplexity!",
          description: `${data.totalContactos ?? 0} contacto${(data.totalContactos ?? 0) !== 1 ? "s" : ""} encontrado${(data.totalContactos ?? 0) !== 1 ? "s" : ""}.`,
        });
      }
      router.refresh();

    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error de conexión",
        description: String(err),
      });
    } finally {
      setActualizando(false);
    }
  };

  const limpiarContactos = async () => {
    setLimpiando(true);
    try {
      const res = await fetch(
        `/api/empresas/${empresaId}/limpiar-contactos`,
        { method: "POST" }
      );
      const data = await res.json() as { ok: boolean; eliminados?: number; error?: string };
      if (!data.ok) {
        toast({ variant: "destructive", title: "Error al limpiar", description: data.error });
        return;
      }
      toast({
        title: data.eliminados === 0 ? "Sin contactos para limpiar" : `${data.eliminados} contacto${data.eliminados !== 1 ? "s" : ""} eliminado${data.eliminados !== 1 ? "s" : ""}`,
        description: data.eliminados === 0 ? "No hay contactos sin nombre en esta empresa." : "Se eliminaron los contactos sin nombre real.",
      });
      if ((data.eliminados ?? 0) > 0) router.refresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Error de conexión", description: String(err) });
    } finally {
      setLimpiando(false);
    }
  };

  // Mostrar los contactos ya registrados primero, luego los sugeridos por IA no registrados
  const cargoRegistrado = new Set(contactos.map((c) => c.cargo));
  const decisoresSugeridos = decisoresIA.filter(
    (d) => !cargoRegistrado.has(d.cargo)
  );

  return (
    <div className="space-y-4 pb-6">
      {/* Botón principal — buscar con Perplexity */}
      <button
        onClick={actualizarDecisores}
        disabled={actualizando}
        className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border-2 border-[#7C3AED] text-[#7C3AED] bg-white dark:bg-background hover:bg-[#EDE9FE] dark:hover:bg-[#7C3AED]/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <RefreshCw className={`h-4 w-4 shrink-0 ${actualizando ? "animate-spin" : ""}`} />
        <div className="text-left">
          <p className="text-sm font-semibold">
            {actualizando ? "Buscando en internet..." : "↻ Actualizar con Perplexity"}
          </p>
          {!actualizando && (
            <p className="text-xs opacity-70">Busca contactos reales y actualiza la inteligencia comercial</p>
          )}
        </div>
      </button>

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
              {contactos.length > 0 ? "Buscar también" : "A quién buscar"}
            </p>
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

      {/* Contactos encontrados en internet (Perplexity) */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            🔍 Contactos encontrados en internet
          </p>
          <button
            onClick={limpiarContactos}
            disabled={limpiando}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            {limpiando ? "Limpiando..." : "Limpiar sin nombre"}
          </button>
        </div>
        {contactosVisibles.length > 0 ? (
          <div className="space-y-2">
            {contactosVisibles.map((c, i) => (
              <ContactoRealCard
                key={i}
                contacto={c}
                empresaId={empresaId}
                onEliminar={() => eliminarContactoLocal(i)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground px-1">
            No se encontraron contactos públicos. Pulsa &ldquo;↻ Actualizar con Perplexity&rdquo; para buscar en internet.
          </p>
        )}
      </div>

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

// ── Tarjeta de contacto real encontrado en internet ───────────
const CONFIANZA_BADGE: Record<string, { label: string; cls: string }> = {
  alta:  { label: "✓ Alta confianza",  cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  media: { label: "~ Confianza media", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  baja:  { label: "? Baja confianza",  cls: "bg-muted text-muted-foreground" },
};

const RELEVANCIA_BADGE: Record<string, { label: string; cls: string }> = {
  alta:  { label: "Alta relevancia",  cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  media: { label: "Media relevancia", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  baja:  { label: "Baja relevancia",  cls: "bg-muted text-muted-foreground" },
};

function ContactoRealCard({
  contacto,
  empresaId,
  onEliminar,
}: {
  contacto: ContactoReal;
  empresaId: string;
  onEliminar: () => void;
}) {
  const [agregado, setAgregado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  const copiarEmail = () => {
    if (!contacto.email) return;
    navigator.clipboard.writeText(contacto.email).catch(() => {});
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };

  const agregar = async () => {
    setGuardando(true);
    try {
      await fetch("/api/contactos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          nombre: contacto.nombre ?? "Contacto encontrado en internet",
          cargo: contacto.cargo ?? null,
          area: null,
          email: contacto.email ?? null,
          telefono: contacto.telefono ?? null,
          linkedin_url: contacto.linkedin_url ?? null,
          es_decisor: contacto.relevancia_venta === "alta",
          notas_ia: `Encontrado en internet.\nFuente: ${contacto.fuente}\nConfianza: ${contacto.confianza}`,
        }),
      });
      setAgregado(true);
    } finally {
      setGuardando(false);
    }
  };

  const confianza = CONFIANZA_BADGE[contacto.confianza] ?? CONFIANZA_BADGE.baja;
  const relevancia = RELEVANCIA_BADGE[contacto.relevancia_venta] ?? RELEVANCIA_BADGE.baja;

  return (
    <Card className="border border-dashed border-violet-200 dark:border-violet-800/30">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-violet-100 dark:bg-violet-900/20 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">
              {contacto.nombre ?? "Nombre desconocido"}
            </p>
            {contacto.cargo && (
              <p className="text-xs text-muted-foreground">{contacto.cargo}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${confianza.cls}`}>
                {confianza.label}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${relevancia.cls}`}>
                {relevancia.label}
              </span>
            </div>
          </div>
        </div>

        {/* Datos de contacto */}
        <div className="mt-3 space-y-1.5">
          {contacto.email && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono flex-1 truncate">{contacto.email}</span>
              <button onClick={copiarEmail} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Copy className="h-3 w-3" />
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>
          )}
          {contacto.telefono && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground flex-1">{contacto.telefono}</span>
              <a href={`tel:${contacto.telefono}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Phone className="h-3 w-3" />
                Llamar
              </a>
            </div>
          )}
          {contacto.linkedin_url && (
            <a
              href={contacto.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Ver LinkedIn
            </a>
          )}
        </div>

        {/* Cómo contactar (si no hay datos directos) */}
        {!contacto.email && !contacto.telefono && !contacto.linkedin_url && contacto.como_contactar && (
          <div className="mt-2.5 bg-amber-50 dark:bg-amber-900/10 rounded-lg p-2.5">
            <p className="text-xs text-amber-700 dark:text-amber-400">{contacto.como_contactar}</p>
          </div>
        )}

        {/* Fuente */}
        <p className="text-xs text-muted-foreground mt-2">
          Fuente: {contacto.fuente.startsWith("http") ? (
            <a href={contacto.fuente} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {(() => { try { return new URL(contacto.fuente).hostname.replace(/^www\./, ""); } catch { return contacto.fuente; } })()}
            </a>
          ) : contacto.fuente}
        </p>

        {/* Acciones: agregar + eliminar */}
        <div className="mt-3 space-y-2">
          {agregado ? (
            <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
              <CheckCircle className="h-3.5 w-3.5" />
              Agregado a decisores
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs gap-1.5"
              onClick={agregar}
              disabled={guardando}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {guardando ? "Guardando..." : "➕ Agregar a decisores"}
            </Button>
          )}

          {/* Eliminar con confirmación inline */}
          {confirmarEliminar ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground flex-1">¿Eliminar este contacto?</span>
              <button
                onClick={onEliminar}
                className="text-xs font-medium text-destructive hover:underline"
              >
                Eliminar
              </button>
              <button
                onClick={() => setConfirmarEliminar(false)}
                className="text-xs text-muted-foreground hover:underline"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmarEliminar(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Eliminar de la lista
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
