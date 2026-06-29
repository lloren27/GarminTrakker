const DEFAULT_API_URL = "http://localhost:3000";

function normalizeApiUrl(value?: string): string {
  const configuredUrl = value?.trim() || DEFAULT_API_URL;
  const hasProtocol = /^https?:\/\//i.test(configuredUrl);
  const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(
    configuredUrl,
  );
  const urlWithProtocol = hasProtocol
    ? configuredUrl
    : `${isLocalHost ? "http" : "https"}://${configuredUrl}`;

  try {
    const parsedUrl = new URL(urlWithProtocol);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("solo se permiten URLs HTTP o HTTPS");
    }

    return parsedUrl.toString().replace(/\/+$/, "");
  } catch {
    throw new Error(`VITE_API_URL no es válida: "${configuredUrl}"`);
  }
}

export const API_URL: string = normalizeApiUrl(import.meta.env.VITE_API_URL);
export const SOCKET_URL: string = API_URL;
