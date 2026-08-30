import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

// Isolated controller/middleware tests: no real database, email or application secret.
process.env.SECRET = randomBytes(32).toString('hex');
mock.module('dotenv', { defaultExport: { config: () => ({}) }, namedExports: { config: () => ({}) } });
mock.module('../config/sqlconfig.js', { defaultExport: {
  execute() { throw new Error('Database access is forbidden in isolated tests'); },
  query() { throw new Error('Database access is forbidden in isolated tests'); },
} });
const citizen = { id: 202, role: 'warga' };
const citizenToken = jwt.sign(citizen, process.env.SECRET, { expiresIn: '1h' });
mock.module('../services/otpService.js', { namedExports: {
  requestOtpService: async () => ({ success: true, userId: citizen.id }),
  verifyOtpService: async () => ({ success: true, userId: citizen.id, is_verified: 1,
    token: citizenToken, user: citizen, role: 'warga', message: 'Verified fixture' }),
} });
mock.module('../services/createAccount.js', { namedExports: {
  generateWargaAccount: async () => ({ userId: citizen.id, username: 'fixture', temporaryPassword: 'Fixture123!',
    token: citizenToken, user: citizen, role: 'warga' }),
  generateStaffAccount: async () => {}, bindAccountToFamilyService: async () => {}, checkAccountStatusService: async () => {},
} });
mock.module('../utils/socket.js', { namedExports: { emitSyncEvent: () => {} } });
const { verifyOtpController } = await import('../controllers/otpController.js');
const { createWargaAccountController } = await import('../controllers/accountController.js');
const { default: jwtAuth } = await import('../middlewares/validationJwt.js');
const { checkRoles } = await import('../middlewares/checkRole.js');

function response() {
  return { code: 200, body: null, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
}
function authenticate(token) {
  const req = { headers: { authorization: `Bearer ${token}` } };
  let authenticated = false;
  jwtAuth(req, response(), () => { authenticated = true; });
  assert.equal(authenticated, true);
  return req;
}

for (const role of ['rt', 'bendahara', 'sekertaris']) {
  test(`${role}: account/OTP response cannot replace principal; next JWT-authorized action succeeds`, async () => {
    const adminToken = jwt.sign({ id: 1, role }, process.env.SECRET, { expiresIn: '1h' });
    const req = authenticate(adminToken);
    const before = structuredClone(req.user);
    const authHeader = req.headers.authorization;
    req.body = { familyId: 10, username: 'fixture', password: 'Fixture123!', email: 'fixture@example.invalid' };
    const created = response();
    let canCreate = false;
    checkRoles('rt')(req, created, () => { canCreate = true; });
    if (canCreate) {
      await createWargaAccountController(req, created);
      assert.equal(created.code, 201);
      assert.equal(created.body.token, undefined);
      assert.equal(created.body.user, undefined);
      assert.equal(created.body.output.token, undefined);
    } else {
      assert.equal(created.code, 403, 'Keep RT-only create-account policy');
    }
    req.body = { userId: citizen.id, otp: '111111' };
    const verified = response();
    await verifyOtpController(req, verified);
    assert.equal(verified.code, 200);
    assert.deepEqual(Object.keys(verified.body).sort(), ['is_verified', 'message', 'pesan', 'success', 'userId']);
    assert.deepEqual(req.user, before);
    assert.equal(req.headers.authorization, authHeader);
    const nextReq = authenticate(adminToken);
    let allowed = false;
    checkRoles('rt', 'bendahara', 'sekretaris')(nextReq, response(), () => { allowed = true; });
    assert.equal(allowed, true, 'All staff retain access to shared admin actions');
    assert.equal(nextReq.user.role, role);
  });
}

test('resident JWT remains forbidden from staff operations', () => {
  const req = authenticate(citizenToken);
  const res = response();
  let allowed = false;
  checkRoles('rt', 'bendahara', 'sekretaris')(req, res, () => { allowed = true; });
  assert.equal(allowed, false);
  assert.equal(res.code, 403);
});
