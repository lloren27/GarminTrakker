import dotenv from "dotenv";
import http from "http";
import app from "./app";
import { setupSocket } from "./config/socket";

dotenv.config();

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

setupSocket(server);

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
