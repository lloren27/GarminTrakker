import { apiRequest } from "./apiClient";

export type GarminDevice = {
  id: string;
  model: string;
  pairedAt: string;
  lastSeenAt?: string;
  online: boolean;
};

export function pairGarmin(pairingCode: string) {
  return apiRequest<{
    success: boolean;
    message: string;
    pairedAt: string;
    model?: string;
  }>("/api/connect-iq/pair", {
    method: "POST",
    body: JSON.stringify({ pairingCode }),
  });
}

export function getGarminDevices() {
  return apiRequest<GarminDevice[]>("/api/connect-iq/devices");
}

export function unlinkGarminDevice(deviceId: string) {
  return apiRequest<void>(`/api/connect-iq/devices/${deviceId}`, {
    method: "DELETE",
  });
}
