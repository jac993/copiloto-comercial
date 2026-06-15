// Script one-time: regenera los decisores de todas las empresas existentes
// con los 6 cargos fijos adaptados al rubro de cada empresa.
//
// Uso: node --env-file=.env.local scripts/regenerar-todos-decisores.mjs

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY) {
  console.error("Faltan variables de entorno. Verifica .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const PROMPT = `
Eres un analista comercial B2B especializado en etiquetas autoadhesivas e imprenta industrial en Chile.

Tienes la ficha de una empresa chilena. Tu tarea es completar los campos variables de los 6 decisores
estándar, adaptando "por_que_es_clave" y "dolor_especifico" al rubro específico de ESTA empresa.

REGLA CRÍTICA: NUNCA seas genérico. Usa el rubro, los productos y el proceso de ESTA empresa.
MAL: "puede tener problemas de calidad con las etiquetas"
BIEN: "En esta planta de conservas, una etiqueta de nutrición con dato incorrecto obliga a retirar
el lote completo del mercado y enfrentar una denuncia SEREMI Salud."

Para "query_linkedin" usa: "[cargo corto] [nombre empresa] Chile"

Responde ÚNICAMENTE con el JSON, sin markdown ni texto adicional:

{
  "decisores": [
    {
      "cargo": "Jefe/a de Calidad",
      "area": "calidad",
      "por_que_es_clave": "...",
      "dolor_especifico": "...",
      "query_linkedin": "Jefe Calidad [NombreEmpresa] Chile"
    },
    {
      "cargo": "Jefe/Gerente de Operaciones",
      "area": "operaciones",
      "por_que_es_clave": "...",
      "dolor_especifico": "...",
      "query_linkedin": "Jefe Operaciones [NombreEmpresa] Chile"
    },
    {
      "cargo": "Jefe/a de Logística o Despacho",
      "area": "operaciones",
      "por_que_es_clave": "...",
      "dolor_especifico": "...",
      "query_linkedin": "Jefe Logística [NombreEmpresa] Chile"
    },
    {
      "cargo": "Gerente de Planta",
      "area": "operaciones",
      "por_que_es_clave": "...",
      "dolor_especifico": "...",
      "query_linkedin": "Gerente Planta [NombreEmpresa] Chile"
    },
    {
      "cargo": "Jefe/Gerente de Compras o Adquisiciones",
      "area": "compras",
      "por_que_es_clave": "...",
      "dolor_especifico": "...",
      "query_linkedin": "Jefe Compras [NombreEmpresa] Chile"
    },
    {
      "cargo": "Gerente General o Dueño",
      "area": "gerencia",
      "por_que_es_clave": "...",
      "dolor_especifico": "...",
      "query_linkedin": "Gerente General [NombreEmpresa] Chile"
    }
  ]
}
`;

async function regenerarEmpresa(empresa) {
  const ficha = empresa.ficha_ia;

  const mensaje = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `${PROMPT}

FICHA DE LA EMPRESA:
Nombre: ${ficha.nombre}
Industria: ${ficha.industria}
Qué fabrican o venden: ${ficha.que_fabrican_o_venden}
Por qué necesitan etiquetas: ${ficha.por_que_necesitan_etiquetas}
Tamaño: ${ficha.tamano_estimado}
Región: ${ficha.region}`,
      },
    ],
  });

  const texto = mensaje.content[0].text;
  // Remover posibles bloques markdown ```json ... ``` antes de extraer
  const textoLimpio = texto.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "");
  const jsonMatch = textoLimpio.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No se pudo extraer JSON. Respuesta: ${texto.slice(0, 200)}`);

  let resultado;
  try {
    resultado = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    throw new Error(`JSON inválido: ${parseErr.message}. Fragmento: ${jsonMatch[0].slice(0, 300)}`);
  }
  const fichaActualizada = { ...ficha, decisores: resultado.decisores };

  const { error } = await supabase
    .from("empresas")
    .update({ ficha_ia: fichaActualizada })
    .eq("id", empresa.id);

  if (error) throw new Error(error.message);
  return resultado.decisores.length;
}

async function main() {
  // Obtener todas las empresas con ficha_ia
  const { data: empresas, error } = await supabase
    .from("empresas")
    .select("id, nombre, ficha_ia")
    .not("ficha_ia", "is", null);

  if (error) {
    console.error("Error al obtener empresas:", error.message);
    process.exit(1);
  }

  console.log(`Encontradas ${empresas.length} empresas con ficha_ia.\n`);

  let ok = 0;
  let errores = 0;

  for (const empresa of empresas) {
    process.stdout.write(`  → ${empresa.nombre ?? empresa.id}... `);
    try {
      const n = await regenerarEmpresa(empresa);
      console.log(`✓ ${n} decisores`);
      ok++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      errores++;
    }
    // Pausa de 500ms entre llamadas para no saturar la API
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nListo: ${ok} empresas actualizadas, ${errores} con error.`);
}

main();
