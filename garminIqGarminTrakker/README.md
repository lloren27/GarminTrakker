# GarminTrakker Connect IQ

Data Field de Garmin Connect IQ para enviar ubicacion desde dispositivos Edge
y mostrar un resumen minimo de grupo.

## Variantes

El proyecto genera dos variantes desde el mismo codigo:

| Variante | Dispositivos | Sincronizacion |
| --- | --- | --- |
| Legacy | Edge 530, 830, 1030 y 1030 Plus | Servicio de fondo, maximo cada 5 minutos |
| Live | Edge 540, 840, 1040, 850 y 1050 | Directa durante la actividad, cada 30 segundos |

El Edge 530 usa Connect IQ 3.3 y no permite llamar a Internet directamente
desde `compute()`. La variante Legacy guarda la telemetria mas reciente y el
servicio de fondo la envia cuando Garmin permite ejecutar el siguiente ciclo.

El campo muestra:

- nombre del campo;
- puesto y total de corredores con posicion reciente en el mismo GPX;
- porcentaje y kilometros recorridos sobre la ruta;
- distancia restante o alerta de salida del recorrido;
- antiguedad de la ultima sincronizacion;
- amigo mas cercano por delante y por detras cuando el backend los devuelve.

Hasta recibir el primer resumen del backend, el numero central usa la distancia
de actividad como respaldo. En la variante Legacy aparece el tiempo desde la
ultima sincronizacion y `MAX 5m`. No se actualiza el timestamp de una posicion
si el Garmin no ha enviado una lectura nueva.

## Vinculacion

El `.prg` es el mismo para todos los usuarios y no contiene ningun `userId`.

1. Instala el Data Field y anadelo a una pantalla de actividad.
2. Con Garmin Connect conectado, el Edge mostrara un codigo como `ABCD-EFGH`.
3. Entra en la web, abre `Mi Garmin` e introduce el codigo.
4. El Edge recibira un token propio y lo guardara de forma persistente.
5. Cuando haya GPS, enviara telemetria segun la cadencia de su variante.

En Edge 530 el primer codigo puede tardar hasta 5 minutos y, despues de
introducirlo en la web, la confirmacion puede tardar otro ciclo. El codigo
temporal caduca a los 20 minutos; si caduca, el servicio genera otro.

## Configuracion

Edita [source/GarminTrakkerConfig.mc](source/GarminTrakkerConfig.mc) antes de probar:

```monkeyc
const PAIRING_START_URL = "https://backendgarmintrakker-production.up.railway.app/api/connect-iq/pairing/start";
const PAIRING_STATUS_URL = "https://backendgarmintrakker-production.up.railway.app/api/connect-iq/pairing/status";
const LIVE_UPDATE_URL = "https://backendgarmintrakker-production.up.railway.app/api/connect-iq/live-update";
```

La web de seguimiento desplegada esta en:

```txt
https://webgarmintrakker-production.up.railway.app
```

El Data Field no llama a la web directamente; la web se usa para crear/unirse a grupos, cargar recorridos y ver el mapa.

## SDK local

El SDK detectado en esta maquina esta en:

```sh
/Users/lloren27/Library/Application Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-9.2.0-2026-06-09-92a1605b2
```

## Compilar para Edge 530

```sh
"/Users/lloren27/Library/Application Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-9.2.0-2026-06-09-92a1605b2/bin/monkeyc" \
  -f monkey.jungle \
  -d edge530 \
  -o bin/GarminTrakker-edge530.prg \
  -y developer_key.der
```

## Compilar para Edge 540 o superior

```sh
"/Users/lloren27/Library/Application Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-9.2.0-2026-06-09-92a1605b2/bin/monkeyc" \
  -f monkey.jungle \
  -d edge540 \
  -o bin/GarminTrakker-edge540.prg \
  -y developer_key.der
```

Las anotaciones de `monkey.jungle` seleccionan automaticamente la
implementacion Legacy o Live para cada familia.

El archivo `developer_key.der` no se guarda en el repo. Si no existe, hay que crearlo desde las herramientas del SDK o reutilizar la clave de desarrollo local.

## Ejecutar en simulador

Primero abre el simulador:

```sh
"/Users/lloren27/Library/Application Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-9.2.0-2026-06-09-92a1605b2/bin/connectiq"
```

Despues, con el simulador abierto:

```sh
"/Users/lloren27/Library/Application Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-9.2.0-2026-06-09-92a1605b2/bin/monkeydo" \
  bin/GarminTrakker-edge530.prg \
  edge530
```

## Contrato backend

La variante Live manda cada 30 segundos. La Legacy guarda la ultima muestra
cada 30 segundos y la transmite cuando se ejecuta su ciclo de 5 minutos:

```json
{
  "latitude": 43.123,
  "longitude": -5.456,
  "elapsedDistanceMeters": 12450,
  "averageSpeedMps": 8.4,
  "currentSpeedMps": 9.1,
  "timerTimeSeconds": 1482,
  "recordedAtEpoch": 1782242400
}
```

Y espera un resumen compacto:

```json
{
  "success": true,
  "ahead": { "name": "Ana", "deltaMeters": 320, "gapSeconds": 39 },
  "behind": { "name": "Luis", "deltaMeters": 180, "gapSeconds": 22 },
  "progressMeters": 12450,
  "progressSource": "route",
  "remainingMeters": 18550,
  "routeLengthMeters": 31000,
  "progressPercent": 40.16,
  "distanceFromRouteMeters": 12,
  "isOffRoute": false,
  "rank": 3,
  "participantCount": 14
}
```

`rank` solo incluye usuarios con una posicion reciente y proyectada sobre la
misma ruta. Si no hay GPX cargado, el Data Field sigue enviando telemetria y
muestra la distancia de actividad, pero no presenta una clasificacion oficial.
