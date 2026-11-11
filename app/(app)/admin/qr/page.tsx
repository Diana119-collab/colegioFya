"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";

type Sec = { id: string; nivel: string; grado: number; seccion: string };
type Est = { id: string; codigo: string; apellidos: string; nombres: string };

export default function Stickers() {
  const [secs, setSecs] = useState<Sec[]>([]);
  const [sel, setSel] = useState("");
  const [ests, setEsts] = useState<(Est & { img: string })[]>([]);

  useEffect(() => {
    supabase().from("secciones").select("*").order("nivel").order("grado").order("seccion")
      .then(({ data }) => setSecs(data ?? []));
  }, []);

  useEffect(() => {
    if (!sel) return;
    supabase().from("estudiantes").select("id,codigo,apellidos,nombres")
      .eq("seccion_id", sel).eq("activo", true).order("apellidos")
      .then(async ({ data }) => {
        const l = await Promise.all((data ?? []).map(async (e) => ({
          ...e, img: await QRCode.toDataURL(e.codigo, { margin: 0, width: 200 }),
        })));
        setEsts(l);
      });
  }, [sel]);

  const s = secs.find((x) => x.id === sel);
  return (
    <>
      <div className="print:hidden mb-4">
        <h2 className="text-2xl font-bold mb-3">Stickers QR para agendas</h2>
        <select className="border rounded p-2" value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">Elegir sección…</option>
          {secs.map((x) => <option key={x.id} value={x.id}>{x.nivel} {x.grado}° {x.seccion}</option>)}
        </select>
        {ests.length > 0 && (
          <button className="ml-3 bg-red-700 text-white px-4 py-2 rounded" onClick={() => window.print()}>
            Imprimir ({ests.length})
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
        {ests.map((e) => (
          <div key={e.id} className="bg-white border rounded p-2 text-center break-inside-avoid">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.img} alt="" className="mx-auto w-28 h-28" />
            <p className="text-[11px] leading-tight mt-1 font-semibold">{e.apellidos}, {e.nombres}</p>
            <p className="text-[10px] text-gray-500 capitalize">{s?.grado}° {s?.seccion} {s?.nivel}</p>
          </div>
        ))}
      </div>
    </>
  );
}
