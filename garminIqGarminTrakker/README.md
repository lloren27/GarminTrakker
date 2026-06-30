# GarminTrakker Connect IQ

Data Field de Garmin Connect IQ para enviar ubicacion en directo desde dispositivos Edge y mostrar un resumen minimo de grupo.

## Primer objetivo

La primera version se compila para Edge 530 y solo muestra:

- nombre del campo;
- distancia de la actividad;
- estado `WAIT GPS`, `READY`, `SENDING`, `SYNC OK` o error HTTP;
- amigo mas cercano por delante y por detras cuando el backend los devuelve.

El campo manda la ubicacion al backend cada 30 segundos cuando hay GPS.

## Vinculacion

El `.prg` es el mismo para todos los usuarios y no contiene ningun `userId`.

1. Instala el Data Field y anadelo a una pantalla de actividad.
2. Con Garmin Connect conectado, el Edge mostrara un codigo como `ABCD-EFGH`.
3. Entra en la web, abre `Mi Garmin` e introduce el codigo.
4. El Edge recibira un token propio y lo guardara de forma persistente.
5. Cuando haya GPS, enviara telemetria cada 30 segundos.

El codigo temporal caduca a los 10 minutos. Si caduca, el Edge genera otro.

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

El Data Field manda cada 30 segundos:

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
  "progressMeters": 12450
}
```

De momento `progressMeters` usa `elapsedDistanceMeters`. Cuando el backend tenga GPX cargado, se sustituira por progreso proyectado sobre el track.
