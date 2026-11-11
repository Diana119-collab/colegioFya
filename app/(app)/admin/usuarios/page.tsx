"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type P = { id: string; nombre: string; email: string | null; rol: string; nivel: string | null; activo: boolean };

async function api(method: "POST" | "PATCH", body: object) {
  const { data } = await supabase().auth.getSession();
  const r = await fetch("/api/usuarios", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
    body: JSON.stringify(body),
  });
  return (await r.json()) as { ok?: boolean; error?: string };
}

function FilaUsuario({ u, onGuardar, onClave }: {
  u: P; onGuardar: (id: string, c: Partial<P>) => Promise<void>; onClave: (u: P) => void;
}) {
  const [d, setD] = useState({ nombre: u.nombre, rol: u.rol, nivel: u.nivel ?? "", activo: u.activo });
  const [guardando, setGuardando] = useState(false);
  const cambiado = d.nombre !== u.nombre || d.rol !== u.rol || d.nivel !== (u.nivel ?? "") || d.activo !== u.activo;

  async function guardar() {
    setGuardando(true);
    await onGuardar(u.id, { nombre: d.nombre.trim(), rol: d.rol, nivel: d.rol === "auxiliar" ? d.nivel || null : null, activo: d.activo });
    setGuardando(false);
  }

  return (
    <tr className={`border-b ${cambiado ? "bg-amber-50" : ""}`}>
      <td className="p-2"><input className="border rounded p-1" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} /></td>
      <td className="text-gray-700">{u.email ?? "—"}</td>
      <td><select className="border rounded p-1" value={d.rol} onChange={(e) => setD({ ...d, rol: e.target.value })}>
        <option value="admin">Administrador</option><option value="profesor">Profesor</option><option value="auxiliar">Auxiliar</option></select></td>
      <td><select className="border rounded p-1 disabled:opacity-40" disabled={d.rol !== "auxiliar"} value={d.nivel} onChange={(e) => setD({ ...d, nivel: e.target.value })}>
        <option value="">Todos</option><option value="inicial">Inicial</option><option value="primaria">Primaria</option><option value="secundaria">Secundaria</option></select></td>
      <td><input type="checkbox" checked={d.activo} onChange={(e) => setD({ ...d, activo: e.target.checked })} /></td>
      <td className="whitespace-nowrap">
        <button onClick={guardar} disabled={!cambiado || guardando}
          className="bg-red-700 text-white px-3 py-1 rounded mr-3 disabled:opacity-30">{guardando ? "…" : "Guardar"}</button>
        <button onClick={() => onClave(u)} className="text-red-700 underline">Cambiar contraseña</button>
      </td>
    </tr>
  );
}

export default function Usuarios() {
  const [lista, setLista] = useState<P[]>([]);
  const [f, setF] = useState({ nombre: "", email: "", password: "", rol: "profesor", nivel: "" });
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    const { data } = await supabase().rpc("lista_usuarios");
    setLista((data ?? []) as P[]);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function cambiar(id: string, campos: Partial<P>) {
    await supabase().from("profiles").update(campos).eq("id", id);
    cargar();
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Creando…");
    const r = await api("POST", f);
    if (r.error) return setMsg("Error: " + r.error);
    setMsg(`Usuario creado: ${f.email}`);
    setF({ nombre: "", email: "", password: "", rol: "profesor", nivel: "" });
    cargar();
  }

  async function nuevaClave(u: P) {
    const password = prompt(`Nueva contraseña para ${u.nombre} (mínimo 6 caracteres):`);
    if (!password) return;
    const r = await api("PATCH", { id: u.id, password });
    alert(r.error ? "Error: " + r.error : "Contraseña actualizada");
  }

  const inp = "border rounded p-2";
  return (
    <>
      <h2 className="text-2xl font-bold mb-4">Usuarios</h2>
      <form onSubmit={crear} className="bg-white border rounded p-3 mb-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <input className={inp} placeholder="Nombre completo" required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <input className={inp} type="email" placeholder="Correo" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input className={inp} type="text" placeholder="Contraseña (mín. 6)" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <select className={inp} value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}>
          <option value="profesor">Profesor</option><option value="auxiliar">Auxiliar</option><option value="admin">Administrador</option>
        </select>
        <select className={inp} value={f.nivel} onChange={(e) => setF({ ...f, nivel: e.target.value })} disabled={f.rol !== "auxiliar"}>
          <option value="">Nivel: todos</option><option value="inicial">Inicial</option><option value="primaria">Primaria</option><option value="secundaria">Secundaria</option>
        </select>
        <button className="bg-red-700 text-white rounded p-2">Crear usuario</button>
        {msg && <p className="text-sm sm:col-span-2 lg:col-span-3">{msg}</p>}
      </form>

      <div className="bg-white border rounded overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b"><th className="p-2">Nombre</th><th>Correo</th><th>Rol</th><th>Nivel (auxiliar)</th><th>Activo</th><th /></tr></thead>
          <tbody>{lista.map((u) => (
            <FilaUsuario key={u.id} u={u} onGuardar={cambiar} onClave={nuevaClave} />
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
