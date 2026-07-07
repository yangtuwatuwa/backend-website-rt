import jwt from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config()
const SECRET = process.env.SECRET

const response = (req,res,next) => {

    const veriv = req.headers.authorization

    
     if(!veriv){
        return res.status(401).json({
            pesan:"username not exit"
        })
     }

        const token =
        veriv.split(" ")[1];

    try {

        const decoded =
            jwt.verify(
                token,
                SECRET
            );

        req.user = decoded

        next();

    } catch (err) {

        return res.status(403).json({
            message: "Token tidak valid"
        });

    }
}
     
export default response