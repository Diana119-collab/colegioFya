"use client";
import { useEffect, useState } from "react";
import { useHoraLimite } from "@/components/Ingreso";

const APERTURA = "07:30";

function partesLima(d: Date) {
  const [h, m, s] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(d).split(":").map(Number);
  return { h, m, s };
}
const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const dos = (n: number) => String(n).padStart(2, "0");

/** Reloj en vivo (hora de Lima) que avisa si el ingreso cuenta como puntual o tardanza. */
export default function Reloj() {
  const limite = useHoraLimite();
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    setAhora(new Date());
    const t = setInterval(() => setAhora(new Date()), 500);
    return () => clearInterval(t);
  }, []);
  if (!ahora) return <div className="h-32" />;

  const { h, m, s } = partesLima(ahora);
  const minuto = h * 60 + m;
  const tarde = minuto > minutos(limite);
  const antes = minuto < minutos(APERTURA);
  const restan = (minutos(limite) + 1) * 60 - (minuto * 60 + s);   // segundos hasta que empiece la tardanza
  const total = (minutos(limite) + 1 - minutos(APERTURA)) * 60;
  const avance = tarde ? 100 : antes ? 0 : ((total - restan) * 100) / total;
  const manecilla = (grados: number, largo: number, grosor: number, color: string) => (
    <line x1="50" y1="50" x2="50" y2={50 - largo} stroke={color} strokeWidth={grosor} strokeLinecap="round"
      transform={`rotate(${grados} 50 50)`} />
  );

  return (
    <div className={`border-2 rounded p-3 flex items-center gap-4 ${tarde ? "border-amber-500 bg-amber-50" : "border-green-600 bg-green-50"}`}>
      <svg viewBox="0 0 100 100" className="w-24 h-24 shrink-0" aria-hidden>
        <circle cx="50" cy="50" r="47" fill="#fff" stroke="#b91c1c" strokeWidth="4" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="50" y1="8" x2="50" y2={i % 3 === 0 ? 16 : 12} stroke="#555" strokeWidth="2" transform={`rotate(${i * 30} 50 50)`} />
        ))}
        {manecilla((h % 12) * 30 + m / 2, 24, 4, "#111")}
        {manecilla(m * 6 + s / 10, 34, 3, "#111")}
        {manecilla(s * 6, 38, 1.2, "#b91c1c")}
        <circle cx="50" cy="50" r="3" fill="#b91c1c" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-4xl font-bold tabular-nums">{dos(h)}:{dos(m)}:{dos(s)}</p>
        <p className="text-xs text-gray-600 capitalize">
          {ahora.toLocaleDateString("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" })}
        </p>
        <p className="font-semibold mt-1">
          {tarde ? `◷ Tardanza (pasó las ${limite})`
            : antes ? `✓ Puntual · el ingreso abre a las ${APERTURA}`
            : `✓ Puntual · quedan ${dos(Math.floor(restan / 60))}:${dos(restan % 60)}`}
        </p>
        <div className="h-2 bg-white rounded mt-1 overflow-hidden">
          <div className={`h-full ${tarde ? "bg-amber-500" : "bg-green-600"}`} style={{ width: `${avance}%` }} />
        </div>
      </div>
    </div>
  );
}
