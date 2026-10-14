// Traduce los estados técnicos de la API a algo legible y los agrupa
// en tres categorías: vigente, no vigente y no confirmado.

export const GRUPOS = {
  vigente: { etiqueta: "Vigente", descripcion: "El servidor confirmó que la casilla existe" },
  no_vigente: { etiqueta: "No vigente", descripcion: "La dirección no existe o no puede recibir correo" },
  dudoso: { etiqueta: "No confirmado", descripcion: "No se pudo saber con certeza" },
};

export const ESTADOS = {
  existe: { etiqueta: "Existe", grupo: "vigente" },
  no_existe: { etiqueta: "No existe", grupo: "no_vigente" },
  formato_invalido: { etiqueta: "Formato inválido", grupo: "no_vigente" },
  dominio_invalido: { etiqueta: "Dominio inválido", grupo: "no_vigente" },
  catch_all: { etiqueta: "Acepta todo (catch-all)", grupo: "dudoso" },
  desconocido: { etiqueta: "Sin respuesta", grupo: "dudoso" },
  dominio_valido: { etiqueta: "Dominio válido", grupo: "dudoso" },
};

export function infoEstado(estado) {
  const info = ESTADOS[estado] ?? { etiqueta: estado, grupo: "dudoso" };
  return { ...info, grupoEtiqueta: GRUPOS[info.grupo].etiqueta };
}
