import { type NextRequest, NextResponse } from "next/server";

// App de un solo usuario sin auth — el middleware solo pasa el request sin modificarlo
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
