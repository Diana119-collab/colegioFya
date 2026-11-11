"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ESPECIALIDADES, asignarEspecialidades, leerTodo } from "@/lib/ept";

type Sec = { id: string; nivel: string; grado: number; seccion: string };
type Est = {
  id: string; dni: string | null; apellidos: string; nombres: string; seccion_id: string;
  correo: string | null; apoderado: string | null; celular_apoderado: string | null; activo: boolean;
};
// Niveles y grados fijos; las secciones A-F siempre se ofrecen (más las que ya existan, ej. "Rosado").
const GRADOS: Record<string, { v: number; t: string }[]> = {
  inicial: [3, 4, 5].map((n) => ({ v: n, t: `${n} años` })),
  primaria: [1, 2, 3, 4, 5, 6].map((n) => ({ v: n, t: `${n}°` })),
  secundaria: [1, 2, 3, 4, 5].map((n) => ({ v: n, t: `${n}°` })),
};
const SECCIONES_BASE = ["A", "B", "C", "D", "E", "F"];

const vacio = { id: "", dni: "", apellidos: "", nombres: "", nivel: "", grado: "", seccion: "", correo: "", especialidad: "", apoderado: "", celular_apoderado: "" };

export default function Estudiantes() {
  const [lista, setLista] = useState<Est[]>([]);
  const [secs, setSecs] = useState<Sec[]>([]);
  const [esp, setEsp] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [form, setForm] = useState<typeof vacio | null>(null);
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    const sb = supabase();
    const [e, s, v] = await Promise.all([
      leerTodo<Est>((d, h) => sb.from("estudiantes").select("*").order("apellidos").range(d, h)),
      sb.from("secciones").select("*").order("nivel").order("grado").order("seccion"),
      leerTodo<{ estudiante_id: string; especialidad: string }>((d, h) =>
        sb.from("estudiante_especialidad").select("estudiante_id,especialidad").range(d, h)),
    ]);
    setLista(e);
    setSecs(s.data ?? []);
    setEsp(Object.fromEntries(v.map((x) => [x.estudiante_id, x.especialidad])));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const opcionesSeccion = (nivel: string, grado: string) =>
    [...new Set([...SECCIONES_BASE, ...secs.filter((x) => x.nivel === nivel && String(x.grado) === grado).map((x) => x.seccion)])].sort();

  const nombreSec = (id: string) => {
    const s = secs.find((x) => x.id === id);
    return s ? `${s.grado}° ${s.seccion} ${s.nivel}` : "";
  };

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const sb = supabase();
    // Busca el aula (nivel + grado + sección); si no existe todavía, la crea.
    const { data: aula, error: errAula } = await sb.from("secciones")
      .upsert({ nivel: form.nivel, grado: Number(form.grado), seccion: form.seccion }, { onConflict: "nivel,grado,seccion" })
      .select("id,nivel,grado").single();
    if (errAula || !aula) return setMsg(errAula?.message ?? "No se pudo crear el aula");
    const secSel = aula;
    const datos = {
      correo: form.correo.trim() || null,
      dni: form.dni.trim() || null, apellidos: form.apellidos.trim(), nombres: form.nombres.trim(),
      seccion_id: aula.id, apoderado: form.apoderado.trim() || null,
      celular_apoderado: form.celular_apoderado.trim() || null,
    };
    let id = form.id;
    let error;
    if (id) ({ error } = await sb.from("estudiantes").update(datos).eq("id", id));
    else {
      const r = await sb.from("estudiantes").insert(datos).select("id").single();
      error = r.error; id = r.data?.id ?? "";
    }
    if (error) return setMsg(error.message.includes("dni") ? "Ya existe un estudiante con ese DNI" : error.message);
    // Especialidad EPT: solo secundaria, una por estudiante (null = sin especialidad)
    const quiere = secSel?.nivel === "secundaria" && form.especialidad ? form.especialidad : null;
    const r2 = await asignarEspecialidades(sb, [{ estudianteId: id, grado: secSel?.grado ?? 1, especialidad: quiere }]);
    if (r2.error) return setMsg("Se guardó el estudiante, pero la especialidad falló: " + r2.error);
    setForm(null); setMsg("Guardado");
    cargar();
  }

  async function activar(est: Est, activo: boolean) {
    if (!activo && !confirm(`¿Dar de baja a ${est.apellidos}, ${est.nombres}? Dejará de aparecer en reportes y aulas.`)) return;
    await supabase().from("estudiantes").update({ activo }).eq("id", est.id);
    cargar();
  }

  const f = lista.filter((e) => e.activo !== verInactivos &&
    `${e.apellidos} ${e.nombres} ${e.dni ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const inp = "border rounded p-2 w-full";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-2xl font-bold mr-auto">Estudiantes ({f.length})</h2>
        <button onClick={() => { setForm({ ...vacio }); setMsg(""); }}
          className="bg-red-700 text-white px-4 py-2 rounded">+ Nuevo estudiante</button>
      </div>

      {form && (
        <form onSubmit={guardar} className="bg-white border rounded p-4 mb-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <h3 className="font-semibold sm:col-span-2 lg:col-span-3">{form.id ? "Editar estudiante" : "Nuevo estudiante"}</h3>
          <input className={inp} placeholder="Apellidos" required value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} />
          <input className={inp} placeholder="Nombres" required value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} />
          <input className={inp} placeholder="DNI" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} />
          <select className={inp} required value={form.nivel}
            onChange={(e) => setForm({ ...form, nivel: e.target.value, grado: "", seccion: "", especialidad: "" })}>
            <option value="">Nivel…</option>
            <option value="inicial">Inicial</option><option value="primaria">Primaria</option><option value="secundaria">Secundaria</option>
          </select>
          <select className={inp} required disabled={!form.nivel} value={form.grado}
            onChange={(e) => setForm({ ...form, grado: e.target.value, seccion: "" })}>
            <option value="">{form.nivel === "inicial" ? "Edad…" : "Grado…"}</option>
            {(GRADOS[form.nivel] ?? []).map((g) => <option key={g.v} value={g.v}>{g.t}</option>)}
          </select>
          <select className={inp} required disabled={!form.grado} value={form.seccion}
            onChange={(e) => setForm({ ...form, seccion: e.target.value })}>
            <option value="">Sección…</option>
            {opcionesSeccion(form.nivel, form.grado).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <input className={inp} type="email" placeholder="Correo del estudiante" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} />
          {form.nivel === "secundaria" && (
            <select className={inp} value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value })}>
              <option value="">Especialidad EPT: ninguna</option>
              {ESPECIALIDADES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          )}
          <input className={inp} placeholder="Apoderado" value={form.apoderado} onChange={(e) => setForm({ ...form, apoderado: e.target.value })} />
          <input className={inp} placeholder="Celular apoderado (ej. 999111222)" value={form.celular_apoderado} onChange={(e) => setForm({ ...form, celular_apoderado: e.target.value })} />
          <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
            <button className="bg-red-700 text-white px-4 py-2 rounded">Guardar</button>
            <button type="button" onClick={() => setForm(null)} className="border px-4 py-2 rounded">Cancelar</button>
          </div>
        </form>
      )}
      {msg && <p className="text-sm mb-2">{msg}</p>}

      <div className="flex gap-3 items-center mb-3">
        <input className="border rounded p-2 w-full max-w-sm" placeholder="Buscar por nombre o DNI" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="text-sm whitespace-nowrap"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver dados de baja</label>
      </div>

      {f.length > 300 && <p className="text-xs text-gray-500 mb-1">Mostrando 300 de {f.length}. Usa el buscador para encontrar a un estudiante.</p>}
      <div className="bg-white border rounded overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b">
            <th className="p-2">Apellidos y nombres</th><th>DNI</th><th>Correo</th><th>Aula</th><th>Especialidad EPT</th><th>Apoderado</th><th>Celular</th><th /></tr></thead>
          <tbody>{f.slice(0, 300).map((e) => (
            <tr key={e.id} className="border-b">
              <td className="p-2">{e.apellidos}, {e.nombres}</td><td>{e.dni}</td>
              <td>{e.correo}</td>
              <td className="capitalize">{nombreSec(e.seccion_id)}</td>
              <td>{esp[e.id] ?? ""}</td>
              <td>{e.apoderado}</td><td>{e.celular_apoderado}</td>
              <td className="whitespace-nowrap">
                <button className="text-red-700 underline mr-3" onClick={() => {
                  const sec = secs.find((x) => x.id === e.seccion_id);
                  setForm({ id: e.id, dni: e.dni ?? "", apellidos: e.apellidos, nombres: e.nombres,
                    nivel: sec?.nivel ?? "", grado: String(sec?.grado ?? ""), seccion: sec?.seccion ?? "",
                    correo: e.correo ?? "", especialidad: esp[e.id] ?? "",
                    apoderado: e.apoderado ?? "", celular_apoderado: e.celular_apoderado ?? "" });
                  setMsg(""); window.scrollTo({ top: 0, behavior: "smooth" });
                }}>Editar</button>
                <button className="text-gray-600 underline" onClick={() => activar(e, !e.activo)}>
                  {e.activo ? "Dar de baja" : "Reactivar"}</button>
              </td>
            </tr>))}</tbody>
        </table>
      </div>
    </>
  );
}
