import crypto from "node:crypto";

let sequence = 0;

function uniqueDigits(length = 16) {
  sequence += 1;
  const source = `${Date.now()}${process.pid}${sequence}`;
  return source.padEnd(length, "0").slice(-length);
}

function assertExecutor(executor) {
  if (!executor || typeof executor.execute !== "function") {
    throw new TypeError("Seed helper memerlukan mysql2 connection/executor.");
  }
}

export async function seedHouse(executor, overrides = {}) {
  assertExecutor(executor);

  const suffix = uniqueDigits(8);
  const house = {
    blok: `TEST-${suffix}`,
    nomor: suffix,
    alamat: `Alamat test ${suffix}`,
    status: "pribadi",
    ...overrides,
  };

  const [result] = await executor.execute(
    "INSERT INTO house (blok, nomor, alamat, status) VALUES (?, ?, ?, ?)",
    [house.blok, house.nomor, house.alamat, house.status],
  );

  return { id: result.insertId, ...house };
}

export async function seedFamily(executor, overrides = {}) {
  assertExecutor(executor);

  const { house: houseOverrides = {}, houseId, ...familyOverrides } = overrides;
  const house = houseId ? null : await seedHouse(executor, houseOverrides);
  const family = {
    noKk: uniqueDigits(16),
    kepalaKeluargaId: null,
    ...familyOverrides,
  };
  const resolvedHouseId = houseId ?? house.id;

  const [result] = await executor.execute(
    "INSERT INTO family (no_kk, house_id, kepala_keluarga_id) VALUES (?, ?, ?)",
    [family.noKk, resolvedHouseId, family.kepalaKeluargaId],
  );

  return {
    id: result.insertId,
    noKk: family.noKk,
    houseId: resolvedHouseId,
    kepalaKeluargaId: family.kepalaKeluargaId,
    house,
  };
}

export async function seedWarga(executor, overrides = {}) {
  assertExecutor(executor);

  if (!overrides.familyId || !overrides.houseId) {
    throw new Error("seedWarga memerlukan familyId dan houseId.");
  }

  const suffix = uniqueDigits(16);
  const warga = {
    nik: suffix,
    nama: `Warga Test ${suffix.slice(-6)}`,
    jenisKelamin: "Laki-laki",
    tglLahir: "1990-01-01",
    statusHidup: "Hidup",
    noHp: `08${suffix.slice(-10)}`,
    umur: 36,
    statusData: "diterima",
    ...overrides,
  };

  const [result] = await executor.execute(
    `INSERT INTO warga
      (nik, nama, jenis_kelamin, tgl_lahir, status_hidup, no_hp, umur, family_id, house_id, status_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      warga.nik,
      warga.nama,
      warga.jenisKelamin,
      warga.tglLahir,
      warga.statusHidup,
      warga.noHp,
      warga.umur,
      warga.familyId,
      warga.houseId,
      warga.statusData,
    ],
  );

  return { id: result.insertId, ...warga };
}

export async function seedAccount(executor, overrides = {}) {
  assertExecutor(executor);

  const suffix = uniqueDigits(10);
  const email = `test-${suffix}@example.test`;
  const account = {
    username: `test_${suffix}`,
    password: "$argon2id$test-only-password-hash",
    emailEncrypted: Buffer.from(email),
    emailBlindIdx: crypto.createHash("sha256").update(email).digest("hex"),
    role: "warga",
    familyId: null,
    mustChangePassword: 0,
    isVerified: 1,
    ...overrides,
  };

  const [result] = await executor.execute(
    `INSERT INTO acount
      (username, password, email_encrypted, email_blind_idx, role, family_id, must_change_password, is_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      account.username,
      account.password,
      account.emailEncrypted,
      account.emailBlindIdx,
      account.role,
      account.familyId,
      account.mustChangePassword,
      account.isVerified,
    ],
  );

  return { id: result.insertId, ...account };
}

export async function setFamilyHead(executor, familyId, wargaId) {
  assertExecutor(executor);

  await executor.execute(
    "UPDATE family SET kepala_keluarga_id = ? WHERE id = ?",
    [wargaId, familyId],
  );
}

export async function seedKasContribution(executor, overrides = {}) {
  assertExecutor(executor);

  if (!overrides.familyId) {
    throw new Error("seedKasContribution memerlukan familyId.");
  }

  const contribution = {
    amount: 50000,
    category: "sosial",
    description: "Kontribusi kas untuk integration test",
    channel: "transfer",
    proofUrl: null,
    status: "approved",
    rejectReason: null,
    recordedBy: null,
    verifiedBy: null,
    verifiedAt: null,
    ...overrides,
  };

  const [result] = await executor.execute(
    `INSERT INTO kas_contributions
      (family_id, amount, category, description, channel, proof_url, status,
       reject_reason, recorded_by, verified_by, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      contribution.familyId,
      contribution.amount,
      contribution.category,
      contribution.description,
      contribution.channel,
      contribution.proofUrl,
      contribution.status,
      contribution.rejectReason,
      contribution.recordedBy,
      contribution.verifiedBy,
      contribution.verifiedAt,
    ],
  );

  return { id: result.insertId, ...contribution };
}

export async function seedOtpCode(executor, overrides = {}) {
  assertExecutor(executor);

  if (!overrides.userId || !overrides.otpHash) {
    throw new Error("seedOtpCode memerlukan userId dan otpHash.");
  }

  const otp = {
    purpose: "VERIFICATION",
    isUsed: 0,
    attempts: 0,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    ...overrides,
  };

  const [result] = await executor.execute(
    `INSERT INTO otp_codes
      (user_id, otp_hash, purpose, is_used, attempts, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      otp.userId,
      otp.otpHash,
      otp.purpose,
      otp.isUsed,
      otp.attempts,
      otp.expiresAt,
    ],
  );

  return { id: result.insertId, ...otp };
}

export async function seedFamilyWithAccount(executor, overrides = {}) {
  assertExecutor(executor);

  const family = await seedFamily(executor, overrides.family);
  const warga = await seedWarga(executor, {
    familyId: family.id,
    houseId: family.houseId,
    ...overrides.warga,
  });

  await setFamilyHead(executor, family.id, warga.id);

  const account = await seedAccount(executor, {
    familyId: family.id,
    ...overrides.account,
  });

  return {
    house: family.house,
    family: { ...family, kepalaKeluargaId: warga.id },
    warga,
    account,
  };
}
