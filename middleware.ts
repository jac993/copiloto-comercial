import { type NextRequest, NextResponse } from "next/server";
import { esRutaPublica, validarApiKey } from "@/lib/auth-middleware";

// App de un solo usuario. El middleware solo hace una cosa: exigir Bearer
// token en /api/**. Todo lo demás (páginas, assets) pasa sin tocar.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && !esRutaPublica(pathname)) {
    const rechazo = validarApiKey(request);
    if (rechazo) return rechazo;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
