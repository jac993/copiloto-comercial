import { createClient as createServerSupabase } from "@/utils/supabase/server";
import { cookies } from "next/headers";

// Cliente para uso en API routes y Server Components
// Uso: const supabase = await getSupabaseServer()
export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerSupabase(cookieStore);
}

// Re-exporta los helpers para facilitar imports en el resto de la app
export { createClient as createBrowserClient } from "@/utils/supabase/client";
export { createClient as createServerClient } from "@/utils/supabase/server";
