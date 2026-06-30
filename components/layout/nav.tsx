"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Building2, BarChart2, Settings, DollarSign, Bell, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

// Carga el conteo de interacciones vencidas sin respuesta (sin bloquear el render)
function useBadgeVencidas() {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    function fetch_() {
      fetch("/api/interacciones/vencidas")
        .then((r) => r.json())
        .then((d: { total?: number }) => setTotal(d.total ?? 0))
        .catch(() => {/* silent */});
    }
    fetch_();
    const id = setInterval(fetch_, 5 * 60 * 1000); // refresca cada 5 min
    return () => clearInterval(id);
  }, []);
  return total;
}

// Secciones principales del copiloto
const navItems = [
  {
    href: "/",
    label: "Hoy",
    icon: Sun,
    description: "Tu agenda y prioridades del día",
  },
  {
    href: "/cuentas",
    label: "Cuentas",
    icon: Building2,
    description: "Empresas, decisores e interacciones",
  },
  {
    href: "/casos",
    label: "Casos",
    icon: Trophy,
    description: "Base de casos reales de One Label",
  },
  {
    href: "/rendimiento",
    label: "Rendimiento",
    icon: BarChart2,
    description: "Evaluaciones semanales con IA",
  },
  {
    href: "/configuracion",
    label: "Configuración",
    icon: Settings,
    description: "Integraciones y preferencias",
  },
  {
    href: "/admin/costos",
    label: "Costos",
    icon: DollarSign,
    description: "Monitor de uso de APIs",
  },
];

// Navegación inferior para móvil
export function BottomNav() {
  const pathname = usePathname();
  const alertas = useBadgeVencidas();

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm md:hidden">
        <div className="flex h-16 items-stretch">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon
                  className={cn("h-5 w-5 transition-all", isActive && "scale-110")}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
                <span>{item.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 h-0.5 w-8 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Badge flotante de alertas — aparece solo cuando hay vencidas */}
      {alertas > 0 && (
        <Link
          href="/alertas"
          className="fixed bottom-[72px] right-3 z-50 md:hidden flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-full shadow-lg transition-colors animate-bounce"
          style={{ animationDuration: "2s" }}
        >
          <Bell className="h-3 w-3" />
          {alertas}
        </Link>
      )}
    </>
  );
}

// Sidebar izquierdo para desktop
export function Sidebar() {
  const pathname = usePathname();
  const alertas = useBadgeVencidas();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:left-0 md:z-50 border-r border-[#2a2a2a] bg-[#1A1A1A]">
      {/* Logo / nombre de la app */}
      <div className="flex h-28 items-center justify-center pt-2 border-b border-[#2a2a2a]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png.png" alt="Copiloto Comercial" style={{ height: 96, width: "auto" }} />
      </div>

      {/* Links de navegación */}
      <nav className="flex flex-col gap-1 p-3 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all border-l-2",
                isActive
                  ? "bg-orange-500/20 text-orange-400 border-orange-500"
                  : "text-gray-400 hover:bg-white/5 hover:text-gray-200 border-transparent"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={isActive ? 2.5 : 1.8} />
              <div className="flex flex-col">
                <span>{item.label}</span>
                {!isActive && (
                  <span className="text-xs opacity-50">{item.description}</span>
                )}
              </div>
            </Link>
          );
        })}

        {/* Alertas — solo visible cuando hay interacciones vencidas */}
        {alertas > 0 && (
          <Link
            href="/alertas"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all mt-1 border-l-2",
              pathname.startsWith("/alertas")
                ? "bg-red-500/20 text-red-400 border-red-500"
                : "bg-red-500/10 text-red-400 hover:bg-red-500/20 border-transparent"
            )}
          >
            <div className="relative">
              <Bell className="h-5 w-5 shrink-0" />
            </div>
            <div className="flex items-center justify-between flex-1">
              <span>Alertas</span>
              <span className="text-xs font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                {alertas}
              </span>
            </div>
          </Link>
        )}
      </nav>

      {/* Footer del sidebar */}
      <div className="p-3 border-t border-[#2a2a2a]">
        <p className="text-xs text-gray-600 text-center px-2">
          Solo para tu uso personal
        </p>
      </div>
    </aside>
  );
}
