# Verificador de correos: frontend

Interfaz en React (Vite) para la API local de verificación de correos.

## Requisitos

- Node.js (versión LTS) instalado: https://nodejs.org
- La API corriendo en `http://127.0.0.1:8000` (`python api.py` en la carpeta de arriba)

## Primera vez

```powershell
cd frontend
npm install
```

## Uso diario

Dos terminales en VS Code:

1. **API**: en la carpeta `verificador-email`, con el venv activado:
   ```powershell
   python api.py
   ```
2. **Frontend**: en la carpeta `verificador-email\frontend`:
   ```powershell
   npm run dev
   ```

Abrí http://127.0.0.1:5173 en el navegador.

## Qué hace

- **Lista o Excel**: arrastrá un `.xlsx`, `.csv` o `.txt`, o pegá correos. Se buscan correos
  en todas las hojas y columnas, sin duplicados. Se verifican en lotes de 50 y se puede cancelar.
- **Un correo**: verificación individual.
- Resultados agrupados en **Vigente**, **No vigente** y **No confirmado**, con filtro,
  búsqueda y descarga a Excel.
- El interruptor **Solo formato y dominio** evita la consulta SMTP (útil si tu red bloquea el puerto 25).

El frontend reenvía las llamadas de `/api/...` a la API mediante el proxy de Vite
(ver `vite.config.js`), así que no hace falta configurar CORS. Nada se guarda en ninguna base de datos.
