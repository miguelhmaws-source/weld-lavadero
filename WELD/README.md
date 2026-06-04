# WELD Lavadero

Aplicacion web local para administrar un lavadero de autos.

## Como usar con base de datos

Haz doble clic en `Iniciar WELD Lavadero.bat`.

Eso abre la aplicacion en el navegador y crea/usa la base de datos local `lavadero.db`.

Importante: deja abierta la ventana negra del servidor mientras uses la aplicacion.

## Como usar desde internet

Lee [DEPLOY_INTERNET.md](C:/Users/Admin/Documents/WELD/DEPLOY_INTERNET.md).

La app ya puede trabajar con PostgreSQL en nube usando la variable `DATABASE_URL` y puede pedir usuario/contrasena con `APP_USER` y `APP_PASSWORD`.

## Uso sin servidor

Tambien puedes abrir `index.html` directamente, pero en ese modo la informacion se guarda en `localStorage` del navegador y no en `lavadero.db`.

## Funciones incluidas

- Panel diario con ingresos, egresos, utilidad, cola y tiempos.
- Botones para abrir negocio, cerrar negocio y cerrar sesion.
- Registro de vehiculos con placa, cliente, servicio, empleado y metodo de pago.
- Cola de espera con estados: espera, lavado, secado, finalizado, entregado y cancelado.
- Temporizador real para autos en lavado o secado.
- Envio de recibo por WhatsApp desde cada vehiculo.
- Registro de egresos y cierre estimado de caja.
- Historial de clientes.
- Productividad por empleado y comisiones.
- Inventario con alertas de stock bajo.
- Reportes basicos historicos.
- Exportacion de datos en Excel `.xlsx`.

## Archivos

- `index.html`: estructura principal.
- `styles.css`: estilos visuales y responsive.
- `app.js`: logica de negocio y persistencia local.
- `server.py`: servidor local y API para guardar en SQLite.
- `lavadero.db`: base de datos SQLite local.
- `Iniciar WELD Lavadero.bat`: acceso para iniciar la app con base de datos.
- `requirements.txt`: dependencia para PostgreSQL en nube.
- `render.yaml`: configuracion para publicar en Render.
- `DEPLOY_INTERNET.md`: guia para usar la app desde internet.

## Siguiente mejora recomendada

Conectar una base de datos real y agregar login por roles: administrador, cajero, operario y supervisor.
