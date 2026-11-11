"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const sb = supabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return setError("Correo o contraseña incorrectos");
    const { data: p } = await sb.from("profiles").select("rol").eq("id", data.user.id).single();
    router.replace(p?.rol === "profesor" ? "/aula" : p?.rol === "auxiliar" ? "/escaner" : "/admin/estudiantes");
  }

  return (
    <div className="min-h-screen grid place-items-center bg-red-700 p-4">
      <form onSubmit={entrar} className="bg-white rounded-lg p-6 w-full max-w-sm space-y-3">
        <h1 className="text-xl font-bold text-red-700">Fe y Alegría 17</h1>
        <p className="text-sm text-gray-500">Sistema de asistencia</p>
        <input className="border rounded w-full p-2" type="email" placeholder="Correo" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <input className="border rounded w-full p-2" type="password" placeholder="Contraseña" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="bg-red-700 text-white rounded w-full p-2 font-semibold">Ingresar</button>
      </form>
    </div>
  );
}
