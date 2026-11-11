"use client";
import { useCallback, useEffect, useState } from "react";
import { usePerfil } from "@/components/Shell";
import { supabase, hoyLima } from "@/lib/supabase";

type Clase = { id: string; nombre: string };
type Marca = { clase_id: string; estudiante_id: string; estado: "tardanza" | "falta"; observacion: string | null };
type Est = { id: string; apellidos: string; nombres: string };

const fmtFecha = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function MiReporte() {
  const perfil = usePerfil();
  const [fecha, setFecha] = useState(hoyLima());
  const [clases, setClases] = useState<Clase[]>([]);
  const [filtro, setFiltro] = useState("");
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [totales, setTotales] = useState<Record<string, number>>({});
  const [ests, setEsts] = useState<Record<string, Est>>({});
  const [colegio, setColegio] = useState<Record<string, string>>({});
  const [noLectivo, setNoLectivo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const sb = supabase();
    let q = sb.from("clases").select("id,nombre").order("nombre");
    if (perfil.rol === "profesor") q = q.eq("profesor_id", perfil.id);
    const { data: cl } = await q;
    const lista = cl ?? [];
    setClases(lista);
    const ids = lista.map((c) => c.id);
    if (!ids.length) { setMarcas([]); setCargando(false); return; }

    const [{ data: m }, { data: ca }, { data: nl }] = await Promise.all([
      sb.from("asistencia_clase").select("clase_id,estudiante_id,estado,observacion").eq("fecha", fecha).in("clase_id", ids),
      sb.from("clase_alumnos").select("clase_id").in("clase_id", ids).limit(5000),
      sb.rpc("motivo_no_lectivo", { p_fecha: fecha }),
    ]);
    const marcasDia = (m ?? []) as Marca[];
    setMarcas(marcasDia);
    setNoLectivo((nl as string | null) ?? null);
    const t: Record<string, number> = {};
    for (const x of ca ?? []) t[x.clase_id] = (t[x.clase_id] ?? 0) + 1;
    setTotales(t);

    const estIds = [...new Set(marcasDia.map((x) => x.estudiante_id))];
    if (estIds.length) {
      const [{ data: e }, { data: ac }] = await Promise.all([
        sb.from("estudiantes").select("id,apellidos,nombres").in("id", estIds),
        sb.from("asistencia_colegio").select("estudiante_id,estado").eq("fecha", fecha).in("estudiante_id", estIds),
      ]);
      setEsts(Object.fromEntries((e ?? []).map((x) => [x.id, x])));
      setColegio(Object.fromEntries((ac ?? []).map((x) => [x.estudiante_id, x.estado])));
    } else { setEsts({}); setColegio({}); }
    setCargando(false);
  }, [perfil, fecha]);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = clases.filter((c) => !filtro || c.id === filtro);

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 mb-4 print:hidden">
        <h2 className="text-2xl font-bold mr-auto">Reporte de mi clase</h2>
        <input type="date" className="border rounded p-2" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <select className="border rounded p-2" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos mis cursos</option>
          {clases.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button onClick={cargar} className="border rounded px-3 py-2 bg-white">Actualizar</button>
        <button onClick={() => window.print()} className="bg-red-700 text-white rounded px-3 py-2">Imprimir</button>
      </div>
      <p className="capitalize text-gray-600 mb-3">{fmtFecha(fecha)} · {perfil.nombre}</p>

      {noLectivo && <p className="bg-blue-100 text-blue-800 rounded p-3 mb-3">Día no lectivo ({noLectivo}).</p>}
      {cargando && <p>Cargando…</p>}
      {!cargando && clases.length === 0 && <p className="text-gray-500">No tienes cursos asignados.</p>}

      <div className="space-y-4">
        {visibles.map((c) => {
          const delCurso = marcas.filter((m) => m.clase_id === c.id);
          const tardes = delCurso.filter((m) => m.estado === "tardanza").length;
          const faltas = delCurso.filter((m) => m.estado === "falta").length;
          const total = totales[c.id] ?? 0;
          return (
            <section key={c.id} className="bg-white border rounded break-inside-avoid">
              <header className="p-3 border-b flex flex-wrap gap-x-6 gap-y-1 items-baseline">
                <h3 className="font-semibold mr-auto">{c.nombre}</h3>
                <span className="text-sm">Alumnos: <b>{total}</b></span>
                <span className="text-sm text-green-700">Presentes: <b>{Math.max(total - tardes - faltas, 0)}</b></span>
                <span className="text-sm text-amber-700">Tardanzas: <b>{tardes}</b></span>
                <span className="text-sm text-red-700">Faltas: <b>{faltas}</b></span>
              </header>
              {delCurso.length === 0 ? (
                <p className="p-3 text-sm text-gray-500">Sin tardanzas ni faltas registradas.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="p-2">Estudiante</th><th>En mi clase</th><th>Al colegio</th></tr></thead>
                  <tbody>
                    {delCurso.map((m) => {
                      const e = ests[m.estudiante_id];
                      const col = colegio[m.estudiante_id];
                      return (
                        <tr key={m.estudiante_id} className="border-b">
                          <td className="p-2">{e ? `${e.apellidos}, ${e.nombres}` : "…"}</td>
                          <td className={m.estado === "falta" ? "text-red-700 font-semibold" : "text-amber-700 font-semibold"}>
                            {m.estado === "falta" ? "Falta" : "Tardanza"}
                          </td>
                          <td>
                            {!col ? <span className="text-red-700">No ingresó al colegio</span>
                              : m.estado === "falta" ? <span className="text-red-700 font-semibold">⚠ Ingresó ({col}) pero faltó a clase</span>
                              : <span className="text-gray-700">Ingresó ({col})</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
