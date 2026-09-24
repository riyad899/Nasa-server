import dotenv from "dotenv";
import AppError from "../app/errorHelpers/appError.js";
import status from "http-status";

dotenv.config();
interface EnvConfig {
    NODE_ENV: string;
    PORT: string;
    DATABASE_URL: string;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    ACCESS_TOKEN_SECRET: string;
    REFRESH_TOKEN_SECRET: string;
    ACCESS_TOKEN_EXPIRES_IN: string;
    REFRESH_TOKEN_EXPIRES_IN: string;
    FRONTEND_URL: string;
    BETTER_AUTH_SESSION_EXPIRES_IN: string;
    BETTER_AUTH_SEASSION_UPDATE_AGE: string;
    EMAIL_SENDER: {
        SMTP_USER: string;
        SMTP_PASS: string;
        SMTP_HOST: string;
        SMTP_PORT: string;
        SMTP_FROM: string;
    }
    Google_Client_ID: string;
    Google_Client_Secret: string;
    Google_callbackURL: string;
    RAG: {
        OPENROUTER_API_KEY: string;
        OPENROUTER_EMBEDDING_MODEL: string;
        OPENROUTER_LLM_MODEL: string;
    };
}

const LoadEnvVarialbes = (): EnvConfig => {
    const requiredEnvVars = [
        "NODE_ENV",
        "PORT",
        "DATABASE_URL",
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
        "ACCESS_TOKEN_SECRET",
        "REFRESH_TOKEN_SECRET",
        "ACCESS_TOKEN_EXPIRES_IN",
        "REFRESH_TOKEN_EXPIRES_IN",
        "FRONTEND_URL",
        "BETTER_AUTH_SESSION_EXPIRES_IN",
        "BETTER_AUTH_SEASSION_UPDATE_AGE",
        "EMAIL_SENDER_SMTP_USER",
        "EMAIL_SENDER_SMTP_PASS",
        "EMAIL_SENDER_SMTP_HOST",
        "EMAIL_SENDER_SMTP_PORT",
        "EMAIL_SENDER_SMTP_FROM",
        "Google_Client_ID",
        "Google_Client_Secret",
        "Google_callbackURL",
    ];
    requiredEnvVars.forEach((varName) => {
        if (!process.env[varName]) {
            throw new AppError(`Missing required environment variable: ${varName}`, status.INTERNAL_SERVER_ERROR);
        }
    });

    return {
        NODE_ENV: process.env.NODE_ENV as string,
        PORT: process.env.PORT as string,
        DATABASE_URL: process.env.DATABASE_URL as string,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET as string,
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL as string,
        ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET as string,
        REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET as string,
        ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN as string,
        REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN as string,
        FRONTEND_URL: process.env.FRONTEND_URL as string,
        BETTER_AUTH_SESSION_EXPIRES_IN: process.env.BETTER_AUTH_SESSION_EXPIRES_IN as string,
        BETTER_AUTH_SEASSION_UPDATE_AGE: process.env.BETTER_AUTH_SEASSION_UPDATE_AGE as string,
        EMAIL_SENDER: {
            SMTP_USER: process.env.EMAIL_SENDER_SMTP_USER as string,
            SMTP_PASS: process.env.EMAIL_SENDER_SMTP_PASS as string,
            SMTP_HOST: process.env.EMAIL_SENDER_SMTP_HOST as string,
            SMTP_PORT: process.env.EMAIL_SENDER_SMTP_PORT as string,
            SMTP_FROM: process.env.EMAIL_SENDER_SMTP_FROM as string,
        },
        Google_Client_ID: process.env.Google_Client_ID as string,
        Google_Client_Secret: process.env.Google_Client_Secret as string,
        Google_callbackURL: process.env.Google_callbackURL as string,
        RAG: {
            OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
            OPENROUTER_EMBEDDING_MODEL: process.env.OPENROUTER_EMBEDDING_MODEL || "nvidia/llama-nemotron-embed-vl-1b-v2:free",
            OPENROUTER_LLM_MODEL: process.env.OPENROUTER_LLM_MODEL || "nvidia/nemotron-3-super-120b-a12b:free",
        },
    }
}


export const envVars = LoadEnvVarialbes();
