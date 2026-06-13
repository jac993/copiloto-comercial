import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/providers";
import { BottomNav, Sidebar } from "@/components/layout/nav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Copiloto Comercial",
  description: "Tu asistente de ventas B2B con IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          {/* Layout responsivo: sidebar en desktop, bottom nav en móvil */}
          <div className="min-h-screen flex">
            <Sidebar />

            {/* Contenido principal — margen izquierdo solo en desktop */}
            <main className="flex-1 md:ml-64 pb-20 md:pb-0">
              {children}
            </main>
          </div>

          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
