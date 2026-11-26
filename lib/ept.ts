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
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Acepta variantes y abreviaturas ("Computac", "Ind.Vestido", "Ebaniste"...) y devuelve el nombre oficial. */
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

/** "Edemita L." -> id del único usuario "Edemita Lopez"; null si no hay coincidencia clara. */
function emparejarDocente(docente: string, perfiles: { id: string; nombre: string }[]): string | null {
  const tokens = sinTildes(docente).replace(/\./g, " ").split(" ").filter(Boolean);
  if (!tokens.length) return null;
  const [primero, ...iniciales] = tokens;
  const c = perfiles.filter((p) => {
    const pn = sinTildes(p.nombre).split(" ");
    return pn.includes(primero) && iniciales.every((i) => pn.some((w) => w !== primero && w.startsWith(i)));
  });
  return c.length === 1 ? c[0].id : null;
}

export type Asignacion = {
  estudianteId: string;
  grado: number;
  especialidad: string | null;
  docente?: string | null;   // docente del taller tal como viene en el Excel
};

/**
 * Deja a cada estudiante en UNA sola especialidad EPT (la reemplaza si ya tenía otra).
 * Las clases son por especialidad + grado + docente: "Computación 5° (Edemita L.)".
 * Si el docente coincide con un usuario del sistema, se le asigna la clase automáticamente.
 * especialidad = null  →  solo lo quita de su especialidad actual.
 */
export async function asignarEspecialidades(sb: SupabaseClient, items: Asignacion[]) {
  const res = { error: null as string | null, docentesSinUsuario: [] as string[] };
  if (!items.length) return res;
  const clave = (d?: string | null) => sinTildes(d ?? "");

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

  // 2) clases EPT existentes y las que falten (una por especialidad, grado y docente)
  const { data: clasesAct } = await sb.from("clases").select("id,curso_id,grado,docente_texto,profesor_id")
    .in("curso_id", cursoIds).is("seccion_id", null);
  const claseId = new Map((clasesAct ?? []).map((c) => [`${c.curso_id}|${c.grado}|${clave(c.docente_texto)}`, c.id as string]));
  const sinProfesor = new Map((clasesAct ?? []).filter((c) => !c.profesor_id && c.docente_texto)
    .map((c) => [c.id as string, c.docente_texto as string]));

  const { data: perfiles } = await sb.from("profiles").select("id,nombre").eq("rol", "profesor").eq("activo", true);
  const faltantes = new Map<string, { curso_id: string; grado: number; nombre: string; docente_texto: string | null; profesor_id: string | null }>();
  const sinUsuario = new Set<string>();

  for (const it of items) {
    if (!it.especialidad) continue;
    const curso = cursoPorNombre.get(it.especialidad);
    if (!curso) return { ...res, error: `Especialidad desconocida: ${it.especialidad}` };
    const doc = it.docente?.trim() || null;
    const k = `${curso.id}|${it.grado}|${clave(doc)}`;
    if (!claseId.has(k) && !faltantes.has(k)) {
      const prof = doc ? emparejarDocente(doc, perfiles ?? []) : null;
      if (doc && !prof) sinUsuario.add(doc);
      faltantes.set(k, {
        curso_id: curso.id, grado: it.grado, docente_texto: doc, profesor_id: prof,
        nombre: doc ? `${it.especialidad} ${it.grado}° (${doc})` : `${it.especialidad} ${it.grado}°`,
      });
    }
  }
  if (faltantes.size) {
    const { data, error } = await sb.from("clases")
      .insert([...faltantes.values()].map((f) => ({ ...f, nivel: "secundaria" })))
      .select("id,curso_id,grado,docente_texto");
    if (error) return { ...res, error: error.message };
    for (const c of data ?? []) claseId.set(`${c.curso_id}|${c.grado}|${clave(c.docente_texto)}`, c.id);
  }
  // clases que ya existían sin profesor: reintenta emparejar con los usuarios actuales
  for (const [id, doc] of sinProfesor) {
    const prof = emparejarDocente(doc, perfiles ?? []);
    if (prof) await sb.from("clases").update({ profesor_id: prof }).eq("id", id);
    else sinUsuario.add(doc);
  }
  res.docentesSinUsuario = [...sinUsuario].sort();

  // 3) quitar la especialidad anterior de estos estudiantes
  const todasClases = (await sb.from("clases").select("id").in("curso_id", cursoIds).is("seccion_id", null)).data ?? [];
  const claseIdsEpt = todasClases.map((c) => c.id);
  const estIds = [...new Set(items.map((i) => i.estudianteId))];
  for (let i = 0; i < estIds.length; i += 200) {
    const { error } = await sb.from("clase_estudiantes").delete()
      .in("estudiante_id", estIds.slice(i, i + 200)).in("clase_id", claseIdsEpt);
    if (error) return { ...res, error: error.message };
  }

  // 4) asignar la nueva
  const filas = items.filter((i) => i.especialidad).map((i) => ({
    clase_id: claseId.get(`${cursoPorNombre.get(i.especialidad!)!.id}|${i.grado}|${clave(i.docente)}`)!,
    estudiante_id: i.estudianteId,
  }));
  for (let i = 0; i < filas.length; i += 300) {
    const { error } = await sb.from("clase_estudiantes").upsert(filas.slice(i, i + 300));
    if (error) return { ...res, error: error.message };
  }
  return res;
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
