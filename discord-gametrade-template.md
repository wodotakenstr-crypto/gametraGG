# Plantilla Discord: GameTrade

## Identidad del servidor

- Nombre: `GameTrade`
- Descripción: `Comunidad oficial de GameTrade. Compra y vende con seguridad dentro de gametradegg.com.`
- Icono sugerido: el logo `G` de GameTrade sobre fondo azul oscuro.
- Regla principal: los pedidos, pagos, entregas y disputas se realizan solo en GameTrade. Discord no es un medio de pago ni de entrega.

## Roles

Crea los roles en este orden, de arriba hacia abajo. Solo asigna roles de staff a personas de confianza.

| Rol | Uso | Permisos principales |
| --- | --- | --- |
| `Fundador` | Propietario del servidor | Administrador |
| `Administrador` | Gestión general | Administrar servidor, canales y roles |
| `Moderador` | Moderación diaria | Gestionar mensajes, expulsar, silenciar y ver registro |
| `Soporte` | Atención a usuarios | Ver y responder tickets |
| `Vendedor verificado` | Vendedores revisados en GameTrade | Publicar en canales de vendedores |
| `Miembro` | Usuario verificado del servidor | Ver y escribir en comunidad |
| `Nuevo` | Usuario que aún no aceptó reglas | Solo puede ver bienvenida y reglas |
| `Silenciado` | Sanción temporal | Sin enviar mensajes ni reaccionar |

## Canales

### INICIO

- `#bienvenida` - Solo lectura. Mensaje de bienvenida y enlace a `https://gametradegg.com`.
- `#reglas` - Solo lectura. Reglas del servidor y seguridad.
- `#anuncios` - Solo lectura. Novedades, mantenimiento y lanzamientos.
- `#verificacion` - Explica cómo obtener el rol `Miembro`. Al inicio, un moderador puede asignarlo manualmente.

### MERCADO

- `#como-funciona` - Solo lectura. Explica que todo pedido comienza en GameTrade.
- `#ofertas-destacadas` - Solo lectura para publicaciones oficiales.
- `#vendedores-verificados` - Solo lectura. Lista de vendedores aprobados y enlace a sus ofertas en GameTrade.
- `#buscar-oferta` - `Miembro` puede escribir. Consultas generales sobre juegos u ofertas; sin pagos ni entregas por Discord.

### COMUNIDAD

- `#general` - Conversación general sobre gaming.
- `#albion-online`
- `#world-of-warcraft`
- `#runescape`
- `#free-fire-y-roblox`
- `#sugerencias` - Mejoras para GameTrade y Discord.
- `#reportes-comunidad` - Reportar spam, suplantación o conducta irregular. No compartir datos privados.

### AYUDA

- `#abrir-ticket` - Solo lectura. Indica cómo pedir ayuda y enlaza al correo `gametradegg8@gmail.com`.
- `#preguntas-frecuentes` - Solo lectura. Dudas de cuenta, pedidos y seguridad.
- Categoría `TICKETS` - Privada. Cada ticket debe ser visible únicamente para el usuario, `Soporte`, `Moderador`, `Administrador` y `Fundador`.

### EQUIPO INTERNO

Esta categoría debe ser privada para `Moderador`, `Soporte`, `Administrador` y `Fundador`.

- `#staff-general`
- `#casos-y-disputas`
- `#registro-moderacion`
- `#ideas-internas`

## Permisos de categorías

- `INICIO`: `@everyone` puede ver; nadie escribe salvo staff.
- `MERCADO`: `Nuevo` puede leer; `Miembro` escribe solo en `#buscar-oferta`; `Vendedor verificado` no publica ventas directas, solo enlaces aprobados por staff.
- `COMUNIDAD`: `Miembro` puede ver, escribir y reaccionar; `Nuevo` no escribe.
- `AYUDA`: todos pueden leer `#abrir-ticket` y `#preguntas-frecuentes`; los tickets son privados.
- `EQUIPO INTERNO`: oculto para cualquier rol que no sea staff.

## Mensaje para #bienvenida

```text
Bienvenido a GameTrade.

Somos la comunidad oficial de GameTrade para jugadores que buscan oro, ítems y servicios gaming.

Visita el mercado: https://gametradegg.com
Soporte por correo: gametradegg8@gmail.com

Antes de participar, lee #reglas. Para comprar, vender, pagar o abrir una disputa, usa siempre GameTrade. Nunca envíes dinero, códigos ni datos de tu cuenta por Discord.
```

## Mensaje para #reglas

```text
REGLAS DE GAMETRADE

1. Respeta a todos los miembros. Sin insultos, acoso, spam ni contenido ilegal.
2. No compres, vendas, pagues ni entregues productos por mensajes de Discord. Los pedidos se hacen únicamente en GameTrade.
3. Nunca compartas contraseñas, códigos de verificación, datos bancarios o accesos a cuentas.
4. No suplantes a GameTrade, vendedores, moderadores o bots.
5. Reporta enlaces sospechosos, estafas o perfiles falsos al equipo de soporte.
6. El incumplimiento puede resultar en eliminación de mensajes, silencio, expulsión o baneo.

Al permanecer en el servidor aceptas estas reglas.
```

## Mensaje para #como-funciona

```text
COMO COMPRAR O VENDER CON SEGURIDAD

1. Busca o publica una oferta en https://gametradegg.com.
2. Realiza la comunicación y seguimiento dentro del pedido de GameTrade.
3. No confirmes una entrega hasta recibir lo acordado.
4. Si existe un problema, conserva la evidencia y escribe a gametradegg8@gmail.com.

Discord sirve para comunidad y ayuda general. No es un canal de pago, entrega ni resolución formal de pedidos.
```

## Mensaje para #abrir-ticket

```text
NECESITAS AYUDA?

Para soporte de cuenta, pedidos o disputas, escribe a gametradegg8@gmail.com.

Incluye tu correo de GameTrade, el número de pedido si existe y una explicación breve. Nunca incluyas tu contraseña, códigos de verificación ni datos financieros.
```

## Configuración recomendada

1. Activa `Servidor de comunidad` desde Ajustes del servidor.
2. Activa el filtro de contenido explícito y el nivel de verificación `Medio` o superior.
3. Activa AutoMod para bloquear spam, enlaces sospechosos, phishing y menciones masivas.
4. Desactiva `@everyone` para crear invitaciones. Deja esta función solo a staff.
5. Usa invitaciones con vencimiento y sin permisos de administrador.
6. No conectes bots con permiso `Administrador` salvo que sea imprescindible y confiable.

## Automatización profesional

### Funciones nativas de Discord

1. Activa `Servidor de comunidad` y `Onboarding`.
2. Configura `#reglas` como canal de reglas y exige aceptar reglas antes de asignar `Miembro`.
3. En Onboarding, ofrece intereses: `Free Fire`, `Roblox`, `Lineage 2`, `Albion`, `WoW` y `RuneScape`. Cada interés puede mostrar su canal de comunidad correspondiente.
4. Activa AutoMod con cuatro reglas: bloquear spam de menciones, bloquear enlaces sospechosos, bloquear palabras de estafa y alertar al canal privado `#registro-moderacion`.
5. Activa registro de auditoría y revisión de medios para miembros nuevos.

### Tickets de soporte

Usa un bot de tickets reconocido solo después de revisar su reputación y permisos. Debe tener permisos mínimos: gestionar canales, gestionar mensajes y usar comandos de aplicación. Nunca `Administrador`.

Configuración del panel en `#abrir-ticket`:

```text
ABRIR UN TICKET DE SOPORTE

Elige la categoría correcta:
• Cuenta y acceso
• Pedido o entrega
• Reportar estafa o suplantación
• Vendedor verificado

No compartas contraseñas, códigos, tarjetas, billeteras ni claves privadas. Para un pedido, incluye su ID de GameTrade.
```

Cada ticket debe crear un canal privado visible únicamente para el usuario, `Soporte`, `Moderador`, `Administrador` y `Fundador`. Al cerrarlo, el bot debe publicar un transcript solo en `#casos-y-disputas`.

### Moderación y registros

Un bot de moderación puede complementar AutoMod, pero con permisos mínimos. Configura acciones escalonadas: advertencia, silencio temporal, expulsión y baneo. Todos los casos deben registrarse en `#registro-moderacion` con usuario, motivo, moderador y fecha.

### Mensaje automático de bienvenida

```text
Hola {usuario}, bienvenido a GameTrade.

Lee #reglas y revisa #como-funciona antes de participar. Para comprar o vender, usa siempre https://gametradegg.com.

Por seguridad, Discord nunca se usa para pagos, entrega de cuentas, códigos o datos financieros.
```

### Lista previa al lanzamiento

- [ ] Dos administradores confiables con 2FA activado.
- [ ] AutoMod probado desde una cuenta de prueba.
- [ ] Ticket de prueba creado, cerrado y con transcript privado.
- [ ] `@everyone` sin permisos para crear invitaciones, gestionar canales o mencionar roles.
- [ ] Enlace de invitación permanente sin permisos administrativos.
- [ ] Canal `#anuncios` solo lectura y con el enlace oficial a GameTrade.

## Convertirlo en una plantilla oficial de Discord

1. Crea el servidor llamado `GameTrade` en tu cuenta de Discord.
2. Replica las categorías, canales, roles y permisos anteriores.
3. Publica los cuatro mensajes preparados en sus canales correspondientes.
4. Ve a `Ajustes del servidor` > `Plantillas de servidor` > `Crear plantilla`.
5. Nómbrala `GameTrade Community`, añade la descripción y copia el enlace que Discord genere.
6. Comparte ese enlace solo con personas a las que quieras permitir crear una copia del servidor.

Discord no permite crear un servidor ni publicar una plantilla dentro de una cuenta sin iniciar sesión y autorizarlo desde esa cuenta.
