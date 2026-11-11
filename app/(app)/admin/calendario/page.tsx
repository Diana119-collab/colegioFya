"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Dia = { fecha: string; motivo: string };

const fmt = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function Calendario() {
  const [dias, setDias] = useState<Dia[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    const { data } = await supabase().from("dias_no_lectivos").select("*").order("fecha");
    setDias(data ?? []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!desde) return;
    const fin = new Date((hasta || desde) + "T12:00:00");
    const filas: Dia[] = [];
    for (const d = new Date(desde + "T12:00:00"); d <= fin; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0 || d.getDay() === 6) continue;     // fines de semana ya cuentan como no lectivos
      filas.push({ fecha: d.toISOString().slice(0, 10), motivo: motivo || "No lectivo" });
    }
    if (!filas.length) return setMsg("Esas fechas ya son fin de semana.");
    const { error } = await supabase().from("dias_no_lectivos").upsert(filas);
    setMsg(error ? error.message : `${filas.length} día(s) guardados`);
    setDesde(""); setHasta(""); setMotivo("");
    cargar();
  }

  async function quitar(fecha: string) {
    await supabase().from("dias_no_lectivos").delete().eq("fecha", fecha);
    cargar();
  }

  return (
    <>
      <h2 className="text-2xl font-bold mb-2">Calendario no lectivo</h2>
      <p className="text-sm text-gray-600 mb-4">
        Los sábados y domingos ya se consideran no lectivos. Registra aquí feriados, vacaciones o jornadas sin clases:
        en esas fechas el reporte no marca faltas. Para un solo día deja &quot;Hasta&quot; vacío.
      </p>
      <form onSubmit={agregar} className="flex flex-wrap gap-2 items-end bg-white border rounded p-3 mb-4">
        <label className="text-sm">Desde<br /><input type="date" required className="border rounded p-2" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="text-sm">Hasta<br /><input type="date" className="border rounded p-2" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></label>
        <label className="text-sm">Motivo<br /><input className="border rounded p-2" placeholder="Feriado, vacaciones…" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
        <button className="bg-red-700 text-white px-4 py-2 rounded">Agregar</button>
        {msg && <span className="text-sm">{msg}</span>}
      </form>
      <div className="bg-white border rounded overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b"><th className="p-2">Fecha</th><th>Motivo</th><th /></tr></thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.fecha} className="border-b">
                <td className="p-2 capitalize">{fmt(d.fecha)}</td><td>{d.motivo}</td>
                <td><button onClick={() => quitar(d.fecha)} className="text-red-700 underline">Quitar</button></td>
              </tr>
            ))}
            {dias.length === 0 && <tr><td colSpan={3} className="p-4 text-gray-500">Sin días registrados.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
