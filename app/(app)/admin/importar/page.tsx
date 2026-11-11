"use client";
import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { asignarEspecialidades, normalizarEspecialidad, Asignacion } from "@/lib/ept";

type Fila = Record<string, string>;

const norm = (s: string) =>
  s.toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

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
  return rows.map((r) => {
    const o: Fila = {};
    for (const k in r) o[norm(k)] = String(r[k] ?? "").trim();
    return o;
  });
}

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

  async function importarAlumnos() {
    const sb = supabase();
    const out: string[] = [];
    let ok = 0;
    // 1) secciones
    const claves = new Map<string, { nivel: string; grado: number; seccion: string }>();
    for (const f of filas) {
      const nivel = norm(f.nivel || "secundaria");
      const grado = parseInt(f.grado);
      const seccion = (f.seccion || "A").toUpperCase();
      if (!["inicial", "primaria", "secundaria"].includes(nivel) || !grado)
        continue;
      claves.set(`${nivel}|${grado}|${seccion}`, { nivel, grado, seccion });
    }
    if (claves.size)
      await sb.from("secciones").upsert([...claves.values()], { onConflict: "nivel,grado,seccion" });
    const { data: secs } = await sb.from("secciones").select("*");
    const mapa = new Map((secs ?? []).map((s) => [`${s.nivel}|${s.grado}|${s.seccion}`, s.id]));

    // 2) estudiantes (por DNI)
    const lote: Record<string, unknown>[] = [];
    filas.forEach((f, i) => {
      const nivel = norm(f.nivel || "secundaria");
      const id = mapa.get(`${nivel}|${parseInt(f.grado)}|${(f.seccion || "A").toUpperCase()}`);
      if (!id || !f.apellidos || !f.nombres) {
        out.push(`Fila ${i + 2}: datos incompletos o nivel/grado inválido, omitida`);
        return;
      }
      lote.push({
        dni: f.dni || null, apellidos: f.apellidos, nombres: f.nombres, seccion_id: id,
        correo: f.correo || f.email || null,
        apoderado: f.apoderado || null, celular_apoderado: f.celular || f.celular_apoderado || null,
      });
    });
    for (let i = 0; i < lote.length; i += 200) {
      const parte = lote.slice(i, i + 200);
      const { error } = await sb.from("estudiantes").upsert(parte, { onConflict: "dni" });
      if (error) out.push(`Error: ${error.message}`);
      else ok += parte.length;
    }
    out.unshift(`Importados/actualizados: ${ok} de ${filas.length}`);
    if (filas.some((f) => f.especialidad)) out.push(...(await aplicarEspecialidades()));
    setLog(out);
  }

  // Asigna la especialidad EPT (1 por estudiante) leyendo columnas dni + especialidad
  async function aplicarEspecialidades(): Promise<string[]> {
    const sb = supabase();
    const out: string[] = [];
    const dnis = filas.filter((f) => f.especialidad && f.dni).map((f) => f.dni);
    const porDni = new Map<string, { id: string; grado: number; nivel: string }>();
    for (let i = 0; i < dnis.length; i += 200) {
      const { data } = await sb.from("estudiantes").select("id,dni,secciones(nivel,grado)").in("dni", dnis.slice(i, i + 200));
      for (const e of data ?? []) {
        const sec = e.secciones as unknown as { nivel: string; grado: number };
        porDni.set(e.dni, { id: e.id, grado: sec.grado, nivel: sec.nivel });
      }
    }
    const items: Asignacion[] = [];
    filas.forEach((f, i) => {
      if (!f.especialidad) return;
      const est = porDni.get(f.dni);
      const esp = normalizarEspecialidad(f.especialidad);
      if (!est) return void out.push(`Fila ${i + 2}: DNI ${f.dni || "(vacío)"} no encontrado, sin especialidad`);
      if (est.nivel !== "secundaria") return void out.push(`Fila ${i + 2}: la EPT es solo de secundaria, se omitió`);
      if (!esp) return void out.push(`Fila ${i + 2}: especialidad "${f.especialidad}" no reconocida`);
      items.push({ estudianteId: est.id, grado: est.grado, especialidad: esp });
    });
    const r = await asignarEspecialidades(sb, items);
    out.unshift(r.error ? `Error en especialidades: ${r.error}` : `Especialidades EPT asignadas: ${items.length}`);
    return out;
  }

  async function importarEpt() {
    // columnas: dni, especialidad  (cada estudiante queda en UNA sola especialidad)
    const out = await aplicarEspecialidades();
    setLog(out);
  }

  async function ejecutar() {
    setBusy(true);
    try { await (tipo === "alumnos" ? importarAlumnos() : importarEpt()); }
    finally { setBusy(false); }
  }

  const cols = filas[0] ? Object.keys(filas[0]) : [];
  return (
    <>
      <h2 className="text-2xl font-bold mb-4">Importar desde CSV o Excel</h2>
      <div className="flex gap-2 mb-4">
        {(["alumnos", "ept"] as const).map((t) => (
          <button key={t} onClick={() => { setTipo(t); setFilas([]); setLog([]); }}
            className={`px-3 py-1 rounded border ${tipo === t ? "bg-red-700 text-white" : "bg-white"}`}>
            {t === "alumnos" ? "Estudiantes" : "Especialidades EPT"}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-600 mb-2">
        {tipo === "alumnos"
          ? "Columnas: dni, apellidos, nombres, correo, nivel (inicial/primaria/secundaria), grado, seccion, apoderado, celular. Opcional para secundaria: especialidad."
          : "Columnas: dni, especialidad (Computación, Industria del vestido, Industria alimentaria, Carpintería metálica, Ebanistería, Electricidad). Cada estudiante queda en una sola especialidad; si ya tenía otra, se cambia. El estudiante debe existir (se busca por DNI)."}
      </p>
      <input type="file" accept=".csv,.xlsx,.xls" onChange={alElegir} className="mb-4" />
      {filas.length > 0 && (
        <>
          <p className="mb-2">{filas.length} filas detectadas. Vista previa:</p>
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
