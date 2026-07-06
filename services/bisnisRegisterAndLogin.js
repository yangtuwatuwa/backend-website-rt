import registerAccount from "../models/register.js";
import { argonhash } from "../helpers/argon2.js";
import { encryptEmails } from "../helpers/ciihper.js";
export async function register(username, password,email ,role ){
    const pasplaintext = await argonhash(password)
    const emailsEncrypt = await encryptEmails(email)
    const hasilny = await registerAccount(username , pasplaintext , emailsEncrypt , role)
    return hasilny; 
}