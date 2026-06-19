"use client";

import { useState } from "react";
import { ExternalLink, UserPlus, User, Trash2, Pencil, X, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import type { Contacto, DecisorIA, AreaContacto } from "@/lib/types";

const AREA_OPCIONES: { value: AreaContacto; label: string }[] = [
  { value: "calidad",       label: "Calidad" },
  { value: "operaciones",   label: "Operaciones" },
  { value: "adquisiciones", label: "Adquisiciones" },
  { value: "compras",       label: "Compras" },
  { value: "gerencia",      label: "Gerencia" },
  { value: "otro",          label: "Otro" },
];

const AREA_LABEL: Record<string, string> = Object.fromEntries(
  AREA_OPCIONES.map((o) => [o.value, o.label])
);

const AREA_COLOR: Record<string, string> = {
  calidad:       "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  operaciones:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  adquisiciones: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  compras:       "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  gerencia:      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  otro:          "bg-muted text-muted-foreground",
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
  nombreBusqueda: string;
}

export function TabDecisores({ contactos, decisoresIA, empresaId, nombreBusqueda }: TabDecisoresProps) {
  const [decisoresLocales, setDecisoresLocales] = useState<DecisorIA[]>(decisoresIA);
  // Estado local para soportar eliminaciones sin recargar la página
  const [contactosLocales, setContactosLocales] = useState<Contacto[]>(contactos);

  const eliminarPersonaDecisor = (index: number) => {
    setDecisoresLocales((prev) =>
      prev.map((d, i) => i === index ? { ...d, persona_encontrada: null } : d)
    );
  };

  const handleContactoEliminado = (id: string) => {
    setContactosLocales((prev) => prev.filter((c) => c.id !== id));
  };

  const handleContactoAgregado = (nuevo: Contacto) => {
    setContactosLocales((prev) => [...prev, nuevo]);
  };

  const cargoRegistrado = new Set(contactosLocales.map((c) => c.cargo));
  const decisoresSugeridos = decisoresLocales.filter((d) => !cargoRegistrado.has(d.cargo));

  const personasIdentificadas = decisoresLocales.filter(
    (d) => d.persona_encontrada?.nombre != null
  ).length;

  return (
    <div className="space-y-4 pb-6">
      {/* Contactos ya registrados */}
      {contactosLocales.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
            Contactos registrados
          </p>
          <div className="space-y-2">
            {contactosLocales.map((contacto) => (
              <ContactoCard
                key={contacto.id}
                contacto={contacto}
                onEliminar={() => handleContactoEliminado(contacto.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Decisores sugeridos por IA */}
      {decisoresSugeridos.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {contactos.length > 0 ? "Buscar también" : "Decisores clave"}
            </p>
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
                nombreBusqueda={nombreBusqueda}
                onContactoAgregado={handleContactoAgregado}
                onPersonaEliminada={() => {
                  const idxReal = decisoresLocales.findIndex((d) => d.cargo === decisor.cargo);
                  if (idxReal >= 0) eliminarPersonaDecisor(idxReal);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {contactosLocales.length === 0 && decisoresSugeridos.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <User className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin decisores identificados</p>
          <p className="text-xs mt-1 opacity-70">Pulsa &ldquo;⚡ Reinvestigar empresa&rdquo; para generar la ficha</p>
        </div>
      )}
    </div>
  );
}

// ── ContactoCard — muestra un contacto guardado, con edición inline ──────────

function ContactoCard({ contacto, onEliminar }: { contacto: Contacto; onEliminar?: () => void }) {
  const [datos, setDatos] = useState<Contacto>(contacto);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({
    nombre:      datos.nombre,
    cargo:       datos.cargo      ?? "",
    area:        datos.area       ?? "",
    email:       datos.email      ?? "",
    telefono:    datos.telefono   ?? "",
    linkedin_url: datos.linkedin_url ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areaColor = AREA_COLOR[datos.area ?? "otro"] ?? AREA_COLOR.otro;
  const iniciales = datos.nombre
    .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const handleEliminar = async () => {
    setEliminando(true);
    try {
      await fetch(`/api/contactos/${datos.id}`, { method: "DELETE" });
      onEliminar?.();
    } finally {
      setEliminando(false);
    }
  };

  const guardarEdicion = async () => {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/contactos/${datos.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre:      form.nombre.trim(),
          cargo:       form.cargo.trim()       || null,
          area:        form.area               || null,
          email:       form.email.trim()       || null,
          telefono:    form.telefono.trim()    || null,
          linkedin_url: form.linkedin_url.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("No se pudo guardar");
      const actualizado = (await res.json()) as Contacto;
      setDatos(actualizado);
      setEditando(false);
    } catch {
      setError("Error al guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  if (editando) {
    return (
      <Card>
        <CardContent className="pt-4 pb-4 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-muted-foreground">Editar contacto</p>
            <button
              onClick={() => { setEditando(false); setError(null); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Cancelar edición"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            placeholder="Nombre completo *"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <input
            type="text"
            placeholder="Cargo"
            value={form.cargo}
            onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={form.area}
            onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Área (opcional)</option>
            {AREA_OPCIONES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="tel"
            placeholder="Teléfono"
            value={form.telefono}
            onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="url"
            placeholder="URL de LinkedIn"
            value={form.linkedin_url}
            onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            size="sm"
            className="w-full bg-[#7C3AED] hover:bg-violet-700"
            onClick={guardarEdicion}
            disabled={!form.nombre.trim() || guardando}
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            {iniciales}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{datos.nombre}</p>
                  {datos.es_decisor && (
                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                      Decisor
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{datos.cargo}</p>
                {datos.area && (
                  <span className={`inline-block mt-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${areaColor}`}>
                    {AREA_LABEL[datos.area]}
                  </span>
                )}
              </div>
              {/* Botones editar y eliminar */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => setEditando(true)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-[#7C3AED] hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                  aria-label="Editar contacto"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {onEliminar && (
                  <button
                    onClick={handleEliminar}
                    disabled={eliminando}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    aria-label="Eliminar contacto"
                  >
                    {eliminando
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {datos.notas_ia && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {datos.notas_ia.split("\n")[0]}
              </p>
            )}
          </div>
        </div>

        {/* Acciones: teléfono, email, LinkedIn */}
        {(datos.telefono || datos.email || datos.linkedin_url) && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {datos.telefono && (
              <Button variant="outline" size="sm" className="flex-1 text-xs min-w-0" asChild>
                <a href={`tel:${datos.telefono}`}>📞 {datos.telefono}</a>
              </Button>
            )}
            {datos.email && (
              <Button variant="outline" size="sm" className="flex-1 text-xs min-w-0" asChild>
                <a href={`mailto:${datos.email}`}>✉️ Email</a>
              </Button>
            )}
            {datos.linkedin_url && (
              <Button variant="outline" size="sm" className="flex-1 text-xs min-w-0 gap-1" asChild>
                <a href={datos.linkedin_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  LinkedIn
                </a>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── DecisorSugeridoCard — decisor de IA pendiente de encontrar ────────────────

function DecisorSugeridoCard({
  decisor,
  empresaId,
  nombreBusqueda,
  onContactoAgregado,
  onPersonaEliminada,
}: {
  decisor: DecisorIA;
  empresaId: string;
  nombreBusqueda: string;
  onContactoAgregado: (c: Contacto) => void;
  onPersonaEliminada: () => void;
}) {
  const [agregados, setAgregados] = useState<Contacto[]>([]);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
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
      const res = await fetch("/api/contactos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id:  empresaId,
          nombre:      nombre.trim(),
          cargo:       decisor.cargo,
          area:        decisor.area,
          telefono:    telefono.trim() || null,
          email:       email.trim()    || null,
          linkedin_url: linkedinUrl.trim() || null,
          es_decisor:  true,
          notas_ia:    `${decisor.por_que_es_clave}\n\nDolor: ${decisor.dolor_especifico}`,
        }),
      });
      const nuevo = (await res.json()) as Contacto;
      setAgregados((prev) => [...prev, nuevo]);
      onContactoAgregado(nuevo);
      setNombre("");
      setEmail("");
      setLinkedinUrl("");
      setTelefono("");
      setMostrando(false);
    } finally {
      setGuardando(false);
    }
  };

  const eliminarPersona = async () => {
    onPersonaEliminada();
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
        {/* Encabezado */}
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

        {/* Persona encontrada */}
        {tienePersona && persona ? (
          <div className="bg-violet-50 dark:bg-violet-900/10 rounded-lg p-3 mb-3 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-full bg-[#7C3AED]/15 flex items-center justify-center text-xs font-bold text-[#7C3AED] shrink-0">
                {(persona.nombre ?? "?").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
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
            {persona.fuente && (
              <p className="text-xs text-muted-foreground">Fuente: {persona.fuente}</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-3 py-2 px-3 bg-muted/50 rounded-lg">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              No se encontró persona pública para este cargo
            </p>
          </div>
        )}

        {/* Contactos recién agregados — se muestran como tarjeta real */}
        {agregados.length > 0 && (
          <div className="mb-3 space-y-2">
            {agregados.map((c) => (
              <ContactoCard
                key={c.id}
                contacto={c}
                onEliminar={() => setAgregados((prev) => prev.filter((x) => x.id !== c.id))}
              />
            ))}
          </div>
        )}

        <div className="border-t border-dashed border-border mb-3" />

        {/* Acciones */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" asChild>
            <a
              href={(() => {
                // Extrae el prefijo de cargo (primeras 2 palabras: "Jefe Calidad", "Gerente General"…)
                // y reemplaza el nombre de empresa por el nombre comercial si existe
                const partes = decisor.query_linkedin.trim().split(/\s+/);
                const prefijoCargo = partes.slice(0, 2).join(" ");
                const query = `${prefijoCargo} ${nombreBusqueda} Chile`;
                return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
              })()}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Buscar en LinkedIn
            </a>
          </Button>
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

        {/* Mini-form con email y LinkedIn */}
        {mostrando && (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <input
              type="text"
              placeholder="Nombre completo *"
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
            <input
              type="email"
              placeholder="Email (opcional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="url"
              placeholder="URL de LinkedIn (opcional)"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              size="sm"
              className="w-full bg-[#7C3AED] hover:bg-violet-700"
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
