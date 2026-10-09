import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError.js";
import { User } from "../module/User/user.model.js";
import { USER_STATUSES } from "../module/User/user.validation.js";

import { verifyAccessToken } from "../utils/jwt.js";

export const authenticate: RequestHandler = async (req, _res, next) => {
  const accessToken = req.cookies?.accessToken;
  if(typeof accessToken !== "string" || !accessToken) {
    return next(new AppError("Access token is required.", 401, "AUTHENTICATION_REQUIRED"));
  }
  try {
    const payload = verifyAccessToken(accessToken);
    const user = await User.findById(payload.sub).select("role status").lean();
    if(!user || user.status !== USER_STATUSES.ACTIVE) {
      return next(new AppError("Your account is not active.", 401, "ACCOUNT_INACTIVE"));
    }
    _res.locals.user = {
        userId: payload.sub,
        sessionId: payload.sid,
        role: user?.role,
    }
    next();
  } catch (error) {
    return next(error);
  }
};