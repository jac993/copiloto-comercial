import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Combina clases de Tailwind sin conflictos — patrón estándar de shadcn/ui
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Normaliza una URL de LinkedIn para usarla como href. Varios linkedin_url de
// la BD están guardados sin protocolo ("linkedin.com/in/..."); sin él el
// navegador lo resuelve como ruta relativa y navega DENTRO de la app en vez
// de ir a LinkedIn.
export function hrefLinkedIn(url: string): string {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}
