/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from "express";
import { Role, userStatus } from "@prisma/client";
import { CookieUtils } from "../app/utils/cookie.js";
import { prisma } from "../app/lib/prisma.js";
import AppError from "../app/errorHelpers/appError.js";
import status from "http-status";
import { jwtUtils } from "../app/utils/jwt.js";
import { envVars } from "../config/env.js";


export const checkAuth = (...authRoles: Role[]) => async (req: Request, res: Response, next: NextFunction) => {
    try {

        //Session Token Verification
        const sessionToken = CookieUtils.getCookie(req, "better-auth.session_token");

        if (!sessionToken) {
            throw new Error('Unauthorized access! No session token provided.');
        }

        if (sessionToken) {
            const sessionExists = await prisma.session.findFirst({
                where: {
                    token: sessionToken,
                    expiresAt: {
                        gt: new Date(),
                    }
                },
                include: {
                    user: true,
                }
            })

            if (sessionExists && sessionExists.user) {
                const user = sessionExists.user;

                const now = new Date();
                const expiresAt = new Date(sessionExists.expiresAt)
                const createdAt = new Date(sessionExists.createdAt)

                const sessionLifeTime = expiresAt.getTime() - createdAt.getTime();
                const timeRemaining = expiresAt.getTime() - now.getTime();
                const percentRemaining = (timeRemaining / sessionLifeTime) * 100;

                if (percentRemaining < 20) {
                    res.setHeader('X-Session-Refresh', 'true');
                    res.setHeader('X-Session-Expires-At', expiresAt.toISOString());
                    res.setHeader('X-Time-Remaining', timeRemaining.toString());

                    console.log("Session Expiring Soon!!");
                }

                if (user.status === userStatus.BLOCKED || user.status === userStatus.DELETED) {
                    throw new AppError('Unauthorized access! User is not active.', status.UNAUTHORIZED);
                }

                if (user.isdeleted) {
                    throw new AppError('Unauthorized access! User is deleted.', status.UNAUTHORIZED);
                }

                if (authRoles.length > 0 && !authRoles.includes(user.role)) {
                    throw new AppError('Forbidden access! You do not have permission to access this resource.', status.FORBIDDEN);
                }

                req.user = {
                    userId : user.id,
                    role : user.role,
                    email : user.email,
                }
            }

            const accessToken = CookieUtils.getCookie(req, 'accessToken');

            if (!accessToken) {
                throw new AppError('Unauthorized access! No access token provided.', status.UNAUTHORIZED);
            }


        }

        //Access Token Verification
        const accessToken = CookieUtils.getCookie(req, 'accessToken');

        if (!accessToken) {
            throw new AppError('Unauthorized access! No access token provided.', status.UNAUTHORIZED);
        }

        const verifiedToken = jwtUtils.verifyToken(accessToken, envVars.ACCESS_TOKEN_SECRET);

        if (!verifiedToken.success) {
            throw new AppError('Unauthorized access! Invalid access token.', status.UNAUTHORIZED);
        }

        if (authRoles.length > 0 && !authRoles.includes(verifiedToken.data!.role as Role)) {
            throw new AppError('Forbidden access! You do not have permission to access this resource.', status.FORBIDDEN);
        }

        next()
    } catch (error: any) {
        next(error);
    }
};