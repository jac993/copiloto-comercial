"use client";

import { useState } from "react";
import { Trophy, Plus, Pencil, Trash2, X, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Caso, CasoInsert, TecnicaCaso, TamanoCaso, CanalCaso } from "@/lib/types";

// ─── Opciones de selects ──────────────────────────────────────

const TAMANOS: { value: TamanoCaso; label: string }[] = [
  { value: "grande",   label: "Grande" },
  { value: "mediana",  label: "Mediana" },
  { value: "pequeña",  label: "Pequeña" },
];

const CANALES: { value: CanalCaso; label: string }[] = [
  { value: "llamada",  label: "Llamada" },
  { value: "email",    label: "Email" },
  { value: "LinkedIn", label: "LinkedIn" },
  { value: "referido", label: "Referido" },
  { value: "visita",   label: "Visita" },
];

const TECNICAS: { value: TecnicaCaso; label: string }[] = [
  { value: "SPIN",       label: "SPIN" },
  { value: "Challenger", label: "Challenger" },
  { value: "Sandler",    label: "Sandler" },
  { value: "Consultiva", label: "Consultiva" },
  { value: "Otra",       label: "Otra" },
];

// ─── Formulario vacío ─────────────────────────────────────────

const FORM_VACIO: Omit<CasoInsert, "activo"> = {
  sector: "",
  tamano_empresa: null,
  cargo_decisor: null,
  problema: "",
  proveedor_anterior: null,
  solucion: "",
  tipo_etiqueta: null,
  resultado: "",
  objecion_vencida: null,
  canal_entrada: null,
  tecnica_venta: null,
  tiempo_cierre: null,
};

// ─── Props ────────────────────────────────────────────────────

interface CasosClientProps {
  casosIniciales: Caso[];
}

// ─── Componente principal ─────────────────────────────────────

export function CasosClient({ casosIniciales }: CasosClientProps) {
  const { toast } = useToast();
  const [casos, setCasos] = useState<Caso[]>(casosIniciales);
  const [sheetAbierto, setSheetAbierto] = useState(false);
  const [editando, setEditando] = useState<Caso | null>(null);
  const [form, setForm] = useState<Omit<CasoInsert, "activo">>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  // ── Formulario helpers ──────────────────────────────────────

  const abrirNuevo = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setSheetAbierto(true);
  };

  const abrirEditar = (caso: Caso) => {
    setEditando(caso);
    setForm({
      sector:            caso.sector,
      tamano_empresa:    caso.tamano_empresa,
      cargo_decisor:     caso.cargo_decisor,
      problema:          caso.problema,
      proveedor_anterior:caso.proveedor_anterior,
      solucion:          caso.solucion,
      tipo_etiqueta:     caso.tipo_etiqueta,
      resultado:         caso.resultado,
      objecion_vencida:  caso.objecion_vencida,
      canal_entrada:     caso.canal_entrada,
      tecnica_venta:     caso.tecnica_venta,
      tiempo_cierre:     caso.tiempo_cierre,
    });
    setSheetAbierto(true);
  };

  const cerrarSheet = () => {
    setSheetAbierto(false);
    setEditando(null);
    setForm(FORM_VACIO);
  };

  const setField = <K extends keyof typeof form>(key: K, value: typeof form[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ── Guardar ─────────────────────────────────────────────────

  const guardar = async () => {
    if (!form.sector.trim() || !form.problema.trim() || !form.solucion.trim() || !form.resultado.trim()) {
      toast({ variant: "destructive", title: "Completa los campos obligatorios: sector, problema, solución y resultado" });
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        ...form,
        sector:           form.sector.trim(),
        problema:         form.problema.trim(),
        solucion:         form.solucion.trim(),
        resultado:        form.resultado.trim(),
        cargo_decisor:    form.cargo_decisor?.trim() || null,
        proveedor_anterior:form.proveedor_anterior?.trim() || null,
        tipo_etiqueta:    form.tipo_etiqueta?.trim() || null,
        objecion_vencida: form.objecion_vencida?.trim() || null,
        tiempo_cierre:    form.tiempo_cierre?.trim() || null,
      };

      if (editando) {
        const res = await fetch(`/api/casos/${editando.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json() as Caso & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Error al actualizar");
        setCasos((prev) => prev.map((c) => c.id === editando.id ? data : c));
        toast({ title: "Caso actualizado ✓" });
      } else {
        const res = await fetch("/api/casos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json() as Caso & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Error al crear");
        setCasos((prev) => [data, ...prev]);
        toast({ title: "Caso agregado ✓" });
      }

      cerrarSheet();
    } catch (e) {
      toast({ variant: "destructive", title: "Error al guardar", description: e instanceof Error ? e.message : "Error desconocido" });
    } finally {
      setGuardando(false);
    }
  };

  // ── Eliminar ─────────────────────────────────────────────────

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar este caso? Esta acción no se puede deshacer.")) return;
    setEliminandoId(id);
    try {
      const res = await fetch(`/api/casos/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Error al eliminar");
      }
      setCasos((prev) => prev.filter((c) => c.id !== id));
      toast({ title: "Caso eliminado" });
    } catch (e) {
      toast({ variant: "destructive", title: "Error al eliminar", description: e instanceof Error ? e.message : "Error desconocido" });
    } finally {
      setEliminandoId(null);
    }
  };

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="relative pb-24">

      {/* Lista de casos */}
      {casos.length === 0 ? (
        <EstadoVacio onAgregar={abrirNuevo} />
      ) : (
        <div className="px-4 pt-4 space-y-3">
          <p className="text-xs text-muted-foreground font-medium">
            {casos.length} {casos.length === 1 ? "caso documentado" : "casos documentados"}
          </p>
          {casos.map((caso) => (
            <CasoCard
              key={caso.id}
              caso={caso}
              expandido={expandidoId === caso.id}
              onToggle={() => setExpandidoId(expandidoId === caso.id ? null : caso.id)}
              onEditar={() => abrirEditar(caso)}
              onEliminar={() => eliminar(caso.id)}
              eliminando={eliminandoId === caso.id}
            />
          ))}
        </div>
      )}

      {/* FAB — agregar caso */}
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40">
        <Button
          size="lg"
          className="rounded-2xl shadow-xl shadow-primary/30 gap-2 pr-5 h-14"
          onClick={abrirNuevo}
        >
          <Plus className="h-5 w-5" />
          Agregar caso real
        </Button>
      </div>

      {/* Sheet — formulario */}
      {sheetAbierto && (
        <CasoSheet
          form={form}
          editando={editando}
          guardando={guardando}
          onClose={cerrarSheet}
          onGuardar={guardar}
          setField={setField}
        />
      )}
    </div>
  );
}

// ─── Card de caso ─────────────────────────────────────────────

interface CasoCardProps {
  caso: Caso;
  expandido: boolean;
  onToggle: () => void;
  onEditar: () => void;
  onEliminar: () => void;
  eliminando: boolean;
}

function CasoCard({ caso, expandido, onToggle, onEditar, onEliminar, eliminando }: CasoCardProps) {
  return (
    <Card className="border hover:border-primary/30 transition-all">
      <CardContent className="p-4">
        {/* Cabecera */}
        <button
          type="button"
          onClick={onToggle}
          className="w-full text-left"
        >
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Trophy className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm capitalize">{caso.sector}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  {caso.tamano_empresa && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium capitalize">
                      {caso.tamano_empresa}
                    </span>
                  )}
                  {expandido ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{caso.problema}</p>
              <p className="text-xs font-medium text-green-600 dark:text-green-400 mt-1 line-clamp-1">
                → {caso.resultado}
              </p>
            </div>
          </div>
        </button>

        {/* Detalle expandible */}
        {expandido && (
          <div className="mt-4 space-y-3 border-t border-border pt-3">
            <DetalleFila label="Solución" valor={caso.solucion} />
            {caso.cargo_decisor && <DetalleFila label="Decisor que cerró" valor={caso.cargo_decisor} />}
            {caso.tipo_etiqueta && <DetalleFila label="Tipo de etiqueta" valor={caso.tipo_etiqueta} />}
            {caso.proveedor_anterior && <DetalleFila label="Proveedor anterior" valor={caso.proveedor_anterior} />}
            {caso.objecion_vencida && <DetalleFila label="Objeción vencida" valor={caso.objecion_vencida} />}
            <div className="flex flex-wrap gap-2 pt-1">
              {caso.canal_entrada && <Tag label={caso.canal_entrada} color="blue" />}
              {caso.tecnica_venta && <Tag label={caso.tecnica_venta} color="purple" />}
              {caso.tiempo_cierre && <Tag label={`Cierre: ${caso.tiempo_cierre}`} color="amber" />}
            </div>

            {/* Acciones */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onEditar}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg border border-border hover:border-foreground/20"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
              <button
                type="button"
                onClick={onEliminar}
                disabled={eliminando}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 transition-colors px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/30 hover:border-red-400 disabled:opacity-50"
              >
                {eliminando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Eliminar
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DetalleFila({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm mt-0.5 leading-snug">{valor}</p>
    </div>
  );
}

function Tag({ label, color }: { label: string; color: "blue" | "purple" | "amber" }) {
  const cls = {
    blue:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    amber:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  }[color];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
  );
}

// ─── Estado vacío ─────────────────────────────────────────────

function EstadoVacio({ onAgregar }: { onAgregar: () => void }) {
  return (
    <div className="px-4 pt-6">
      <div className="flex flex-col items-center text-center gap-5 p-8 rounded-2xl border-2 border-dashed border-border">
        <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center">
          <Trophy className="h-10 w-10 text-primary" />
        </div>
        <div className="space-y-2 max-w-xs">
          <p className="font-semibold text-lg">Sin casos documentados</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Agrega casos reales de ventas cerradas para que la IA los use como referencia al preparar borradores y análisis.
          </p>
        </div>
        <Button size="lg" className="gap-2 w-full max-w-xs" onClick={onAgregar}>
          <Plus className="h-4 w-4" />
          Agregar primer caso
        </Button>
      </div>
    </div>
  );
}

// ─── Sheet / formulario ───────────────────────────────────────

interface CasoSheetProps {
  form: Omit<CasoInsert, "activo">;
  editando: Caso | null;
  guardando: boolean;
  onClose: () => void;
  onGuardar: () => void;
  setField: <K extends keyof Omit<CasoInsert, "activo">>(key: K, value: Omit<CasoInsert, "activo">[K]) => void;
}

function CasoSheet({ form, editando, guardando, onClose, onGuardar, setField }: CasoSheetProps) {
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel deslizable desde la derecha */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-background border-l border-border shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-semibold text-base">
              {editando ? "Editar caso" : "Nuevo caso real"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              La IA usará este caso como referencia en borradores y análisis
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Formulario — scroll */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Sector */}
          <Campo label="Sector *" descripcion="Ej: lácteos, vitivinícola, farmacéutico, cosmética">
            <input
              type="text"
              value={form.sector}
              onChange={(e) => setField("sector", e.target.value)}
              placeholder="Ej: vitivinícola"
              className={INPUT_CLS}
            />
          </Campo>

          {/* Tamaño */}
          <Campo label="Tamaño de empresa">
            <div className="flex gap-2 flex-wrap">
              {TAMANOS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setField("tamano_empresa", form.tamano_empresa === t.value ? null : t.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.tamano_empresa === t.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Campo>

          {/* Cargo decisor */}
          <Campo label="Cargo del decisor que cerró" descripcion="Ej: Jefe de Calidad, Gerente de Operaciones">
            <input
              type="text"
              value={form.cargo_decisor ?? ""}
              onChange={(e) => setField("cargo_decisor", e.target.value || null)}
              placeholder="Ej: Jefe de Calidad"
              className={INPUT_CLS}
            />
          </Campo>

          {/* Problema */}
          <Campo label="Problema que tenían *" descripcion="Describe el dolor que motivó el cambio de proveedor">
            <textarea
              value={form.problema}
              onChange={(e) => setField("problema", e.target.value)}
              rows={3}
              placeholder="Ej: Etiquetas con adhesivo que se despegaba en cámaras frías, generando re-etiquetado en línea."
              className={TEXTAREA_CLS}
            />
          </Campo>

          {/* Proveedor anterior */}
          <Campo label="Proveedor anterior y por qué fallaba" descripcion="Opcional">
            <textarea
              value={form.proveedor_anterior ?? ""}
              onChange={(e) => setField("proveedor_anterior", e.target.value || null)}
              rows={2}
              placeholder="Ej: Proveedor X — mala consistencia de colores entre lotes, afectaba trazabilidad."
              className={TEXTAREA_CLS}
            />
          </Campo>

          {/* Solución */}
          <Campo label="Solución que aplicó One Label *">
            <textarea
              value={form.solucion}
              onChange={(e) => setField("solucion", e.target.value)}
              rows={3}
              placeholder="Ej: Etiquetas con adhesivo criogénico certificado, entrega en 5 días, control de color con densitómetro por lote."
              className={TEXTAREA_CLS}
            />
          </Campo>

          {/* Tipo de etiqueta */}
          <Campo label="Tipo de etiqueta" descripcion="Opcional">
            <input
              type="text"
              value={form.tipo_etiqueta ?? ""}
              onChange={(e) => setField("tipo_etiqueta", e.target.value || null)}
              placeholder="Ej: Etiqueta wrap-around BOPP criogénica"
              className={INPUT_CLS}
            />
          </Campo>

          {/* Resultado */}
          <Campo label="Resultado medido *" descripcion="Qué mejoró, en qué porcentaje, cuánto ahorraron">
            <textarea
              value={form.resultado}
              onChange={(e) => setField("resultado", e.target.value)}
              rows={3}
              placeholder="Ej: Cero re-etiquetados en 6 meses. Ahorro estimado de 2 horas/semana en línea de producción."
              className={TEXTAREA_CLS}
            />
          </Campo>

          {/* Objeción vencida */}
          <Campo label="Objeción principal que se venció" descripcion="Opcional">
            <input
              type="text"
              value={form.objecion_vencida ?? ""}
              onChange={(e) => setField("objecion_vencida", e.target.value || null)}
              placeholder="Ej: 'Tenemos contrato con proveedor actual hasta diciembre'"
              className={INPUT_CLS}
            />
          </Campo>

          {/* Canal de entrada */}
          <Campo label="Canal de entrada">
            <div className="flex gap-2 flex-wrap">
              {CANALES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setField("canal_entrada", form.canal_entrada === c.value ? null : c.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.canal_entrada === c.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </Campo>

          {/* Técnica de venta */}
          <Campo label="Técnica de venta que funcionó">
            <div className="flex gap-2 flex-wrap">
              {TECNICAS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setField("tecnica_venta", form.tecnica_venta === t.value ? null : t.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.tecnica_venta === t.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Campo>

          {/* Tiempo de cierre */}
          <Campo label="Tiempo desde primer contacto hasta cierre" descripcion="Opcional">
            <input
              type="text"
              value={form.tiempo_cierre ?? ""}
              onChange={(e) => setField("tiempo_cierre", e.target.value || null)}
              placeholder="Ej: 3 semanas, 2 meses"
              className={INPUT_CLS}
            />
          </Campo>

        </div>

        {/* Footer con botones */}
        <div className="shrink-0 px-5 py-4 border-t border-border flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={guardando}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={onGuardar}
            disabled={guardando}
            className="flex-1 bg-[#7C3AED] hover:bg-[#6d28d9] text-white gap-2"
          >
            {guardando ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</>
            ) : (
              editando ? "Guardar cambios" : "Agregar caso"
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

// ─── Helpers de estilo ────────────────────────────────────────

const INPUT_CLS =
  "w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/60";

const TEXTAREA_CLS =
  "w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/60";

function Campo({
  label,
  descripcion,
  children,
}: {
  label: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {descripcion && (
        <p className="text-xs text-muted-foreground -mt-1">{descripcion}</p>
      )}
      {children}
    </div>
  );
}
