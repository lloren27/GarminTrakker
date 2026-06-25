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

## Demo

Si el backend no expone aun `/api/v1/tracking/:trackingId`, la ruta `LAGOS26`
carga datos demo coherentes con el seed local del backend.

```sh
http://localhost:5173/track/LAGOS26
```
