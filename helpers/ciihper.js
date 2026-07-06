import CryptoJS from "crypto-js";
import dotenv from "dotenv"

const keyCrypto =process.env.KEYENCRYPT
console.log(keyCrypto)
export function encryptEmails(email) {
    const cipherText  = CryptoJS.AES.encrypt(email , keyCrypto).toString() 
    return cipherText;
}

export function decryptEmails() {
    const byte = CryptoJS.AES.decrypt(encryptEmails() , keyCrypto)
    const hasilnya = byte.toString(CryptoJS.enc.Utf8)

}

