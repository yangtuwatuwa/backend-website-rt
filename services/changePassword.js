import { updateWargaPassword } from "../models/changePassword.js";
import { argonhash } from "../helpers/argon2.js";

export async function changePasswordService(userId, newPassword) {
    try {
        if (!newPassword || newPassword.length < 5) {
            return "error: password baru minimal 5 karakter masbro";
        }
        const passwordHash = await argonhash(newPassword);
        const result = await updateWargaPassword(userId, passwordHash);
        return result;
    } catch (err) {
        console.log(err);
        return "error karena: " + err;
    }
}
