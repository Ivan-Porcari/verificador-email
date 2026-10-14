#!/usr/bin/env python3
"""
API local para verificar correos electrónicos.

Requisitos:
    pip install fastapi uvicorn dnspython

Iniciar (solo accesible desde tu propia máquina):
    python api.py

Documentación interactiva:
    http://127.0.0.1:8000/docs

Endpoints:
    GET  /verificar?email=alguien@ejemplo.com[&sin_smtp=true]
    POST /verificar-lista[?sin_smtp=true]
         body: {"emails": ["a@ejemplo.com", "b@ejemplo.com"]}
           o:  ["a@ejemplo.com", "b@ejemplo.com"]
"""

from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional, Union

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from verificar_emails import HILOS, verificar

HOST = "127.0.0.1"   # solo local; no lo cambies a 0.0.0.0 si no querés exponerla
PUERTO = 8000
MAX_EMAILS = 500     # límite por pedido, para no saturar servidores ajenos

app = FastAPI(
    title="Verificador de correos",
    description="Verifica si una dirección de correo existe (formato, dominio y SMTP).",
    version="1.0.0",
)


class Resultado(BaseModel):
    email: str
    estado: str
    detalle: str
    desechable: Optional[bool] = None


class ListaEmails(BaseModel):
    emails: List[str]


class RespuestaLista(BaseModel):
    total: int
    resumen: dict
    resultados: List[Resultado]


def _verificar_varios(emails: List[str], usar_smtp: bool) -> List[dict]:
    with ThreadPoolExecutor(max_workers=HILOS) as pool:
        return list(pool.map(lambda e: verificar(e, usar_smtp), emails))


@app.get("/verificar", response_model=Resultado, response_model_exclude_none=True,
         summary="Verificar un correo")
async def verificar_uno(
    email: str = Query(..., description="Correo a verificar", examples=["alguien@gmail.com"]),
    sin_smtp: bool = Query(False, description="Validar solo formato y dominio"),
):
    return await run_in_threadpool(verificar, email, not sin_smtp)


@app.post("/verificar-lista", response_model=RespuestaLista, response_model_exclude_none=True,
          summary="Verificar una lista de correos")
async def verificar_lista(
    datos: Union[ListaEmails, List[str]] = Body(
        ..., examples=[{"emails": ["alguien@gmail.com", "otro@ejemplo.com"]}]
    ),
    sin_smtp: bool = Query(False, description="Validar solo formato y dominio"),
):
    emails = datos.emails if isinstance(datos, ListaEmails) else datos

    # Elimina vacíos y duplicados manteniendo el orden
    vistos, unicos = set(), []
    for e in emails:
        clave = e.strip().lower()
        if clave and clave not in vistos:
            vistos.add(clave)
            unicos.append(e.strip())

    if not unicos:
        raise HTTPException(400, "La lista no contiene correos.")
    if len(unicos) > MAX_EMAILS:
        raise HTTPException(400, f"Máximo {MAX_EMAILS} correos por pedido (recibidos: {len(unicos)}).")

    resultados = await run_in_threadpool(_verificar_varios, unicos, not sin_smtp)

    resumen = {}
    for r in resultados:
        resumen[r["estado"]] = resumen.get(r["estado"], 0) + 1

    return {"total": len(resultados), "resumen": resumen, "resultados": resultados}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PUERTO)
