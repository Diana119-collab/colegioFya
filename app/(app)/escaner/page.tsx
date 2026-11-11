"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Res = { ok: boolean; error?: string; repetido?: boolean; estado?: string; nombre?: string; aula?: string };

export default function Escaner() {
  return <><Contenido /></>;
}

function Contenido() {
  const [ult, setUlt] = useState<Res | null>(null);
  const [hist, setHist] = useState<(Res & { hora: string })[]>([]);
  const [manual, setManual] = useState("");
  const [camError, setCamError] = useState("");
  const lastCode = useRef({ code: "", t: 0 });

  async function procesar(codigo: string) {
    const now = Date.now();
    if (codigo === lastCode.current.code && now - lastCode.current.t < 4000) return;
    lastCode.current = { code: codigo, t: now };
    const { data, error } = await supabase().rpc("registrar_ingreso", { p_codigo: codigo });
    const r: Res = error ? { ok: false, error: error.message } : (data as Res);
    setUlt(r);
    if (r.ok && !r.repetido)
      setHist((h) => [{ ...r, hora: new Date().toLocaleTimeString("es-PE") }, ...h].slice(0, 30));
    try { navigator.vibrate?.(r.ok ? 80 : [80, 60, 80]); } catch {}
  }

  useEffect(() => {
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let activo = true;
    let iniciado = false;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!activo || !document.getElementById("lector")) return;
      scanner = new Html5Qrcode("lector");
      try {
        await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 },
          (txt) => activo && procesar(txt), () => {});
        iniciado = true;
        if (!activo) scanner.stop().catch(() => {});   // el usuario salió mientras arrancaba
      } catch {
        if (activo) setCamError("No se pudo abrir la cámara. Permite el acceso o usa el ingreso manual.");
      }
    })();
    return () => {
      activo = false;
      if (iniciado) scanner?.stop().then(() => scanner?.clear()).catch(() => {});
    };
  }, []);

  const color = !ult ? "bg-gray-200" : !ult.ok ? "bg-red-200"
    : ult.estado === "tardanza" ? "bg-amber-200" : "bg-green-200";

  return (
    <>
      <h2 className="text-2xl font-bold mb-4">Ingreso al colegio</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div id="lector" className="w-full max-w-sm bg-black rounded overflow-hidden" />
          {camError && <p className="text-sm text-red-600 mt-2">{camError}</p>}
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual) procesar(manual.trim()); setManual(""); }}>
            <input className="border rounded p-2 flex-1" placeholder="Código manual (si el QR no lee)"
              value={manual} onChange={(e) => setManual(e.target.value)} />
            <button className="bg-red-700 text-white px-3 rounded">OK</button>
          </form>
        </div>
        <div>
          <div className={`rounded p-4 mb-4 ${color}`}>
            {!ult && <p>Acerca el QR de la agenda a la cámara.</p>}
            {ult && !ult.ok && <p className="font-bold">{ult.error}</p>}
            {ult?.ok && (
              <>
                <p className="text-xl font-bold">{ult.nombre}</p>
                <p className="capitalize">{ult.aula}</p>
                <p className="font-semibold uppercase mt-1">
                  {ult.repetido ? `Ya registrado (${ult.estado})` : ult.estado}
                </p>
              </>
            )}
          </div>
          <h3 className="font-semibold mb-1">Últimos ingresos</h3>
          <ul className="text-sm space-y-1">
            {hist.map((h, i) => (
              <li key={i} className="flex justify-between bg-white border rounded px-2 py-1">
                <span>{h.nombre}</span>
                <span className={h.estado === "tardanza" ? "text-amber-700" : "text-green-700"}>{h.estado} · {h.hora}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
