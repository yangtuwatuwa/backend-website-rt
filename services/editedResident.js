import { editedWarga } from "../models/resident.js"
import { encryptEmails } from "../helpers/ciihper.js"

export default async function editResident(id, nik, executor = undefined){
    
    try {
    const encryptedNik = encryptEmails(nik)
    const hasildbnya = await editedWarga(id, encryptedNik, executor)
    return hasildbnya;    
    } catch (error) {
        return "salah di bagian warga "
        
    }
}
