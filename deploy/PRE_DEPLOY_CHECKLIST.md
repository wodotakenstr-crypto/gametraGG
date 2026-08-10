# Despliegue de GameTrade

## Antes de conectar el dominio

1. Resuelve los errores pendientes de `dpkg`, `openssh-server` y `rsyslog` en el VPS.
2. Actualiza el sistema y habilita firewall: SSH, HTTP y HTTPS solamente.
3. Crea el usuario Linux `gametrade` sin permisos de root para ejecutar la aplicación.
4. Instala Node.js LTS, PostgreSQL, Nginx, Certbot y el plugin de Nginx.

## Base de datos

1. Crea una base `gametrade` y un usuario PostgreSQL con contraseña propia.
2. Crea `/etc/gametrade/gametrade.env` a partir de `.env.example`.
3. Configura `NODE_ENV=production`, `DATABASE_URL`, SMTP Brevo, `ADMIN_EMAIL` y `USDT_TRC20_DEPOSIT_ADDRESS`.
4. Protege el archivo: propietario `gametrade`, permisos `600`.
5. Ejecuta `npm ci` y después `npm run db:migrate` dentro de `/opt/gametrade`.

## Servicio y HTTPS

1. Instala y habilita `deploy/gametrade.service`.
2. Copia `deploy/gametrade.bootstrap.nginx.conf` para arrancar Nginx por HTTP.
3. Verifica que `http://gametradegg.com/api/health` responda correctamente.
4. Ejecuta Certbot para crear el certificado de `gametradegg.com` y `www.gametradegg.com`.
5. Sustituye el archivo temporal por `deploy/gametrade.nginx.conf` y recarga Nginx.
6. Comprueba la redirección HTTP a HTTPS y que `/smtp-setup.html` devuelva `404` desde internet.

## Respaldos y pruebas

1. Crea `/var/backups/gametrade` con propiedad de `gametrade`.
2. Habilita `gametrade-backup.service` y `gametrade-backup.timer`.
3. Copia los respaldos fuera del VPS y prueba una restauración antes del lanzamiento.
4. Prueba con dos cuentas: pago USDT, hash, confirmación admin, entrega, confirmación, crédito a billetera, retiro y registro de hash de salida.
5. Verifica que nunca se soliciten ni almacenen contraseñas de juegos, frase semilla, claves privadas, códigos 2FA ni credenciales de Binance.

No habilites pagos públicos hasta completar todas las pruebas anteriores.
