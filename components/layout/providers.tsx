"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";

// Agrupa todos los providers del cliente — layout.tsx los usa como wrapper
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster />
    </ThemeProvider>
  );
}
