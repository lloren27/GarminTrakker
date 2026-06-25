export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export interface JwtUserPayload {
  userId: string;
  login: string;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  userId: string;
  login: string;
}

export interface RequestPasswordResetBody {
  email: string;
}

export interface ResetPasswordBody {
  token: string;
  password: string;
  confirmPassword: string;
}
