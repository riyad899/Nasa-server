/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from "express";
import { Role, userStatus } from "../generated/prisma/client.js";
import { CookieUtils } from "../app/utils/cookie.js";
import { prisma } from "../app/lib/prisma.js";
import AppError from "../app/errorHelpers/appError.js";
import status from "http-status";
import { jwtUtils } from "../app/utils/jwt.js";
import { envVars } from "../config/env.js";

export const checkAuth = (...authRoles: Role[]) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionToken = CookieUtils.getCookie(req, "better-auth.session_token") || (req.headers["x-session-token"] as string);
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
        const accessToken = CookieUtils.getCookie(req, "accessToken") || bearerToken;

        let authenticatedUser: { userId: string; role: Role; email: string } | null = null;

        // 1. Try Better Auth Session verification
        if (sessionToken) {
            const sessionExists = await prisma.session.findFirst({
                where: {
                    token: sessionToken,
                    expiresAt: {
                        gt: new Date(),
                    },
                },
                include: {
                    user: true,
                },
            });

            if (sessionExists && sessionExists.user) {
                const user = sessionExists.user;

                if (user.status === userStatus.BLOCKED || user.status === userStatus.DELETED || user.isdeleted) {
                    throw new AppError("Unauthorized access! User is inactive or deleted.", status.UNAUTHORIZED);
                }

                authenticatedUser = {
                    userId: user.id,
                    role: user.role as Role,
                    email: user.email,
                };
            }
        }

        // 2. Try JWT Access Token verification if session didn't match or to supplement
        if (!authenticatedUser && accessToken) {
            const verifiedToken = jwtUtils.verifyToken(accessToken, envVars.ACCESS_TOKEN_SECRET);
            if (verifiedToken.success && verifiedToken.data) {
                const data = verifiedToken.data as any;
                authenticatedUser = {
                    userId: data.userId,
                    role: data.role as Role,
                    email: data.email,
                };
            }
        }

        // If neither session nor access token is valid
        if (!authenticatedUser) {
            throw new AppError("Unauthorized access! Please sign in to continue.", status.UNAUTHORIZED);
        }

        // Role authorization check
        if (authRoles.length > 0 && !authRoles.includes(authenticatedUser.role)) {
            throw new AppError("Forbidden access! You do not have permission to access this resource.", status.FORBIDDEN);
        }

        req.user = authenticatedUser;
        next();
    } catch (error: any) {
        next(error);
    }
};

export const optionalAuth = () => async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionToken = CookieUtils.getCookie(req, "better-auth.session_token") || (req.headers["x-session-token"] as string);
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
        const accessToken = CookieUtils.getCookie(req, "accessToken") || bearerToken;

        let authenticatedUser: { userId: string; role: Role; email: string } | null = null;

        if (sessionToken) {
            const sessionExists = await prisma.session.findFirst({
                where: {
                    token: sessionToken,
                    expiresAt: {
                        gt: new Date(),
                    },
                },
                include: {
                    user: true,
                },
            });

            if (sessionExists && sessionExists.user && !sessionExists.user.isdeleted && sessionExists.user.status === userStatus.ACTIVE) {
                authenticatedUser = {
                    userId: sessionExists.user.id,
                    role: sessionExists.user.role as Role,
                    email: sessionExists.user.email,
                };
            }
        }

        if (!authenticatedUser && accessToken) {
            const verifiedToken = jwtUtils.verifyToken(accessToken, envVars.ACCESS_TOKEN_SECRET);
            if (verifiedToken.success && verifiedToken.data) {
                const data = verifiedToken.data as any;
                authenticatedUser = {
                    userId: data.userId,
                    role: data.role as Role,
                    email: data.email,
                };
            }
        }

        if (authenticatedUser) {
            req.user = authenticatedUser;
        }

        next();
    } catch {
        // Guest user, silently continue without user context
        next();
    }
};