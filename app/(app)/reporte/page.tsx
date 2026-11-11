"use client";
import { useCallback, useEffect, useState } from "react";
import { usePerfil } from "@/components/Shell";
import { supabase, hoyLima, waLink } from "@/lib/supabase";
import { leerTodo } from "@/lib/ept";

type Inc = { curso: string; estado: string; obs: string | null };
type Fila = {
  estudiante_id: string; apellidos: string; nombres: string; nivel: string; grado: number; seccion: string;
  apoderado: string | null; celular_apoderado: string | null;
  estado_colegio: "puntual" | "tardanza" | "falta"; hora_ingreso: string | null; incidencias_aula: Inc[];
};
type Item = { fila: Fila; motivo: string; detalle: string; texto: string; extra?: string };

const fmtFecha = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

function Contenido() {
  const perfil = usePerfil();
  const [fecha, setFecha] = useState(hoyLima());
  const [filas, setFilas] = useState<Fila[]>([]);
  const [avisados, setAvisados] = useState<Set<string>>(new Set());
  const [nivel, setNivel] = useState(perfil.nivel ?? "");
  const [soloPend, setSoloPend] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [noLectivo, setNoLectivo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const sb = supabase();
    const [datos, { data: av }, { data: nl }] = await Promise.all([
      leerTodo<Fila>((d, h) => sb.rpc("reporte_diario", { p_fecha: fecha }).range(d, h)),
      sb.from("avisos_padres").select("estudiante_id,motivo,detalle").eq("fecha", fecha).eq("avisado", true),
      sb.rpc("motivo_no_lectivo", { p_fecha: fecha }),
    ]);
    setNoLectivo((nl as string | null) ?? null);
    setFilas(datos);
    setAvisados(new Set((av ?? []).map((a) => `${a.estudiante_id}|${a.motivo}|${a.detalle}`)));
    setCargando(false);
  }, [fecha]);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = filas.filter((f) => !nivel || f.nivel === nivel);
  const resumen = {
    puntual: visibles.filter((f) => f.estado_colegio === "puntual").length,
    tardanza: visibles.filter((f) => f.estado_colegio === "tardanza").length,
    falta: visibles.filter((f) => f.estado_colegio === "falta").length,
  };

  const items: Item[] = [];
  for (const f of visibles) {
    const nom = `${f.nombres} ${f.apellidos}`;
    const dia = fmtFecha(fecha);
    if (f.estado_colegio === "falta")
      items.push({ fila: f, motivo: "falta_colegio", detalle: "",
        texto: `Buenos días. Le informamos del colegio Fe y Alegría 17: su hijo(a) ${nom} NO asistió al colegio el ${dia}. Por favor comuníquese con auxiliares. Gracias.` });
    if (f.estado_colegio === "tardanza")
      items.push({ fila: f, motivo: "tardanza_colegio", detalle: "",
        texto: `Buenos días. Le informamos del colegio Fe y Alegría 17: su hijo(a) ${nom} llegó TARDE al colegio el ${dia}${f.hora_ingreso ? " (" + new Date(f.hora_ingreso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }) + ")" : ""}. Gracias.` });
    for (const i of f.incidencias_aula) {
      const dentro = f.estado_colegio !== "falta";
      items.push({
        fila: f, motivo: i.estado === "falta" ? "falta_clase" : "tardanza_clase", detalle: i.curso,
        extra: i.estado === "falta" && dentro ? "Ingresó al colegio pero no estuvo en el aula" : undefined,
        texto: i.estado === "falta"
          ? `Buenos días. Le informamos del colegio Fe y Alegría 17: su hijo(a) ${nom} ${dentro ? "ingresó al colegio pero NO asistió" : "no asistió"} a la clase de ${i.curso} el ${dia}. Por favor comuníquese con auxiliares. Gracias.`
          : `Buenos días. Le informamos del colegio Fe y Alegría 17: su hijo(a) ${nom} llegó TARDE a la clase de ${i.curso} el ${dia}. Gracias.`,
      });
    }
  }
  const lista = items.filter((it) => !soloPend || !avisados.has(`${it.fila.estudiante_id}|${it.motivo}|${it.detalle}`));

  async function avisar(it: Item) {
    window.open(waLink(it.fila.celular_apoderado, it.texto), "_blank");
    await supabase().from("avisos_padres").upsert({
      estudiante_id: it.fila.estudiante_id, fecha, motivo: it.motivo, detalle: it.detalle,
      avisado: true, avisado_por: perfil.id, avisado_en: new Date().toISOString(),
    }, { onConflict: "estudiante_id,fecha,motivo,detalle" });
    setAvisados((s) => new Set(s).add(`${it.fila.estudiante_id}|${it.motivo}|${it.detalle}`));
  }

  const etiqueta: Record<string, string> = {
    falta_colegio: "Falta al colegio", tardanza_colegio: "Tardanza al colegio",
    falta_clase: "Falta en clase", tardanza_clase: "Tardanza en clase",
  };

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 mb-4 print:hidden">
        <h2 className="text-2xl font-bold mr-auto">Reporte diario</h2>
        <input type="date" className="border rounded p-2" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <select className="border rounded p-2" value={nivel} onChange={(e) => setNivel(e.target.value)}>
          <option value="">Todos los niveles</option>
          <option value="inicial">Inicial</option><option value="primaria">Primaria</option>
          <option value="secundaria">Secundaria</option>
        </select>
        <label className="text-sm"><input type="checkbox" checked={soloPend} onChange={(e) => setSoloPend(e.target.checked)} /> Solo pendientes</label>
        <button onClick={cargar} className="border rounded px-3 py-2 bg-white">Actualizar</button>
        <button onClick={() => window.print()} className="bg-red-700 text-white rounded px-3 py-2">Imprimir</button>
      </div>
      <p className="hidden print:block font-bold">Fe y Alegría 17 — Reporte {fmtFecha(fecha)}</p>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-green-100 rounded p-3"><b className="text-2xl">{resumen.puntual}</b><br />Puntuales</div>
        <div className="bg-amber-100 rounded p-3"><b className="text-2xl">{resumen.tardanza}</b><br />Tardanzas</div>
        <div className="bg-red-100 rounded p-3"><b className="text-2xl">{resumen.falta}</b><br />Faltas</div>
      </div>
      {noLectivo && (
        <p className="bg-blue-100 text-blue-800 rounded p-3 mb-3">
          Día no lectivo ({noLectivo}): no se registran faltas.
        </p>
      )}
      {cargando && <p>Cargando…</p>}
      <div className="bg-white border rounded overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b">
            <th className="p-2">Estudiante</th><th>Aula</th><th>Motivo</th><th>Apoderado</th><th className="print:hidden">WhatsApp</th></tr></thead>
          <tbody>
            {lista.map((it, i) => {
              const ya = avisados.has(`${it.fila.estudiante_id}|${it.motivo}|${it.detalle}`);
              return (
                <tr key={i} className="border-b align-top">
                  <td className="p-2">{it.fila.apellidos}, {it.fila.nombres}</td>
                  <td className="capitalize">{it.fila.grado}° {it.fila.seccion} {it.fila.nivel}</td>
                  <td>{etiqueta[it.motivo]}{it.detalle && `: ${it.detalle}`}
                    {it.extra && <span className="block text-xs text-red-700 font-semibold">⚠ {it.extra}</span>}</td>
                  <td>{it.fila.apoderado}<br /><span className="text-gray-500">{it.fila.celular_apoderado}</span></td>
                  <td className="print:hidden">
                    {it.fila.celular_apoderado ? (
                      <button onClick={() => avisar(it)}
                        className={`px-2 py-1 rounded text-white ${ya ? "bg-gray-400" : "bg-green-600"}`}>
                        {ya ? "Avisado ✓ (reenviar)" : "Avisar"}
                      </button>
                    ) : <span className="text-red-600">Sin celular</span>}
                  </td>
                </tr>
              );
            })}
            {lista.length === 0 && !cargando && <tr><td colSpan={5} className="p-4 text-gray-500">Nada que reportar.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Reporte() {
  return <><Contenido /></>;
}
