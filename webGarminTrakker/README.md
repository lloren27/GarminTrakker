# GarminTrakker Live

Web de seguimiento en directo para grupos GarminTrakker.

La pantalla principal esta pensada como una retransmision de carrera:

- mapa con track GPX/GeoJSON;
- participantes en vivo;
- grupo de cabeza, perseguidores y peloton;
- gaps en distancia y tiempo estimado;
- demo local disponible en `/track/LAGOS26`.

## Desarrollo

```sh
npm run dev
```

Por defecto la web busca el backend en:

```sh
http://localhost:3000
```

Puede cambiarse con:

```sh
VITE_API_URL=http://localhost:3000 npm run dev
```

## Despliegue en Railway

Configura `VITE_API_URL` en el servicio del frontend con la URL publica completa
del backend:

```env
VITE_API_URL=https://backendgarmintrakker-production.up.railway.app
```

Al ser una variable de Vite, Railway debe volver a construir el frontend
despues de cambiarla. La aplicacion tambien normaliza dominios sin protocolo y
elimina la barra final para evitar que las rutas de la API se interpreten como
rutas relativas del frontend.

## Demo

Si el backend no expone aun `/api/v1/tracking/:trackingId`, la ruta `LAGOS26`
carga datos demo coherentes con el seed local del backend.

```sh
http://localhost:5173/track/LAGOS26
```
