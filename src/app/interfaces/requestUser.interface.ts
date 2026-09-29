import type { Role } from "../../generated/prisma/client.js";

export interface IRequestUser {
    userId: string;
    role: Role;
    email: string;
}