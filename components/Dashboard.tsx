"use client";
import { useEffect, useState } from "react";
import { Estado, asistio } from "@/lib/estados";

export type FilaDash = {
  estudiante_id: string; apellidos: string; nombres: string; nivel: string; grado: number; seccion: string;
  estado_colegio: Estado;
  incidencias_aula: { curso: string; estado: string }[];
};

// Colores de estado (siempre acompañados de ícono y texto, nunca solo color)
const ESTADO = {
  puntual: { color: "#0ca30c", icono: "✓", nombre: "Puntual" },
  tardanza: { color: "#fab219", icono: "◷", nombre: "Tardanza" },
  tardanza_justificada: { color: "#4a3aa7", icono: "◶", nombre: "Tardanza justificada" },
  falta: { color: "#d03b3b", icono: "✕", nombre: "Falta" },
  falta_justificada: { color: "#2a78d6", icono: "✎", nombre: "Falta justificada" },
} as const;
const ORDEN = ["puntual", "tardanza", "tardanza_justificada", "falta", "falta_justificada"] as const;
const AZUL = "#2a78d6";
const GRIS = "#e5e4e0";
const imprimirColor = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;

const pct = (n: number, total: number) => (total ? Math.round((n * 1000) / total) / 10 : 0);

type Parte = { nombre: string; valor: number; color: string };
/** Un grupo seleccionable: segmento de un gráfico que se puede abrir para ver a sus estudiantes. */
type Grupo = Parte & { id: string; icono?: string; cumple: (f: FilaDash) => boolean };

/** Falso en el primer cuadro y verdadero después: permite animar la entrada de los gráficos. */
function useEntrada() {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setListo(true), 30);
    return () => clearTimeout(t);
  }, []);
  return listo;
}

/** Gráfico circular: resalta al pasar el mouse y al pulsar muestra la lista de estudiantes. */
function Dona({ titulo, nota, grupos, centro, elegido, onElegir, vacio }: {
  titulo: string; nota: string; grupos: Grupo[]; centro: { valor: string; texto: string };
  elegido: string; onElegir: (id: string) => void; vacio?: string;
}) {
  const listo = useEntrada();
  const [encima, setEncima] = useState("");
  const total = grupos.reduce((s, g) => s + g.valor, 0);
  const activo = grupos.find((g) => g.id === (encima || elegido));
  const visibles = grupos.filter((g) => g.valor > 0);
  const separacion = visibles.length > 1 ? 0.7 : 0;   // espacio entre segmentos (en % del círculo)
  let inicio = 0;

  return (
    <section className="bg-white border rounded p-4 break-inside-avoid flex flex-col">
      <h3 className="font-semibold">{titulo}</h3>
      <p className="text-xs text-gray-500 mb-2">{nota}</p>
      {!total ? <p className="text-sm text-gray-500 py-10 text-center">{vacio ?? "Sin datos."}</p> : (
        <>
          <div className="relative w-52 h-52 mx-auto">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" role="img" aria-label={`${titulo}: ${grupos.map((g) => `${g.nombre} ${g.valor}`).join(", ")}`}>
              {visibles.map((g) => {
                const largo = (g.valor * 100) / total;
                const desde = inicio;
                inicio += largo;
                const resaltado = activo?.id === g.id;
                return (
                  <circle key={g.id} cx="60" cy="60" r="46" fill="none" stroke={g.color} pathLength={100}
                    strokeWidth={resaltado ? 22 : 17}
                    strokeDasharray={`${listo ? Math.max(largo - separacion, 0.5) : 0} 100`} strokeDashoffset={-desde}
                    className="cursor-pointer" opacity={activo && !resaltado ? 0.35 : 1}
                    style={{ transition: "stroke-dasharray .8s ease, stroke-width .15s, opacity .15s", ...imprimirColor }}
                    onMouseEnter={() => setEncima(g.id)} onMouseLeave={() => setEncima("")} onClick={() => onElegir(g.id)}>
                    <title>{`${g.nombre}: ${g.valor} (${pct(g.valor, total)}%)`}</title>
                  </circle>
                );
              })}
            </svg>
            <div className="absolute inset-0 grid place-content-center text-center pointer-events-none px-12">
              <p className="text-3xl font-bold leading-none">{activo ? `${pct(activo.valor, total)}%` : centro.valor}</p>
              <p className="text-[11px] text-gray-500 mt-1 leading-tight">{activo ? `${activo.valor} · ${activo.nombre}` : centro.texto}</p>
            </div>
          </div>
          <ul className="mt-3 space-y-0.5">
            {grupos.map((g) => (
              <li key={g.id}>
                <button type="button" disabled={!g.valor} aria-pressed={elegido === g.id}
                  onClick={() => onElegir(g.id)} onMouseEnter={() => setEncima(g.id)} onMouseLeave={() => setEncima("")}
                  onFocus={() => setEncima(g.id)} onBlur={() => setEncima("")}
                  className={`flex w-full items-center gap-2 px-2 py-1 text-sm text-left disabled:opacity-50 ${
                    elegido === g.id ? "bg-slate-100 font-semibold" : "hover:bg-slate-50"}`}>
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: g.color, ...imprimirColor }} />
                  {g.icono && <span aria-hidden>{g.icono}</span>}
                  <span className="flex-1">{g.nombre}</span>
                  <b className="tabular-nums">{g.valor}</b>
                  <span className="text-gray-500 tabular-nums w-14 text-right">{pct(g.valor, total)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

type PropsGrafico = {
  titulo: string; nota: string; grupos: Grupo[]; elegido: string; onElegir: (id: string) => void;
};

/** Columnas verticales: compara cantidades entre pocas categorías. */
function Columnas({ titulo, nota, grupos, elegido, onElegir, vacio }: PropsGrafico & { vacio: string }) {
  const listo = useEntrada();
  const total = grupos.reduce((s, g) => s + g.valor, 0);
  const max = Math.max(1, ...grupos.map((g) => g.valor));
  return (
    <section className="bg-white border rounded p-4 break-inside-avoid flex flex-col">
      <h3 className="font-semibold">{titulo}</h3>
      <p className="text-xs text-gray-500 mb-2">{nota}</p>
      {!total ? <p className="text-sm text-gray-500 py-10 text-center">{vacio}</p> : (
        <div className="flex-1 flex items-stretch gap-3 min-h-72 border-b border-slate-200">
          {grupos.map((g) => (
            <button key={g.id} type="button" disabled={!g.valor} aria-pressed={elegido === g.id} onClick={() => onElegir(g.id)}
              title={`${g.nombre}: ${g.valor} (${pct(g.valor, total)}%)`}
              className={`group flex-1 flex flex-col items-center px-1 pt-2 ${elegido === g.id ? "bg-slate-100" : "hover:bg-slate-50"}`}>
              <span className="flex-1 w-full flex flex-col justify-end items-center">
                <b className="text-lg leading-none tabular-nums">{g.valor}</b>
                <span className="text-xs text-gray-500 mb-1">{pct(g.valor, total)}%</span>
                {/* la altura máxima deja sitio a las cifras de arriba */}
                <span className="block w-full max-w-16 rounded-t-md transition-all duration-700 ease-out group-hover:opacity-80"
                  style={{ height: listo ? `${(g.valor * 190) / max}px` : 0, minHeight: g.valor ? 4 : 0, background: g.color, ...imprimirColor }} />
              </span>
            </button>
          ))}
        </div>
      )}
      {total > 0 && (
        <div className="flex gap-3 mt-2">
          {grupos.map((g) => (
            <p key={g.id} className="flex-1 text-center text-xs text-gray-600 leading-tight">
              <span aria-hidden>{g.icono} </span>{g.nombre}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/** Medidor semicircular: qué parte del total cumple una condición. El primer grupo es el que se mide. */
function Medidor({ titulo, nota, grupos, elegido, onElegir }: PropsGrafico) {
  const listo = useEntrada();
  const [parte, resto] = grupos;
  const total = parte.valor + resto.valor;
  const avance = total ? (parte.valor * 100) / total : 0;
  const arco = "M 15 70 A 55 55 0 0 1 125 70";
  return (
    <section className="bg-white border rounded p-4 break-inside-avoid flex flex-col">
      <h3 className="font-semibold">{titulo}</h3>
      <p className="text-xs text-gray-500 mb-2">{nota}</p>
      <div className="flex-1 grid place-content-center">
        <svg viewBox="0 0 140 82" className="w-64 max-w-full" role="img" aria-label={`${parte.nombre}: ${parte.valor} de ${total}`}>
          <path d={arco} fill="none" stroke="#eceae5" strokeWidth="16" strokeLinecap="round" style={imprimirColor} />
          {parte.valor > 0 && (
            <path d={arco} fill="none" stroke={parte.color} strokeWidth="16" strokeLinecap="round" pathLength={100}
              strokeDasharray={`${listo ? Math.max(avance, 0.5) : 0} 100`} className="cursor-pointer" onClick={() => onElegir(parte.id)}
              style={{ transition: "stroke-dasharray .9s ease", ...imprimirColor }}>
              <title>{`${parte.nombre}: ${parte.valor} (${pct(parte.valor, total)}%)`}</title>
            </path>
          )}
          <text x="70" y="62" textAnchor="middle" fontSize="22" fontWeight="700" fill="#0f172a">{pct(parte.valor, total)}%</text>
          <text x="70" y="76" textAnchor="middle" fontSize="7" fill="#64748b">{parte.nombre.toLowerCase()}</text>
        </svg>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {grupos.map((g) => (
          <button key={g.id} type="button" disabled={!g.valor} aria-pressed={elegido === g.id} onClick={() => onElegir(g.id)}
            className={`border p-3 text-left disabled:opacity-50 ${elegido === g.id ? "bg-slate-100 border-slate-400" : "border-slate-200 hover:bg-slate-50"}`}>
            <span className="block text-2xl font-bold tabular-nums">{g.valor}</span>
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: g.color, ...imprimirColor }} />{g.nombre}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Barra 100 % apilada; 2px de separación entre segmentos y detalle al pasar el mouse. */
function Apilada({ partes, alto = 14 }: { partes: Parte[]; alto?: number }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <div className="flex gap-[2px] w-full rounded-full overflow-hidden" style={{ height: alto, background: total ? undefined : GRIS }}>
      {partes.filter((p) => p.valor > 0).map((p) => (
        <div key={p.nombre} title={`${p.nombre}: ${p.valor} (${pct(p.valor, total)}%)`}
          className="hover:opacity-75 transition-all duration-700" style={{ flexGrow: p.valor, flexBasis: 0, minWidth: 3, background: p.color, ...imprimirColor }} />
      ))}
    </div>
  );
}

/** Barras horizontales de una sola serie (magnitud); cada una abre su lista de estudiantes. */
function Barras({ grupos, total, elegido, onElegir }: { grupos: Grupo[]; total: number; elegido: string; onElegir: (id: string) => void }) {
  const listo = useEntrada();
  const max = Math.max(1, ...grupos.map((g) => g.valor));
  return (
    <ul className="space-y-1">
      {grupos.map((g) => (
        <li key={g.id}>
          <button type="button" disabled={!g.valor} aria-pressed={elegido === g.id} onClick={() => onElegir(g.id)}
            title={`${g.nombre}: ${g.valor} de ${total} estudiantes`}
            className={`block w-full text-left text-sm px-2 py-1.5 disabled:opacity-50 ${elegido === g.id ? "bg-slate-100" : "hover:bg-slate-50"}`}>
            <span className="flex justify-between gap-2">
              <span>{g.nombre}</span>
              <span><b>{g.valor}</b> <span className="text-gray-500">({pct(g.valor, total)}%)</span></span>
            </span>
            <span className="block h-2.5 mt-1 rounded-full bg-slate-100 overflow-hidden">
              <span className="block h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: listo ? `${(g.valor * 100) / max}%` : 0, background: g.color, ...imprimirColor }} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Cifra({ titulo, valor, nota }: { titulo: string; valor: string | number; nota: string }) {
  return (
    <div className="bg-white border rounded p-3 break-inside-avoid transition hover:-translate-y-0.5">
      <p className="text-sm text-gray-600">{titulo}</p>
      <p className="text-3xl font-bold">{valor}</p>
      <p className="text-xs text-gray-500">{nota}</p>
    </div>
  );
}

function Panel({ titulo, nota, children, ancho }: { titulo: string; nota?: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <section className={`bg-white border rounded p-4 break-inside-avoid ${ancho ? "lg:col-span-2" : ""}`}>
      <h3 className="font-semibold">{titulo}</h3>
      {nota && <p className="text-xs text-gray-500 mb-3">{nota}</p>}
      <div className={nota ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export default function Dashboard({ filas, incid }: { filas: FilaDash[]; incid: Map<string, string> }) {
  const [elegido, setElegido] = useState("");
  const total = filas.length;
  if (!total) return <p className="text-gray-500">No hay datos para mostrar en esta fecha o filtro.</p>;

  const n = (cond: (f: FilaDash) => boolean) => filas.filter(cond).length;
  const faltoClase = (f: FilaDash) => f.incidencias_aula.some((i) => i.estado === "falta");
  const tardeClase = (f: FilaDash) => f.incidencias_aula.some((i) => i.estado === "tardanza");
  const vino = (f: FilaDash) => asistio(f.estado_colegio);
  const grupo = (id: string, nombre: string, color: string, cumple: (f: FilaDash) => boolean, icono?: string): Grupo =>
    ({ id, nombre, color, cumple, icono, valor: n(cumple) });

  const vinieron = n(vino);
  const faltaron = n((f) => f.estado_colegio === "falta");
  const faltaronJ = n((f) => f.estado_colegio === "falta_justificada");
  const escapados = n((f) => vino(f) && faltoClase(f));
  const conIncid = n((f) => incid.has(f.estudiante_id));

  const ingreso = ORDEN.map((k) => grupo(k, ESTADO[k].nombre, ESTADO[k].color, (f) => f.estado_colegio === k, ESTADO[k].icono));
  // De los que ingresaron: qué pasó en sus clases (cada alumno cuenta una sola vez)
  const enAula = [
    grupo("aula-ok", "Sin novedad en clases", ESTADO.puntual.color, (f) => vino(f) && !faltoClase(f) && !tardeClase(f), "✓"),
    grupo("aula-tarde", "Tarde a alguna clase", ESTADO.tardanza.color, (f) => vino(f) && !faltoClase(f) && tardeClase(f), "◷"),
    grupo("aula-falta", "Faltó a alguna clase", ESTADO.falta.color, (f) => vino(f) && faltoClase(f), "✕"),
  ];
  const incidencias = [
    grupo("con-inc", "Con incidencia", AZUL, (f) => incid.has(f.estudiante_id), "✎"),
    grupo("sin-inc", "Sin incidencia", "#b8b6ae", (f) => !incid.has(f.estudiante_id)),
  ];
  const motivos = [
    grupo("m-falta", "Falta al colegio", AZUL, (f) => f.estado_colegio === "falta"),
    grupo("m-tarde", "Tardanza al colegio", AZUL, (f) => f.estado_colegio === "tardanza"),
    grupo("m-faltaj", "Falta justificada", AZUL, (f) => f.estado_colegio === "falta_justificada"),
    grupo("m-tardej", "Tardanza justificada", AZUL, (f) => f.estado_colegio === "tardanza_justificada"),
    grupo("m-escap", "Ingresó, pero faltó a clase", AZUL, (f) => vino(f) && faltoClase(f)),
    grupo("m-tclase", "Tardanza en clase", AZUL, tardeClase),
  ];

  const seleccion = [...ingreso, ...enAula, ...incidencias, ...motivos].find((g) => g.id === elegido);
  const detalle = seleccion ? filas.filter(seleccion.cumple) : [];
  const elegir = (id: string) => setElegido((actual) => (actual === id ? "" : id));

  const aulas = new Map<string, { etiqueta: string; orden: string; filas: FilaDash[] }>();
  for (const f of filas) {
    const clave = `${f.nivel}|${f.grado}|${f.seccion}`;
    if (!aulas.has(clave))
      aulas.set(clave, {
        etiqueta: `${f.grado}${f.nivel === "inicial" ? " años" : "°"} ${f.seccion} ${f.nivel}`,
        orden: `${["inicial", "primaria", "secundaria"].indexOf(f.nivel)}|${f.grado}|${f.seccion}`,
        filas: [],
      });
    aulas.get(clave)!.filas.push(f);
  }

  const cursos = new Map<string, { falta: number; tardanza: number }>();
  for (const f of filas)
    for (const i of f.incidencias_aula) {
      const c = cursos.get(i.curso) ?? { falta: 0, tardanza: 0 };
      if (i.estado === "falta") c.falta++; else c.tardanza++;
      cursos.set(i.curso, c);
    }
  const listaCursos = [...cursos].sort((a, b) => b[1].falta + b[1].tardanza - (a[1].falta + a[1].tardanza));
  const maxCurso = Math.max(1, ...listaCursos.map(([, c]) => c.falta + c.tardanza));

  const anotados = filas.filter((f) => incid.has(f.estudiante_id));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Cifra titulo="Asistencia al colegio" valor={`${pct(vinieron, total)}%`} nota={`${vinieron} de ${total} estudiantes`} />
        <Cifra titulo="Inasistencia" valor={`${pct(faltaron + faltaronJ, total)}%`} nota={`${faltaron} sin justificar · ${faltaronJ} justificadas`} />
        <Cifra titulo="Ingresaron pero faltaron a clase" valor={escapados} nota={`${pct(escapados, vinieron)}% de los que ingresaron`} />
        <Cifra titulo="Con incidencia anotada" valor={`${pct(conIncid, total)}%`} nota={`${conIncid} con incidencia · ${total - conIncid} sin incidencia`} />
      </div>

      <p className="text-sm text-gray-600 print:hidden">Pulsa un sector, una columna, una barra o una cifra para ver qué estudiantes son.</p>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Dona titulo="Ingreso al colegio" nota={`Sobre ${total} estudiantes`} grupos={ingreso} elegido={elegido} onElegir={elegir}
          centro={{ valor: `${pct(vinieron, total)}%`, texto: "asistencia" }} />
        <Columnas titulo="Dentro de las aulas" nota={`Sobre los ${vinieron} que ingresaron, según los docentes`} grupos={enAula}
          elegido={elegido} onElegir={elegir} vacio="Todavía no hay ingresos registrados." />
        <Medidor titulo="Incidencias" nota="Anotadas por el auxiliar" grupos={incidencias} elegido={elegido} onElegir={elegir} />
      </div>

      {seleccion && (
        <section className="bg-white border rounded p-4 fade-in" aria-live="polite">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-3 h-3 rounded-sm" style={{ background: seleccion.color }} />
            <h3 className="font-semibold mr-auto">{seleccion.nombre} ({detalle.length})</h3>
            <button type="button" onClick={() => setElegido("")} className="bg-slate-100 px-3 py-1 text-sm print:hidden">Cerrar</button>
          </div>
          {detalle.length === 0 ? <p className="text-sm text-gray-500">Ningún estudiante en este grupo.</p> : (
            <ul className="max-h-72 overflow-auto grid sm:grid-cols-2 xl:grid-cols-3 gap-x-4">
              {detalle.map((f) => (
                <li key={f.estudiante_id} className="border-b py-1.5 text-sm">
                  <span className="font-medium">{f.apellidos}, {f.nombres}</span>
                  <span className="text-gray-500"> · {f.grado}° {f.seccion}</span>
                  {incid.has(f.estudiante_id) && <span className="block text-xs text-gray-600">{incid.get(f.estudiante_id)}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel titulo="Motivos" nota="Estudiantes por motivo (uno puede tener varios)">
          <Barras grupos={motivos} total={total} elegido={elegido} onElegir={elegir} />
        </Panel>

        <Panel titulo="Novedades por curso" nota="Faltas y tardanzas marcadas por los docentes">
          {listaCursos.length === 0 ? <p className="text-sm text-gray-500">Ningún docente ha marcado novedades.</p> : (
            <ul className="space-y-3 max-h-80 overflow-auto">
              {listaCursos.map(([nombre, c]) => (
                <li key={nombre} className="text-sm">
                  <div className="flex justify-between gap-2 mb-1">
                    <span>{nombre}</span>
                    <span className="text-gray-600 whitespace-nowrap">✕ {c.falta} faltas · ◷ {c.tardanza} tard.</span>
                  </div>
                  <div style={{ width: `${((c.falta + c.tardanza) * 100) / maxCurso}%` }}>
                    <Apilada partes={[
                      { nombre: "Faltas", valor: c.falta, color: ESTADO.falta.color },
                      { nombre: "Tardanzas", valor: c.tardanza, color: ESTADO.tardanza.color },
                    ]} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel titulo="Asistencia por aula" nota="Pasa el mouse sobre la barra para ver el detalle" ancho>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b text-gray-600">
                <th className="py-1">Aula</th><th className="w-1/3">Distribución</th>
                {ORDEN.map((k) => <th key={k} className="text-right pl-2" title={ESTADO[k].nombre}>
                  {{ puntual: "Puntual", tardanza: "Tarde", tardanza_justificada: "T. just.", falta: "Falta", falta_justificada: "F. just." }[k]}
                </th>)}
                <th className="text-right pl-2">Asistencia</th></tr></thead>
              <tbody>
                {[...aulas.values()].sort((a, b) => a.orden.localeCompare(b.orden, "es", { numeric: true })).map((a) => {
                  const c = (k: Estado) => a.filas.filter((f) => f.estado_colegio === k).length;
                  return (
                    <tr key={a.orden} className="border-b">
                      <td className="py-1.5 capitalize whitespace-nowrap pr-3">{a.etiqueta}</td>
                      <td className="pr-3"><Apilada partes={ORDEN.map((k) => ({ ...ESTADO[k], valor: c(k) }))} /></td>
                      {ORDEN.map((k) => <td key={k} className="text-right tabular-nums pl-2">{c(k)}</td>)}
                      <td className="text-right tabular-nums font-semibold pl-2">{pct(a.filas.filter(vino).length, a.filas.length)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel titulo={`Incidencias anotadas (${anotados.length})`} ancho>
          {anotados.length === 0 ? <p className="text-sm text-gray-500">No hay incidencias guardadas para esta fecha.</p> : (
            <table className="w-full text-sm">
              <tbody>
                {anotados.map((f) => (
                  <tr key={f.estudiante_id} className="border-b align-top">
                    <td className="py-1.5 pr-3">{f.apellidos}, {f.nombres}</td>
                    <td className="pr-3 whitespace-nowrap">{f.grado}° {f.seccion}</td>
                    <td className="pr-3 whitespace-nowrap">{ESTADO[f.estado_colegio].icono} {ESTADO[f.estado_colegio].nombre}</td>
                    <td className="whitespace-pre-wrap">{incid.get(f.estudiante_id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}
