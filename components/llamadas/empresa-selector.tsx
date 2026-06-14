"use client";

// Selector de empresa con búsqueda por nombre.
// Filtra la lista precargada en el cliente para no hacer fetch en cada keystroke.
// Al seleccionar, carga los contactos de esa empresa.

import { useState, useRef, useEffect } from "react";
import { Search, Building2, X } from "lucide-react";
import type { Empresa, Contacto } from "@/lib/types";

interface EmpresaSelectorProps {
  empresas: Empresa[];
  onSeleccionar: (empresa: Empresa | null) => void;
  onContactoSeleccionado?: (contacto: Contacto | null) => void;
  placeholder?: string;
}

export function EmpresaSelector({
  empresas,
  onSeleccionar,
  onContactoSeleccionado,
  placeholder = "Buscar empresa...",
}: EmpresaSelectorProps) {
  const [query, setQuery] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [seleccionada, setSeleccionada] = useState<Empresa | null>(null);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [contactoId, setContactoId] = useState<string>("");
  const [cargandoContactos, setCargandoContactos] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Filtrar empresas por query (case insensitive)
  const resultados = query.length >= 1
    ? empresas.filter((e) =>
        e.nombre.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Cargar contactos cuando se selecciona una empresa
  async function seleccionar(empresa: Empresa) {
    setSeleccionada(empresa);
    setAbierto(false);
    setQuery(empresa.nombre);
    onSeleccionar(empresa);
    setContactoId("");
    onContactoSeleccionado?.(null);

    if (!onContactoSeleccionado) return;

    setCargandoContactos(true);
    try {
      const res = await fetch(`/api/contactos?empresa_id=${empresa.id}`);
      const data = await res.json() as { contactos?: Contacto[] };
      setContactos(data.contactos ?? []);
    } catch {
      setContactos([]);
    } finally {
      setCargandoContactos(false);
    }
  }

  function limpiar() {
    setSeleccionada(null);
    setQuery("");
    setContactos([]);
    setContactoId("");
    onSeleccionar(null);
    onContactoSeleccionado?.(null);
  }

  function handleContactoChange(id: string) {
    setContactoId(id);
    const contacto = contactos.find((c) => c.id === id) ?? null;
    onContactoSeleccionado?.(contacto);
  }

  return (
    <div className="space-y-3">
      {/* Input de búsqueda */}
      <div ref={contenedorRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setAbierto(true);
              if (!e.target.value) limpiar();
            }}
            onFocus={() => setAbierto(true)}
            placeholder={placeholder}
            className="w-full h-12 pl-10 pr-10 rounded-xl border border-input bg-background text-sm
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
          {seleccionada && (
            <button
              onClick={limpiar}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Dropdown de resultados */}
        {abierto && resultados.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
            {resultados.map((empresa) => (
              <button
                key={empresa.id}
                onClick={() => seleccionar(empresa)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 text-left transition-colors"
              >
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{empresa.nombre}</p>
                  {empresa.industria && (
                    <p className="text-xs text-muted-foreground truncate">{empresa.industria}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {abierto && query.length >= 1 && resultados.length === 0 && (
          <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg px-4 py-3">
            <p className="text-sm text-muted-foreground">Sin resultados para &ldquo;{query}&rdquo;</p>
          </div>
        )}
      </div>

      {/* Selector de contacto (solo si hay empresa seleccionada y hay callback) */}
      {seleccionada && onContactoSeleccionado && (
        <div>
          {cargandoContactos ? (
            <div className="h-12 rounded-xl bg-muted animate-pulse" />
          ) : (
            <select
              value={contactoId}
              onChange={(e) => handleContactoChange(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-input bg-background text-sm
                focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            >
              <option value="">Contacto (opcional)</option>
              {contactos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}{c.cargo ? ` — ${c.cargo}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
