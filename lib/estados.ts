export type EstadoBase = "puntual" | "tardanza" | "falta";
export type Estado = EstadoBase | "tardanza_justificada" | "falta_justificada";
export type Justificacion = { tipo: "falta" | "tardanza"; motivo: string; informado_por: string | null };

export const NOMBRE_ESTADO: Record<Estado, string> = {
  puntual: "Puntual",
  tardanza: "Tardanza",
  tardanza_justificada: "Tardanza justificada",
  falta: "Falta",
  falta_justificada: "Falta justificada",
};

/** La justificación solo aplica si coincide con lo que realmente pasó (faltó o llegó tarde). */
export function estadoEfectivo(base: EstadoBase, j?: Justificacion): Estado {
  if (j && base === "falta" && j.tipo === "falta") return "falta_justificada";
  if (j && base === "tardanza" && j.tipo === "tardanza") return "tardanza_justificada";
  return base;
}

export const asistio = (e: Estado) => e !== "falta" && e !== "falta_justificada";

export const textoJustificacion = (j?: Justificacion) =>
  j ? `${j.tipo === "falta" ? "Falta" : "Tardanza"}: ${j.motivo}${j.informado_por ? ` (informa ${j.informado_por})` : ""}` : "";
