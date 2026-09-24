// =============================================================
// Genera una API_SECRET_KEY aleatoria para pegar en .env.local.
//
// Uso:   npx tsx generate-api-key.ts
//
// Usa randomBytes del módulo crypto de Node (CSPRNG). NO usar Math.random()
// para esto: es predecible y no sirve como secreto.
// =============================================================

import { randomBytes } from "node:crypto";

// 32 bytes = 256 bits de entropía. En hex quedan 64 caracteres.
const clave = randomBytes(32).toString("hex");

console.log("");
console.log("  API_SECRET_KEY generada:");
console.log("");
console.log(`  API_SECRET_KEY=${clave}`);
console.log("");
console.log("  Pega esa línea en .env.local (nunca en .env.local.example,");
console.log("  que sí se commitea). Y cárgala también en Vercel:");
console.log("  Project Settings > Environment Variables.");
console.log("");
