"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase, Perfil, Rol } from "@/lib/supabase";

const Ctx = createContext<Perfil | null>(null);
export const usePerfil = () => useContext(Ctx)!;

const MENU: { href: string; label: string; roles: Rol[] }[] = [
  { href: "/escaner", label: "Escanear QR", roles: ["auxiliar", "admin"] },
  { href: "/reporte", label: "Reporte diario", roles: ["auxiliar", "admin"] },
  { href: "/aula", label: "Mi aula", roles: ["profesor", "admin"] },
  { href: "/mi-reporte", label: "Reporte de mi clase", roles: ["profesor", "admin"] },
  { href: "/admin/estudiantes", label: "Estudiantes", roles: ["admin"] },
  { href: "/admin/importar", label: "Importar CSV/Excel", roles: ["admin"] },
  { href: "/admin/qr", label: "Stickers QR", roles: ["admin"] },
  { href: "/admin/clases", label: "Cursos y grupos", roles: ["admin"] },
  { href: "/admin/calendario", label: "Calendario no lectivo", roles: ["admin"] },
  { href: "/admin/usuarios", label: "Usuarios", roles: ["admin"] },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
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

  if (!perfil) return <p className="p-8 text-gray-500">Cargando…</p>;

  const items = MENU.filter((m) => m.roles.includes(perfil.rol));
  return (
    <Ctx.Provider value={perfil}>
      <div className="min-h-screen md:flex">
        <aside className="bg-red-700 text-white md:w-60 md:min-h-screen p-4 print:hidden">
          <h1 className="font-bold leading-tight">Fe y Alegría 17</h1>
          <p className="text-xs text-red-100 mb-4">Villa El Salvador · Asistencia</p>
          <nav className="flex md:flex-col gap-1 flex-wrap">
            {items.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className={`px-3 py-2 rounded text-sm ${
                  path.startsWith(m.href) ? "bg-white text-red-700 font-semibold" : "hover:bg-red-600"
                }`}
              >
                {m.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 text-xs text-red-100">
            {perfil.nombre} ({perfil.rol})
            <button
              className="block underline mt-1"
              onClick={async () => {
                await supabase().auth.signOut();
                router.replace("/login");
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </aside>
        <main className="flex-1 p-4 md:p-8 bg-gray-50">{children}</main>
      </div>
    </Ctx.Provider>
  );
}
