import { Mic, Upload, FileText, BrainCircuit, Zap } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Pantalla "Llamadas" — transcripción y coaching post-llamada
export default function LlamadasPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex h-16 items-center justify-between px-5">
          <h1 className="text-lg font-semibold">Llamadas</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 py-6 space-y-6">

        {/* Estado vacío principal */}
        <Card className="border-dashed">
          <CardContent className="pt-10 pb-10 flex flex-col items-center text-center gap-5">
            <div className="relative">
              <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center">
                <Mic className="h-10 w-10 text-primary" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary flex items-center justify-center">
                <Upload className="h-4 w-4 text-white" />
              </div>
            </div>

            <div className="space-y-2 max-w-sm">
              <p className="font-semibold text-lg">Sin llamadas registradas</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Sube el audio de una llamada y la IA la transcribe, resume
                los acuerdos y te da coaching personalizado según el perfil
                del cliente.
              </p>
            </div>

            <Button size="lg" className="w-full max-w-xs gap-2">
              <Upload className="h-4 w-4" />
              Subir llamada
            </Button>

            <p className="text-xs text-muted-foreground">
              Formatos: MP3, MP4, M4A, WAV · Máx. 25 MB
            </p>
          </CardContent>
        </Card>

        {/* Flujo de 3 pasos — educativo para el primer uso */}
        <section>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
            Cómo funciona
          </h2>
          <div className="space-y-3">
            {[
              {
                step: "1",
                icon: Upload,
                title: "Subir audio",
                desc: "Arrastra o selecciona el archivo de tu llamada.",
                badge: null,
                color: "bg-muted",
              },
              {
                step: "2",
                icon: FileText,
                title: "Transcribir",
                desc: "Whisper convierte el audio a texto completo.",
                badge: "usa IA",
                color: "bg-primary/10",
              },
              {
                step: "3",
                icon: BrainCircuit,
                title: "Analizar llamada",
                desc: "La IA identifica señales, objeciones y te da coaching.",
                badge: "usa IA",
                color: "bg-primary/10",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="flex items-start gap-4 p-4 rounded-2xl bg-muted/50"
                >
                  <div className={`h-10 w-10 rounded-xl ${item.color} flex items-center justify-center shrink-0`}>
                    <Icon className="h-5 w-5 text-foreground/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-muted-foreground font-bold">Paso {item.step}</span>
                      {item.badge && (
                        <Badge variant="ai" className="text-xs py-0 h-5">
                          <Zap className="h-2.5 w-2.5" /> {item.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Técnicas de venta disponibles */}
        <section>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
            Coaching disponible
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { tecnica: "SPIN Selling", desc: "Para Calidad y Operaciones" },
              { tecnica: "Challenger", desc: "Para Gerentes de planta" },
              { tecnica: "Consultiva", desc: "Para dolores técnicos" },
              { tecnica: "Relacional", desc: "Para Procurement" },
            ].map((t) => (
              <Card key={t.tecnica} className="border-0 bg-muted/50">
                <CardContent className="pt-3 pb-3 px-3">
                  <p className="text-xs font-semibold">{t.tecnica}</p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
