import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { authService } from "./auth.service.js";
import AppError from "../../errorHelpers/appError.js";
import { tokenUtils } from "../../utils/token.js";
import { Request, Response } from "express";
import { CookieUtils } from "../../utils/cookie.js";
import { envVars } from "../../../config/env.js";
import { auth } from "../../lib/auth.js";

const register = catchAsync(async (req, res) => {
  const { name, email, password, image } = req.body;
  const result = await authService.register(
    {
      name,
      email,
      password,
      image,
    },
    req.headers
  );
  const { accessToken, refreshToken, token } = result.data;

  tokenUtils.setAccessTokenCookie(res, accessToken);
  tokenUtils.setRefreshTokenCookie(res, refreshToken);
  if (typeof token === "string" && token.length > 0) {
    tokenUtils.setBetterAuthSessionCookie(res, token);
  }
  res.clearCookie("better-auth.session_data", { path: "/" });

  sendResponse(res, {
    httpStatus: status.CREATED,
    success: true,
    message: "User registered successfully",
    data: result.data,
  });
});

const LoginUser = catchAsync(async (req, res) => {
  const payload = req.body;
  const result = await authService.LoginUser(payload);
  const { accessToken, refreshToken, token, ...rest } = result;

  tokenUtils.setAccessTokenCookie(res, accessToken);
  tokenUtils.setRefreshTokenCookie(res, refreshToken);
  tokenUtils.setBetterAuthSessionCookie(res, token);
  res.clearCookie("better-auth.session_data", { path: "/" });

  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "User logged in successfully",
    data: { token, accessToken, refreshToken, ...rest },
  });
});

const getMe = catchAsync(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Unauthorized access! User not found in request.", status.UNAUTHORIZED);
  }

  const result = await authService.getMe(user.userId);

  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "User profile retrieved successfully",
    data: result,
  });
});

const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  await authService.verifyEmail(email, otp);
  sendResponse(res, { httpStatus: status.OK, success: true, message: "Email verified successfully" });
});

const updateUser = catchAsync(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Unauthorized access! User not found in request.", status.UNAUTHORIZED);
  }
  const data = await authService.updateUser(user.userId, req.body);
  sendResponse(res, { httpStatus: status.OK, success: true, message: "User updated successfully", data });
});

const getNewToken = catchAsync(async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;
  const betterAuthSessionToken = req.cookies["better-auth.session_token"];
  if (!refreshToken) {
    throw new AppError("Refresh token is missing", status.UNAUTHORIZED);
  }
  const result = await authService.getNewToken(refreshToken, betterAuthSessionToken);
  const { accessToken, refreshToken: newRefreshToken, sessionToken } = result;

  tokenUtils.setAccessTokenCookie(res, accessToken);
  tokenUtils.setRefreshTokenCookie(res, newRefreshToken);
  tokenUtils.setBetterAuthSessionCookie(res, sessionToken);

  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "New tokens generated successfully",
    data: { accessToken, refreshToken: newRefreshToken, sessionToken },
  });
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const betterAuthSessionToken = req.cookies["better-auth.session_token"];
  const result = await authService.changePassword(payload, betterAuthSessionToken);
  const { accessToken, refreshToken, token } = result;

  tokenUtils.setAccessTokenCookie(res, accessToken);
  tokenUtils.setRefreshTokenCookie(res, refreshToken);
  tokenUtils.setBetterAuthSessionCookie(res, token as string);

  sendResponse(res, { httpStatus: status.OK, success: true, message: "Password changed successfully", data: result });
});

const logoutUser = catchAsync(async (req: Request, res: Response) => {
  const betterAuthSessionToken = req.cookies["better-auth.session_token"];
  const result = await authService.logoutUser(betterAuthSessionToken);
  CookieUtils.clearCookie(res, 'accessToken', { httpOnly: true, secure: true, sameSite: "none" });
  CookieUtils.clearCookie(res, 'refreshToken', { httpOnly: true, secure: true, sameSite: "none" });
  CookieUtils.clearCookie(res, 'better-auth.session_token', { httpOnly: true, secure: true, sameSite: "none" });
  sendResponse(res, { httpStatus: status.OK, success: true, message: "User logged out successfully", data: result });
});

const forgetPassword = catchAsync(async (req: Request, res: Response) => {
  const { email } = req.body;
  await authService.forgetPassword(email);
  sendResponse(res, { httpStatus: status.OK, success: true, message: "Password reset OTP sent to email successfully" });
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const { email, otp, newPassword } = req.body;
  await authService.resetPassword(email, otp, newPassword);
  sendResponse(res, { httpStatus: status.OK, success: true, message: "Password reset successfully" });
});

// GET /api/v1/auth/login/google?redirect=/dashboard
const googleLogin = catchAsync(async (req: Request, res: Response) => {
  const redirectPath = (req.query.redirect as string) || "/dashboard";
  const encodedRedirectPath = encodeURIComponent(redirectPath);
  const callbackURL = `${envVars.BETTER_AUTH_URL}/api/v1/auth/google/success?redirect=${encodedRedirectPath}`;

  // Server-side: ask better-auth for the Google OAuth URL, then redirect the browser there
  const result = await auth.api.signInSocial({
    body: {
      provider: "google",
      callbackURL,
    },
  });

  if (!result?.url) {
    return res.status(500).json({ success: false, message: "Failed to get Google OAuth URL. Check your Google_Client_ID and Google_Client_Secret in .env" });
  }

  res.redirect(result.url);
});

const googleLoginSuccess = catchAsync(async (req: Request, res: Response) => {
  const redirectPath = req.query.redirect as string || "/dashboard";
  const sessionToken = req.cookies["better-auth.session_token"];

  if (!sessionToken) return res.redirect(`${envVars.FRONTEND_URL}/login?error=oauth_failed`);

  const session = await auth.api.getSession({
    headers: { "Cookie": `better-auth.session_token=${sessionToken}` },
  });

  if (!session) return res.redirect(`${envVars.FRONTEND_URL}/login?error=no_session_found`);
  if (session && !session.user) return res.redirect(`${envVars.FRONTEND_URL}/login?error=no_user_found`);

  const result = await authService.googleLoginSuccess(session);
  const { accessToken, refreshToken } = result;

  tokenUtils.setAccessTokenCookie(res, accessToken);
  tokenUtils.setRefreshTokenCookie(res, refreshToken);

  const isValidRedirectPath = redirectPath.startsWith("/") && !redirectPath.startsWith("//");
  const finalRedirectPath = isValidRedirectPath ? redirectPath : "/dashboard";
  res.redirect(`${envVars.FRONTEND_URL}${finalRedirectPath}`);
});

const handleOAuthError = catchAsync((req: Request, res: Response) => {
  const error = req.query.error as string || "oauth_failed";
  res.redirect(`${envVars.FRONTEND_URL}/login?error=${error}`);
});

export const AuthController = {
  register, LoginUser, updateUser, getMe, getNewToken, changePassword,
  logoutUser, verifyEmail, forgetPassword, resetPassword, googleLogin, googleLoginSuccess, handleOAuthError,
};