import { Router } from "express";
import { Role } from "@prisma/client";
import { checkAuth } from "../../../middleware/checkAuth.js";
import { validateZodSchema } from "../../../middleware/validateReq.js";
import { AdminController } from "./admin.controller.js";
import { updateAdminZodSchema } from "./admin.validation.js";

const router = Router();

router.get("/",
    checkAuth(Role.ADMIN),
    AdminController.getAllAdmins);
router.get("/:id",
    checkAuth(Role.ADMIN),
    AdminController.getAdminById);
router.patch("/:id",
    checkAuth(Role.ADMIN),
    validateZodSchema(updateAdminZodSchema), AdminController.updateAdmin);
router.delete("/:id",
    checkAuth(Role.ADMIN),
    AdminController.deleteAdmin);

export const AdminRoute = router;