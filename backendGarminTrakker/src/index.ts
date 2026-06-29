import dotenv from "dotenv";
import http from "http";
import app from "./app";
import { setupSocket } from "./config/socket";

dotenv.config();

const DEFAULT_PORT = 3000;
const parsedPort = Number.parseInt(process.env.PORT || `${DEFAULT_PORT}`, 10);

if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
  throw new Error(`PORT no es válido: "${process.env.PORT}"`);
}

const server = http.createServer(app);

setupSocket(server);

server.on("error", (error) => {
  console.error("No se pudo iniciar el servidor HTTP:", error);
  process.exitCode = 1;
});

server.listen(parsedPort, "0.0.0.0", () => {
  console.log(`Servidor escuchando en http://0.0.0.0:${parsedPort}`);
});
