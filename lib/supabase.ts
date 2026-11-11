import { createBrowserClient } from "@supabase/ssr";

export function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export type Rol = "admin" | "profesor" | "auxiliar";

export type Perfil = {
  id: string;
  nombre: string;
  rol: Rol;
  nivel: string | null;
};

export const hoyLima = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

export const waLink = (celular: string | null, texto: string) => {
  const n = (celular ?? "").replace(/\D/g, "");
  const num = n.length === 9 ? "51" + n : n;
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
};
