# GameTrade

Marketplace local para ofertas de monedas, items y servicios de videojuegos.

## Ejecutar

```powershell
& "C:\Program Files\nodejs\npm.cmd" start
```

Abrir `http://localhost:3000`.

## Estado actual

- Ofertas organizadas por juego y tipo de producto.
- Búsqueda, filtros y traducciones de interfaz.
- Cuentas de comprador y vendedor con sesiones locales.
- Ofertas, pedidos, chat privado, disputas y notificaciones.
- Panel de vendedor para gestionar ofertas y solicitar verificación.
- Panel administrativo para verificar vendedores, moderar ofertas y resolver disputas.
- En desarrollo, datos de demostración persistidos en `data/store.json`.

## PostgreSQL en producción

Producción (`NODE_ENV=production`) usa exclusivamente PostgreSQL y no lee ni escribe `data/store.json`. Define `DATABASE_URL` junto a los demás secretos y ejecuta una vez:

```powershell
$env:DATABASE_URL = "postgresql://usuario:contraseña@host:5432/gametrade"
& "C:\Program Files\nodejs\npm.cmd" run db:migrate
```

La migración crea `gametrade.app_state` con un estado vacío y es idempotente: nunca sobrescribe un estado existente. No importa `data/store.json`, para evitar publicar por accidente cuentas, pedidos o datos de desarrollo.

Solo para una importación local revisada y deliberada, antes de un despliegue y contra una base de datos vacía, usa:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run db:migrate:import-local
```

Este comando puede importar datos de desarrollo, incluidos perfiles, mensajes y transacciones de ejemplo. Revísalos y no lo uses como paso normal de producción.

Para crear una copia JSON sin exponerla por HTTP:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run db:export > gametrade-backup.json
```

## Administrador local

Define el correo de una cuenta existente y con correo verificado antes de iniciar el servidor. Solo esa cuenta verá la opción `Administración` en su menú personal:

```powershell
$env:ADMIN_EMAIL = "tu-correo@ejemplo.com"
& "C:\Program Files\nodejs\npm.cmd" start
```

No uses este método como solución final de producción. En el despliegue se debe configurar el valor como secreto del servidor.

## Verificación de correo

Los vendedores deben verificar su correo con un código de seis dígitos antes de publicar o solicitar verificación de vendedor. Configura un proveedor SMTP antes de usarlo fuera de desarrollo:

```powershell
$env:SMTP_HOST = "smtp.tu-proveedor.com"
$env:SMTP_PORT = "587"
$env:SMTP_USER = "usuario-smtp"
$env:SMTP_PASSWORD = "contraseña-o-token-smtp"
$env:FROM_EMAIL = "no-reply@tu-dominio.com"
& "C:\Program Files\nodejs\npm.cmd" start
```

Sin esas variables, el servidor no envía ningún código al navegador ni por correo; solo registra el código en su consola local para desarrollo.

Para Brevo, usa `start-gametrade.ps1`: solicita la clave SMTP de forma oculta y la mantiene solo mientras el servidor esté abierto.

## Antes de aceptar pagos reales

- Programar copias de seguridad de PostgreSQL y comprobar restauraciones.
- Obtener aprobación explícita del proveedor para marketplace y bienes virtuales.
- Configurar credenciales PayPal Business como secretos del servidor, nunca en el navegador ni en el repositorio.
- Seleccionar un proveedor de custodia o pagos USDT y definir su proceso KYC/AML.
- Implementar webhooks de pago, conciliación contable, límites y revisión de retiros.
- Publicar términos, política de privacidad, reglas de disputa y productos prohibidos.

## Comisión y retiro

- Comisión de GameTrade para nuevos pedidos: `5%`.
- Tarifa de retiro prevista: el mayor entre `1%` del monto retirado y `1.00 USDT` de reserva de red más `0.50 USDT` de margen para GameTrade. Antes de aprobar un retiro, el administrador debe comparar esta reserva con el costo real de Binance/TRC20.
- Monto mínimo de retiro previsto: `10 USDT`.
- No se debe mostrar ni cobrar una tarifa de retiro hasta que la billetera, confirmación de pagos y retiros reales estén integrados.

## Antes de publicar en .com

- Configurar el dominio y DNS hacia el VPS.
- Instalar HTTPS con Let's Encrypt y Nginx como proxy inverso.
- Ejecutar `npm run db:migrate` con `DATABASE_URL` antes del primer arranque de producción.
- Configurar copias de seguridad automáticas de base de datos y archivos.
- Definir secretos persistentes del servidor para Brevo, administrador y pagos.
- Configurar `ADMIN_EMAIL`, revisar vendedores y probar disputas.
- Publicar datos legales reales, correo de soporte y políticas definitivas.
- Probar registro, verificación de correo, recuperación de contraseña, pedidos y notificaciones con cuentas separadas.

## Configuración persistente del VPS

No copies claves SMTP al repositorio. En el VPS crea `/etc/gametrade/gametrade.env` a partir de `.env.example`, asigna permisos `600` y configura los valores reales de Brevo, `ADMIN_EMAIL` y `USDT_TRC20_DEPOSIT_ADDRESS`.

Los archivos `deploy/gametrade.service` y `deploy/gametrade.nginx.conf` preparan el servicio Node.js, HTTPS y el proxy de Nginx. En producción GameTrade no inicia si faltan `DATABASE_URL`, `ADMIN_EMAIL`, SMTP o `FROM_EMAIL`, comprueba que la migración creó el estado y verifica la conexión SMTP antes de abrir el puerto.

Sigue `deploy/PRE_DEPLOY_CHECKLIST.md` en el VPS. Usa primero `deploy/gametrade.bootstrap.nginx.conf` por HTTP para que Certbot pueda emitir el certificado y luego cambia a la configuración HTTPS.

Las cookies de sesión se marcan automáticamente como `Secure` en `NODE_ENV=production`. Nginx debe terminar HTTPS antes de enviar tráfico a Node.js.

Para el respaldo diario, crea `/var/backups/gametrade`, asigna su propiedad al usuario `gametrade` y habilita `deploy/gametrade-backup.service` junto con `deploy/gametrade-backup.timer`. Conserva las copias fuera del VPS y prueba la restauración antes de publicar.
