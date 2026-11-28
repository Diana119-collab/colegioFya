"use client";
import { useEffect, useState } from "react";
import { supabase, hoyLima } from "@/lib/supabase";
import { leerTodo } from "@/lib/ept";
import { usePerfil } from "@/components/Shell";
import Icono from "@/components/Icono";

export type Ingreso = { estado: "puntual" | "tardanza"; hora: string };

export const horaLima = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

/** Hora límite de puntualidad ("07:45"), tomada de la tabla configuracion. */
export function useHoraLimite() {
  const [limite, setLimite] = useState("07:45");
  useEffect(() => {
    supabase().from("configuracion").select("hora_limite_puntual").eq("id", 1).maybeSingle()
      .then(({ data }) => data && setLimite(String(data.hora_limite_puntual).slice(0, 5)));
  }, []);
  return limite;
}

/** Registro manual (estudiante sin agenda): se indica la hora de llegada y el estado sale de la regla. */
export function MarcarIngreso({ estudianteId, fecha, onListo, onCancelar }: {
  estudianteId: string; fecha: string; onListo: (i: Ingreso) => void; onCancelar?: () => void;
}) {
  const perfil = usePerfil();
  const limite = useHoraLimite();
  const [elegida, setElegida] = useState("");   // vacío = usar la hora actual
  const [ahora, setAhora] = useState(() => horaLima(new Date()));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setAhora(horaLima(new Date())), 15000);
    return () => clearInterval(t);
  }, []);

  const esHoy = fecha === hoyLima();
  const hora = elegida || (esHoy ? ahora : "");   // en días pasados hay que escribir la hora
  const estado: Ingreso["estado"] = hora <= limite ? "puntual" : "tardanza";

  async function registrar() {
    setBusy(true);
    setMsg("");
    const marca = `${fecha}T${elegida || (esHoy ? horaLima(new Date()) : "")}:00-05:00`;
    const final: Ingreso["estado"] = marca.slice(11, 16) <= limite ? "puntual" : "tardanza";
    const { error } = await supabase().from("asistencia_colegio").insert({
      estudiante_id: estudianteId, fecha, hora: marca, estado: final, registrado_por: perfil.id,
    });
    setBusy(false);
    if (error) return setMsg(error.code === "23505" ? "Ya tenía ingreso registrado ese día" : error.message);
    onListo({ estado: final, hora: marca });
  }

  if (fecha > hoyLima()) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <input type="time" className="border rounded p-1 text-sm" aria-label="Hora de llegada"
        value={hora} onChange={(e) => setElegida(e.target.value)} />
      {/* verde = puntual, naranja = tardanza, según la hora elegida */}
      <button type="button" onClick={registrar} disabled={!hora || busy}
        title={!hora ? "Indica la hora de llegada" : `Guardar como ${estado}`}
        aria-label={!hora ? "Guardar" : `Guardar como ${estado}`}
        className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${
          !hora ? "bg-gray-500" : estado === "puntual" ? "bg-green-700" : "bg-orange-600"}`}>
        {hora && <Icono nombre={estado === "puntual" ? "check" : "reloj"} className="w-3.5 h-3.5" />}
        {busy ? "Guardando…" : "Guardar"}
      </button>
      {onCancelar && (
        <button type="button" onClick={onCancelar} disabled={busy}
          className="border border-slate-300 bg-white text-slate-700 px-3 py-1.5 text-xs">Cancelar</button>
      )}
      {msg && <span className="text-xs text-red-700">{msg}</span>}
    </div>
  );
}

/** En listas largas: solo un botón; el control de hora se crea al abrirlo. */
export function IngresoDesplegable(props: React.ComponentProps<typeof MarcarIngreso>) {
  const [abierto, setAbierto] = useState(false);
  if (props.fecha > hoyLima()) return null;
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)}
        className="mt-1 mr-1 bg-slate-100 text-slate-700 px-2.5 py-1 text-xs font-medium print:hidden">+ Registrar ingreso manual</button>
    );
  return <MarcarIngreso {...props} onCancelar={() => setAbierto(false)} />;
}

type Est = {
  id: string; dni: string | null; apellidos: string; nombres: string;
  secciones: { nivel: string; grado: number; seccion: string };
};

const sinTildes = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Buscador para registrar el ingreso de hoy a quien olvidó su agenda. */
export function RegistroManual({ onRegistrado }: { onRegistrado: (nombre: string, aula: string, i: Ingreso) => void }) {
  const limite = useHoraLimite();
  const [lista, setLista] = useState<Est[]>([]);
  const [q, setQ] = useState("");
  const [ingresos, setIngresos] = useState<Record<string, Ingreso>>({});

  useEffect(() => {
    leerTodo<Est>((d, h) => supabase().from("estudiantes")
      .select("id,dni,apellidos,nombres,secciones(nivel,grado,seccion)")
      .eq("activo", true).order("apellidos").order("id").range(d, h) as never).then(setLista);
  }, []);

  const palabras = sinTildes(q).split(/\s+/).filter(Boolean);
  const hallados = q.trim().length < 2 ? [] : lista.filter((e) => {
    const t = sinTildes(`${e.apellidos} ${e.nombres} ${e.dni ?? ""}`);
    return palabras.every((p) => t.includes(p));
  }).slice(0, 8);
  const ids = hallados.map((e) => e.id).join(",");

  useEffect(() => {
    if (!ids) return;
    supabase().from("asistencia_colegio").select("estudiante_id,estado,hora")
      .eq("fecha", hoyLima()).in("estudiante_id", ids.split(","))
      .then(({ data }) => setIngresos((m) => ({
        ...m, ...Object.fromEntries((data ?? []).map((x) => [x.estudiante_id, { estado: x.estado, hora: x.hora }])),
      })));
  }, [ids]);

  return (
    <section className="bg-white border rounded p-4">
      <h3 className="font-semibold">Sin agenda: registro manual</h3>
      <p className="text-xs text-gray-500 mb-2">
        Busca al estudiante por apellidos, nombres o DNI. Hasta las {limite} es puntual; después, tardanza.
      </p>
      <input className="border rounded p-2 w-full" placeholder="Ej. Ato Omar" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-2 divide-y">
        {hallados.map((e) => {
          const aula = `${e.secciones.grado}° ${e.secciones.seccion} ${e.secciones.nivel}`;
          const ya = ingresos[e.id];
          return (
            <li key={e.id} className="py-2 flex flex-wrap items-center gap-2">
              <div className="mr-auto">
                <p className="text-sm font-medium">{e.apellidos}, {e.nombres}</p>
                <p className="text-xs text-gray-500 capitalize">{aula}</p>
              </div>
              {ya ? (
                <span className={`text-xs font-semibold ${ya.estado === "tardanza" ? "text-amber-700" : "text-green-700"}`}>
                  Ya registrado: {ya.estado} {horaLima(new Date(ya.hora))}
                </span>
              ) : (
                <MarcarIngreso estudianteId={e.id} fecha={hoyLima()} onListo={(i) => {
                  setIngresos((m) => ({ ...m, [e.id]: i }));
                  onRegistrado(`${e.apellidos}, ${e.nombres}`, aula, i);
                }} />
              )}
            </li>
          );
        })}
        {q.trim().length >= 2 && hallados.length === 0 && <li className="py-2 text-sm text-gray-500">Sin resultados.</li>}
      </ul>
    </section>
  );
}
