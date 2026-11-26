"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { usePerfil } from "@/components/Shell";
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
const ORDEN_NIVEL: Record<string, number> = { inicial: 0, primaria: 1, secundaria: 2 };
const tituloAula = (s?: Sec) =>
  s ? `${s.grado}${s.nivel === "inicial" ? " años" : "°"} ${s.seccion} · ${s.nivel[0].toUpperCase()}${s.nivel.slice(1)}` : "Sin aula";

const vacio = { id: "", dni: "", apellidos: "", nombres: "", nivel: "", grado: "", seccion: "", correo: "", especialidad: "", docente: "", apoderado: "", celular_apoderado: "" };

export default function Estudiantes() {
  const perfil = usePerfil();
  const esAdmin = perfil.rol === "admin";   // el auxiliar solo consulta
  const [filtro, setFiltro] = useState({ nivel: esAdmin ? "" : perfil.nivel ?? "", grado: "", seccion: "" });
  const [lista, setLista] = useState<Est[]>([]);
  const [secs, setSecs] = useState<Sec[]>([]);
  const [esp, setEsp] = useState<Record<string, { especialidad: string; docente: string | null; grado: number }>>({});
  const [docentes, setDocentes] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [form, setForm] = useState<typeof vacio | null>(null);
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    const sb = supabase();
    const [e, s, v] = await Promise.all([
      leerTodo<Est>((d, h) => sb.from("estudiantes").select("*").order("apellidos").range(d, h)),
      sb.from("secciones").select("*").order("nivel").order("grado").order("seccion"),
      leerTodo<{ estudiante_id: string; especialidad: string; docente_texto: string | null; grado: number }>((d, h) =>
        sb.from("estudiante_especialidad").select("estudiante_id,especialidad,docente_texto,grado").range(d, h)),
    ]);
    setLista(e);
    setSecs(s.data ?? []);
    setEsp(Object.fromEntries(v.map((x) => [x.estudiante_id, { especialidad: x.especialidad, docente: x.docente_texto, grado: x.grado }])));
    const docs: Record<string, Set<string>> = {};
    for (const x of v) if (x.docente_texto) (docs[`${x.especialidad}|${x.grado}`] ??= new Set()).add(x.docente_texto);
    setDocentes(Object.fromEntries(Object.entries(docs).map(([k, set]) => [k, [...set].sort()])));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const opcionesSeccion = (nivel: string, grado: string) =>
    [...new Set([...SECCIONES_BASE, ...secs.filter((x) => x.nivel === nivel && String(x.grado) === grado).map((x) => x.seccion)])].sort();

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
    const r2 = await asignarEspecialidades(sb, [{ estudianteId: id, grado: secSel?.grado ?? 1, especialidad: quiere, docente: quiere ? form.docente.trim() || null : null }]);
    if (r2.error) return setMsg("Se guardó el estudiante, pero la especialidad falló: " + r2.error);
    setForm(null); setMsg("Guardado");
    cargar();
  }

  async function activar(est: Est, activo: boolean) {
    if (!activo && !confirm(`¿Dar de baja a ${est.apellidos}, ${est.nombres}? Dejará de aparecer en reportes y aulas.`)) return;
    await supabase().from("estudiantes").update({ activo }).eq("id", est.id);
    cargar();
  }

  const porId = new Map(secs.map((s) => [s.id, s]));
  const f = lista
    .filter((e) => {
      const s = porId.get(e.seccion_id);
      return e.activo !== verInactivos &&
        (!filtro.nivel || s?.nivel === filtro.nivel) &&
        (!filtro.grado || String(s?.grado) === filtro.grado) &&
        (!filtro.seccion || s?.seccion === filtro.seccion) &&
        `${e.apellidos} ${e.nombres} ${e.dni ?? ""}`.toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => {
      const x = porId.get(a.seccion_id), y = porId.get(b.seccion_id);
      return (ORDEN_NIVEL[x?.nivel ?? ""] ?? 9) - (ORDEN_NIVEL[y?.nivel ?? ""] ?? 9) ||
        (x?.grado ?? 0) - (y?.grado ?? 0) || (x?.seccion ?? "").localeCompare(y?.seccion ?? "") ||
        a.apellidos.localeCompare(b.apellidos, "es");
    });
  const totalAula = new Map<string, number>();
  for (const e of f) totalAula.set(e.seccion_id, (totalAula.get(e.seccion_id) ?? 0) + 1);
  const delFiltro = secs.filter((s) => !filtro.nivel || s.nivel === filtro.nivel);
  const gradosFiltro = [...new Set(delFiltro.map((s) => s.grado))].sort((a, b) => a - b);
  const seccionesFiltro = [...new Set(delFiltro.filter((s) => String(s.grado) === filtro.grado).map((s) => s.seccion))].sort();
  const columnas = esAdmin ? 6 : 4;
  const inp = "border rounded p-2 w-full";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-2xl font-bold mr-auto">Estudiantes ({f.length})</h2>
        {esAdmin && (
          <button onClick={() => { setForm({ ...vacio }); setMsg(""); }}
            className="bg-red-700 text-white px-4 py-2 rounded">+ Nuevo estudiante</button>
        )}
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
            <select className={inp} value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value, docente: "" })}>
              <option value="">Especialidad EPT: ninguna</option>
              {ESPECIALIDADES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          )}
          {form.nivel === "secundaria" && form.especialidad && (
            <input className={inp} list="docentes-taller" placeholder="Docente del taller (ej. Edemita L.)"
              value={form.docente} onChange={(e) => setForm({ ...form, docente: e.target.value })} />
          )}
          <datalist id="docentes-taller">
            {(docentes[`${form.especialidad}|${form.grado}`] ?? []).map((d) => <option key={d} value={d} />)}
          </datalist>
          <input className={inp} placeholder="Apoderado" value={form.apoderado} onChange={(e) => setForm({ ...form, apoderado: e.target.value })} />
          <input className={inp} placeholder="Celular apoderado (ej. 999111222)" value={form.celular_apoderado} onChange={(e) => setForm({ ...form, celular_apoderado: e.target.value })} />
          <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
            <button className="bg-red-700 text-white px-4 py-2 rounded">Guardar</button>
            <button type="button" onClick={() => setForm(null)} className="border px-4 py-2 rounded">Cancelar</button>
          </div>
        </form>
      )}
      {msg && <p className="text-sm mb-2">{msg}</p>}

      <div className="flex flex-wrap gap-3 items-center mb-3">
        <select className="border rounded p-2" value={filtro.nivel}
          onChange={(e) => setFiltro({ nivel: e.target.value, grado: "", seccion: "" })}>
          <option value="">Todos los niveles</option>
          <option value="inicial">Inicial</option><option value="primaria">Primaria</option><option value="secundaria">Secundaria</option>
        </select>
        <select className="border rounded p-2 disabled:opacity-40" disabled={!filtro.nivel} value={filtro.grado}
          onChange={(e) => setFiltro({ ...filtro, grado: e.target.value, seccion: "" })}>
          <option value="">Todos los grados</option>
          {gradosFiltro.map((g) => <option key={g} value={g}>{g}{filtro.nivel === "inicial" ? " años" : "°"}</option>)}
        </select>
        <select className="border rounded p-2 disabled:opacity-40" disabled={!filtro.grado} value={filtro.seccion}
          onChange={(e) => setFiltro({ ...filtro, seccion: e.target.value })}>
          <option value="">Todas las secciones</option>
          {seccionesFiltro.map((x) => <option key={x} value={x}>Sección {x}</option>)}
        </select>
        <input className="border rounded p-2 w-full max-w-sm" placeholder="Buscar por nombre o DNI" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="text-sm whitespace-nowrap"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver dados de baja</label>
      </div>

      {f.length > 300 && <p className="text-xs text-gray-500 mb-1">Mostrando 300 de {f.length}. Filtra por grado y sección o usa el buscador.</p>}
      <div className="bg-white border rounded overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b">
            <th className="p-2">Apellidos y nombres</th><th>DNI</th>
            {esAdmin && <th>Correo</th>}
            <th>Apoderado</th><th>Celular</th>
            {esAdmin && <th />}</tr></thead>
          <tbody>{f.slice(0, 300).map((e, i, arr) => (
            <Fragment key={e.id}>
              {arr[i - 1]?.seccion_id !== e.seccion_id && (
                <tr className="bg-red-50 border-b">
                  <td colSpan={columnas} className="p-2 font-semibold text-red-800">
                    {tituloAula(porId.get(e.seccion_id))} <span className="font-normal">({totalAula.get(e.seccion_id)} estudiantes)</span>
                  </td>
                </tr>
              )}
              <tr className="border-b">
                <td className="p-2">{e.apellidos}, {e.nombres}</td><td>{e.dni}</td>
                {esAdmin && <td>{e.correo}</td>}
                <td>{e.apoderado}</td><td>{e.celular_apoderado}</td>
                {esAdmin && (
                  <td className="whitespace-nowrap">
                    <button className="text-red-700 underline mr-3" onClick={() => {
                      const sec = porId.get(e.seccion_id);
                      setForm({ id: e.id, dni: e.dni ?? "", apellidos: e.apellidos, nombres: e.nombres,
                        nivel: sec?.nivel ?? "", grado: String(sec?.grado ?? ""), seccion: sec?.seccion ?? "",
                        correo: e.correo ?? "", especialidad: esp[e.id]?.especialidad ?? "", docente: esp[e.id]?.docente ?? "",
                        apoderado: e.apoderado ?? "", celular_apoderado: e.celular_apoderado ?? "" });
                      setMsg(""); window.scrollTo({ top: 0, behavior: "smooth" });
                    }}>Editar</button>
                    <button className="text-gray-600 underline" onClick={() => activar(e, !e.activo)}>
                      {e.activo ? "Dar de baja" : "Reactivar"}</button>
                  </td>
                )}
              </tr>
            </Fragment>))}</tbody>
        </table>
      </div>
    </>
  );
}
