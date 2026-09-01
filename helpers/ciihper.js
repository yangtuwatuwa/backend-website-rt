import CryptoJS from "crypto-js";
import dotenv from "dotenv"
dotenv.config()
export function encryptEmails(email) {
    const keyCrypto = process.env.KEYENCRYPT
    const cipherText  = CryptoJS.AES.encrypt(email , keyCrypto).toString() 
    return cipherText;
}

export function decryptEmails(cipherText) {
    if (cipherText === null || cipherText === undefined || cipherText === "" || typeof cipherText !== "string") {
        return "";
    }
    const keyCrypto = process.env.KEYENCRYPT;
    if (!keyCrypto) {
        return "";
    }
    try {
        const byte = CryptoJS.AES.decrypt(cipherText, keyCrypto);
        const hasilnya = byte.toString(CryptoJS.enc.Utf8);
        return hasilnya || "";
    } catch (err) {
        return "";
    }
}

