export function role(roles){

    return(req,res,next)=>{

        if(!req.user || !roles.includes(req.user.role)){

            return res.send("g boleh masuk mas maaf")

        }

        next()

    }

}

