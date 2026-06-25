# GarminTrakker Connect IQ

Data Field de Garmin Connect IQ para enviar ubicacion en directo desde dispositivos Edge y mostrar un resumen minimo de grupo.

## Primer objetivo

La primera version se compila para Edge 530 y solo muestra:

- nombre del campo;
- distancia de la actividad;
- estado `WAIT GPS`, `READY`, `SENDING`, `SYNC OK` o error HTTP;
- amigo mas cercano por delante y por detras cuando el backend los devuelve.

El campo manda la ubicacion al backend cada 30 segundos cuando hay GPS.

## Configuracion de desarrollo

Edita [source/GarminTrakkerConfig.mc](source/GarminTrakkerConfig.mc) antes de probar:

```monkeyc
const API_URL = "http://127.0.0.1:3000/api/connect-iq/live-update";
const DEVICE_TOKEN = "dev-connect-iq-token";
const USER_ID = "replace-with-user-object-id";
```

En backend, `DEVICE_TOKEN` debe coincidir con `CONNECT_IQ_SHARED_TOKEN` cuando esa variable este definida. En desarrollo, si `CONNECT_IQ_SHARED_TOKEN` no existe, el backend permite la peticion para facilitar pruebas locales.

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
  "userId": "mongodb-object-id",
  "latitude": 43.123,
  "longitude": -5.456,
  "elapsedDistanceMeters": 12450,
  "recordedAtEpoch": 1782242400
}
```

Y espera un resumen compacto:

```json
{
  "success": true,
  "ahead": { "name": "Ana", "deltaMeters": 320 },
  "behind": { "name": "Luis", "deltaMeters": 180 },
  "progressMeters": 12450
}
```

De momento `progressMeters` usa `elapsedDistanceMeters`. Cuando el backend tenga GPX cargado, se sustituira por progreso proyectado sobre el track.
