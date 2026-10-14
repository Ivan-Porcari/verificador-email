import { useMemo, useRef, useState } from "react";
import { verificarLista, verificarUno } from "./api";
import { exportarResultados, extraerCorreos, leerArchivo } from "./correos";
import { GRUPOS, infoEstado } from "./estados";

const LOTE = 50; // correos por pedido a la API

export default function App() {
  const [pestana, setPestana] = useState("lista");
  const [sinSmtp, setSinSmtp] = useState(false);

  return (
    <div className="app">
      <header className="encabezado">
        <div>
          <h1>Verificador de correos</h1>
          <p className="sub">Comprobá si una dirección existe antes de enviarle un correo.</p>
        </div>
        <label
          className="interruptor"
          title="Más rápido y no usa el puerto 25, pero no confirma si la casilla existe"
        >
          <input
            type="checkbox"
            checked={sinSmtp}
            onChange={(e) => setSinSmtp(e.target.checked)}
          />
          <span className="pista" aria-hidden="true" />
          <span>Solo formato y dominio</span>
        </label>
      </header>

      <nav className="pestanas" role="tablist">
        <button
          role="tab"
          aria-selected={pestana === "lista"}
          className={pestana === "lista" ? "activa" : ""}
          onClick={() => setPestana("lista")}
        >
          Lista o Excel
        </button>
        <button
          role="tab"
          aria-selected={pestana === "uno"}
          className={pestana === "uno" ? "activa" : ""}
          onClick={() => setPestana("uno")}
        >
          Un correo
        </button>
      </nav>

      <div hidden={pestana !== "lista"}>
        <VerificarLista sinSmtp={sinSmtp} />
      </div>
      <div hidden={pestana !== "uno"}>
        <VerificarUno sinSmtp={sinSmtp} />
      </div>

      <footer className="pie">
        API local en 127.0.0.1:8000 · Nada se guarda: todo queda en tu computadora.
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------------- un correo */

function VerificarUno({ sinSmtp }) {
  const [email, setEmail] = useState("");
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  async function enviar(e) {
    e.preventDefault();
    const valor = email.trim();
    if (!valor) return;
    setCargando(true);
    setError("");
    setResultado(null);
    try {
      setResultado(await verificarUno(valor, sinSmtp));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <section className="tarjeta">
      <form className="fila-form" onSubmit={enviar}>
        <input
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck="false"
          placeholder="alguien@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Correo a verificar"
        />
        <button className="primario" disabled={cargando || !email.trim()}>
          {cargando ? "Verificando…" : "Verificar"}
        </button>
      </form>

      {cargando && <p className="nota">Consultando al servidor de correo, puede tardar unos segundos…</p>}
      {error && <Aviso>{error}</Aviso>}
      {resultado && <ResultadoUnico r={resultado} />}
    </section>
  );
}

function ResultadoUnico({ r }) {
  const info = infoEstado(r.estado);
  return (
    <div className={`resultado-unico grupo-${info.grupo}`}>
      <div className="resultado-cabecera">
        <span className={`insignia grande grupo-${info.grupo}`}>{info.grupoEtiqueta}</span>
        <span className="resultado-email">{r.email}</span>
      </div>
      <dl>
        <dt>Estado</dt>
        <dd>{info.etiqueta}</dd>
        <dt>Detalle</dt>
        <dd>{r.detalle || "—"}</dd>
        {r.desechable && (
          <>
            <dt>Aviso</dt>
            <dd>Es un dominio de correo desechable (temporal)</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/* -------------------------------------------------------------------- lista */

function VerificarLista({ sinSmtp }) {
  const [texto, setTexto] = useState("");
  const [origen, setOrigen] = useState("");
  const [errorArchivo, setErrorArchivo] = useState("");
  const [resultados, setResultados] = useState([]);
  const [progreso, setProgreso] = useState({ hechos: 0, total: 0 });
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const controlador = useRef(null);

  const correos = useMemo(() => extraerCorreos(texto), [texto]);

  async function cargarArchivo(archivo) {
    setErrorArchivo("");
    try {
      const { correos: encontrados, detalle } = await leerArchivo(archivo);
      if (encontrados.length === 0) {
        setErrorArchivo(`No se encontraron correos en ${archivo.name}.`);
        return;
      }
      setTexto(encontrados.join("\n"));
      setOrigen(detalle);
    } catch (err) {
      setErrorArchivo(err.message);
    }
  }

  async function iniciar() {
    const lista = correos;
    if (lista.length === 0) return;

    const ctrl = new AbortController();
    controlador.current = ctrl;
    setProcesando(true);
    setError("");
    setResultados([]);
    setFiltro("todos");
    setBusqueda("");
    setProgreso({ hechos: 0, total: lista.length });

    const acumulados = [];
    try {
      for (let i = 0; i < lista.length; i += LOTE) {
        const respuesta = await verificarLista(lista.slice(i, i + LOTE), sinSmtp, ctrl.signal);
        acumulados.push(...respuesta.resultados);
        setResultados([...acumulados]);
        setProgreso({ hechos: Math.min(i + LOTE, lista.length), total: lista.length });
      }
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setProcesando(false);
      controlador.current = null;
    }
  }

  function limpiar() {
    setTexto("");
    setOrigen("");
    setErrorArchivo("");
    setResultados([]);
    setError("");
    setProgreso({ hechos: 0, total: 0 });
  }

  const conteo = useMemo(() => {
    const c = { vigente: 0, no_vigente: 0, dudoso: 0 };
    for (const r of resultados) c[infoEstado(r.estado).grupo]++;
    return c;
  }, [resultados]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return resultados.filter(
      (r) =>
        (filtro === "todos" || infoEstado(r.estado).grupo === filtro) &&
        (!q || r.email.toLowerCase().includes(q))
    );
  }, [resultados, filtro, busqueda]);

  const porcentaje = progreso.total ? Math.round((progreso.hechos / progreso.total) * 100) : 0;

  return (
    <>
      <section className="tarjeta">
        <ZonaArchivo onArchivo={cargarArchivo} deshabilitada={procesando} />
        {errorArchivo && <Aviso>{errorArchivo}</Aviso>}

        <div className="separador"><span>o pegá los correos</span></div>

        <textarea
          rows={6}
          spellCheck="false"
          placeholder={"uno@ejemplo.com\notro@ejemplo.com, tercero@ejemplo.com"}
          value={texto}
          disabled={procesando}
          onChange={(e) => {
            setTexto(e.target.value);
            setOrigen("");
          }}
          aria-label="Lista de correos"
        />

        <div className="acciones">
          <span className="nota">
            {correos.length === 0
              ? "Sin correos todavía"
              : `${correos.length} ${correos.length === 1 ? "correo único" : "correos únicos"}${
                  origen ? ` · desde ${origen}` : ""
                }`}
          </span>
          <div className="botones">
            {(texto || resultados.length > 0) && !procesando && (
              <button className="secundario" onClick={limpiar}>Limpiar</button>
            )}
            {procesando ? (
              <button className="secundario" onClick={() => controlador.current?.abort()}>
                Cancelar
              </button>
            ) : (
              <button className="primario" disabled={correos.length === 0} onClick={iniciar}>
                Verificar {correos.length > 0 ? correos.length : ""}
              </button>
            )}
          </div>
        </div>

        {procesando && (
          <div className="progreso" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100}>
            <div className="progreso-barra" style={{ width: `${porcentaje}%` }} />
            <span>{progreso.hechos} de {progreso.total} · {porcentaje}%</span>
          </div>
        )}
        {error && <Aviso>{error}</Aviso>}
      </section>

      {resultados.length > 0 && (
        <section className="tarjeta">
          <div className="resumen">
            <Filtro activo={filtro === "todos"} onClick={() => setFiltro("todos")} etiqueta="Todos" valor={resultados.length} />
            {Object.entries(GRUPOS).map(([clave, g]) => (
              <Filtro
                key={clave}
                grupo={clave}
                activo={filtro === clave}
                onClick={() => setFiltro(clave)}
                etiqueta={g.etiqueta}
                valor={conteo[clave]}
                titulo={g.descripcion}
              />
            ))}
          </div>

          <div className="barra-tabla">
            <input
              type="search"
              placeholder="Buscar correo…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar en los resultados"
            />
            <button className="secundario" onClick={() => exportarResultados(resultados)} disabled={procesando}>
              Descargar Excel
            </button>
          </div>

          <div className="tabla-contenedor">
            <table>
              <thead>
                <tr>
                  <th>Correo</th>
                  <th>Resultado</th>
                  <th>Estado</th>
                  <th className="col-detalle">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => {
                  const info = infoEstado(r.estado);
                  return (
                    <tr key={r.email}>
                      <td className="celda-email">
                        {r.email}
                        {r.desechable && <span className="etiqueta-chica">desechable</span>}
                      </td>
                      <td><span className={`insignia grupo-${info.grupo}`}>{info.grupoEtiqueta}</span></td>
                      <td>{info.etiqueta}</td>
                      <td className="col-detalle detalle">{r.detalle}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibles.length === 0 && <p className="nota vacia">No hay resultados con ese filtro.</p>}
          </div>
        </section>
      )}
    </>
  );
}

/* --------------------------------------------------------------- auxiliares */

function ZonaArchivo({ onArchivo, deshabilitada }) {
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef(null);

  function soltar(e) {
    e.preventDefault();
    setArrastrando(false);
    if (deshabilitada) return;
    const archivo = e.dataTransfer.files?.[0];
    if (archivo) onArchivo(archivo);
  }

  return (
    <label
      className={`zona-archivo${arrastrando ? " arrastrando" : ""}${deshabilitada ? " deshabilitada" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={soltar}
    >
      <input
        ref={input}
        type="file"
        accept=".xlsx,.csv,.txt"
        disabled={deshabilitada}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) onArchivo(archivo);
          e.target.value = "";
        }}
      />
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </svg>
      <strong>Arrastrá tu Excel acá o hacé clic para elegirlo</strong>
      <span>.xlsx, .csv o .txt · se buscan correos en todas las hojas y columnas</span>
    </label>
  );
}

function Filtro({ activo, onClick, etiqueta, valor, grupo, titulo }) {
  return (
    <button className={`filtro${activo ? " activo" : ""}${grupo ? ` grupo-${grupo}` : ""}`} onClick={onClick} title={titulo}>
      <span className="filtro-valor">{valor}</span>
      <span className="filtro-etiqueta">{etiqueta}</span>
    </button>
  );
}

function Aviso({ children }) {
  return <p className="aviso" role="alert">{children}</p>;
}
