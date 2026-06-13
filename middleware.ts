import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

// Middleware de Next.js — refresca la sesión de Supabase en cada request
export async function middleware(request: NextRequest) {
  const { supabaseResponse } = createClient(request);
  return supabaseResponse;
}

// Solo aplica a rutas de la app, excluye archivos estáticos y assets
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
