import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";

import pool from "../config/sqlconfig.js";
import { encryptEmails } from "../helpers/ciihper.js";
import { encryptEmail } from "../lib/crypto/email.js";
import { getProfilSayaByAccountId } from "../models/profilSaya.js";
import accountRoutes from "../routes/account.js";
import wargaApiRoutes from "../routes/wargaApi.js";
import residentRoutes from "../routes/userAcces.js";
import { getProfilSayaService } from "../services/profilSayaService.js";
import { maskEmail, maskNik } from "../utils/masking.js";

function encryptedProfileRow(overrides = {}) {
    return {
        account_id: 77,
        username: "joko",
        email_encrypted: encryptEmail("joko@gmail.com"),
        family_id: 8,
        kepala_keluarga_id: 19,
        warga_id: 19,
        nik: encryptEmails("1301123456789830"),
        nama: "Joko Santoso",
        jenis_kelamin: "Laki-laki",
        tgl_lahir: encryptEmails("1990-05-12"),
        no_hp: encryptEmails("081234567890"),
        house_blok: encryptEmails("B"),
        house_nomor: encryptEmails("15"),
        house_alamat: encryptEmails("Jl. Kamboja No. 15"),
        house_status: "pribadi",
        pekerjaan: "tidak boleh terkirim",
        ...overrides
    };
}

test("maskNik hanya menyisakan 4 karakter awal dan 3 karakter akhir", () => {
    assert.equal(maskNik("1301123456789830"), "1301*********830");
    assert.equal(maskNik(null), null);
    assert.equal(maskNik("1234567"), "*******" );
});

test("maskEmail hanya menyisakan karakter pertama dan domain", () => {
    assert.equal(maskEmail("joko@gmail.com"), "j***@gmail.com");
    assert.equal(maskEmail(null), null);
    assert.equal(maskEmail("invalid"), "i***");
});

test("model mengikat query hanya ke account id login", async () => {
    let capturedSql = "";
    let capturedParams = [];
    const executor = {
        async execute(sql, params) {
            capturedSql = sql.replace(/\s+/g, " ").trim();
            capturedParams = params;
            return [[encryptedProfileRow()]];
        }
    };

    await getProfilSayaByAccountId(77, executor);

    assert.match(capturedSql, /FROM acount a/);
    assert.match(capturedSql, /w\.id = f\.kepala_keluarga_id/);
    assert.match(capturedSql, /w\.family_id = f\.id/);
    assert.match(capturedSql, /WHERE a\.id = \? AND a\.role = 'warga'/);
    assert.deepEqual(capturedParams, [77]);
});

test("service menghasilkan profil termasking tanpa field pekerjaan atau data internal", async () => {
    const rawNik = "1301123456789830";
    const rawEmail = "joko@gmail.com";
    const executor = {
        async execute(_sql, params) {
            assert.deepEqual(params, [77]);
            return [[encryptedProfileRow({
                nik: encryptEmails(rawNik),
                email_encrypted: encryptEmail(rawEmail)
            })]];
        }
    };

    const profile = await getProfilSayaService(77, executor);

    assert.equal(profile.nik, "1301*********830");
    assert.equal(profile.email, "j***@gmail.com");
    assert.equal(profile.rt, null);
    assert.equal(profile.rw, null);
    assert.equal(profile.pekerjaan, undefined);
    assert.equal(profile.account_id, undefined);
    assert.equal(profile.family_id, undefined);
    assert.equal(profile.email_encrypted, undefined);
    assert.equal(JSON.stringify(profile).includes(rawNik), false);
    assert.equal(JSON.stringify(profile).includes(rawEmail), false);
});

test("dua account id tidak dapat saling mengambil profil", async () => {
    const executor = {
        async execute(_sql, [accountId]) {
            if (accountId === 77) {
                return [[encryptedProfileRow({ account_id: 77, nama: "Keluarga A" })]];
            }
            if (accountId === 88) {
                return [[encryptedProfileRow({ account_id: 88, family_id: 9, warga_id: 20, nama: "Keluarga B" })]];
            }
            return [[]];
        }
    };

    const profileA = await getProfilSayaService(77, executor);
    const profileB = await getProfilSayaService(88, executor);

    assert.equal(profileA.nama, "Keluarga A");
    assert.equal(profileB.nama, "Keluarga B");
    assert.notEqual(profileA.nama, profileB.nama);
});

test("email kosong dikembalikan sebagai null", async () => {
    const executor = {
        async execute() {
            return [[encryptedProfileRow({ email_encrypted: null })]];
        }
    };

    const profile = await getProfilSayaService(77, executor);
    assert.equal(profile.email, null);
});

test("GET /api/profil-saya memakai id JWT dan menolak role non-warga", async () => {
    const originalExecute = pool.execute;
    const capturedParams = [];
    pool.execute = async (_sql, params) => {
        capturedParams.push(params);
        return [[encryptedProfileRow()]];
    };

    const app = express();
    app.use("/api", wargaApiRoutes);
    const server = await new Promise(resolve => {
        const listener = app.listen(0, () => resolve(listener));
    });
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
        const wargaToken = jwt.sign({ id: 77, role: "warga" }, process.env.SECRET, { expiresIn: "5m" });
        const response = await fetch(`${baseUrl}/api/profil-saya`, {
            headers: { Authorization: `Bearer ${wargaToken}` }
        });
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.deepEqual(capturedParams, [[77]]);
        assert.equal(body.data.nama, "Joko Santoso");
        assert.equal(body.data.nik, "1301*********830");
        assert.equal(body.data.pekerjaan, undefined);

        const rtToken = jwt.sign({ id: 1, role: "rt" }, process.env.SECRET, { expiresIn: "5m" });
        const forbidden = await fetch(`${baseUrl}/api/profil-saya`, {
            headers: { Authorization: `Bearer ${rtToken}` }
        });
        assert.equal(forbidden.status, 403);

        const parameterized = await fetch(`${baseUrl}/api/profil-saya/88`, {
            headers: { Authorization: `Bearer ${wargaToken}` }
        });
        assert.equal(parameterized.status, 404);
        assert.deepEqual(capturedParams, [[77]]);
    } finally {
        pool.execute = originalExecute;
        await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
});

test("tiga GET legacy dihapus tanpa menghapus PATCH akun dan daftar keluarga", () => {
    const routeMethods = router => router.stack
        .filter(layer => layer.route)
        .map(layer => ({ path: layer.route.path, methods: layer.route.methods }));

    const account = routeMethods(accountRoutes);
    const resident = routeMethods(residentRoutes);

    assert.equal(account.some(route => route.path === "/profile" && route.methods.get), false);
    assert.equal(resident.some(route => route.path === "/my-account" && route.methods.get), false);
    assert.equal(resident.some(route => route.path === "/profile" && route.methods.get), false);

    assert.equal(account.some(route => route.path === "/profile" && route.methods.patch), true);
    assert.equal(resident.some(route => route.path === "/my-account" && route.methods.patch), true);
    assert.equal(resident.some(route => route.path === "/profile" && route.methods.patch), true);
    assert.equal(resident.some(route => route.path === "/getmyfamily/:id" && route.methods.get), true);
});
