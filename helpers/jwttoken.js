import jwt from "jsonwebtoken"
import dotenv from "dotenv"

dotenv.config()
const SECRET = process.env.SECRET

export function generateJwt(payload) {
    return jwt.sign(payload, SECRET, 
        {
        expiresIn:"24h"
        }
    );
}

export function verify(token) {
    return jwt.verify(token, SECRET)
}