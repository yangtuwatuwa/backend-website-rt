import express from "express";
import jwtAuth from "../middlewares/validationJwt.js";
import {
    getMyNotificationsController,
    getUnreadNotificationCountController,
    markNotificationReadController,
    markAllNotificationsReadController
} from "../controllers/notificationController.js";
import { updateMyAccountController } from "../controllers/accountProfileController.js";

const router = express.Router();

// === IN-APP NOTIFICATIONS ===
router.get("/notifications", jwtAuth, getMyNotificationsController);
router.get("/notifications/unread-count", jwtAuth, getUnreadNotificationCountController);
router.patch("/notifications/read-all", jwtAuth, markAllNotificationsReadController);
router.patch("/notifications/:id/read", jwtAuth, markNotificationReadController);

// === ACCOUNT PROFILE ===
router.patch("/profile", jwtAuth, updateMyAccountController);

export default router;
