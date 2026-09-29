import { userStatus } from "../../../generated/prisma/client.js";

export interface IUpdateAdminPayload {
    admin?: {
        name?: string;
        profilePhoto?: string;
        status?: userStatus;
    }
}