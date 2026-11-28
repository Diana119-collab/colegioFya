"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePerfil } from "@/components/Shell";
import Dashboard from "@/components/Dashboard";
import { IngresoDesplegable, Ingreso, horaLima } from "@/components/Ingreso";
import { supabase, hoyLima, waLink } from "@/lib/supabase";
import { leerTodo } from "@/lib/ept";
import Justificar from "@/components/Justificar";
import { Justificacion, NOMBRE_ESTADO, estadoEfectivo, textoJustificacion } from "@/lib/estados";

type Inc = { curso: string; estado: string; obs: string | null };
type Fila = {
  estudiante_id: string; apellidos: string; nombres: string; nivel: string; grado: number; seccion: string;
  apoderado: string | null; celular_apoderado: string | null;
  estado_colegio: "puntual" | "tardanza" | "falta"; hora_ingreso: string | null; incidencias_aula: Inc[];
};
type Item = { fila: Fila; motivo: string; detalle: string; texto: string; extra?: string };

const fmtFecha = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

const sinTildes = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Caja de incidencia de un estudiante en un día. Vacía y guardada = se borra la anotación. */
function Incidencia({ inicial, onGuardar }: { inicial: string; onGuardar: (t: string) => Promise<string | null> }) {
  const [texto, setTexto] = useState(inicial);
  const [guardado, setGuardado] = useState(inicial);
  const [estado, setEstado] = useState("");
  const cambiado = texto.trim() !== guardado.trim();

  async function guardar() {
    if (!cambiado) return;
    setEstado("Guardando…");
    const error = await onGuardar(texto.trim());
    if (error) return setEstado("Error: " + error);
    setGuardado(texto);
    setEstado("Guardado ✓");
  }

  return (
    <div className="min-w-56">
      <textarea rows={2} value={texto} placeholder="Anotar incidencia (opcional)"
        className={`border rounded p-1 w-full ${cambiado ? "bg-amber-50 border-amber-400" : ""} print:border-0`}
        onChange={(e) => { setTexto(e.target.value); setEstado(""); }} />
      <div className="flex items-center gap-2 print:hidden">
        <button onClick={guardar} disabled={!cambiado}
          className="bg-red-700 text-white px-3 py-1 rounded text-xs disabled:opacity-30">Guardar</button>
        <span className="text-xs text-gray-600">{cambiado && !estado ? "Sin guardar" : estado}</span>
      </div>
    </div>
  );
}

function Contenido() {
  const perfil = usePerfil();
  const [fecha, setFecha] = useState(hoyLima());
  const [filas, setFilas] = useState<Fila[]>([]);
  const [avisados, setAvisados] = useState<Set<string>>(new Set());
  const [incid, setIncid] = useState<Map<string, string>>(new Map());
  const [fechaCargada, setFechaCargada] = useState("");   // fecha a la que pertenecen los datos en pantalla
  const [nivel, setNivel] = useState(perfil.nivel ?? "");
  const [grado, setGrado] = useState("");
  const [seccion, setSeccion] = useState("");
  const [q, setQ] = useState("");
  const [soloPend, setSoloPend] = useState(false);
  const [todos, setTodos] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [noLectivo, setNoLectivo] = useState<string | null>(null);
  const [errorIncid, setErrorIncid] = useState("");
  const [justif, setJustif] = useState<Map<string, Justificacion>>(new Map());
  const [vista, setVista] = useState<"lista" | "estadisticas">("lista");
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setCargando(true);
    setFechaCargada("");
    const sb = supabase();
    let fallo = "";
    const [datos, { data: av }, { data: nl }, inc, jus] = await Promise.all([
      leerTodo<Fila>((d, h) => sb.rpc("reporte_diario", { p_fecha: fecha }).range(d, h)),
      sb.from("avisos_padres").select("estudiante_id,motivo,detalle").eq("fecha", fecha).eq("avisado", true),
      sb.rpc("motivo_no_lectivo", { p_fecha: fecha }),
      leerTodo<{ estudiante_id: string; detalle: string }>(async (d, h) => {
        const r = await sb.from("incidencias_diarias").select("estudiante_id,detalle").eq("fecha", fecha)
          .order("estudiante_id").range(d, h);
        if (r.error) fallo = r.error.message;
        return r;
      }),
      leerTodo<Justificacion & { estudiante_id: string }>(async (d, h) => {
        const r = await sb.from("justificaciones").select("estudiante_id,tipo,motivo,informado_por").eq("fecha", fecha)
          .order("estudiante_id").range(d, h);
        if (r.error) fallo = r.error.message;
        return r;
      }),
    ]);
    if (n !== pedido.current) return;   // llegó tarde: ya se pidió otra fecha
    setNoLectivo((nl as string | null) ?? null);
    setFilas(datos);
    setAvisados(new Set((av ?? []).map((a) => `${a.estudiante_id}|${a.motivo}|${a.detalle}`)));
    setIncid(new Map(inc.map((x) => [x.estudiante_id, x.detalle])));
    setErrorIncid(fallo);
    setJustif(new Map(jus.map((x) => [x.estudiante_id, x])));
    setFechaCargada(fecha);
    setCargando(false);
  }, [fecha]);
  useEffect(() => { cargar(); }, [cargar]);

  const delNivel = filas.filter((f) => !nivel || f.nivel === nivel);
  const grados = [...new Set(delNivel.map((f) => f.grado))].sort((a, b) => a - b);
  const secciones = [...new Set(delNivel.filter((f) => String(f.grado) === grado).map((f) => f.seccion))].sort();
  const visibles = delNivel.filter((f) =>
    (!grado || String(f.grado) === grado) && (!seccion || f.seccion === seccion) &&
    sinTildes(`${f.apellidos} ${f.nombres}`).includes(sinTildes(q)));
  const efectivo = (f: Fila) => estadoEfectivo(f.estado_colegio, justif.get(f.estudiante_id));
  const cuenta = (e: string) => visibles.filter((f) => efectivo(f) === e).length;
  const resumen = {
    puntual: cuenta("puntual"), tardanza: cuenta("tardanza"), falta: cuenta("falta"),
    tardanzaJ: cuenta("tardanza_justificada"), faltaJ: cuenta("falta_justificada"),
  };

  const items: Item[] = [];
  for (const f of visibles) {
    const antes = items.length;
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
    // alumnos sin faltas ni tardanzas: se muestran si tienen incidencia o si se pide ver a todos
    if (items.length === antes && (todos || incid.has(f.estudiante_id)))
      items.push({ fila: f, motivo: "sin_novedad", detalle: "", texto: "" });
  }
  const clave = (it: Item) => `${it.fila.estudiante_id}|${it.motivo}|${it.detalle}`;
  const justificado = (it: Item) =>
    (it.motivo === "falta_colegio" || it.motivo === "tardanza_colegio") && efectivo(it.fila).endsWith("justificada") ||
    (it.motivo.endsWith("_clase") && justif.has(it.fila.estudiante_id));
  const lista = items.filter((it) =>
    !soloPend || (it.motivo !== "sin_novedad" && !justificado(it) && !avisados.has(clave(it))));
  const filasPorAlumno = new Map<string, number>();
  for (const it of lista) filasPorAlumno.set(it.fila.estudiante_id, (filasPorAlumno.get(it.fila.estudiante_id) ?? 0) + 1);

  async function avisar(it: Item) {
    window.open(waLink(it.fila.celular_apoderado, it.texto), "_blank");
    await supabase().from("avisos_padres").upsert({
      estudiante_id: it.fila.estudiante_id, fecha, motivo: it.motivo, detalle: it.detalle,
      avisado: true, avisado_por: perfil.id, avisado_en: new Date().toISOString(),
    }, { onConflict: "estudiante_id,fecha,motivo,detalle" });
    setAvisados((s) => new Set(s).add(clave(it)));
  }

  async function guardarIncidencia(estudianteId: string, dia: string, texto: string) {
    const tabla = supabase().from("incidencias_diarias");
    const { error } = texto
      ? await tabla.upsert({
          estudiante_id: estudianteId, fecha: dia, detalle: texto,
          registrado_por: perfil.id, actualizado_en: new Date().toISOString(),
        }, { onConflict: "estudiante_id,fecha" })
      : await tabla.delete().eq("estudiante_id", estudianteId).eq("fecha", dia);
    if (error) return error.message;
    // se actualiza el valor en memoria para que no se pierda al cambiar de filtro
    setIncid((m) => {
      const nuevo = new Map(m);
      if (texto) nuevo.set(estudianteId, texto);
      else nuevo.delete(estudianteId);
      return nuevo;
    });
    return null;
  }

  /** Refleja en pantalla un ingreso registrado o anulado, sin recargar (no se pierde lo escrito). */
  function actualizarIngreso(estudianteId: string, i: Ingreso | null) {
    setFilas((fs) => fs.map((f) => f.estudiante_id === estudianteId
      ? { ...f, estado_colegio: i?.estado ?? "falta", hora_ingreso: i?.hora ?? null } : f));
  }

  async function anular(f: Fila) {
    if (!confirm(`¿Anular el ingreso de ${f.apellidos}, ${f.nombres}? Quedará como falta.`)) return;
    const { error } = await supabase().from("asistencia_colegio").delete()
      .eq("estudiante_id", f.estudiante_id).eq("fecha", fecha);
    if (error) return alert(error.message);
    actualizarIngreso(f.estudiante_id, null);
  }

  const etiqueta: Record<string, string> = {
    falta_colegio: "Falta al colegio", tardanza_colegio: "Tardanza al colegio",
    falta_clase: "Falta en clase", tardanza_clase: "Tardanza en clase", sin_novedad: "Asistió puntual",
  };
  const listo = !cargando && fechaCargada === fecha;

  /** Descarga en Excel lo que se ve en pantalla: una fila por estudiante. */
  async function exportar() {
    const XLSX = await import("xlsx");
    const porAlumno = new Map<string, Item[]>();
    for (const it of lista) porAlumno.set(it.fila.estudiante_id, [...(porAlumno.get(it.fila.estudiante_id) ?? []), it]);
    const datos = [...porAlumno.values()].map((its) => {
      const f = its[0].fila;
      const avisables = its.filter((it) => it.motivo !== "sin_novedad");
      const enviados = avisables.filter((it) => avisados.has(clave(it))).length;
      return {
        Fecha: fecha,
        Nivel: f.nivel,
        Grado: f.grado,
        Sección: f.seccion,
        Apellidos: f.apellidos,
        Nombres: f.nombres,
        "Estado en el colegio": NOMBRE_ESTADO[efectivo(f)],
        "Hora de ingreso": f.hora_ingreso ? horaLima(new Date(f.hora_ingreso)) : "",
        "Observaciones por curso": f.incidencias_aula.map((x) =>
          `${x.curso}: ${x.estado === "tardanza" ? "tardanza"
            : f.estado_colegio === "falta" ? "falta" : "ingresó al colegio pero no estuvo en el aula"}${x.obs ? ` - ${x.obs}` : ""}`
        ).join(", "),
        Justificación: textoJustificacion(justif.get(f.estudiante_id)),
        Apoderado: f.apoderado ?? "",
        Celular: f.celular_apoderado ?? "",
        "Avisado por WhatsApp": !avisables.length ? "" : enviados === avisables.length ? "Sí" : enviados ? "Parcial" : "No",
        Incidencia: incid.get(f.estudiante_id) ?? "",
      };
    });
    const hoja = XLSX.utils.json_to_sheet(datos);
    hoja["!cols"] = [11, 11, 6, 8, 28, 28, 22, 10, 60, 40, 24, 12, 14, 50].map((wch) => ({ wch }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Reporte diario");
    const partes = ["reporte", fecha, nivel, grado && `${grado}`, seccion].filter(Boolean);
    XLSX.writeFile(libro, `${partes.join("_")}.xlsx`);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-3 print:hidden">
        <h2 className="text-2xl font-bold mr-auto">Reporte diario</h2>
        <input type="date" className="border rounded p-2" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        <button onClick={cargar} className="border rounded px-3 py-2 bg-white">Actualizar</button>
        <button onClick={exportar} disabled={!listo || lista.length === 0}
          className="bg-green-700 text-white rounded px-3 py-2 disabled:opacity-40">Exportar Excel</button>
        <button onClick={() => window.print()} className="bg-red-700 text-white rounded px-3 py-2">Imprimir</button>
      </div>
      <div className="flex gap-1 border-b mb-3 print:hidden">
        {([["lista", "Lista de Estudiantes"], ["estadisticas", "Estadísticas"]] as const).map(([k, t]) => (
          <button key={k} onClick={() => setVista(k)}
            className={`px-4 py-2 -mb-px border-b-2 ${vista === k ? "border-red-700 text-red-700 font-semibold" : "border-transparent text-gray-600"}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4 print:hidden">
        <select className="border rounded p-2" value={nivel}
          onChange={(e) => { setNivel(e.target.value); setGrado(""); setSeccion(""); }}>
          <option value="">Todos los niveles</option>
          <option value="inicial">Inicial</option><option value="primaria">Primaria</option><option value="secundaria">Secundaria</option>
        </select>
        <select className="border rounded p-2 disabled:opacity-40" disabled={!nivel} value={grado}
          title={nivel ? "" : "Primero elige el nivel"}
          onChange={(e) => { setGrado(e.target.value); setSeccion(""); }}>
          <option value="">Todos los grados</option>
          {grados.map((g) => <option key={g} value={g}>{g}{nivel === "inicial" ? " años" : "°"}</option>)}
        </select>
        <select className="border rounded p-2 disabled:opacity-40" disabled={!grado} value={seccion}
          title={grado ? "" : "Primero elige el grado"} onChange={(e) => setSeccion(e.target.value)}>
          <option value="">Todas las secciones</option>
          {secciones.map((x) => <option key={x} value={x}>Sección {x}</option>)}
        </select>
        <input className="border rounded p-2 w-full max-w-xs" placeholder="Buscar por nombre" value={q} onChange={(e) => setQ(e.target.value)} />
        {vista === "lista" && <>
        <label className="text-sm"><input type="checkbox" checked={soloPend} onChange={(e) => setSoloPend(e.target.checked)} /> Solo avisos pendientes</label>
        <label className="text-sm"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Incluir puntuales</label>
        </>}
      </div>
      <p className="hidden print:block font-bold">
        Fe y Alegría 17 — Reporte {fmtFecha(fecha)}{nivel && ` · ${nivel}`}{grado && ` ${grado}°`}{seccion && ` ${seccion}`}
      </p>
      {vista === "lista" && (
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <div className="bg-green-100 rounded p-3"><b className="text-2xl">{resumen.puntual}</b><br />Puntuales</div>
        <div className="bg-amber-100 rounded p-3"><b className="text-2xl">{resumen.tardanza}</b><br />Tardanzas</div>
        <div className="bg-red-100 rounded p-3"><b className="text-2xl">{resumen.falta}</b><br />Faltas</div>
        <div className="bg-violet-100 rounded p-3"><b className="text-2xl">{resumen.tardanzaJ}</b><br />Tardanzas justificadas</div>
        <div className="bg-blue-100 rounded p-3"><b className="text-2xl">{resumen.faltaJ}</b><br />Faltas justificadas</div>
      </div>
      )}
      {noLectivo && (
        <p className="bg-blue-100 text-blue-800 rounded p-3 mb-3">
          Día no lectivo ({noLectivo}): no se registran faltas.
        </p>
      )}
      {errorIncid && (
        <p className="bg-red-100 text-red-800 rounded p-3 mb-3 print:hidden">
          No se pudieron leer las incidencias o justificaciones: {errorIncid}
        </p>
      )}
      {!listo && <p>Cargando…</p>}
      {listo && vista === "estadisticas" && (
        <Dashboard filas={visibles.map((f) => ({ ...f, estado_colegio: efectivo(f) }))} incid={incid} />
      )}
      {listo && vista === "lista" && (
        <div className="bg-white border rounded overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b">
              <th className="p-2">Estudiante</th><th>Aula</th><th>Motivo</th><th>Apoderado</th>
              <th className="print:hidden">WhatsApp</th><th className="p-2">Incidencia</th></tr></thead>
            <tbody>
              {lista.map((it, i) => {
                const ya = avisados.has(clave(it));
                const id = it.fila.estudiante_id;
                const primera = lista[i - 1]?.fila.estudiante_id !== id;   // una sola caja por estudiante
                return (
                  <tr key={clave(it)} className="border-b align-top">
                    <td className="p-2">{it.fila.apellidos}, {it.fila.nombres}</td>
                    <td className="capitalize">{it.fila.grado}° {it.fila.seccion} {it.fila.nivel}</td>
                    <td>{(it.motivo === "falta_colegio" || it.motivo === "tardanza_colegio") && justificado(it)
                        ? NOMBRE_ESTADO[efectivo(it.fila)] : etiqueta[it.motivo]}{it.detalle && `: ${it.detalle}`}
                      {it.extra && <span className="block text-xs text-red-700 font-semibold">⚠ {it.extra}</span>}
                      {it.motivo === "falta_colegio" && !noLectivo && (
                        <div className="my-1">
                          <IngresoDesplegable key={`${fechaCargada}|${id}`} estudianteId={id} fecha={fechaCargada}
                            onListo={(ing) => actualizarIngreso(id, ing)} />
                        </div>
                      )}
                      {(it.motivo === "tardanza_colegio" || it.motivo === "sin_novedad") && it.fila.hora_ingreso && (
                        <span className="block text-xs text-gray-500">
                          Ingreso {horaLima(new Date(it.fila.hora_ingreso))}
                          <button onClick={() => anular(it.fila)} className="ml-2 text-red-700 underline print:hidden">Anular</button>
                        </span>
                      )}
                      {primera && (
                        <Justificar key={`j|${fechaCargada}|${id}`} estudianteId={id} fecha={fechaCargada}
                          tipoSugerido={it.fila.estado_colegio === "tardanza" ? "tardanza" : "falta"} actual={justif.get(id)}
                          onCambio={(j) => setJustif((m) => {
                            const nuevo = new Map(m);
                            if (j) nuevo.set(id, j); else nuevo.delete(id);
                            return nuevo;
                          })} />
                      )}
                    </td>
                    <td>{it.fila.apoderado}<br /><span className="text-gray-500">{it.fila.celular_apoderado}</span></td>
                    <td className="print:hidden">
                      {it.motivo === "sin_novedad" ? null : justificado(it) ? (
                        <span className="text-blue-700 text-xs font-semibold">Justificado</span>
                      ) : it.fila.celular_apoderado ? (
                        <button onClick={() => avisar(it)}
                          className={`px-2 py-1 rounded text-white ${ya ? "bg-gray-400" : "bg-green-600"}`}>
                          {ya ? "Avisado ✓ (reenviar)" : "Avisar"}
                        </button>
                      ) : <span className="text-red-600">Sin celular</span>}
                    </td>
                    {primera && (
                      <td className="p-2" rowSpan={filasPorAlumno.get(id)}>
                        <Incidencia key={`${fechaCargada}|${id}`} inicial={incid.get(id) ?? ""}
                          onGuardar={(t) => guardarIncidencia(id, fechaCargada, t)} />
                      </td>
                    )}
                  </tr>
                );
              })}
              {lista.length === 0 && <tr><td colSpan={6} className="p-4 text-gray-500">Nada que reportar.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Reporte() {
  return <Contenido />;
}
