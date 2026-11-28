"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase, Perfil, Rol } from "@/lib/supabase";
import Icono, { NombreIcono } from "@/components/Icono";

const Ctx = createContext<Perfil | null>(null);
export const usePerfil = () => useContext(Ctx)!;

const MENU: { href: string; label: string; icono: NombreIcono; roles: Rol[] }[] = [
  { href: "/escaner", label: "Escanear QR", icono: "qr", roles: ["auxiliar", "admin"] },
  { href: "/reporte", label: "Reporte diario", icono: "reporte", roles: ["auxiliar", "admin"] },
  { href: "/periodo", label: "Reporte por periodo", icono: "grafica", roles: ["auxiliar", "admin"] },
  { href: "/aula", label: "Mi aula", icono: "aula", roles: ["profesor", "admin"] },
  { href: "/mi-reporte", label: "Reporte de mi clase", icono: "lista", roles: ["profesor", "admin"] },
  { href: "/admin/estudiantes", label: "Estudiantes", icono: "personas", roles: ["admin", "auxiliar"] },
  { href: "/admin/importar", label: "Importar CSV/Excel", icono: "subir", roles: ["admin"] },
  { href: "/admin/qr", label: "Stickers QR", icono: "etiqueta", roles: ["admin"] },
  { href: "/admin/clases", label: "Cursos y grupos", icono: "libro", roles: ["admin"] },
  { href: "/admin/calendario", label: "Calendario no lectivo", icono: "calendario", roles: ["admin"] },
  { href: "/admin/usuarios", label: "Usuarios", icono: "usuario", roles: ["admin"] },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [abierto, setAbierto] = useState(false);   // menú en celulares
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    const sb = supabase();
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return router.replace("/login");
      const { data: p } = await sb.from("profiles").select("*").eq("id", data.user.id).single();
      if (!p || !p.activo) {
        await sb.auth.signOut();
        return router.replace("/login");
      }
      setPerfil(p as Perfil);
    });
  }, [router]);
  useEffect(() => setAbierto(false), [path]);

  if (!perfil)
    return (
      <div className="min-h-screen grid place-items-center text-gray-500">
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 rounded-full border-2 border-red-700 border-t-transparent animate-spin" />
          Cargando…
        </div>
      </div>
    );

  const items = MENU.filter((m) => m.roles.includes(perfil.rol));
  return (
    <Ctx.Provider value={perfil}>
      <div className="min-h-screen md:flex bg-slate-50">
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-red-800 text-white px-4 py-3 print:hidden">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="w-9 h-9 rounded-lg bg-white object-contain p-0.5" />
            <p className="font-bold">Fe y Alegría 17</p>
          </div>
          <button onClick={() => setAbierto(!abierto)} aria-label="Menú" aria-expanded={abierto} className="p-1">
            <Icono nombre={abierto ? "cerrar" : "menu"} className="w-6 h-6" />
          </button>
        </header>

        <aside className={`${abierto ? "block" : "hidden"} md:flex md:flex-col md:w-64 md:shrink-0 md:sticky md:top-0 md:h-screen md:overflow-y-auto
          bg-gradient-to-b from-red-800 to-red-950 text-white p-4 print:hidden`}>
          <div className="hidden md:flex items-center gap-3 mb-6 px-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Logo Fe y Alegría 17" className="w-14 h-14 shrink-0 rounded-2xl bg-white object-contain p-1 shadow" />
            <div>
              <h1 className="font-bold leading-tight">Fe y Alegría 17</h1>
              <p className="text-xs text-red-200">Villa El Salvador · Asistencia</p>
            </div>
          </div>
          <nav className="flex flex-col gap-1">
            {items.map((m) => {
              const activo = path.startsWith(m.href);
              return (
                <Link key={m.href} href={m.href} aria-current={activo ? "page" : undefined}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    activo ? "bg-white text-red-800 font-semibold shadow-lg" : "text-red-50 hover:bg-white/10 hover:translate-x-0.5"
                  }`}>
                  <Icono nombre={m.icono} className={`w-5 h-5 shrink-0 ${activo ? "" : "opacity-80 group-hover:opacity-100"}`} />
                  {m.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 md:mt-auto rounded-2xl bg-white/10 p-3">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center w-9 h-9 rounded-full bg-white/20 font-bold uppercase">{perfil.nombre.slice(0, 1)}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{perfil.nombre}</p>
                <p className="text-xs text-red-200 capitalize">{perfil.rol === "admin" ? "Administrador" : perfil.rol}</p>
              </div>
            </div>
            <button
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2 text-xs hover:bg-white/20 transition"
              onClick={async () => {
                await supabase().auth.signOut();
                router.replace("/login");
              }}>
              <Icono nombre="salir" className="w-4 h-4" /> Cerrar sesión
            </button>
          </div>
        </aside>

        <main className="app-main flex-1 min-w-0 p-4 md:p-8">
          <div key={path} className="fade-in">{children}</div>
        </main>
      </div>
    </Ctx.Provider>
  );
}
