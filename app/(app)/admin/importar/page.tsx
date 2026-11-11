"use client";
import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { asignarEspecialidades, normalizarEspecialidad, leerTodo, Asignacion } from "@/lib/ept";

type Fila = Record<string, string>;
type Existente = { id: string; dni: string | null; correo: string | null; apellidos: string; nombres: string };

const norm = (s: string) =>
  s.toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/** Traduce los encabezados del archivo (ej. "APELLIDOS Y NOMBRES", "CORREO INSTITUCIONAL", "GRAD") a nombres internos. */
function canon(k: string): string {
  const t = norm(k);
  if (t.startsWith("dni") || t === "documento") return "dni";
  if (t.includes("apellidos") && t.includes("nombres")) return "apellidos y nombres";
  if (t === "apellidos") return "apellidos";
  if (t === "nombres") return "nombres";
  if (t === "sx" || t === "sexo" || t === "genero") return "sexo";
  if (t.includes("correo") || t.includes("email") || t.includes("e-mail")) return "correo";
  if (t === "taller" || t.startsWith("especialidad")) return "especialidad";
  if (t === "docente" || t === "profesor") return "docente";
  if (t.startsWith("grad")) return "grado";
  if (t.startsWith("secc")) return "seccion";
  if (t === "nivel") return "nivel";
  if (t.startsWith("apoderado")) return "apoderado";
  if (t.startsWith("celular") || t.startsWith("telefono") || t.startsWith("cel")) return "celular";
  return t;
}

async function leerArchivo(file: File): Promise<Fila[]> {
  let rows: Record<string, unknown>[];
  if (file.name.toLowerCase().endsWith(".csv")) {
    rows = await new Promise((res, rej) =>
      Papa.parse<Record<string, unknown>>(file, {
        header: true, skipEmptyLines: true, complete: (r) => res(r.data), error: rej,
      })
    );
  } else {
    const wb = XLSX.read(await file.arrayBuffer());
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  }
  return rows
    .map((r) => {
      const o: Fila = {};
      for (const k in r) o[canon(k)] = String(r[k] ?? "").trim();
      return o;
    })
    .filter((o) => Object.values(o).some((v) => v));
}

/** "ATO TORRES, OMAR LEONEL" -> apellidos "ATO TORRES", nombres "OMAR LEONEL" */
function separarNombre(f: Fila): { apellidos: string; nombres: string; aviso?: string } {
  if (f.apellidos && f.nombres) return { apellidos: f.apellidos, nombres: f.nombres };
  const full = f["apellidos y nombres"] ?? "";
  const i = full.indexOf(",");
  if (i > 0) return { apellidos: full.slice(0, i).trim(), nombres: full.slice(i + 1).trim() };
  const p = full.split(/\s+/).filter(Boolean);       // sin coma: 2 primeras palabras = apellidos
  if (p.length >= 3) return { apellidos: p.slice(0, 2).join(" "), nombres: p.slice(2).join(" "), aviso: "sin coma, se asumieron 2 apellidos" };
  return { apellidos: full, nombres: "" };
}

const claveNombre = (a: string, n: string) => norm(`${a}|${n}`);
const normCorreo = (c?: string | null) => (c ?? "").trim().toLowerCase();
const normSexo = (s?: string) => {
  const t = norm(s ?? "");
  return t.startsWith("h") ? "H" : t.startsWith("m") ? "M" : null;
};

export default function Importar() {
  const [tipo, setTipo] = useState<"alumnos" | "ept">("alumnos");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFilas(await leerArchivo(f));
    setLog([]);
  }

  async function cargarExistentes(): Promise<Existente[]> {
    const sb = supabase();
    return leerTodo<Existente>((d, h) => sb.from("estudiantes").select("id,dni,correo,apellidos,nombres").range(d, h));
  }

  function indice(ex: Existente[]) {
    const dni = new Map<string, string>(), correo = new Map<string, string>(), nombre = new Map<string, string>();
    for (const e of ex) {
      if (e.dni) dni.set(e.dni, e.id);
      if (e.correo) correo.set(normCorreo(e.correo), e.id);
      nombre.set(claveNombre(e.apellidos, e.nombres), e.id);
    }
    return (f: Fila, ap: string, no: string) =>
      (f.dni && dni.get(f.dni)) || (f.correo && correo.get(normCorreo(f.correo))) || nombre.get(claveNombre(ap, no)) || null;
  }

  async function importarAlumnos() {
    const sb = supabase();
    const out: string[] = [];

    // 1) aulas (nivel + grado + sección). Si el archivo no trae nivel se asume secundaria.
    const aulas = new Map<string, { nivel: string; grado: number; seccion: string }>();
    const val = filas.map((f, i) => {
      const nivel = norm(f.nivel || "secundaria");
      const grado = parseInt(f.grado);
      const seccion = (f.seccion || "").toUpperCase().trim();
      const { apellidos, nombres, aviso } = separarNombre(f);
      let error = "";
      if (!apellidos || !nombres) error = "falta apellidos o nombres";
      else if (!["inicial", "primaria", "secundaria"].includes(nivel)) error = `nivel "${f.nivel}" inválido`;
      else if (!grado || !seccion) error = "falta grado o sección";
      if (aviso) out.push(`Fila ${i + 2} (${apellidos}): ${aviso}`);
      if (!error) aulas.set(`${nivel}|${grado}|${seccion}`, { nivel, grado, seccion });
      return { f, i, nivel, grado, seccion, apellidos, nombres, error };
    });
    if (aulas.size) {
      const { error } = await sb.from("secciones").upsert([...aulas.values()], { onConflict: "nivel,grado,seccion" });
      if (error) return setLog([`Error creando aulas: ${error.message}`]);
    }
    const { data: secs } = await sb.from("secciones").select("*");
    const aulaId = new Map((secs ?? []).map((s) => [`${s.nivel}|${s.grado}|${s.seccion}`, s.id]));

    // 2) crear o actualizar (se reconoce al alumno por DNI, luego correo, luego nombre)
    const buscar = indice(await cargarExistentes());
    const nuevos: Record<string, unknown>[] = [];
    const cambios: Record<string, unknown>[] = [];
    const vistos = new Set<string>();
    for (const v of val) {
      if (v.error) { out.push(`Fila ${v.i + 2}: ${v.error}, omitida`); continue; }
      const clave = v.f.dni || normCorreo(v.f.correo) || claveNombre(v.apellidos, v.nombres);
      if (vistos.has(clave)) { out.push(`Fila ${v.i + 2}: ${v.apellidos}, ${v.nombres} aparece repetido en el archivo, omitida`); continue; }
      vistos.add(clave);
      const datos: Record<string, unknown> = {
        dni: v.f.dni || null, apellidos: v.apellidos, nombres: v.nombres,
        correo: normCorreo(v.f.correo) || null, sexo: normSexo(v.f.sexo),
        seccion_id: aulaId.get(`${v.nivel}|${v.grado}|${v.seccion}`),
        apoderado: v.f.apoderado || null, celular_apoderado: v.f.celular || null,
      };
      const id = buscar(v.f, v.apellidos, v.nombres);
      if (id) {
        // al actualizar no se borran datos que el archivo no trae
        for (const k of ["dni", "correo", "sexo", "apoderado", "celular_apoderado"]) if (!datos[k]) delete datos[k];
        cambios.push({ id, ...datos });
      } else nuevos.push(datos);
    }
    for (let i = 0; i < nuevos.length; i += 200) {
      const { error } = await sb.from("estudiantes").insert(nuevos.slice(i, i + 200));
      if (error) out.push(`Error al crear: ${error.message}`);
    }
    for (let i = 0; i < cambios.length; i += 200) {
      const { error } = await sb.from("estudiantes").upsert(cambios.slice(i, i + 200), { onConflict: "id" });
      if (error) out.push(`Error al actualizar: ${error.message}`);
    }
    out.unshift(`Estudiantes nuevos: ${nuevos.length} · actualizados: ${cambios.length} · omitidos: ${filas.length - nuevos.length - cambios.length}`);

    // 3) especialidad EPT (columna Taller / especialidad)
    if (filas.some((f) => f.especialidad)) out.push(...(await aplicarEspecialidades()));
    setLog(out);
  }

  /** Deja a cada estudiante en UNA especialidad. Reconoce abreviaturas ("Computac"). */
  async function aplicarEspecialidades(): Promise<string[]> {
    const sb = supabase();
    const out: string[] = [];
    const buscar = indice(await cargarExistentes());
    const ids = new Map<string, { grado: number; nivel: string }>();
    const todos = await leerTodo<{ id: string; secciones: { nivel: string; grado: number } }>((d, h) =>
      sb.from("estudiantes").select("id,secciones(nivel,grado)").range(d, h) as never);
    for (const e of todos) ids.set(e.id, e.secciones);

    const items: Asignacion[] = [];
    filas.forEach((f, i) => {
      if (!f.especialidad) return;
      const { apellidos, nombres } = separarNombre(f);
      const id = buscar(f, apellidos, nombres);
      const esp = normalizarEspecialidad(f.especialidad);
      const quien = apellidos ? `${apellidos}, ${nombres}` : f.dni || f.correo;
      if (!id) return void out.push(`Fila ${i + 2}: ${quien} no encontrado, sin especialidad`);
      const s = ids.get(id);
      if (!s || s.nivel !== "secundaria") return void out.push(`Fila ${i + 2}: ${quien}: la EPT es solo de secundaria, se omitió`);
      if (!esp) return void out.push(`Fila ${i + 2}: ${quien}: taller "${f.especialidad}" no reconocido`);
      items.push({ estudianteId: id, grado: s.grado, especialidad: esp });
    });
    const r = await asignarEspecialidades(sb, items);
    out.unshift(r.error ? `Error en especialidades: ${r.error}` : `Especialidades EPT asignadas: ${items.length}`);
    return out;
  }

  async function ejecutar() {
    setBusy(true);
    try {
      if (tipo === "alumnos") await importarAlumnos();
      else setLog(await aplicarEspecialidades());
    } finally { setBusy(false); }
  }

  const cols = filas[0] ? Object.keys(filas[0]) : [];
  return (
    <>
      <h2 className="text-2xl font-bold mb-4">Importar desde CSV o Excel</h2>
      <div className="flex gap-2 mb-4">
        {(["alumnos", "ept"] as const).map((t) => (
          <button key={t} onClick={() => { setTipo(t); setFilas([]); setLog([]); }}
            className={`px-3 py-1 rounded border ${tipo === t ? "bg-red-700 text-white" : "bg-white"}`}>
            {t === "alumnos" ? "Estudiantes" : "Solo especialidades EPT"}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-600 mb-2">
        {tipo === "alumnos"
          ? "Formato del colegio: dni, APELLIDOS Y NOMBRES (en una columna: «APELLIDOS, NOMBRES»), Sx, CORREO INSTITUCIONAL, Taller, Docente, GRAD, SECCION. También acepta columnas separadas apellidos y nombres, nivel, apoderado y celular. Sin columna nivel se asume secundaria. Si el DNI está vacío, se reconoce al alumno por su correo o por su nombre, así que puedes volver a importar sin duplicar."
          : "Columnas: dni (o correo institucional) y taller/especialidad. Cada estudiante queda en una sola especialidad; si ya tenía otra, se cambia. El estudiante debe existir."}
      </p>
      <input type="file" accept=".csv,.xlsx,.xls" onChange={alElegir} className="mb-4" />
      {filas.length > 0 && (
        <>
          <p className="mb-2">{filas.length} filas detectadas. Vista previa (columnas reconocidas):</p>
          <div className="overflow-auto max-h-72 bg-white border rounded mb-3">
            <table className="text-sm w-full">
              <thead><tr>{cols.map((c) => <th key={c} className="text-left p-1 border-b">{c}</th>)}</tr></thead>
              <tbody>{filas.slice(0, 20).map((f, i) => (
                <tr key={i}>{cols.map((c) => <td key={c} className="p-1 border-b">{f[c]}</td>)}</tr>))}</tbody>
            </table>
          </div>
          <button disabled={busy} onClick={ejecutar} className="bg-red-700 text-white px-4 py-2 rounded disabled:opacity-50">
            {busy ? "Importando…" : "Importar"}
          </button>
        </>
      )}
      {log.length > 0 && <ul className="mt-4 text-sm space-y-1">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </>
  );
}
