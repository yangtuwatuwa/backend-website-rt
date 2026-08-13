import { getMyAccountService, updateMyAccountService, updateAccountByAdminService } from "../services/accountProfileService.js";
import { responseSucces } from "../utils/response.js";

export async function getMyAccountController(req, res) {
    const userId = req.user.id;
    console.log(`[Request Get My Account] userId: ${userId}`);

    try {
        const profile = await getMyAccountService(userId);
        if (typeof profile === "string" && profile.startsWith("error")) {
            return res.status(400).json({ pesan: profile });
        }
        return res.status(200).json({
            response: 200,
            output: profile,
            data: profile,
            message: "Data profil akun berhasil diambil"
        });
    } catch (err) {
        console.log(`[Error Get My Account]:`, err);
        return res.status(500).json({ pesan: "error mas di controller getMyAccountController: " + err });
    }
}

export async function updateMyAccountController(req, res) {
    const userId = req.user.id;
    const { username, email, oldPassword, old_password, newPassword, new_password, password } = req.body;
    
    const targetOldPassword = oldPassword || old_password;
    const targetNewPassword = newPassword || new_password || password;

    console.log(`[Request Update My Account] userId: ${userId}, username: ${username}, email: ${email}`);

    try {
        const updatedProfile = await updateMyAccountService(userId, {
            username,
            email,
            oldPassword: targetOldPassword,
            newPassword: targetNewPassword
        });

        if (typeof updatedProfile === "string" && updatedProfile.startsWith("error")) {
            return res.status(400).json({ pesan: updatedProfile });
        }

        return res.status(200).json({
            response: 200,
            output: updatedProfile,
            data: updatedProfile,
            message: "Profil akun berhasil diperbarui masbro!"
        });
    } catch (err) {
        console.log(`[Error Update My Account]:`, err);
        return res.status(500).json({ pesan: "error mas di controller updateMyAccountController: " + err });
    }
}

export async function updateAccountByAdminController(req, res) {
    const { id, familyId: paramFamilyId } = req.params;
    const { 
        accountId, account_id, id: bodyId, 
        familyId, family_id, 
        username, email, 
        password, newPassword, new_password 
    } = req.body;

    const targetAccountId = id || accountId || account_id || bodyId;
    const targetFamilyId = paramFamilyId || familyId || family_id;
    const targetPassword = password || newPassword || new_password;

    console.log(`[Request Admin Update Account] accountId: ${targetAccountId}, familyId: ${targetFamilyId}, username: ${username}`);

    try {
        const updatedProfile = await updateAccountByAdminService({
            accountId: targetAccountId,
            familyId: targetFamilyId,
            username,
            email,
            password: targetPassword
        });

        if (typeof updatedProfile === "string" && updatedProfile.startsWith("error")) {
            return res.status(400).json({ pesan: updatedProfile });
        }

        return res.status(200).json({
            response: 200,
            output: updatedProfile,
            data: updatedProfile,
            message: "Akun warga berhasil diperbarui oleh admin!"
        });
    } catch (err) {
        console.log(`[Error Admin Update Account]:`, err);
        return res.status(500).json({ pesan: "error mas di controller updateAccountByAdminController: " + err });
    }
}

