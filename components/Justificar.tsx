"use client";
import { useState } from "react";
import { usePerfil } from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Justificacion, textoJustificacion } from "@/lib/estados";

/** Registrar, ver o quitar la justificación de un estudiante para la fecha del reporte. */
export default function Justificar({ estudianteId, fecha, tipoSugerido, actual, onCambio }: {
  estudianteId: string; fecha: string; tipoSugerido: Justificacion["tipo"];
  actual?: Justificacion; onCambio: (j: Justificacion | null) => void;
}) {
  const perfil = usePerfil();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState(tipoSugerido);
  const [motivo, setMotivo] = useState("");
  const [tutor, setTutor] = useState("");
  const [hasta, setHasta] = useState("");
  const [msg, setMsg] = useState("");

  function abrir() {
    setTipo(actual?.tipo ?? tipoSugerido);
    setMotivo(actual?.motivo ?? "");
    setTutor(actual?.informado_por ?? "");
    setHasta(""); setMsg(""); setAbierto(true);
  }

  async function guardar() {
    if (!motivo.trim()) return setMsg("Escribe el motivo");
    const j: Justificacion = { tipo, motivo: motivo.trim(), informado_por: tutor.trim() || null };
    // la fecha del reporte y, si se indicó "hasta", los demás días de lunes a viernes
    const dias = [fecha];
    if (hasta > fecha) {
      for (const d = new Date(fecha + "T12:00:00Z"); ;) {
        d.setUTCDate(d.getUTCDate() + 1);
        const f = d.toISOString().slice(0, 10);
        if (f > hasta) break;
        if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dias.push(f);
        if (dias.length > 60) return setMsg("El rango es demasiado largo (máximo 60 días)");
      }
    }
    const { error } = await supabase().from("justificaciones").upsert(
      dias.map((f) => ({ estudiante_id: estudianteId, fecha: f, ...j, registrado_por: perfil.id })),
      { onConflict: "estudiante_id,fecha" });
    if (error) return setMsg(error.message);
    setAbierto(false);
    onCambio(j);
  }

  async function quitar() {
    if (!confirm("¿Quitar la justificación de este día?")) return;
    const { error } = await supabase().from("justificaciones").delete().eq("estudiante_id", estudianteId).eq("fecha", fecha);
    if (error) return alert(error.message);
    onCambio(null);
  }

  const inp = "border rounded p-1 text-xs";
  return (
    <div className="my-1">
      {actual && <p className="text-xs text-blue-800">📝 {textoJustificacion(actual)}</p>}
      {!abierto ? (
        <p className="text-xs print:hidden flex gap-1 mt-1">
          <button type="button" onClick={abrir} className="bg-blue-50 text-blue-700 px-2.5 py-1 font-medium">{actual ? "Editar" : "Justificar"}</button>
          {actual && <button type="button" onClick={quitar} className="bg-red-50 text-red-700 px-2.5 py-1 font-medium">Quitar</button>}
        </p>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded p-2 grid gap-1 max-w-xs print:hidden">
          <select className={inp} value={tipo} onChange={(e) => setTipo(e.target.value as Justificacion["tipo"])}>
            <option value="falta">Falta justificada</option><option value="tardanza">Tardanza justificada</option>
          </select>
          <textarea className={inp} rows={2} placeholder="Motivo (ej. cita médica)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <input className={inp} placeholder="Tutor que informa" value={tutor} onChange={(e) => setTutor(e.target.value)} />
          <label className="text-xs">Si son varios días, hasta:
            <input type="date" min={fecha} className={`${inp} ml-1`} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={guardar} className="bg-blue-700 text-white px-3 py-1 rounded text-xs">Guardar</button>
            <button type="button" onClick={() => setAbierto(false)} className="border px-3 py-1 rounded text-xs bg-white">Cancelar</button>
          </div>
          {msg && <p className="text-xs text-red-700">{msg}</p>}
        </div>
      )}
    </div>
  );
}
