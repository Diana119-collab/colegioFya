"use client";
import { useEffect, useState } from "react";
import { usePerfil } from "@/components/Shell";
import { supabase, hoyLima } from "@/lib/supabase";

type Clase = { id: string; nombre: string };
type Est = { id: string; apellidos: string; nombres: string };

function Contenido() {
  const perfil = usePerfil();
  const [clases, setClases] = useState<Clase[]>([]);
  const [claseId, setClaseId] = useState("");
  const [ests, setEsts] = useState<Est[]>([]);
  const [colegio, setColegio] = useState<Record<string, string>>({});
  const [marcas, setMarcas] = useState<Record<string, string>>({});
  const fecha = hoyLima();

  useEffect(() => {
    let q = supabase().from("clases").select("id,nombre").order("nombre");
    if (perfil.rol === "profesor") q = q.eq("profesor_id", perfil.id);
    q.then(({ data }) => { setClases(data ?? []); if (data?.[0]) setClaseId(data[0].id); });
  }, [perfil]);

  useEffect(() => {
    if (!claseId) return;
    (async () => {
      const sb = supabase();
      const { data: ca } = await sb.from("clase_alumnos").select("estudiante_id").eq("clase_id", claseId);
      const ids = (ca ?? []).map((x) => x.estudiante_id);
      const [{ data: e }, { data: ac }, { data: m }] = await Promise.all([
        sb.from("estudiantes").select("id,apellidos,nombres").in("id", ids).order("apellidos"),
        sb.from("asistencia_colegio").select("estudiante_id,estado").eq("fecha", fecha).in("estudiante_id", ids),
        sb.from("asistencia_clase").select("estudiante_id,estado").eq("fecha", fecha).eq("clase_id", claseId),
      ]);
      setEsts(e ?? []);
      setColegio(Object.fromEntries((ac ?? []).map((x) => [x.estudiante_id, x.estado])));
      setMarcas(Object.fromEntries((m ?? []).map((x) => [x.estudiante_id, x.estado])));
    })();
  }, [claseId, fecha]);

  async function marcar(id: string, estado: "tardanza" | "falta") {
    const sb = supabase();
    if (marcas[id] === estado) {            // segundo toque = quitar marca
      await sb.from("asistencia_clase").delete().eq("clase_id", claseId).eq("estudiante_id", id).eq("fecha", fecha);
      setMarcas((m) => { const n = { ...m }; delete n[id]; return n; });
      return;
    }
    const { error } = await sb.from("asistencia_clase").upsert(
      { clase_id: claseId, estudiante_id: id, fecha, estado, registrado_por: perfil.id },
      { onConflict: "clase_id,estudiante_id,fecha" });
    if (!error) setMarcas((m) => ({ ...m, [id]: estado }));
    else alert(error.message);
  }

  const badge = (id: string) => {
    const c = colegio[id];
    if (!c) return <span className="text-xs bg-red-100 text-red-700 px-1 rounded">No ingresó al colegio</span>;
    return <span className={`text-xs px-1 rounded ${c === "tardanza" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>Ingresó ({c})</span>;
  };

  return (
    <>
      <h2 className="text-2xl font-bold mb-1">Mi aula</h2>
      <p className="text-sm text-gray-600 mb-3">Marca solo a quienes llegan tarde (T) o faltan (F). El resto se considera presente. Toca de nuevo para quitar la marca.</p>
      <select className="border rounded p-2 mb-4" value={claseId} onChange={(e) => setClaseId(e.target.value)}>
        {clases.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      {clases.length === 0 && <p className="text-gray-500">No tienes cursos asignados.</p>}
      <ul className="space-y-1">
        {ests.map((e) => (
          <li key={e.id} className="bg-white border rounded p-2 flex items-center gap-2">
            <div className="flex-1">
              <p>{e.apellidos}, {e.nombres}</p>{badge(e.id)}
            </div>
            {(["tardanza", "falta"] as const).map((s) => (
              <button key={s} onClick={() => marcar(e.id, s)}
                className={`w-11 h-11 rounded font-bold border ${marcas[e.id] === s
                  ? s === "falta" ? "bg-red-600 text-white" : "bg-amber-500 text-white" : "bg-white"}`}>
                {s === "falta" ? "F" : "T"}
              </button>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Aula() {
  return <><Contenido /></>;
}
