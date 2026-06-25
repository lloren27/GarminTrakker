const envApiUrl = import.meta.env.VITE_API_URL;

export const API_URL: string = envApiUrl?.trim() || "http://localhost:3000";
export const SOCKET_URL: string = API_URL;

if (!/^https?:\/\//.test(API_URL)) {
  console.warn("VITE_API_URL debería comenzar con http:// o https://");
}
