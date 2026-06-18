"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Building2, Mic, BarChart2, Settings, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

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
    description: "Empresas y decisores",
  },
  {
    href: "/llamadas",
    label: "Interacciones",
    icon: Mic,
    description: "Registro de interacciones con IA",
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

  return (
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
                className={cn(
                  "h-5 w-5 transition-all",
                  isActive && "scale-110"
                )}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span>{item.label}</span>
              {/* Indicador de sección activa */}
              {isActive && (
                <span className="absolute bottom-0 h-0.5 w-8 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Sidebar izquierdo para desktop
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:left-0 md:z-50 border-r border-border bg-background">
      {/* Logo / nombre de la app */}
      <div className="flex h-28 items-center justify-center pt-2 border-b border-border">
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
                "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={isActive ? 2.5 : 1.8} />
              <div className="flex flex-col">
                <span>{item.label}</span>
                {!isActive && (
                  <span className="text-xs opacity-70">{item.description}</span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer del sidebar */}
      <div className="p-3 border-t border-border">
        <p className="text-xs text-muted-foreground text-center px-2">
          Solo para tu uso personal
        </p>
      </div>
    </aside>
  );
}
