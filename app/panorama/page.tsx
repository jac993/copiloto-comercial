"use client";

// =============================================================
// Pantalla Panorama — vista agrupada por semáforo de todos los
// prospectos activos. Replica el mockup de referencia (paleta
// oscura fija, chips-filtro, grupos por color, filas clickeables).
// Sin IA: solo lectura vía /api/panorama.
// =============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw } from "lucide-react";
import type { PanoramaFila, EstadoEmpresa, TipoInteraccion } from "@/lib/types";

// ── Labels ───────────────────────────────────────────────────

const ESTADO_LABEL: Record<EstadoEmpresa, string> = {
  prospecto: "Prospecto",
  contactado: "Contactado",
  en_conversacion: "En conversación",
  reunion_agendada: "Reunión agendada",
  cotizado: "Cotizado",
  ganado: "Ganado",
  perdido: "Perdido",
};

const TIPO_LABEL: Record<TipoInteraccion, string> = {
  llamada: "llamada",
  email: "correo",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  reunion: "reunión",
  sin_respuesta: "intento sin respuesta",
};

type Color = "rojo" | "amarillo" | "verde";

const GRUPOS: { color: Color; dotClass: string; filaClass: string; titulo: string }[] = [
  { color: "rojo", dotClass: "r", filaClass: "r", titulo: "Requieren acción ahora" },
  { color: "amarillo", dotClass: "a", filaClass: "a", titulo: "Atención pronto" },
  { color: "verde", dotClass: "v", filaClass: "v", titulo: "Al día" },
];

// ── Helpers ──────────────────────────────────────────────────

function metaUltimoContacto(f: PanoramaFila): string {
  if (!f.ultima_interaccion || f.dias_sin_contacto === null) {
    return "Sin contacto registrado aún";
  }
  const dias = f.dias_sin_contacto;
  const cuando = dias === 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`;
  const tipo = TIPO_LABEL[f.ultima_interaccion.tipo] ?? f.ultima_interaccion.tipo;
  const con = f.ultima_interaccion.contacto_nombre
    ? ` con ${f.ultima_interaccion.contacto_nombre}`
    : "";
  return `Último contacto: ${tipo}${con} · ${cuando}`;
}

// ── Componente principal ─────────────────────────────────────

export default function PanoramaPage() {
  const router = useRouter();
  const [filas, setFilas] = useState<PanoramaFila[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actualizadoEn, setActualizadoEn] = useState<string | null>(null);
  // Filtro por chip: null = mostrar todo; click en el chip activo lo desactiva
  const [filtro, setFiltro] = useState<Color | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/panorama", { cache: "no-store" });
      if (!res.ok) throw new Error("Error al cargar el panorama");
      const data = await res.json() as { filas: PanoramaFila[] };
      setFilas(data.filas);
      setActualizadoEn(
        new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })
      );
    } catch {
      setError("No se pudo cargar el panorama. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Dentro de cada grupo: más días sin contacto primero (null = nunca → primero)
  const porColor = useMemo(() => {
    const mapa: Record<Color, PanoramaFila[]> = { rojo: [], amarillo: [], verde: [] };
    for (const f of filas ?? []) mapa[f.semaforo].push(f);
    for (const color of Object.keys(mapa) as Color[]) {
      mapa[color].sort(
        (a, b) => (b.dias_sin_contacto ?? 1e9) - (a.dias_sin_contacto ?? 1e9)
      );
    }
    return mapa;
  }, [filas]);

  const total = filas?.length ?? 0;

  return (
    <div className="pan">
      {/* CSS del mockup de referencia — replicado tal cual, scoped bajo .pan.
          dangerouslySetInnerHTML evita el hydration mismatch de React con
          nodos de texto dentro de <style>. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .pan{
          --bg:#0F0F0F; --card:#1C1C1C; --card2:#242424; --border:#2E2E2E;
          --txt:#F5F5F5; --muted:#9CA3AF; --dim:#6B7280;
          --orange:#F97316; --orange-soft:rgba(249,115,22,.14);
          --red:#EF4444; --red-soft:rgba(239,68,68,.12);
          --amber:#F59E0B; --amber-soft:rgba(245,158,11,.12);
          --green:#22C55E; --green-soft:rgba(34,197,94,.10);
          background:var(--bg);color:var(--txt);padding:24px;max-width:900px;margin:0 auto;
          min-height:100vh;font-family:'Segoe UI',system-ui,sans-serif;
        }
        .pan *{box-sizing:border-box;margin:0;padding:0}
        .pan h1{font-size:22px;font-weight:800;display:flex;align-items:center;gap:10px}
        .pan .sub{color:var(--muted);font-size:13px;margin-top:4px;margin-bottom:18px}
        .pan .resumen{display:flex;gap:10px;margin-bottom:22px}
        .pan .chip{flex:1;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:12px 14px;cursor:pointer;transition:.15s}
        .pan .chip:hover{border-color:var(--orange)}
        .pan .chip .n{font-size:24px;font-weight:800}
        .pan .chip .l{font-size:11px;color:var(--muted);margin-top:2px;text-transform:uppercase;letter-spacing:.04em}
        .pan .chip.rojo .n{color:var(--red)} .pan .chip.amarillo .n{color:var(--amber)} .pan .chip.verde .n{color:var(--green)}
        .pan .chip.activa{outline:2px solid var(--orange)}
        .pan .grupo{margin-bottom:22px}
        .pan .grupo-h{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
        .pan .dot{width:9px;height:9px;border-radius:50%}
        .pan .dot.r{background:var(--red)} .pan .dot.a{background:var(--amber)} .pan .dot.v{background:var(--green)}
        .pan .fila{background:var(--card);border:1px solid var(--border);border-left:3px solid transparent;border-radius:12px;padding:12px 14px;margin-bottom:8px;display:grid;grid-template-columns:1fr auto;gap:4px 12px;cursor:pointer;transition:.15s}
        .pan .fila:hover{background:var(--card2)}
        .pan .fila.r{border-left-color:var(--red)} .pan .fila.a{border-left-color:var(--amber)} .pan .fila.v{border-left-color:var(--green)}
        .pan .nombre{font-weight:700;font-size:14.5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .pan .etapa{font-size:10.5px;padding:2px 8px;border-radius:99px;background:var(--orange-soft);color:var(--orange);font-weight:600}
        .pan .frio{font-size:10.5px;padding:2px 8px;border-radius:99px;background:rgba(56,189,248,.14);color:#38BDF8;font-weight:600;white-space:nowrap}
        .pan .sugerencia{grid-column:1/-1;font-size:12px;color:#38BDF8;font-weight:600;display:flex;align-items:center;gap:6px}
        .pan .meddic{font-size:11px;color:var(--muted);font-weight:600;white-space:nowrap;align-self:start;text-align:right}
        .pan .meddic b{color:var(--txt)}
        .pan .accion{grid-column:1/-1;font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:6px}
        .pan .accion .alerta{color:var(--red);font-weight:600}
        .pan .accion .pronto{color:var(--amber);font-weight:600}
        .pan .meta{grid-column:1/-1;font-size:11.5px;color:var(--dim)}
        .pan .barra{height:4px;border-radius:99px;background:var(--border);width:64px;overflow:hidden;margin-top:4px;margin-left:auto}
        .pan .barra i{display:block;height:100%;background:var(--orange)}
        .pan .skeleton{background:var(--card);border:1px solid var(--border);border-radius:12px;height:76px;margin-bottom:8px;animation:panpulse 1.4s ease-in-out infinite}
        @keyframes panpulse{0%,100%{opacity:.5}50%{opacity:1}}
        .pan .estado-msg{display:flex;flex-direction:column;align-items:center;gap:12px;padding:48px 16px;text-align:center;color:var(--muted);font-size:13px}
        .pan .btn-retry{display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--border);color:var(--txt);border-radius:10px;padding:8px 14px;font-size:12.5px;font-weight:600;cursor:pointer;transition:.15s}
        .pan .btn-retry:hover{border-color:var(--orange)}
        @media(max-width:560px){
          .pan{padding:14px}
          .pan .resumen{gap:6px}
          .pan .chip{padding:10px}
          .pan .chip .n{font-size:20px}
        }
      ` }} />

      <h1>📡 Panorama</h1>
      <div className="sub">
        {cargando
          ? "Cargando prospectos..."
          : `${total} ${total === 1 ? "prospecto activo" : "prospectos activos"}${actualizadoEn ? ` · actualizado a las ${actualizadoEn}` : ""}`}
      </div>

      {cargando ? (
        <>
          <div className="resumen">
            {[0, 1, 2].map((i) => <div key={i} className="chip"><div className="n">&nbsp;</div><div className="l">&nbsp;</div></div>)}
          </div>
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" />)}
        </>
      ) : error ? (
        <div className="estado-msg">
          <AlertCircle style={{ width: 28, height: 28, color: "var(--red)" }} />
          <p>{error}</p>
          <button className="btn-retry" onClick={() => void cargar()}>
            <RefreshCw style={{ width: 14, height: 14 }} /> Reintentar
          </button>
        </div>
      ) : total === 0 ? (
        <div className="estado-msg">
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--txt)" }}>Sin prospectos activos</p>
          <p>Agrega empresas en la sección Cuentas y aparecerán aquí con su semáforo de atención.</p>
          <button className="btn-retry" onClick={() => router.push("/cuentas")}>Ir a Cuentas</button>
        </div>
      ) : (
        <>
          {/* Chips resumen: también funcionan como filtro */}
          <div className="resumen">
            <div
              className={`chip rojo${filtro === "rojo" ? " activa" : ""}`}
              onClick={() => setFiltro((f) => (f === "rojo" ? null : "rojo"))}
            >
              <div className="n">{porColor.rojo.length}</div>
              <div className="l">🔴 Acción ya</div>
            </div>
            <div
              className={`chip amarillo${filtro === "amarillo" ? " activa" : ""}`}
              onClick={() => setFiltro((f) => (f === "amarillo" ? null : "amarillo"))}
            >
              <div className="n">{porColor.amarillo.length}</div>
              <div className="l">🟡 Pronto</div>
            </div>
            <div
              className={`chip verde${filtro === "verde" ? " activa" : ""}`}
              onClick={() => setFiltro((f) => (f === "verde" ? null : "verde"))}
            >
              <div className="n">{porColor.verde.length}</div>
              <div className="l">🟢 Al día</div>
            </div>
          </div>

          {/* Grupos por semáforo */}
          {GRUPOS.map(({ color, dotClass, filaClass, titulo }) => {
            const grupo = porColor[color];
            if (grupo.length === 0 || (filtro !== null && filtro !== color)) return null;
            return (
              <div className="grupo" key={color}>
                <div className="grupo-h"><span className={`dot ${dotClass}`} /> {titulo}</div>
                {grupo.map((f) => (
                  <div
                    key={f.empresa_id}
                    className={`fila ${filaClass}`}
                    onClick={() => router.push(`/cuentas/${f.empresa_id}`)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") router.push(`/cuentas/${f.empresa_id}`); }}
                  >
                    <div className="nombre">
                      {f.nombre} <span className="etapa">{ESTADO_LABEL[f.estado]}</span>
                      {/* Enfriamiento silencioso: superó el umbral de su etapa */}
                      {f.enfriada && (
                        <span className="frio">
                          🧊 {f.dias_sin_movimiento} {f.dias_sin_movimiento === 1 ? "día" : "días"} sin movimiento
                        </span>
                      )}
                    </div>
                    <div className="meddic">
                      {f.score_meddic !== null ? (
                        <>
                          MEDDIC <b>{Math.round((f.score_meddic / 12) * 100)}%</b>
                          <div className="barra">
                            <i style={{ width: `${Math.round((f.score_meddic / 12) * 100)}%` }} />
                          </div>
                        </>
                      ) : (
                        <>MEDDIC <b>—</b></>
                      )}
                    </div>
                    <div className="accion">
                      {color === "rojo" && <>⚠️ <span className="alerta">{f.mensaje_accion}</span></>}
                      {color === "amarillo" && <>📅 <span className="pronto">{f.mensaje_accion}</span></>}
                      {color === "verde" && <>✓ {f.mensaje_accion}</>}
                    </div>
                    <div className="meta">
                      {metaUltimoContacto(f)}
                      {f.dias_en_etapa !== null &&
                        ` · ${f.dias_en_etapa} ${f.dias_en_etapa === 1 ? "día" : "días"} en esta etapa`}
                    </div>
                    {/* Acción sugerida para reactivar una cuenta enfriada — el click
                        en la card ya lleva a la ficha, donde se asigna con un clic */}
                    {f.sugerencia_enfriamiento && (
                      <div className="sugerencia">💡 {f.sugerencia_enfriamiento}</div>
                    )}
                    {/* Historial acumulado: cuántas interacciones y con quiénes */}
                    {f.total_interacciones > 0 && (
                      <div className="meta">
                        {f.total_interacciones}{" "}
                        {f.total_interacciones === 1 ? "interacción" : "interacciones"}
                        {f.interacciones_por_contacto.length > 0 &&
                          " · " +
                            f.interacciones_por_contacto
                              .map((c) => `${c.nombre} (${c.count})`)
                              .join(" · ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
