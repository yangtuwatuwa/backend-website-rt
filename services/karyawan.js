import { getKaryawanList, hasUserVoted, insertVote, getVoteResults, insertKaryawan, deleteKaryawan } from "../models/karyawan.js"

export async function listKaryawan(executor = undefined) {
    try {
        const hasilnya = await getKaryawanList(executor)
        return hasilnya
    } catch (err) {
        console.log(err)
        return "error mas di service listKaryawan: " + err
    }
}

export async function addKaryawan(nama, jabatan, deskripsi = "", foto = null, executor = undefined) {
    if (!nama || !jabatan) {
        return "error: Nama dan Jabatan kandidat karyawan wajib diisi masbro!"
    }
    try {
        const hasilnya = await insertKaryawan(nama, jabatan, deskripsi, foto, executor)
        return hasilnya
    } catch (err) {
        console.log(err)
        return "error mas di service addKaryawan: " + err
    }
}

export async function removeKaryawan(id, executor = undefined) {
    try {
        const hasilnya = await deleteKaryawan(id, executor)
        return hasilnya
    } catch (err) {
        console.log(err)
        return "error mas di service removeKaryawan: " + err
    }
}

export async function castVote(accountId, karyawanId, executor = undefined) {
    try {
        // 1. Cek dulu apakah user udah pernah ngevote
        const sudahVote = await hasUserVoted(accountId, executor)
        if (typeof sudahVote === "string" && sudahVote.startsWith("error")) {
            return sudahVote
        }
        if (sudahVote === true) {
            return "error: Lu udah ngevote masbro, cuma bisa 1 vote per akun!"
        }

        // 2. Kalo belum ngevote, baru masukin data vote-nya
        const hasilnya = await insertVote(accountId, karyawanId, executor)
        return hasilnya
    } catch (err) {
        console.log(err)
        return "error mas di service castVote: " + err
    }
}

export async function listVoteResults(executor = undefined) {
    try {
        const hasilnya = await getVoteResults(executor)
        return hasilnya
    } catch (err) {
        console.log(err)
        return "error mas di service listVoteResults: " + err
    }
}

