# WELD Lavadero en internet

Para que empleados puedan usar la app desde otra ubicacion, necesitas publicarla en un hosting y usar una base de datos en nube.

## Opcion recomendada

- Hosting: Render, Railway, Fly.io o VPS.
- Base de datos: PostgreSQL.
- Seguridad: usuario y contrasena mediante `APP_USER` y `APP_PASSWORD`.

La app ya esta preparada para:

- Usar SQLite local si no existe `DATABASE_URL`.
- Usar PostgreSQL si existe `DATABASE_URL`.
- Pedir usuario/contrasena si configuras `APP_PASSWORD`.

## Variables necesarias

En el hosting configura:

- `DATABASE_URL`: conexion PostgreSQL.
- `APP_USER`: usuario para entrar, por ejemplo `admin`.
- `APP_PASSWORD`: contrasena fuerte.
- `PORT`: normalmente lo define el hosting automaticamente.

## Render

Este proyecto incluye `render.yaml`. En Render puedes crear un nuevo Blueprint desde el repositorio y Render creara:

- Servicio web de Python.
- Base de datos PostgreSQL.
- Variable `DATABASE_URL`.

Luego define manualmente `APP_PASSWORD`.

## Importante

No subas `lavadero.db` como base compartida para todos. Ese archivo es solo para uso local. En internet usa PostgreSQL.

## Direccion para empleados

Cuando el hosting termine, te dara una URL parecida a:

`https://weld-lavadero.onrender.com`

Los empleados entran desde cualquier lugar con esa direccion, usuario y contrasena.
