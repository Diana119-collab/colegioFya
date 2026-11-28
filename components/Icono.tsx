// Íconos de línea (SVG) sin dependencias externas.
const TRAZOS = {
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18v2h3M20 17v3",
  reporte: "M9 4h6v3H9zM9 5H5v16h14V5h-4M8 12h8M8 16h5",
  grafica: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-7",
  aula: "M3 5h18v11H3zM8 21l4-5 4 5M7 9h6",
  lista: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  personas: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c.6-3.5 3.2-5.5 6.500-5.5s5.900 2 6.500 5.5M16 5a3 3 0 010 6M18 15c2 .6 3.200 2.400 3.500 5",
  subir: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
  etiqueta: "M3 12V4h8l10 10-8 8zM7.5 8.500h.01",
  libro: "M4 5a2 2 0 012-2h14v15H6a2 2 0 00-2 2zM4 20a2 2 0 002 1h14v-3",
  calendario: "M4 6h16v15H4zM4 11h16M8 3v5M16 3v5",
  usuario: "M12 12a4 4 0 100-8 4 4 0 000 8zM4.500 21c.7-4 3.700-6 7.500-6s6.800 2 7.500 6",
  salir: "M10 4H5v16h5M15 8l4 4-4 4M19 12H9",
  menu: "M4 7h16M4 12h16M4 17h16",
  cerrar: "M6 6l12 12M18 6L6 18",
  check: "M5 12.500l4.500 4.500L19 7.500",
  reloj: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3.500 2",
  x: "M7 7l10 10M17 7L7 17",
  nota: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  whatsapp: "M4 20l1.300-4A8.500 8.500 0 1112 20.500a8.600 8.600 0 01-4.100-1zM9 9c0 3.500 2.500 6 6 6l1-1.500-2-1-1 1c-1.500-.5-2.500-1.500-3-3l1-1-1-2z",
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export default function Icono({ nombre, className = "w-5 h-5" }: { nombre: NombreIcono; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
      strokeLinejoin="round" className={className} aria-hidden>
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}
