import { User } from "../models/user";
import { isConfiguredAdmin } from "../config/adminAccess";

export const sanitizeUser = (user: User) => {
  if (!user) return null;

  return {
    _id: user._id,
    email: user.email,
    login: user.login,
    avatar: user.avatar,
    location: user.location,
    groups: user.groups,
    real_time_location: user.real_time_location,
    push_token: user.push_token,
    emailVerified: user.emailVerified,
    isAdmin: isConfiguredAdmin(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
};
