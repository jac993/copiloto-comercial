"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Building2, BarChart2, Settings, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";

// Carga el conteo de interacciones vencidas sin respuesta (sin bloquear el render)
function useBadgeVencidas() {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    function fetch_() {
      fetch("/api/interacciones/vencidas", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { total?: number }) => setTotal(d.total ?? 0))
        .catch(() => {/* silent */});
    }
    fetch_();
    const id = setInterval(fetch_, 60 * 1000); // refresca cada 60 seg
    // Refresco inmediato cuando otra pantalla (ej: /alertas) marca una respuesta —
    // evita esperar hasta 60s para que la campanita baje el conteo.
    window.addEventListener("vencidas:refresh", fetch_);
    return () => {
      clearInterval(id);
      window.removeEventListener("vencidas:refresh", fetch_);
    };
  }, []);
  return total;
}

// Secciones principales del copiloto — usadas también por BottomNav
const navItems = [
  { href: "/", label: "Hoy", icon: Sun, description: "Tu agenda y prioridades del día" },
  { href: "/cuentas", label: "Cuentas", icon: Building2, description: "Empresas, decisores e interacciones" },
  // Panorama salió del nav: ahora es un tab dentro de Cuentas.
  { href: "/rendimiento", label: "Rendimiento", icon: BarChart2, description: "Evaluaciones semanales con IA" },
  { href: "/configuracion", label: "Configuración", icon: Settings, description: "Integraciones, casos y costos" },
];

// Logo One Label — círculo naranja con peel effect en la esquina superior derecha
function OneLabelLogo() {
  return (
    <svg viewBox="0 0 120 120" width="40" height="40" aria-label="One Label">
      <defs>
        <clipPath id="ol-clip"><circle cx="60" cy="60" r="56"/></clipPath>
        <filter id="ol-peel" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="1" stdDeviation="2" floodOpacity="0.35"/>
        </filter>
      </defs>
      {/* Sombra del círculo */}
      <circle cx="62" cy="63" r="56" fill="rgba(0,0,0,0.22)"/>
      {/* Círculo naranja principal */}
      <circle cx="60" cy="60" r="56" fill="#F97316"/>
      {/* Recorte esquina superior derecha (el "despegue") */}
      <path d="M 88 4 L 116 4 L 116 32 Q 104 20 88 4 Z" fill="#0D0D0D" clipPath="url(#ol-clip)"/>
      {/* Cara visible del peel */}
      <path d="M 88 4 Q 104 20 116 32 Q 108 14 88 4 Z" fill="#E8E8E8" filter="url(#ol-peel)"/>
      {/* Texto "one" */}
      <text x="60" y="66" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="40" fill="white" textAnchor="middle">one</text>
      {/* Texto "label" */}
      <text x="60" y="85" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="14" fill="white" textAnchor="middle" letterSpacing="4.5">label</text>
      {/* Símbolo registrado */}
      <text x="106" y="56" fontFamily="Arial, sans-serif" fontSize="11" fill="white">®</text>
    </svg>
  );
}

// Ítem de navegación del sidebar — ícono cuadrado + tooltip flotante al hover
function NavIconItem({
  href,
  icon: Icon,
  label,
  pathname,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  pathname: string;
  badge?: number;
}) {
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <div className="relative group">
      <Link
        href={href}
        className={cn(
          "relative flex items-center justify-center rounded-xl transition-all w-11 h-11 border",
          isActive
            ? "bg-orange-500/10 text-orange-400 border-orange-500/60"
            : "text-gray-500 hover:bg-white/5 hover:text-gray-300 border-transparent"
        )}
        style={
          isActive
            ? { boxShadow: "0 0 16px rgba(255,122,26,0.5), 0 0 40px rgba(255,122,26,0.2), inset 0 0 12px rgba(255,122,26,0.08)" }
            : undefined
        }
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={isActive ? 2.5 : 1.8} />
        {/* Badge de alertas */}
        {badge != null && badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {badge}
          </span>
        )}
      </Link>
      {/* Tooltip que aparece a la derecha al hover */}
      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center z-[100] pointer-events-none">
        <div className="bg-[#1a1a1a] border border-[#333] text-gray-200 text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-xl">
          {label}
        </div>
      </div>
    </div>
  );
}

// Navegación inferior para móvil — sin cambios funcionales
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

// Sidebar izquierdo para desktop — slim (60px), solo íconos con tooltips
export function Sidebar() {
  const pathname = usePathname();
  const alertas = useBadgeVencidas();

  return (
    <aside
      className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:z-50 border-r border-[#1e1e1e] bg-[#080808]"
      style={{ width: 60 }}
    >
      {/* Logo One Label */}
      <div className="flex items-center justify-center border-b border-[#1e1e1e] shrink-0" style={{ height: 70 }}>
        <Link href="/" aria-label="Inicio">
          <OneLabelLogo />
        </Link>
      </div>

      {/* Navegación principal */}
      <nav className="flex flex-col items-center gap-2 py-3 flex-1">
        {/* Hoy, Cuentas, Rendimiento */}
        {navItems.slice(0, 3).map((item) => (
          <NavIconItem key={item.href} href={item.href} icon={item.icon} label={item.label} pathname={pathname} />
        ))}

        {/* Alertas — siempre visible, badge cuando hay vencidas */}
        <NavIconItem
          href="/alertas"
          icon={Bell}
          label="Alertas"
          pathname={pathname}
          badge={alertas > 0 ? alertas : undefined}
        />

        {/* Separador flexible */}
        <div className="flex-1" />

        {/* Configuración al fondo */}
        <NavIconItem href="/configuracion" icon={Settings} label="Configuración" pathname={pathname} />
      </nav>
    </aside>
  );
}
