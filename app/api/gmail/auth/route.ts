// GET /api/gmail/auth → redirige al flujo OAuth2 de Google
import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/gmail";

export async function GET() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.NEXTAUTH_URL) {
    return NextResponse.json({ error: "Faltan variables GOOGLE_CLIENT_ID o NEXTAUTH_URL" }, { status: 500 });
  }
  return NextResponse.redirect(getAuthUrl());
}
