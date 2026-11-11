import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Solo el administrador puede crear usuarios. Usa la clave secreta (nunca llega al navegador).
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function esAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const sb = admin();
  const { data } = await sb.auth.getUser(token);
  if (!data.user) return null;
  const { data: p } = await sb.from("profiles").select("rol,activo").eq("id", data.user.id).single();
  return p?.rol === "admin" && p.activo ? sb : null;
}

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local" }, { status: 500 });
  const sb = await esAdmin(req);
  if (!sb) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { email, password, nombre, rol, nivel } = await req.json();
  if (!email || !password || password.length < 6 || !nombre || !["admin", "profesor", "auxiliar"].includes(rol))
    return NextResponse.json({ error: "Datos inválidos (contraseña mínimo 6 caracteres)" }, { status: 400 });

  const { data, error } = await sb.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre, rol },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await sb.from("profiles").update({ nombre, rol, nivel: nivel || null }).eq("id", data.user.id);
  return NextResponse.json({ ok: true });
}

// Restablecer contraseña de un usuario
export async function PATCH(req: NextRequest) {
  const sb = await esAdmin(req);
  if (!sb) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id, password } = await req.json();
  if (!id || !password || password.length < 6)
    return NextResponse.json({ error: "Contraseña mínimo 6 caracteres" }, { status: 400 });
  const { error } = await sb.auth.admin.updateUserById(id, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
