import e from "express";
import { regist, login } from "../controllers/registandlogin.js"; 
import { regex , verifyInput } from "../middlewares/verivyGmail.js";
import { authLimiter } from "../middlewares/rateLimiter.js";

const app = e()


app.post("/login", authLimiter, login)
app.post("/debug-regist", verifyInput(regex), regist);

// Route Dashboard Publik / Infografis Landing Page
import { getDashboardStatsController } from "../controllers/financeController.js"
app.get("/dashboard-stats", getDashboardStatsController)

export default app
