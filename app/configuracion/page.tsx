"use client";

// =============================================================
// Pantalla Configuración — Gestión de integraciones (Gmail)
// y preferencias del copiloto.
// =============================================================

import { Suspense, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  CheckCircle2,
  XCircle,
  RefreshCw,
  LogOut,
  AlertCircle,
} from "lucide-react";
import { useSearchParams } from "next/navigation";

interface GmailStatus {
  conectado: boolean;
  email?: string;
  ultimo_sync?: string;
}

interface SyncResult {
  detectados: number;
  revisados: number;
}

function ConfiguracionContent() {
  const searchParams = useSearchParams();
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [desconectando, setDesconectando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const mostrarToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const cargarEstado = async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/gmail/status");
      const data = await res.json();
      setGmail(data);
    } catch {
      setGmail({ conectado: false });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected === "true") {
      // Viene del callback OAuth: refrescar estado hasta confirmar conexión
      cargarEstado().then(() => mostrarToast("✅ Gmail conectado correctamente"));
    } else {
      cargarEstado();
    }

    if (error === "acceso_denegado") mostrarToast("⚠️ Acceso denegado por Google");
    if (error === "fallo_oauth") mostrarToast("❌ Error al conectar Gmail. Intenta de nuevo.");
  }, [searchParams]);

  const sincronizar = async () => {
    setSincronizando(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/gmail/sync");
      const data = await res.json();
      if (data.error) {
        mostrarToast(`❌ ${data.error}`);
      } else {
        setSyncResult({ detectados: data.detectados, revisados: data.revisados });
        mostrarToast(`✅ Sync listo: ${data.detectados} correo(s) nuevo(s) detectado(s)`);
        await cargarEstado();
      }
    } catch {
      mostrarToast("❌ Error al sincronizar. Intenta de nuevo.");
    } finally {
      setSincronizando(false);
    }
  };

  const desconectar = async () => {
    setDesconectando(true);
    try {
      await fetch("/api/gmail/disconnect", { method: "POST" });
      setGmail({ conectado: false });
      setSyncResult(null);
      mostrarToast("Gmail desconectado.");
    } catch {
      mostrarToast("❌ Error al desconectar. Intenta de nuevo.");
    } finally {
      setDesconectando(false);
    }
  };

  const formatSync = (iso?: string) => {
    if (!iso) return "Nunca";
    return new Date(iso).toLocaleString("es-CL", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#111] text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-extrabold text-[#111] dark:text-white">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">Integraciones y preferencias del Copiloto.</p>
      </div>

      {/* Tarjeta Gmail */}
      <Card className="rounded-2xl shadow-sm border border-border">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FEE2E2] flex items-center justify-center">
              <Mail className="w-5 h-5 text-[#DC2626]" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[#111] dark:text-white text-sm">Gmail</p>
              <p className="text-xs text-muted-foreground">Detecta correos de tus cuentas automáticamente</p>
            </div>
            {!cargando && (
              <Badge
                className={gmail?.conectado
                  ? "bg-green-100 text-green-700 border-green-200 text-xs"
                  : "bg-gray-100 text-gray-500 border-gray-200 text-xs"}
              >
                {gmail?.conectado ? "Conectado" : "Desconectado"}
              </Badge>
            )}
          </div>

          {cargando ? (
            <div className="h-8 rounded-lg bg-muted animate-pulse" />
          ) : gmail?.conectado ? (
            <>
              {/* Info cuenta */}
              <div className="bg-[#F0FDF4] border border-green-200 rounded-xl p-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-green-800">{gmail.email}</p>
                  <p className="text-xs text-green-600">Último sync: {formatSync(gmail.ultimo_sync)}</p>
                </div>
              </div>

              {/* Resultado último sync */}
              {syncResult && (
                <div className="bg-[#EDE9FE] border border-violet-200 rounded-xl p-3 text-xs text-[#5B21B6]">
                  Se revisaron <strong>{syncResult.revisados}</strong> correos —{" "}
                  <strong>{syncResult.detectados}</strong> nuevo(s) de clientes detectado(s).
                </div>
              )}

              {/* Acciones */}
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm h-10 rounded-xl"
                  onClick={sincronizar}
                  disabled={sincronizando}
                >
                  {sincronizando ? (
                    <><RefreshCw className="w-4 h-4 mr-1 animate-spin" /> Sincronizando...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4 mr-1" /> Sincronizar ahora</>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="h-10 px-3 text-muted-foreground hover:text-[#DC2626] rounded-xl"
                  onClick={desconectar}
                  disabled={desconectando}
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-[#FFFBEB] border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Conecta tu Gmail para que el Copiloto detecte automáticamente correos de tus clientes y los asocie a cada cuenta.
                </p>
              </div>
              <Button
                className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white h-11 rounded-xl text-sm"
                onClick={() => { window.location.href = "/api/gmail/auth"; }}
              >
                <Mail className="w-4 h-4 mr-2" />
                Conectar Gmail
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Placeholder otras integraciones */}
      <Card className="rounded-2xl shadow-sm border border-dashed border-border opacity-50">
        <CardContent className="p-5 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Más integraciones próximamente</p>
            <p className="text-xs text-muted-foreground">WhatsApp Business, Outlook, calendario…</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ConfiguracionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Cargando configuración…</div>}>
      <ConfiguracionContent />
    </Suspense>
  );
}
