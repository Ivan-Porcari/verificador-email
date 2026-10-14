# Verificador de correos electrónicos

Herramienta local para comprobar si una dirección de correo existe **antes de enviarle un mensaje**, sin llegar a enviarlo.

Incluye tres formas de uso:

- **Script de línea de comandos**: lee un JSON con correos y devuelve el resultado de cada uno.
- **API REST con FastAPI**: para consultar un correo o una lista desde otras aplicaciones.
- **Frontend en React**: permite cargar un Excel o pegar una lista, ver los resultados y descargarlos.

Todo corre en tu computadora (`127.0.0.1`), sin base de datos y sin servicios externos.

---

## ¿Cómo funciona?

Cada correo pasa por varias verificaciones, de la más simple a la más completa:

1. **Formato.** Revisa que la dirección esté bien escrita (`usuario@dominio.tld`).
2. **Dominio (registros MX).** Consulta el DNS para comprobar que el dominio existe y tiene servidores de correo.
3. **Buzón (SMTP).** Se conecta al servidor de correo del dominio y pregunta si acepta al destinatario (`RCPT TO`). Corta la conexión antes de enviar nada.
4. **Detección de catch-all.** Pregunta por una dirección inventada al azar. Si el servidor también la acepta, quiere decir que acepta cualquier dirección y no se puede confirmar el correo real.

Además, marca los correos de servicios **desechables** (mailinator, yopmail, etc.).

## Resultados posibles

| Estado | Grupo en el frontend | Significado |
|---|---|---|
| `existe` | ✅ Vigente | El servidor confirmó que la casilla existe |
| `no_existe` | ❌ No vigente | El servidor rechazó la casilla (error 550 o similar) |
| `formato_invalido` | ❌ No vigente | La dirección está mal escrita |
| `dominio_invalido` | ❌ No vigente | El dominio no existe o no recibe correo |
| `catch_all` | ⚠️ No confirmado | El dominio acepta cualquier dirección |
| `desconocido` | ⚠️ No confirmado | El servidor no respondió, bloqueó la consulta o fue ambiguo |
| `dominio_valido` | ⚠️ No confirmado | Solo con `sin_smtp`: el formato y el dominio son correctos |

---

## Estructura del proyecto

```
verificador-email/
├── verificar_emails.py   # Lógica de verificación + script de línea de comandos
├── api.py                # API REST (FastAPI)
├── requirements.txt      # Dependencias de Python
├── emails.json           # Ejemplo de entrada
└── frontend/             # Interfaz web (React + Vite)
    ├── src/
    ├── package.json
    └── vite.config.js
```

## Requisitos

- **Python 3.10 o superior**
- **Node.js** (solo para el frontend). Podés instalarlo desde [nodejs.org](https://nodejs.org) o dentro del entorno virtual con `nodeenv` (ver abajo).
- **Puerto 25 saliente abierto** para la verificación SMTP. Ver [Limitaciones](#limitaciones).

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/Ivan-Porcari/verificador-email.git
cd verificador-email
```

### 2. Crear y activar el entorno virtual de Python

**Windows (PowerShell):**

```powershell
py -m venv venv
.\venv\Scripts\Activate.ps1
```

> Si PowerShell muestra el error *"la ejecución de scripts está deshabilitada"*, ejecutá una sola vez:
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

**Linux / macOS:**

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Instalar las dependencias de Python

```bash
pip install -r requirements.txt
```

### 4. (Opcional) Instalar Node.js dentro del entorno virtual

Si no tenés Node.js instalado en el sistema:

```bash
pip install nodeenv
nodeenv -p
```

Después desactivá y volvé a activar el entorno, y verificá con `node --version`.

### 5. Instalar las dependencias del frontend

```bash
cd frontend
npm install
cd ..
```

### 6. Configurar tu dominio

Al principio de `verificar_emails.py`, cambiá estos valores por los de tu dominio. Algunos servidores rechazan las consultas que se identifican como `example.com`.

```python
REMITENTE = "verificador@tudominio.com"
HELO = "tudominio.com"
```

---

## Uso

### Opción 1: Frontend web

Abrí dos terminales, con el entorno virtual activado en ambas.

**Terminal 1, la API** (desde la raíz del proyecto):

```bash
python api.py
```

**Terminal 2, el frontend:**

```bash
cd frontend
npm run dev
```

Abrí **http://127.0.0.1:5173** en el navegador.

Desde ahí podés:

- Arrastrar un **Excel (`.xlsx`)**, **CSV** o **TXT**. Busca correos en todas las hojas y columnas y descarta los duplicados.
- Pegar una lista de correos.
- Verificar un solo correo.
- Filtrar los resultados por grupo, buscar un correo y **descargar el resultado en Excel**.
- Activar **"Solo formato y dominio"** para una verificación rápida sin SMTP.

### Opción 2: API REST

Con `python api.py` corriendo, la documentación interactiva queda en **http://127.0.0.1:8000/docs**.

**Verificar un correo:**

```bash
curl "http://127.0.0.1:8000/verificar?email=alguien@ejemplo.com"
```

```json
{
  "email": "alguien@ejemplo.com",
  "estado": "existe",
  "detalle": "Aceptado por mx.ejemplo.com (250)"
}
```

**Verificar una lista** (máximo 500 correos por pedido):

```bash
curl -X POST "http://127.0.0.1:8000/verificar-lista" \
  -H "Content-Type: application/json" \
  -d '{"emails": ["uno@ejemplo.com", "otro@ejemplo.com"]}'
```

```json
{
  "total": 2,
  "resumen": { "existe": 1, "no_existe": 1 },
  "resultados": [
    { "email": "uno@ejemplo.com", "estado": "existe", "detalle": "Aceptado por mx.ejemplo.com (250)" },
    { "email": "otro@ejemplo.com", "estado": "no_existe", "detalle": "Rechazado por mx.ejemplo.com (550)" }
  ]
}
```

Los dos endpoints aceptan el parámetro `?sin_smtp=true` para validar solo formato y dominio.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/verificar?email=...` | Verifica un correo |
| `POST` | `/verificar-lista` | Verifica una lista (`{"emails": [...]}` o `[...]`) |

### Opción 3: Línea de comandos

```bash
python verificar_emails.py emails.json                    # muestra el resultado en pantalla
python verificar_emails.py emails.json -o resultado.json  # lo guarda en un archivo
python verificar_emails.py emails.json --sin-smtp         # solo formato y dominio
```

El archivo de entrada puede ser una lista (`["a@x.com", "b@x.com"]`) o un objeto (`{"emails": [...]}`).

---

## Limitaciones

La verificación SMTP es la mejor aproximación posible sin enviar un correo, pero **no es 100 % confiable**:

- **Puerto 25 bloqueado.** Muchos proveedores de internet hogareños y nubes como AWS, GCP y Azure bloquean el puerto 25 saliente. En ese caso todos los resultados salen como `desconocido`. Para comprobarlo en Windows:
  ```powershell
  Test-NetConnection gmail-smtp-in.l.google.com -Port 25
  ```
- **Dominios catch-all.** Algunos servidores aceptan cualquier dirección, por seguridad o porque tienen un filtro antispam delante. En esos casos no se puede confirmar el correo.
- **Grandes proveedores.** Gmail, Outlook y Yahoo a veces responden de forma ambigua para evitar que se adivinen cuentas.
- **Greylisting y límites.** Algunos servidores rechazan temporalmente la primera consulta (código 4xx), y el resultado queda como `desconocido`.
- **Reputación de tu IP.** Hacer muchas consultas seguidas puede hacer que tu IP termine en listas negras. Conviene verificar listas grandes por partes.

La única forma 100 % segura de confirmar que una persona recibe tus correos es la **doble confirmación** (double opt-in): enviarle un enlace que tenga que abrir.

## Privacidad

- Todo corre localmente. La API escucha solo en `127.0.0.1`, así que no es accesible desde otras máquinas.
- No se guarda nada en ninguna base de datos.
- El `.gitignore` excluye los archivos `.xlsx`, `.csv` y `resultado*.json` para no subir listas de correos reales al repositorio.

## Tecnologías

- **Backend:** Python, FastAPI, Uvicorn, dnspython
- **Frontend:** React, Vite, ExcelJS
