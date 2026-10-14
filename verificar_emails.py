#!/usr/bin/env python3
"""
Verificador de correos electrónicos.

Lee un JSON con correos y devuelve, para cada uno, si existe o no.

Formatos de entrada aceptados:
    ["a@ejemplo.com", "b@ejemplo.com"]
    {"emails": ["a@ejemplo.com", "b@ejemplo.com"]}

Uso:
    python verificar_emails.py entrada.json
    python verificar_emails.py entrada.json -o resultado.json
    python verificar_emails.py entrada.json --sin-smtp      (solo formato + dominio)

Requisito:
    pip install dnspython

Estados posibles en el resultado:
    existe            -> el servidor confirmó que la casilla existe
    no_existe         -> el servidor rechazó la casilla (error 550 y similares)
    formato_invalido  -> la dirección está mal escrita
    dominio_invalido  -> el dominio no existe o no recibe correo
    catch_all         -> el dominio acepta cualquier dirección; no se puede saber
    desconocido       -> el servidor no respondió, bloqueó la consulta o fue ambiguo
    dominio_valido    -> (solo con --sin-smtp) formato y dominio correctos
"""

import argparse
import json
import random
import re
import smtplib
import socket
import string
import sys
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

try:
    import dns.resolver
except ImportError:
    sys.exit("Falta la librería dnspython. Instalala con: pip install dnspython")


# --- Configuración -----------------------------------------------------------

TIMEOUT = 10                      # segundos por conexión
HILOS = 10                        # correos verificados en paralelo
REMITENTE = "verificador@example.com"   # cambialo por una dirección de tu dominio
HELO = "example.com"                    # cambialo por tu dominio

PATRON_EMAIL = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)

DESECHABLES = {
    "mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com",
    "yopmail.com", "trashmail.com", "temp-mail.org", "getnada.com",
    "sharklasers.com", "dispostable.com", "maildrop.cc", "throwawaymail.com",
}


# --- Verificaciones ----------------------------------------------------------

def formato_valido(email: str) -> bool:
    return len(email) <= 254 and bool(PATRON_EMAIL.match(email))


class ErrorDNS(Exception):
    """No se pudo consultar el DNS (sin conexión, timeout, etc.)."""


@lru_cache(maxsize=None)
def servidores_mx(dominio: str) -> tuple:
    """
    Devuelve los servidores de correo del dominio, ordenados por prioridad.
    Tupla vacía = el dominio no existe o no recibe correo.
    Lanza ErrorDNS si no se pudo hacer la consulta.
    """
    try:
        respuestas = dns.resolver.resolve(dominio, "MX", lifetime=TIMEOUT)
        registros = sorted(respuestas, key=lambda r: r.preference)
        mxs = tuple(str(r.exchange).rstrip(".") for r in registros)
        # Un MX "." (RFC 7505) significa que el dominio no acepta correo
        return tuple(m for m in mxs if m)
    except dns.resolver.NXDOMAIN:
        return ()
    except dns.resolver.NoAnswer:
        # Sin MX: según el estándar se puede usar el registro A del dominio
        try:
            dns.resolver.resolve(dominio, "A", lifetime=TIMEOUT)
            return (dominio,)
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
            return ()
        except Exception as e:
            raise ErrorDNS(str(e))
    except Exception as e:
        raise ErrorDNS(str(e))


def consultar_smtp(mx: str, destinatarios: list) -> list:
    """
    Pregunta al servidor por cada destinatario sin enviar ningún mensaje.
    Devuelve una lista de códigos de respuesta (o None si falló).
    """
    codigos = []
    with smtplib.SMTP(mx, 25, timeout=TIMEOUT) as smtp:
        smtp.ehlo(HELO)
        if smtp.has_extn("starttls"):
            try:
                smtp.starttls()
                smtp.ehlo(HELO)
            except Exception:
                pass
        smtp.mail(REMITENTE)
        for dest in destinatarios:
            try:
                codigo, _ = smtp.rcpt(dest)
            except smtplib.SMTPServerDisconnected:
                codigo = None
            codigos.append(codigo)
    return codigos


@lru_cache(maxsize=None)
def es_catch_all(dominio: str, mx: str) -> bool:
    """Prueba una dirección inventada: si el servidor la acepta, acepta todo."""
    falso = "".join(random.choices(string.ascii_lowercase + string.digits, k=20))
    try:
        codigo = consultar_smtp(mx, [f"{falso}@{dominio}"])[0]
        return codigo is not None and 200 <= codigo < 300
    except Exception:
        return False


def verificar(email: str, usar_smtp: bool = True) -> dict:
    email = email.strip()
    resultado = {"email": email, "estado": None, "detalle": ""}

    if not formato_valido(email):
        resultado.update(estado="formato_invalido", detalle="La dirección está mal escrita")
        return resultado

    dominio = email.rsplit("@", 1)[1].lower()
    desechable = dominio in DESECHABLES
    if desechable:
        resultado["desechable"] = True

    try:
        mxs = servidores_mx(dominio)
    except ErrorDNS as e:
        resultado.update(estado="desconocido", detalle=f"No se pudo consultar el DNS: {e}")
        return resultado
    if not mxs:
        resultado.update(estado="dominio_invalido", detalle="El dominio no recibe correo")
        return resultado

    if not usar_smtp:
        resultado.update(estado="dominio_valido", detalle="Formato y dominio correctos (sin verificación SMTP)")
        return resultado

    ultimo_error = ""
    for mx in mxs[:2]:   # probamos hasta 2 servidores
        try:
            codigo = consultar_smtp(mx, [email])[0]
        except (socket.timeout, TimeoutError):
            ultimo_error = f"Tiempo de espera agotado con {mx}"
            continue
        except (ConnectionRefusedError, OSError, smtplib.SMTPException) as e:
            ultimo_error = f"No se pudo conectar a {mx}: {e}"
            continue

        if codigo is None:
            ultimo_error = f"{mx} cortó la conexión"
            continue
        if 200 <= codigo < 300:
            if es_catch_all(dominio, mx):
                resultado.update(estado="catch_all",
                                 detalle="El dominio acepta cualquier dirección; no se puede confirmar")
            else:
                resultado.update(estado="existe", detalle=f"Aceptado por {mx} ({codigo})")
            return resultado
        if codigo in (550, 551, 553, 554):
            resultado.update(estado="no_existe", detalle=f"Rechazado por {mx} ({codigo})")
            return resultado
        # 4xx (greylisting, límite de consultas) u otros códigos: ambiguo
        ultimo_error = f"Respuesta ambigua de {mx} ({codigo})"

    resultado.update(estado="desconocido", detalle=ultimo_error or "Sin respuesta concluyente")
    return resultado


# --- Entrada / salida --------------------------------------------------------

def cargar_emails(ruta: str) -> list:
    with open(ruta, encoding="utf-8") as f:
        datos = json.load(f)
    if isinstance(datos, dict):
        datos = datos.get("emails", [])
    if not isinstance(datos, list):
        sys.exit('El JSON debe ser una lista de correos o {"emails": [...]}')
    # Elimina duplicados manteniendo el orden
    vistos, emails = set(), []
    for e in datos:
        if isinstance(e, str) and e.strip().lower() not in vistos:
            vistos.add(e.strip().lower())
            emails.append(e.strip())
    return emails


def main():
    parser = argparse.ArgumentParser(description="Verifica si una lista de correos existe.")
    parser.add_argument("entrada", help="Archivo JSON con los correos")
    parser.add_argument("-o", "--salida", help="Archivo JSON donde guardar el resultado")
    parser.add_argument("--sin-smtp", action="store_true",
                        help="Verificar solo formato y dominio (más rápido, no usa el puerto 25)")
    args = parser.parse_args()

    emails = cargar_emails(args.entrada)
    if not emails:
        sys.exit("No se encontraron correos en el archivo.")

    print(f"Verificando {len(emails)} correos...", file=sys.stderr)
    with ThreadPoolExecutor(max_workers=HILOS) as pool:
        resultados = list(pool.map(lambda e: verificar(e, not args.sin_smtp), emails))

    resumen = {}
    for r in resultados:
        resumen[r["estado"]] = resumen.get(r["estado"], 0) + 1

    salida = {"total": len(resultados), "resumen": resumen, "resultados": resultados}
    texto = json.dumps(salida, indent=2, ensure_ascii=False)

    if args.salida:
        with open(args.salida, "w", encoding="utf-8") as f:
            f.write(texto)
        print(f"Resultado guardado en {args.salida}", file=sys.stderr)
    else:
        print(texto)


if __name__ == "__main__":
    main()
