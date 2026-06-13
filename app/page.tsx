import { Sun, Zap, Target, TrendingUp } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Pantalla "Hoy" — punto de entrada diario del vendedor
export default function HoyPage() {
  const hoy = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header con gradiente violeta→fucsia — solo en pantalla Hoy */}
      <header className="gradient-hoy px-5 pt-10 pb-8 md:pt-8">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/80 text-sm font-medium capitalize">{hoy}</p>
            <h1 className="text-white text-2xl font-semibold mt-1">
              Buenos días 👋
            </h1>
          </div>
          <div className="bg-white/20 rounded-xl p-1">
            <ThemeToggle />
          </div>
        </div>

        {/* Barra de progreso del día */}
        <div className="mt-6">
          <div className="flex justify-between text-white/80 text-xs font-medium mb-2">
            <span>Meta diaria: 0 / 5 contactos</span>
            <span>0%</span>
          </div>
          <div className="h-2 rounded-full bg-white/20">
            <div className="h-2 rounded-full bg-white w-0 transition-all duration-500" />
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <div className="flex-1 px-4 py-6 space-y-6">

        {/* Racha de días */}
        <Card className="border-0 bg-gradient-to-r from-brand-50 to-purple-50 dark:from-brand-900/20 dark:to-purple-900/10">
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center text-2xl">
              🔥
            </div>
            <div>
              <p className="font-semibold">Racha: 0 días</p>
              <p className="text-sm text-muted-foreground">
                Completa tu meta hoy para empezar tu racha
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Estado vacío — prioridades del día */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Prioridades de hoy
            </h2>
            <Badge variant="ai" className="text-xs">
              <Zap className="h-3 w-3" /> usa IA
            </Badge>
          </div>

          <Card className="border-dashed">
            <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1.5 max-w-xs">
                <p className="font-semibold">Sin prioridades aún</p>
                <p className="text-sm text-muted-foreground">
                  La IA analizará tus cuentas y te dirá con quién hablar hoy
                  y por qué, en orden de oportunidad.
                </p>
              </div>
              <Button size="lg" className="mt-2 w-full max-w-xs gap-2">
                <Zap className="h-4 w-4" />
                Actualizar prioridades
              </Button>
              <p className="text-xs text-muted-foreground">
                Primero agrega cuentas en la sección Cuentas
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Resumen rápido */}
        <section>
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Sun className="h-4 w-4 text-[#F59E0B]" />
            Resumen del día
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Contactos", value: "0", color: "text-primary" },
              { label: "Llamadas", value: "0", color: "text-[#22C55E]" },
              { label: "Ganados", value: "0", color: "text-[#F59E0B]" },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
