import type { SupabaseClient } from "@supabase/supabase-js";

export const ESPECIALIDADES = [
  "Computación",
  "Industria del vestido",
  "Industria alimentaria",
  "Carpintería metálica",
  "Ebanistería",
  "Electricidad",
] as const;

const sinTildes = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Acepta variantes ("computacion", "industria de la moda", "metalica"...) y devuelve el nombre oficial. */
export function normalizarEspecialidad(texto: string): string | null {
  const t = sinTildes(texto);
  if (!t) return null;
  if (t.includes("comput")) return "Computación";
  if (t.includes("vest") || t.includes("moda") || t.includes("confec")) return "Industria del vestido";
  if (t.includes("alim")) return "Industria alimentaria";
  if (t.includes("metal")) return "Carpintería metálica";
  if (t.includes("ebanist") || t.includes("madera") || t.includes("carpinter")) return "Ebanistería";
  if (t.includes("electric")) return "Electricidad";
  return null;
}

export type Asignacion = { estudianteId: string; grado: number; especialidad: string | null };

/**
 * Deja a cada estudiante en UNA sola especialidad EPT (la reemplaza si ya tenía otra).
 * especialidad = null  →  solo lo quita de su especialidad actual.
 * La clase se llama "<Especialidad> <grado>°" y reúne alumnos de todas las secciones de ese grado.
 */
export async function asignarEspecialidades(sb: SupabaseClient, items: Asignacion[]) {
  if (!items.length) return { error: null as string | null };

  // 1) cursos EPT (se crean si faltan)
  const { data: cursosAct } = await sb.from("cursos").select("id,nombre,tipo");
  const cursoPorNombre = new Map((cursosAct ?? []).map((c) => [c.nombre, c]));
  for (const esp of ESPECIALIDADES) {
    const c = cursoPorNombre.get(esp);
    if (!c) {
      const { data } = await sb.from("cursos").insert({ nombre: esp, tipo: "ept" }).select("id,nombre,tipo").single();
      if (data) cursoPorNombre.set(esp, data);
    } else if (c.tipo !== "ept") {
      await sb.from("cursos").update({ tipo: "ept" }).eq("id", c.id);
    }
  }
  const cursoIds = ESPECIALIDADES.map((e) => cursoPorNombre.get(e)?.id).filter(Boolean) as string[];

  // 2) clases EPT existentes y las que falten (una por especialidad y grado)
  const { data: clasesAct } = await sb.from("clases").select("id,curso_id,grado,nombre")
    .in("curso_id", cursoIds).is("seccion_id", null);
  const claseId = new Map((clasesAct ?? []).map((c) => [`${c.curso_id}|${c.grado}`, c.id as string]));
  const faltantes = new Map<string, { curso_id: string; grado: number; nombre: string }>();
  for (const it of items) {
    if (!it.especialidad) continue;
    const curso = cursoPorNombre.get(it.especialidad);
    if (!curso) return { error: `Especialidad desconocida: ${it.especialidad}` };
    const k = `${curso.id}|${it.grado}`;
    if (!claseId.has(k) && !faltantes.has(k))
      faltantes.set(k, { curso_id: curso.id, grado: it.grado, nombre: `${it.especialidad} ${it.grado}°` });
  }
  if (faltantes.size) {
    const { data, error } = await sb.from("clases")
      .insert([...faltantes.values()].map((f) => ({ ...f, nivel: "secundaria" })))
      .select("id,curso_id,grado");
    if (error) return { error: error.message };
    for (const c of data ?? []) claseId.set(`${c.curso_id}|${c.grado}`, c.id);
  }

  // 3) quitar la especialidad anterior de estos estudiantes
  const todasClases = (await sb.from("clases").select("id").in("curso_id", cursoIds).is("seccion_id", null)).data ?? [];
  const claseIdsEpt = todasClases.map((c) => c.id);
  const estIds = [...new Set(items.map((i) => i.estudianteId))];
  for (let i = 0; i < estIds.length; i += 200) {
    const { error } = await sb.from("clase_estudiantes").delete()
      .in("estudiante_id", estIds.slice(i, i + 200)).in("clase_id", claseIdsEpt);
    if (error) return { error: error.message };
  }

  // 4) asignar la nueva
  const filas = items.filter((i) => i.especialidad).map((i) => ({
    clase_id: claseId.get(`${cursoPorNombre.get(i.especialidad!)!.id}|${i.grado}`)!,
    estudiante_id: i.estudianteId,
  }));
  for (let i = 0; i < filas.length; i += 300) {
    const { error } = await sb.from("clase_estudiantes").upsert(filas.slice(i, i + 300));
    if (error) return { error: error.message };
  }
  return { error: null as string | null };
}

/** Lee todas las filas aunque pasen de 1000 (límite de Supabase por consulta). */
export async function leerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await consulta(desde, desde + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
