"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Clase = { id: string; nombre: string; profesor_id: string | null; seccion_id: string | null; nivel: string; grado: number };
type Prof = { id: string; nombre: string };
type Sec = { id: string; nivel: string; grado: number; seccion: string };

const CURSOS_REGULARES = ["Matemática", "Comunicación", "Inglés", "Ciencia y Tecnología", "Personal Social", "Arte y Cultura", "Educación Física", "Religión"];

export default function Clases() {
  const [clases, setClases] = useState<Clase[]>([]);
  const [profs, setProfs] = useState<Prof[]>([]);
  const [secs, setSecs] = useState<Sec[]>([]);
  const [curso, setCurso] = useState("");
  const [secId, setSecId] = useState("");
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    const sb = supabase();
    const [c, p, s] = await Promise.all([
      sb.from("clases").select("id,nombre,profesor_id,seccion_id,nivel,grado").order("nombre"),
      sb.from("profiles").select("id,nombre").eq("rol", "profesor").eq("activo", true).order("nombre"),
      sb.from("secciones").select("*").order("nivel").order("grado").order("seccion"),
    ]);
    setClases(c.data ?? []); setProfs(p.data ?? []); setSecs(s.data ?? []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const sb = supabase();
    const sec = secs.find((x) => x.id === secId);
    if (!sec || !curso.trim()) return;
    let { data: c } = await sb.from("cursos").select("id").eq("nombre", curso.trim()).maybeSingle();
    if (!c) ({ data: c } = await sb.from("cursos").insert({ nombre: curso.trim(), tipo: "regular" }).select("id").single());
    const { error } = await sb.from("clases").insert({
      curso_id: c!.id, nivel: sec.nivel, grado: sec.grado, seccion_id: sec.id,
      nombre: `${curso.trim()} ${sec.grado}° ${sec.seccion}`,
    });
    setMsg(error ? error.message : "Curso creado");
    cargar();
  }

  async function eliminar(c: Clase) {
    if (!confirm(`¿Eliminar "${c.nombre}"? Se borrará también su asistencia registrada y no se puede deshacer.`)) return;
    const { error } = await supabase().from("clases").delete().eq("id", c.id);
    setMsg(error ? error.message : "Eliminado");
    cargar();
  }

  async function asignar(id: string, profesor_id: string) {
    await supabase().from("clases").update({ profesor_id: profesor_id || null }).eq("id", id);
    cargar();
  }

  return (
    <>
      <h2 className="text-2xl font-bold mb-2">Cursos y grupos</h2>
      <p className="text-sm text-gray-600 mb-4">
        Cursos regulares: se crean por grado y sección. Las especialidades EPT (Computación, Industria del vestido, Industria alimentaria, Carpintería metálica, Ebanistería, Electricidad) se forman por grado, por ejemplo &quot;Computación 3°&quot;, y reúnen alumnos de todas las secciones; se llenan desde Estudiantes o al importar. Aquí asignas el profesor de cada una.
      </p>
      <form onSubmit={crear} className="flex flex-wrap gap-2 mb-2 bg-white border rounded p-3">
        <input list="cursos" className="border rounded p-2" placeholder="Curso (ej. Matemática)" value={curso} onChange={(e) => setCurso(e.target.value)} />
        <datalist id="cursos">{CURSOS_REGULARES.map((c) => <option key={c} value={c} />)}</datalist>
        <select className="border rounded p-2" value={secId} onChange={(e) => setSecId(e.target.value)}>
          <option value="">Sección…</option>
          {secs.map((s) => <option key={s.id} value={s.id}>{s.nivel} {s.grado}° {s.seccion}</option>)}
        </select>
        <button className="bg-red-700 text-white px-4 rounded">Crear</button>
        {msg && <span className="text-sm self-center">{msg}</span>}
      </form>
      <div className="bg-white border rounded overflow-auto mt-4">
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b"><th className="p-2">Curso / grupo</th><th>Tipo</th><th>Profesor</th><th /></tr></thead>
          <tbody>{clases.map((c) => (
            <tr key={c.id} className="border-b">
              <td className="p-2">{c.nombre}</td>
              <td>{c.seccion_id ? "Regular" : "EPT (varias secciones)"}</td>
              <td><select className="border rounded p-1" value={c.profesor_id ?? ""} onChange={(e) => asignar(c.id, e.target.value)}>
                <option value="">— sin asignar —</option>
                {profs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select></td>
              <td><button className="text-red-700 underline" onClick={() => eliminar(c)}>Eliminar</button></td>
            </tr>))}</tbody>
        </table>
      </div>
    </>
  );
}
