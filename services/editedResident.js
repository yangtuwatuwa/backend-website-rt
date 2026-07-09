import { editedWarga } from "../models/resident.js"
import { encryptEmails } from "../helpers/ciihper.js"

export default async function editResident(id, nik){
    
    try {
    const encryptedNik = encryptEmails(nik)
    const hasildbnya = await editedWarga(id, encryptedNik)
    return hasildbnya;    
    } catch (error) {
        return "salah di bagian warga "
        
    }
}