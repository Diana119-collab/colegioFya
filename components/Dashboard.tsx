"use client";

export type FilaDash = {
  estudiante_id: string; apellidos: string; nombres: string; nivel: string; grado: number; seccion: string;
  estado_colegio: "puntual" | "tardanza" | "falta";
  incidencias_aula: { curso: string; estado: string }[];
};

// Colores de estado (siempre acompañados de ícono y texto, nunca solo color)
const ESTADO = {
  puntual: { color: "#0ca30c", icono: "✓", nombre: "Puntual" },
  tardanza: { color: "#fab219", icono: "◷", nombre: "Tardanza" },
  falta: { color: "#d03b3b", icono: "✕", nombre: "Falta" },
} as const;
const AZUL = "#2a78d6";
const GRIS = "#e5e4e0";
const imprimirColor = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;

const pct = (n: number, total: number) => (total ? Math.round((n * 1000) / total) / 10 : 0);

type Parte = { nombre: string; valor: number; color: string };

/** Barra 100 % apilada; 2px de separación entre segmentos y detalle al pasar el mouse. */
function Apilada({ partes, alto = 14 }: { partes: Parte[]; alto?: number }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <div className="flex gap-[2px] w-full rounded overflow-hidden" style={{ height: alto, background: total ? undefined : GRIS }}>
      {partes.filter((p) => p.valor > 0).map((p) => (
        <div key={p.nombre} title={`${p.nombre}: ${p.valor} (${pct(p.valor, total)}%)`}
          className="hover:opacity-80" style={{ flexGrow: p.valor, flexBasis: 0, minWidth: 3, background: p.color, ...imprimirColor }} />
      ))}
    </div>
  );
}

function Leyenda({ partes }: { partes: (Parte & { icono?: string })[] }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm">
      {partes.map((p) => (
        <li key={p.nombre} className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: p.color, ...imprimirColor }} />
          {p.icono && <span aria-hidden>{p.icono}</span>}
          {p.nombre}: <b>{p.valor}</b> <span className="text-gray-500">({pct(p.valor, total)}%)</span>
        </li>
      ))}
    </ul>
  );
}

/** Barras horizontales de una sola serie (magnitud). */
function Barras({ datos, total }: { datos: { nombre: string; valor: number }[]; total: number }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <ul className="space-y-2">
      {datos.map((d) => (
        <li key={d.nombre} className="text-sm" title={`${d.nombre}: ${d.valor} de ${total} estudiantes`}>
          <div className="flex justify-between gap-2">
            <span>{d.nombre}</span>
            <span><b>{d.valor}</b> <span className="text-gray-500">({pct(d.valor, total)}%)</span></span>
          </div>
          <div className="h-2.5 mt-0.5">
            <div className="h-full rounded-r" style={{ width: `${(d.valor * 100) / max}%`, background: AZUL, ...imprimirColor }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Cifra({ titulo, valor, nota }: { titulo: string; valor: string | number; nota: string }) {
  return (
    <div className="bg-white border rounded p-3 break-inside-avoid">
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
  const total = filas.length;
  if (!total) return <p className="text-gray-500">No hay datos para mostrar en esta fecha o filtro.</p>;

  const n = (cond: (f: FilaDash) => boolean) => filas.filter(cond).length;
  const faltoClase = (f: FilaDash) => f.incidencias_aula.some((i) => i.estado === "falta");
  const tardeClase = (f: FilaDash) => f.incidencias_aula.some((i) => i.estado === "tardanza");
  const vino = (f: FilaDash) => f.estado_colegio !== "falta";

  const puntual = n((f) => f.estado_colegio === "puntual");
  const tardanza = n((f) => f.estado_colegio === "tardanza");
  const falta = n((f) => f.estado_colegio === "falta");
  const vinieron = puntual + tardanza;
  const escapados = n((f) => vino(f) && faltoClase(f));
  const conIncid = n((f) => incid.has(f.estudiante_id));

  const general: (Parte & { icono: string })[] = (["puntual", "tardanza", "falta"] as const).map((k) => ({
    ...ESTADO[k], valor: { puntual, tardanza, falta }[k],
  }));

  // De los que ingresaron: qué pasó en sus clases (cada alumno cuenta una sola vez)
  const enAula: Parte[] = [
    { nombre: "Sin novedad en clases", valor: n((f) => vino(f) && !faltoClase(f) && !tardeClase(f)), color: ESTADO.puntual.color },
    { nombre: "Llegó tarde a alguna clase", valor: n((f) => vino(f) && !faltoClase(f) && tardeClase(f)), color: ESTADO.tardanza.color },
    { nombre: "Ingresó pero faltó a alguna clase", valor: escapados, color: ESTADO.falta.color },
  ];

  const motivos = [
    { nombre: "Falta al colegio", valor: falta },
    { nombre: "Tardanza al colegio", valor: tardanza },
    { nombre: "Ingresó, pero faltó a clase", valor: escapados },
    { nombre: "Tardanza en clase", valor: n(tardeClase) },
  ];

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
        <Cifra titulo="Inasistencia" valor={`${pct(falta, total)}%`} nota={`${falta} no ingresaron`} />
        <Cifra titulo="Ingresaron pero faltaron a clase" valor={escapados} nota={`${pct(escapados, vinieron)}% de los que ingresaron`} />
        <Cifra titulo="Con incidencia anotada" valor={`${pct(conIncid, total)}%`} nota={`${conIncid} con incidencia · ${total - conIncid} sin incidencia`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel titulo="Ingreso al colegio" nota={`Sobre ${total} estudiantes`} ancho>
          <Apilada partes={general} alto={28} />
          <Leyenda partes={general} />
        </Panel>

        <Panel titulo="Dentro de las aulas" nota={`Sobre los ${vinieron} que ingresaron. Solo cuenta lo que marcaron los docentes.`}>
          {vinieron ? <><Apilada partes={enAula} alto={28} /><Leyenda partes={enAula} /></>
            : <p className="text-sm text-gray-500">Todavía no hay ingresos registrados.</p>}
        </Panel>

        <Panel titulo="Motivos" nota="Estudiantes por motivo (uno puede tener varios)">
          <Barras datos={motivos} total={total} />
        </Panel>

        <Panel titulo="Asistencia por aula" nota="Pasa el mouse sobre la barra para ver el detalle" ancho>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b text-gray-600">
                <th className="py-1">Aula</th><th className="w-2/5">Puntual · Tardanza · Falta</th>
                <th className="text-right">Puntual</th><th className="text-right">Tarde</th><th className="text-right">Falta</th>
                <th className="text-right">Asistencia</th></tr></thead>
              <tbody>
                {[...aulas.values()].sort((a, b) => a.orden.localeCompare(b.orden, "es", { numeric: true })).map((a) => {
                  const c = (k: string) => a.filas.filter((f) => f.estado_colegio === k).length;
                  const partes = (["puntual", "tardanza", "falta"] as const).map((k) => ({ ...ESTADO[k], valor: c(k) }));
                  return (
                    <tr key={a.orden} className="border-b">
                      <td className="py-1.5 capitalize whitespace-nowrap pr-3">{a.etiqueta}</td>
                      <td className="pr-3"><Apilada partes={partes} /></td>
                      <td className="text-right tabular-nums">{c("puntual")}</td>
                      <td className="text-right tabular-nums">{c("tardanza")}</td>
                      <td className="text-right tabular-nums">{c("falta")}</td>
                      <td className="text-right tabular-nums font-semibold">{pct(c("puntual") + c("tardanza"), a.filas.length)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel titulo="Novedades por curso" nota="Faltas y tardanzas marcadas por los docentes" ancho>
          {listaCursos.length === 0 ? <p className="text-sm text-gray-500">Ningún docente ha marcado novedades.</p> : (
            <ul className="space-y-2">
              {listaCursos.map(([nombre, c]) => (
                <li key={nombre} className="grid sm:grid-cols-[16rem_1fr_11rem] gap-x-3 items-center text-sm">
                  <span>{nombre}</span>
                  <div><div style={{ width: `${((c.falta + c.tardanza) * 100) / maxCurso}%` }}>
                    <Apilada partes={[
                      { nombre: "Faltas", valor: c.falta, color: ESTADO.falta.color },
                      { nombre: "Tardanzas", valor: c.tardanza, color: ESTADO.tardanza.color },
                    ]} />
                  </div></div>
                  <span className="text-gray-600">✕ {c.falta} faltas · ◷ {c.tardanza} tard.</span>
                </li>
              ))}
            </ul>
          )}
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
