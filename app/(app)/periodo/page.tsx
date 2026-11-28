"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { usePerfil } from "@/components/Shell";
import { horaLima } from "@/components/Ingreso";
import { supabase, hoyLima } from "@/lib/supabase";
import { leerTodo } from "@/lib/ept";
import { Estado, EstadoBase, Justificacion, NOMBRE_ESTADO, asistio, estadoEfectivo, textoJustificacion } from "@/lib/estados";

type Sec = { id: string; nivel: string; grado: number; seccion: string };
type Alumno = { id: string; apellidos: string; nombres: string; seccion_id: string };
type Dia = { fecha: string; estado: Estado; hora: string; cursos: string; justificacion: string; incidencia: string };
type Resumen = {
  alumno: Alumno; aula: string; dias: Dia[];
  cuenta: Record<Estado, number>; faltasClase: number; tardanzasClase: number; incidencias: number; asistencia: number;
};
type Informe = { titulo: string; lectivos: number; sinRegistro: number; filas: Resumen[] };
type Tipo = "semana" | "mes" | "bimestre" | "rango";

// Fechas referenciales: se pueden ajustar en pantalla según el calendario del colegio.
const BIMESTRES = [
  { n: "I bimestre", desde: "03-01", hasta: "05-15" },
  { n: "II bimestre", desde: "05-18", hasta: "07-24" },
  { n: "III bimestre", desde: "08-10", hasta: "10-09" },
  { n: "IV bimestre", desde: "10-12", hasta: "12-18" },
];
const ESTADOS: Estado[] = ["puntual", "tardanza", "tardanza_justificada", "falta", "falta_justificada"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fecha = (f: string) => new Date(f + "T12:00:00Z");
const corta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const sinTildes = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function semanaDe(f: string): [string, string] {
  const d = fecha(f);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));   // lunes
  const lunes = iso(d);
  d.setUTCDate(d.getUTCDate() + 4);
  return [lunes, iso(d)];
}
function mesDe(m: string): [string, string] {
  const d = fecha(m + "-01");
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return [m + "-01", iso(d)];
}

/** Texto de observaciones e incidencias de un estudiante, día por día. */
const observaciones = (r: Resumen) => r.dias
  .map((d) => [d.cursos, d.justificacion, d.incidencia].filter(Boolean).join(" | "))
  .map((t, i) => (t ? `${corta(r.dias[i].fecha)}: ${t}` : ""))
  .filter(Boolean).join("; ");

export default function Periodo() {
  const perfil = usePerfil();
  const hoy = hoyLima();
  const anio = hoy.slice(0, 4);
  const [tipo, setTipo] = useState<Tipo>("semana");
  const [dia, setDia] = useState(hoy);
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [bim, setBim] = useState(0);
  const [rango, setRango] = useState({ desde: `${anio}-${BIMESTRES[0].desde}`, hasta: `${anio}-${BIMESTRES[0].hasta}` });
  const [secs, setSecs] = useState<Sec[]>([]);
  const [nivel, setNivel] = useState(perfil.nivel ?? "");
  const [grado, setGrado] = useState("");
  const [seccion, setSeccion] = useState("");
  const [q, setQ] = useState("");
  const [informe, setInforme] = useState<Informe | null>(null);
  const [abierto, setAbierto] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const pedido = useRef(0);

  useEffect(() => {
    supabase().from("secciones").select("*").order("grado").order("seccion").then(({ data }) => setSecs(data ?? []));
  }, []);
  // si cambia la selección, el informe anterior deja de corresponder
  useEffect(() => { pedido.current++; setInforme(null); setBusy(false); setMsg(""); },
    [tipo, dia, mes, bim, rango, nivel, grado, seccion]);

  const [desde, hasta] = tipo === "semana" ? semanaDe(dia) : tipo === "mes" ? mesDe(mes) : [rango.desde, rango.hasta];
  const delNivel = secs.filter((s) => s.nivel === nivel);
  const grados = [...new Set(delNivel.map((s) => s.grado))].sort((a, b) => a - b);
  const aulas = delNivel.filter((s) => String(s.grado) === grado);

  async function generar() {
    if (!nivel || !grado) return setMsg("Elige el nivel y el grado");
    if (!desde || !hasta || desde > hasta) return setMsg("Revisa las fechas");
    const n = ++pedido.current;
    setBusy(true); setMsg(""); setInforme(null); setAbierto("");
    try {
      const sb = supabase();
      const fin = hasta > hoy ? hoy : hasta;
      const ids = aulas.map((s) => s.id);
      const alumnos = await leer<Alumno>((d, h) => sb.from("estudiantes").select("id,apellidos,nombres,seccion_id")
        .in("seccion_id", ids).eq("activo", true).order("apellidos").order("id").range(d, h));

      // se consulta por grupos de estudiantes para no exceder los límites del servidor
      async function porGrupos<T>(tabla: string, columnas: string): Promise<T[]> {
        const out: T[] = [];
        for (let i = 0; i < alumnos.length; i += 100) {
          const grupo = alumnos.slice(i, i + 100).map((a) => a.id);
          out.push(...(await leer<T>((d, h) => sb.from(tabla).select(columnas).in("estudiante_id", grupo)
            .gte("fecha", desde).lte("fecha", fin).order("fecha").order("estudiante_id").order(
              tabla === "asistencia_clase" ? "clase_id" : "estudiante_id").range(d, h) as never)));
        }
        return out;
      }
      type Base = { estudiante_id: string; fecha: string };
      const [ingresos, clase, incid, justif, noLect] = await Promise.all([
        porGrupos<Base & { estado: EstadoBase; hora: string }>("asistencia_colegio", "estudiante_id,fecha,estado,hora"),
        porGrupos<Base & { estado: string; observacion: string | null; clases: { nombre: string } }>(
          "asistencia_clase", "estudiante_id,fecha,estado,observacion,clases(nombre)"),
        porGrupos<Base & { detalle: string }>("incidencias_diarias", "estudiante_id,fecha,detalle"),
        porGrupos<Base & Justificacion>("justificaciones", "estudiante_id,fecha,tipo,motivo,informado_por"),
        leer<{ fecha: string }>((d, h) => sb.from("dias_no_lectivos").select("fecha")
          .gte("fecha", desde).lte("fecha", hasta).order("fecha").range(d, h)),
      ]);
      if (n !== pedido.current) return;

      // Días lectivos: lunes a viernes, no feriados y con al menos un ingreso registrado en el grado
      const feriados = new Set(noLect.map((x) => x.fecha));
      const conRegistro = new Set(ingresos.map((x) => x.fecha));
      const lectivos: string[] = [];
      let sinRegistro = 0;
      for (const d = fecha(desde); iso(d) <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
        const f = iso(d);
        if (d.getUTCDay() === 0 || d.getUTCDay() === 6 || feriados.has(f)) continue;
        if (conRegistro.has(f)) lectivos.push(f); else sinRegistro++;
      }

      const k = (x: Base) => `${x.estudiante_id}|${x.fecha}`;
      const mIng = new Map(ingresos.map((x) => [k(x), x]));
      const mInc = new Map(incid.map((x) => [k(x), x.detalle]));
      const mJus = new Map(justif.map((x) => [k(x), x]));
      const mCla = new Map<string, typeof clase>();
      for (const x of clase) mCla.set(k(x), [...(mCla.get(k(x)) ?? []), x]);

      const filas: Resumen[] = alumnos.map((a) => {
        const s = secs.find((x) => x.id === a.seccion_id)!;
        const r: Resumen = {
          alumno: a, aula: `${s.grado}° ${s.seccion}`, dias: [],
          cuenta: { puntual: 0, tardanza: 0, tardanza_justificada: 0, falta: 0, falta_justificada: 0 },
          faltasClase: 0, tardanzasClase: 0, incidencias: 0, asistencia: 0,
        };
        for (const f of lectivos) {
          const clave = `${a.id}|${f}`;
          const ing = mIng.get(clave), j = mJus.get(clave), cl = mCla.get(clave) ?? [], inc = mInc.get(clave) ?? "";
          const estado = estadoEfectivo(ing?.estado ?? "falta", j);
          r.cuenta[estado]++;
          r.faltasClase += cl.filter((c) => c.estado === "falta").length;
          r.tardanzasClase += cl.filter((c) => c.estado === "tardanza").length;
          if (inc) r.incidencias++;
          r.dias.push({
            fecha: f, estado, hora: ing ? horaLima(new Date(ing.hora)) : "",
            cursos: cl.map((c) => `${c.clases?.nombre}: ${c.estado}${c.observacion ? ` - ${c.observacion}` : ""}`).join(", "),
            justificacion: textoJustificacion(j), incidencia: inc,
          });
        }
        const vino = r.dias.filter((d) => asistio(d.estado)).length;
        r.asistencia = lectivos.length ? Math.round((vino * 1000) / lectivos.length) / 10 : 0;
        return r;
      }).sort((x, y) => x.aula.localeCompare(y.aula) || x.alumno.apellidos.localeCompare(y.alumno.apellidos, "es"));

      const nombre = tipo === "semana" ? "Semanal" : tipo === "mes" ? "Mensual" : tipo === "bimestre" ? BIMESTRES[bim].n : "Por rango";
      setInforme({
        titulo: `${nombre} · ${grado}° ${nivel} · del ${corta(desde)} al ${corta(hasta)}/${hasta.slice(0, 4)}`,
        lectivos: lectivos.length, sinRegistro, filas,
      });
    } catch (e) {
      if (n === pedido.current) setMsg("No se pudo generar: " + (e as Error).message);
    } finally {
      if (n === pedido.current) setBusy(false);
    }
  }

  const visibles = (informe?.filas ?? []).filter((r) =>
    (!seccion || r.alumno.seccion_id === seccion) &&
    sinTildes(`${r.alumno.apellidos} ${r.alumno.nombres}`).includes(sinTildes(q)));
  const suma = (f: (r: Resumen) => number) => visibles.reduce((t, r) => t + f(r), 0);
  const posibles = visibles.length * (informe?.lectivos ?? 0);
  const asistencias = suma((r) => r.dias.filter((d) => asistio(d.estado)).length);

  async function exportar() {
    if (!informe) return;
    const XLSX = await import("xlsx");
    const resumen = visibles.map((r) => ({
      Aula: r.aula, Apellidos: r.alumno.apellidos, Nombres: r.alumno.nombres, "Días lectivos": informe.lectivos,
      ...Object.fromEntries(ESTADOS.map((e) => [NOMBRE_ESTADO[e], r.cuenta[e]])),
      "Faltas en clase": r.faltasClase, "Tardanzas en clase": r.tardanzasClase,
      "% Asistencia": r.asistencia, "Días con incidencia": r.incidencias,
      "Observaciones e incidencias": observaciones(r),
    }));
    const detalle = visibles.flatMap((r) => r.dias.map((d) => ({
      Fecha: d.fecha, Aula: r.aula, Apellidos: r.alumno.apellidos, Nombres: r.alumno.nombres,
      Estado: NOMBRE_ESTADO[d.estado], "Hora de ingreso": d.hora, "Observaciones por curso": d.cursos,
      Justificación: d.justificacion, Incidencia: d.incidencia,
    })));
    const libro = XLSX.utils.book_new();
    const h1 = XLSX.utils.json_to_sheet(resumen);
    h1["!cols"] = [8, 28, 28, 12, 10, 10, 20, 8, 18, 14, 16, 12, 16, 80].map((wch) => ({ wch }));
    const h2 = XLSX.utils.json_to_sheet(detalle);
    h2["!cols"] = [11, 8, 28, 28, 20, 14, 50, 40, 50].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(libro, h1, "Resumen");
    XLSX.utils.book_append_sheet(libro, h2, "Detalle diario");
    XLSX.writeFile(libro, `asistencia_${tipo}_${grado}_${nivel}_${desde}_${hasta}.xlsx`);
  }

  const inp = "border rounded p-2 disabled:opacity-40";
  return (
    <>
      <h2 className="text-2xl font-bold mb-3 print:hidden">Reporte por periodo</h2>
      <div className="bg-white border rounded p-3 mb-3 flex flex-wrap gap-3 items-end print:hidden">
        <label className="text-sm">Periodo<br />
          <select className={inp} value={tipo} onChange={(e) => {
            const t = e.target.value as Tipo;
            setTipo(t);
            if (t === "bimestre") setRango({ desde: `${anio}-${BIMESTRES[bim].desde}`, hasta: `${anio}-${BIMESTRES[bim].hasta}` });
          }}>
            <option value="semana">Semanal</option><option value="mes">Mensual</option>
            <option value="bimestre">Bimestral</option><option value="rango">Entre dos fechas</option>
          </select>
        </label>
        {tipo === "semana" && <label className="text-sm">Un día de la semana<br />
          <input type="date" className={inp} value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} /></label>}
        {tipo === "mes" && <label className="text-sm">Mes<br />
          <input type="month" className={inp} value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} /></label>}
        {tipo === "bimestre" && <label className="text-sm">Bimestre<br />
          <select className={inp} value={bim} onChange={(e) => {
            const i = Number(e.target.value);
            setBim(i);
            setRango({ desde: `${anio}-${BIMESTRES[i].desde}`, hasta: `${anio}-${BIMESTRES[i].hasta}` });
          }}>
            {BIMESTRES.map((b, i) => <option key={b.n} value={i}>{b.n}</option>)}
          </select></label>}
        {(tipo === "bimestre" || tipo === "rango") && <>
          <label className="text-sm">Desde<br /><input type="date" className={inp} value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></label>
          <label className="text-sm">Hasta<br /><input type="date" className={inp} value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></label>
        </>}
        <label className="text-sm">Nivel<br />
          <select className={inp} value={nivel} onChange={(e) => { setNivel(e.target.value); setGrado(""); setSeccion(""); }}>
            <option value="">Elegir…</option>
            <option value="inicial">Inicial</option><option value="primaria">Primaria</option><option value="secundaria">Secundaria</option>
          </select></label>
        <label className="text-sm">Grado<br />
          <select className={inp} disabled={!nivel} value={grado} onChange={(e) => { setGrado(e.target.value); setSeccion(""); }}>
            <option value="">Elegir…</option>
            {grados.map((g) => <option key={g} value={g}>{g}{nivel === "inicial" ? " años" : "°"}</option>)}
          </select></label>
        <label className="text-sm">Sección<br />
          <select className={inp} disabled={!grado} value={seccion} onChange={(e) => setSeccion(e.target.value)}>
            <option value="">Todas</option>
            {aulas.map((s) => <option key={s.id} value={s.id}>{s.seccion}</option>)}
          </select></label>
        <button onClick={generar} disabled={busy} className="bg-red-700 text-white rounded px-4 py-2 disabled:opacity-50">
          {busy ? "Generando…" : "Generar"}</button>
      </div>
      {msg && <p className="text-sm text-red-700 mb-3">{msg}</p>}

      {informe && (
        <>
          <div className="flex flex-wrap gap-3 items-center mb-3">
            <h3 className="font-semibold mr-auto">Fe y Alegría 17 — {informe.titulo}</h3>
            <input className="border rounded p-2 print:hidden" placeholder="Buscar estudiante" value={q} onChange={(e) => setQ(e.target.value)} />
            <button onClick={exportar} disabled={!visibles.length} className="bg-green-700 text-white rounded px-3 py-2 disabled:opacity-40 print:hidden">Exportar Excel</button>
            <button onClick={() => window.print()} className="bg-red-700 text-white rounded px-3 py-2 print:hidden">Imprimir</button>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Días lectivos contados: <b>{informe.lectivos}</b>
            {informe.sinRegistro > 0 && ` · ${informe.sinRegistro} día(s) hábiles sin ningún ingreso registrado en el grado no se cuentan`}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[["Asistencia", posibles ? `${Math.round((asistencias * 1000) / posibles) / 10}%` : "—"],
              ["Tardanzas", suma((r) => r.cuenta.tardanza + r.cuenta.tardanza_justificada)],
              ["Faltas sin justificar", suma((r) => r.cuenta.falta)],
              ["Faltas justificadas", suma((r) => r.cuenta.falta_justificada)]].map(([t, v]) => (
              <div key={t} className="bg-white border rounded p-3"><p className="text-sm text-gray-600">{t}</p><p className="text-2xl font-bold">{v}</p></div>
            ))}
          </div>
          <div className="bg-white border rounded overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b">
                <th className="p-2">Estudiante</th><th>Aula</th>
                {["Puntual", "Tarde", "T. just.", "Falta", "F. just.", "Faltas clase", "Tard. clase", "% Asist.", "Incid."]
                  .map((t) => <th key={t} className="text-right px-2">{t}</th>)}
              </tr></thead>
              <tbody>
                {visibles.map((r) => {
                  const ver = abierto === r.alumno.id;
                  const novedades = r.dias.filter((d) => d.estado !== "puntual" || d.cursos || d.justificacion || d.incidencia);
                  return (
                    <Fragment key={r.alumno.id}>
                      <tr className="border-b">
                        <td className="p-2">
                          <button className="text-left hover:underline" aria-expanded={ver} onClick={() => setAbierto(ver ? "" : r.alumno.id)}>
                            <span className="print:hidden">{ver ? "▾ " : "▸ "}</span>{r.alumno.apellidos}, {r.alumno.nombres}
                          </button>
                        </td>
                        <td className="whitespace-nowrap">{r.aula}</td>
                        {[...ESTADOS.map((e) => r.cuenta[e]), r.faltasClase, r.tardanzasClase, `${r.asistencia}%`, r.incidencias]
                          .map((v, i) => <td key={i} className="text-right px-2 tabular-nums">{v}</td>)}
                      </tr>
                      {ver && (
                        <tr className="border-b bg-gray-50"><td colSpan={11} className="p-3">
                          {novedades.length === 0 ? <p className="text-gray-600">Sin novedades en el periodo.</p> : (
                            <table className="w-full text-xs">
                              <thead><tr className="text-left text-gray-600"><th>Fecha</th><th>Estado</th><th>Hora</th><th>Cursos</th><th>Justificación</th><th>Incidencia</th></tr></thead>
                              <tbody>{novedades.map((d) => (
                                <tr key={d.fecha} className="border-t align-top">
                                  <td className="py-1 pr-2">{corta(d.fecha)}</td><td className="pr-2">{NOMBRE_ESTADO[d.estado]}</td>
                                  <td className="pr-2">{d.hora}</td><td className="pr-2">{d.cursos}</td>
                                  <td className="pr-2">{d.justificacion}</td><td className="whitespace-pre-wrap">{d.incidencia}</td>
                                </tr>))}</tbody>
                            </table>
                          )}
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
                {visibles.length === 0 && <tr><td colSpan={11} className="p-4 text-gray-500">Sin estudiantes.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/** Como leerTodo, pero detiene el informe si una consulta falla (para no mostrar faltas falsas). */
async function leer<T>(consulta: (d: number, h: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  return leerTodo<T>(async (d, h) => {
    const r = await consulta(d, h);
    if (r.error) throw new Error(r.error.message);
    return r;
  });
}
