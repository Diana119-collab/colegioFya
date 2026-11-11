import Shell from "@/components/Shell";

// El menú y el perfil se cargan una sola vez; al navegar solo cambia el contenido.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
