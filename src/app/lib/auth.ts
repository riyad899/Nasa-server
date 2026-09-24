import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";
import { userStatus, Role } from "@prisma/client";
import { envVars } from "../../config/env.js";
import { bearer, emailOTP } from "better-auth/plugins";
import { sendEmail } from "../utils/email.js";


export const auth = betterAuth({
   baseURL: envVars.BETTER_AUTH_URL,
   secret: envVars.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
    },
    socialProviders: {
        google: {
            clientId: envVars.Google_Client_ID,
            clientSecret: envVars.Google_Client_Secret,
            // callbackUrl: envVars.GOOGLE_CALLBACK_URL,
            mapProfileToUser: () => {
                return {
                    role: Role.USER,
                    status: userStatus.ACTIVE,
                    needPasswordChange: false,
                    emailVerified: true,
                    isDeleted: false,
                    deletedAt: null,
                }
            }
        }
    },
    emailVerification: {
        sendOnSignUp: false,
        sendOnSignIn: false,
        autoSignInAfterVerification: true,
    },


    user: {
      additionalFields: {
        role: {
          type: "string",
            required: true,
            defaultValue: Role.USER,
        },
        status: {
          type: "string",
          required: true,
          defaultValue: userStatus.ACTIVE,
        },
        needsPasswordReset: {
          type: "boolean",
          required: true,
          defaultValue: false,
        },
        isdeleted: {
          type: "boolean",
          required: true,
          defaultValue: false,
        },
        deletedAt: {
          type: "date",
          required: false,
        }

      },
    },
    plugins: [
      bearer(),
   emailOTP({
            overrideDefaultEmailVerification: true,
            async sendVerificationOTP({email, otp, type}) {
                if(type === "email-verification"){
                  const user = await prisma.user.findUnique({
                    where : {
                        email,
                    }
                  })

                   if(!user){
                    console.error(`User with email ${email} not found. Cannot send verification OTP.`);
                    return;
                   }

                   if(user && user.role === Role.ADMIN){
                    console.log(`User with email ${email} is an admin. Skipping sending verification OTP.`);
                    return;
                   }

                    if (user && !user.emailVerified){
                    sendEmail({
                        to : email,
                        subject : "Verify your email",
                        templateName : "otp",
                        templateData :{
                            name : user.name,
                            otp,
                        }
                    })
                  }
                }else if(type === "forget-password"){
                    const user = await prisma.user.findUnique({
                        where : {
                            email,
                        }
                    })

                    if(user){
                        sendEmail({
                            to : email,
                            subject : "Password Reset OTP",
                            templateName : "otp",
                            templateData :{
                                name : user.name,
                                otp,
                            }
                        })
                    }
                }
            },
            expiresIn : 2 * 60, // 2 minutes in seconds
            otpLength : 6,
        })
    ],

       session: {
        expiresIn: 60 * 60 * 60 * 24, // 1 day in seconds
        updateAge: 60 * 60 * 60 * 24, // 1 day in seconds
        cookieCache: {
          enabled: false,
            maxAge: 60 * 60 * 60 * 24, // 1 day in seconds
        }
    },
    redirectURLs:{
        signIn : `${envVars.BETTER_AUTH_URL}/api/v1/auth/google/success`,
    },
        trustedOrigins: [process.env.BETTER_AUTH_URL || "http://localhost:5000", envVars.FRONTEND_URL],
    advanced: {
        // disableCSRFCheck: true,
        useSecureCookies : false,
        cookies:{
            state:{
                attributes:{
                    sameSite: "none",
                    secure: true,
                    httpOnly: true,
                    path: "/",
                }
            },
            sessionToken:{
                attributes:{
                    sameSite: "none",
                    secure: true,
                    httpOnly: true,
                    path: "/",
                }
            }
        }
    }
});