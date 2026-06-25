import { apiRequest, clearSessionTokens, setSessionTokens } from "./apiClient";

export type AuthUser = {
  _id?: string;
  id?: string;
  login: string;
  email: string;
};

export type AuthResponse = {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export async function login(loginValue: string, password: string) {
  const response = await apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ login: loginValue, password }),
  });

  setSessionTokens(response.accessToken, response.refreshToken);
  localStorage.setItem("garmintrakker.user", JSON.stringify(response.user));

  return response.user;
}

export async function register({
  login: loginValue,
  email,
  password,
}: {
  login: string;
  email: string;
  password: string;
}) {
  const response = await apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      login: loginValue,
      email,
      password,
      confirmPassword: password,
      location: {
        latitude: 43.32321,
        longitude: -5.02013,
      },
    }),
  });

  setSessionTokens(response.accessToken, response.refreshToken);
  localStorage.setItem("garmintrakker.user", JSON.stringify(response.user));

  return response.user;
}

export function getStoredUser(): AuthUser | null {
  const stored = localStorage.getItem("garmintrakker.user");
  if (!stored) return null;

  try {
    return JSON.parse(stored) as AuthUser;
  } catch {
    return null;
  }
}

export function logout() {
  clearSessionTokens();
  localStorage.removeItem("garmintrakker.user");
}
