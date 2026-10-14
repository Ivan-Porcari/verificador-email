// Lectura de correos desde texto o archivos (Excel / CSV) y exportación a Excel.
// exceljs se carga recién cuando hace falta, para que la página abra rápido.

import { infoEstado } from "./estados";

/**
 * Busca correos en un texto. Toma cualquier "palabra" que contenga @,
 * aunque esté mal escrita, para que la API la marque como formato inválido
 * en lugar de ignorarla en silencio.
 */
export function extraerCorreos(texto) {
  const vistos = new Set();
  const correos = [];
  for (const parte of String(texto).split(/[\s,;]+/)) {
    const limpio = parte
      .replace(/^mailto:/i, "")
      .replace(/^[<("'[]+|[>)"'\].]+$/g, "")
      .trim();
    if (!limpio.includes("@")) continue;
    const clave = limpio.toLowerCase();
    if (!vistos.has(clave)) {
      vistos.add(clave);
      correos.push(limpio);
    }
  }
  return correos;
}

/** Lee un .xlsx, .csv o .txt y devuelve los correos encontrados. */
export async function leerArchivo(archivo) {
  const nombre = archivo.name.toLowerCase();

  if (nombre.endsWith(".csv") || nombre.endsWith(".txt")) {
    const correos = extraerCorreos(await archivo.text());
    return { correos, detalle: `${archivo.name}` };
  }

  if (nombre.endsWith(".xls")) {
    throw new Error(
      "El formato .xls (Excel 97-2003) no es compatible. Abrilo en Excel y guardalo como .xlsx."
    );
  }

  if (!nombre.endsWith(".xlsx")) {
    throw new Error("Formato no compatible. Usá un archivo .xlsx, .csv o .txt.");
  }

  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(await archivo.arrayBuffer());
  } catch {
    throw new Error("No se pudo leer el archivo. ¿Está dañado o protegido con contraseña?");
  }

  // Junta el texto de todas las celdas de todas las hojas
  const textos = [];
  const hojas = [];
  libro.eachSheet((hoja) => {
    hojas.push(hoja.name);
    hoja.eachRow({ includeEmpty: false }, (fila) => {
      fila.eachCell({ includeEmpty: false }, (celda) => {
        const valor = celda.value;
        if (valor && typeof valor === "object" && typeof valor.hyperlink === "string") {
          textos.push(valor.hyperlink);
        }
        textos.push(celda.text ?? "");
      });
    });
  });

  const correos = extraerCorreos(textos.join("\n"));
  const detalleHojas = hojas.length === 1 ? "1 hoja" : `${hojas.length} hojas`;
  return { correos, detalle: `${archivo.name} (${detalleHojas})` };
}

const COLORES = {
  vigente: "FFD9F2E3",
  no_vigente: "FFFADBD8",
  dudoso: "FFFCEFD2",
};

/** Descarga un .xlsx con los resultados. */
export async function exportarResultados(resultados) {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Resultados");

  hoja.columns = [
    { header: "Correo", key: "email", width: 38 },
    { header: "Resultado", key: "grupo", width: 16 },
    { header: "Estado", key: "estado", width: 24 },
    { header: "Desechable", key: "desechable", width: 12 },
    { header: "Detalle", key: "detalle", width: 60 },
  ];

  for (const r of resultados) {
    const info = infoEstado(r.estado);
    const fila = hoja.addRow({
      email: r.email,
      grupo: info.grupoEtiqueta,
      estado: info.etiqueta,
      desechable: r.desechable ? "Sí" : "",
      detalle: r.detalle,
    });
    fila.getCell("grupo").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORES[info.grupo] },
    };
  }

  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true };
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  hoja.autoFilter = { from: "A1", to: "E1" };

  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const fecha = new Date().toISOString().slice(0, 10);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = `verificacion-correos-${fecha}.xlsx`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}
