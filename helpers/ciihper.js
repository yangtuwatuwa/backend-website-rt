import CryptoJS from "crypto-js";
import dotenv from "dotenv"
dotenv.config()
const keyCrypto =process.env.KEYENCRYPT
console.log(keyCrypto)
export function encryptEmails(email) {
    const keyCrypto = process.env.KEYENCRYPT
    const cipherText  = CryptoJS.AES.encrypt(email , keyCrypto).toString() 
    return cipherText;
}

export function decryptEmails(cipherText) {
    const keyCrypto = process.env.KEYENCRYPT
    const byte = CryptoJS.AES.decrypt(cipherText , keyCrypto)
    const hasilnya = byte.toString(CryptoJS.enc.Utf8)
    return hasilnya;
}

