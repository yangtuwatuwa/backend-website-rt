import {logicWarganya, listWarganya} from "../services/inputDataWarga.js"

export async function inputData(req,res){
   const {noKK , home , KepalaKeluarga} = req.body
   
    try {
        const warga = await logicWarganya(noKK ,home , KepalaKeluarga)
        if (typeof warga === "string" && warga.startsWith("error")) {
            return res.status(400).json(warga)
        }
        return res.json("data masuk mantap")
    } catch (err) {
        console.log("err mas")
        return res.status(500).json("error mas di controllers: " + err)
    }
    
}

export async function getResident(req,res){
    try {
        const warga = await listWarganya()
        if (typeof warga === "string" && warga.startsWith("error")) {
            return res.status(400).json(warga)
        }
        return res.json(warga)
    } catch (err) {
        console.log("err mas")
        return res.status(500).json("error mas di controllers: " + err)
    }
}