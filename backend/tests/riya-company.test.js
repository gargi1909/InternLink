// End-to-end tests for Riya's company module (profile, internships, applications,
// attendance approval, work-log approval, feedback, completion).
//
// Run from the backend folder:   node --test "tests/*.test.js"
// (On Node 21+, "node --test tests/" fails with MODULE_NOT_FOUND: arguments are treated as file
//  patterns, so the folder itself gets loaded as a script. Plain "node --test" also works.)
//
// Needs a working .env (DATABASE_URL, JWT_SECRET) and migrated database.
// It starts server.js on TEST_PORT (default 5055), creates its own throwaway users whose
// emails start with "riya-test-<timestamp>", and deletes them again at the end.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const prisma = require('../src/config/prisma');

const PORT = Number(process.env.TEST_PORT) || 5055;
const API = `http://localhost:${PORT}/api`;
const TAG = `riya-test-${Date.now()}`;
const PASSWORD = crypto.randomBytes(12).toString('hex'); // throwaway, never stored anywhere

let server;
const tokens = {};
const ids = {};

// ---------- helpers ----------

const api = async (method, url, token, body) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const sendBody = body && method !== 'GET'; // fetch does not allow a body on GET
  const response = await fetch(API + url, { method, headers, body: sendBody ? JSON.stringify(body) : undefined });
  const json = await response.json();
  return { status: response.status, body: json, raw: JSON.stringify(json) };
};

const createUser = async (key, role, profile) => {
  const user = await prisma.user.create({
    data: {
      name: `${TAG} ${key}`,
      email: `${TAG}-${key}@test.local`.toLowerCase(), // register/login store and look up emails in lowercase
      password: await bcrypt.hash(PASSWORD, 10),
      role,
      ...profile,
    },
    include: { company: true, student: true, faculty: true },
  });
  const login = await api('POST', '/auth/login', null, { email: user.email, password: PASSWORD });
  assert.equal(login.status, 200, `login failed for ${key}`);
  tokens[key] = login.body.data.token;
  return user;
};

const waitForServer = async () => {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`${API}/health`);
      if (res.ok) return;
    } catch (err) {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Server did not start');
};

// ---------- setup / teardown ----------

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await waitForServer();

  const companyA = await createUser('companyA', 'COMPANY', { company: { create: { companyName: `${TAG} Company A` } } });
  const companyB = await createUser('companyB', 'COMPANY', { company: { create: { companyName: `${TAG} Company B` } } });
  const student1 = await createUser('student1', 'STUDENT', { student: { create: {} } });
  const student2 = await createUser('student2', 'STUDENT', { student: { create: {} } });
  await createUser('faculty', 'FACULTY', { faculty: { create: {} } });
  await createUser('admin', 'ADMIN', {});

  ids.companyA = companyA.company.id;
  ids.companyB = companyB.company.id;
  ids.student1 = student1.student.id;
  ids.student1User = student1.id;
  ids.student2 = student2.student.id;

  // Company B's data (created directly; Company A must never be able to touch it)
  const internshipB = await prisma.internship.create({
    data: { companyId: ids.companyB, title: `${TAG} B internship`, status: 'ACTIVE' },
  });
  ids.internshipB = internshipB.id;
  ids.applicationB = (await prisma.application.create({
    data: { studentId: ids.student2, internshipId: ids.internshipB, status: 'ACCEPTED' },
  })).id;
  ids.attendanceB = (await prisma.attendance.create({
    data: { studentId: ids.student2, internshipId: ids.internshipB, date: new Date('2026-01-05'), hours: 8 },
  })).id;
  ids.workLogB = (await prisma.workLog.create({
    data: { studentId: ids.student2, internshipId: ids.internshipB, date: new Date('2026-01-05'), description: 'B work', hours: 8 },
  })).id;
  ids.feedbackB = (await prisma.feedback.create({
    data: { companyId: ids.companyB, studentId: ids.student2, internshipId: ids.internshipB, rating: 4 },
  })).id;
});

after(async () => {
  // Cascades remove profiles, internships, applications, attendance, work logs, feedback, notifications
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.$disconnect();
  if (server) server.kill();
});

// ---------- role & auth security ----------

test('no token -> 401 on company routes', async () => {
  assert.equal((await api('GET', '/companies/profile')).status, 401);
  assert.equal((await api('GET', '/feedback/company')).status, 401);
});

test('malformed, forged and wrong-scheme tokens -> 401', async () => {
  const jwt = require('jsonwebtoken');
  const forged = jwt.sign({ id: 1, role: 'COMPANY' }, 'not-the-real-secret');
  const unsigned = jwt.sign({ id: 1, role: 'COMPANY' }, null, { algorithm: 'none' });
  for (const token of ['garbage', forged, unsigned]) {
    const res = await api('GET', '/companies/profile', token);
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  }
  const basic = await fetch(`${API}/companies/profile`, { headers: { Authorization: `Basic ${tokens.companyA}` } });
  assert.equal(basic.status, 401);
});

test('STUDENT, FACULTY and ADMIN get 403 on company-only routes', async () => {
  const routes = [
    ['GET', '/companies/profile'],
    ['GET', '/companies/internships'],
    ['GET', '/companies/applications'],
    ['GET', '/applications/company'],
    ['GET', '/companies/attendance'],
    ['GET', '/companies/worklogs'],
    ['GET', '/feedback/company'],
    ['POST', '/feedback'],
    ['PUT', `/companies/internships/${ids.internshipB}/complete`],
  ];
  for (const role of ['student1', 'faculty', 'admin']) {
    for (const [method, url] of routes) {
      const res = await api(method, url, tokens[role], {});
      assert.equal(res.status, 403, `${role} ${method} ${url} should be 403, got ${res.status}`);
      assert.equal(res.body.success, false);
    }
  }
});

// ---------- profile ----------

test('company gets its own profile, without password data', async () => {
  const res = await api('GET', '/companies/profile', tokens.companyA);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.id, ids.companyA);
  assert.equal(res.body.data.companyName, `${TAG} Company A`);
  assert.ok(!res.raw.includes('password'), 'response must not contain password');
});

test('profile update changes own profile only and ignores id/userId', async () => {
  const before = await prisma.company.findUnique({ where: { id: ids.companyA } });
  const res = await api('PUT', '/companies/profile', tokens.companyA, {
    description: 'We build things',
    location: 'Pune',
    contactEmail: 'HR@Example.com',
    id: ids.companyB,
    userId: 999999,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.id, ids.companyA);
  assert.equal(res.body.data.userId, before.userId);
  assert.equal(res.body.data.description, 'We build things');
  assert.equal(res.body.data.contactEmail, 'hr@example.com');

  const companyB = await prisma.company.findUnique({ where: { id: ids.companyB } });
  assert.equal(companyB.description, null, 'company B must be untouched');
});

test('profile update validation', async () => {
  assert.equal((await api('PUT', '/companies/profile', tokens.companyA, { companyName: '  ' })).status, 400);
  assert.equal((await api('PUT', '/companies/profile', tokens.companyA, { contactEmail: 'not-an-email' })).status, 400);
  assert.equal((await api('PUT', '/companies/profile', tokens.companyA, { website: 'ftp://x' })).status, 400);
  assert.equal((await api('PUT', '/companies/profile', tokens.companyA, { userId: 5 })).status, 400, 'no valid fields');
});

// ---------- internships ----------

test('create internship: default DRAFT, companyId from token (body companyId ignored)', async () => {
  const res = await api('POST', '/companies/internships', tokens.companyA, {
    title: `${TAG} A internship`,
    department: 'Engineering',
    companyId: ids.companyB,
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, 'DRAFT');
  assert.equal(res.body.data.companyId, ids.companyA);
  ids.internshipA = res.body.data.id;
});

test('create internship validation', async () => {
  assert.equal((await api('POST', '/companies/internships', tokens.companyA, {})).status, 400);
  assert.equal((await api('POST', '/companies/internships', tokens.companyA, { title: 'x', status: 'COMPLETED' })).status, 400);
});

test('update own internship works; updating another company\'s internship is 403', async () => {
  const own = await api('PUT', `/companies/internships/${ids.internshipA}`, tokens.companyA, { status: 'ACTIVE', location: 'Remote' });
  assert.equal(own.status, 200);
  assert.equal(own.body.data.status, 'ACTIVE');

  const other = await api('PUT', `/companies/internships/${ids.internshipB}`, tokens.companyA, { title: 'hacked' });
  assert.equal(other.status, 403);
  const internshipB = await prisma.internship.findUnique({ where: { id: ids.internshipB } });
  assert.equal(internshipB.title, `${TAG} B internship`);

  assert.equal((await api('PUT', '/companies/internships/abc', tokens.companyA, { title: 'x' })).status, 400);
  assert.equal((await api('PUT', '/companies/internships/999999999', tokens.companyA, { title: 'x' })).status, 404);
});

test('list internships returns only own internships', async () => {
  const res = await api('GET', '/companies/internships', tokens.companyA);
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length >= 1);
  assert.ok(res.body.data.every((i) => i.companyId === ids.companyA));
  assert.ok(!res.body.data.some((i) => i.id === ids.internshipB));
});

test('delete: own empty internship 200, other company 403', async () => {
  const created = await api('POST', '/companies/internships', tokens.companyA, { title: `${TAG} to delete` });
  const res = await api('DELETE', `/companies/internships/${created.body.data.id}`, tokens.companyA);
  assert.equal(res.status, 200);
  assert.equal(await prisma.internship.findUnique({ where: { id: created.body.data.id } }), null);

  assert.equal((await api('DELETE', `/companies/internships/${ids.internshipB}`, tokens.companyA)).status, 403);
  assert.ok(await prisma.internship.findUnique({ where: { id: ids.internshipB } }), 'B internship still exists');
});

// ---------- applications ----------

test('applications: list/get only own; other company 403; no password data', async () => {
  ids.applicationA = (await prisma.application.create({
    data: { studentId: ids.student1, internshipId: ids.internshipA },
  })).id;

  for (const url of ['/companies/applications', '/applications/company']) {
    const list = await api('GET', url, tokens.companyA);
    assert.equal(list.status, 200);
    assert.ok(list.body.data.some((a) => a.id === ids.applicationA));
    assert.ok(!list.body.data.some((a) => a.id === ids.applicationB));
    assert.ok(!list.raw.includes('password'));
  }

  const one = await api('GET', `/companies/applications/${ids.applicationA}`, tokens.companyA);
  assert.equal(one.status, 200);
  assert.equal(one.body.data.student.user.name, `${TAG} student1`);
  assert.equal(one.body.data.internship.id, ids.internshipA);

  assert.equal((await api('GET', `/companies/applications/${ids.applicationB}`, tokens.companyA)).status, 403);
});

test('delete own internship that has applications -> 409 (close it instead)', async () => {
  assert.equal((await api('DELETE', `/companies/internships/${ids.internshipA}`, tokens.companyA)).status, 409);
});

test('application status: own updates work, invalid 400, other company 403', async () => {
  const shortlisted = await api('PUT', `/companies/applications/${ids.applicationA}/status`, tokens.companyA, { status: 'SHORTLISTED' });
  assert.equal(shortlisted.status, 200);
  assert.equal(shortlisted.body.data.status, 'SHORTLISTED');

  assert.equal((await api('PUT', `/companies/applications/${ids.applicationA}/status`, tokens.companyA, { status: 'HIRED' })).status, 400);
  assert.equal((await api('PUT', `/companies/applications/${ids.applicationA}/status`, tokens.companyA, {})).status, 400);

  const other = await api('PUT', `/companies/applications/${ids.applicationB}/status`, tokens.companyA, { status: 'REJECTED' });
  assert.equal(other.status, 403);
  assert.equal((await prisma.application.findUnique({ where: { id: ids.applicationB } })).status, 'ACCEPTED');

  const accepted = await api('PUT', `/applications/${ids.applicationA}/status`, tokens.companyA, { status: 'ACCEPTED' });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.status, 'ACCEPTED');

  const notification = await prisma.notification.findFirst({ where: { userId: ids.student1User, type: 'APPLICATION' } });
  assert.ok(notification, 'student is notified');
});

// ---------- attendance approval ----------

test('attendance: list own only, approve own, cannot approve twice or approve other company', async () => {
  ids.attendanceA1 = (await prisma.attendance.create({
    data: { studentId: ids.student1, internshipId: ids.internshipA, date: new Date('2026-01-05'), hours: 7.5 },
  })).id;
  ids.attendanceA2 = (await prisma.attendance.create({
    data: { studentId: ids.student1, internshipId: ids.internshipA, date: new Date('2026-01-06'), hours: 6 },
  })).id;

  const list = await api('GET', '/companies/attendance?status=PENDING', tokens.companyA);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.map((r) => r.id).sort(), [ids.attendanceA1, ids.attendanceA2].sort());
  assert.equal(list.body.data[0].student.user.name, `${TAG} student1`);

  const approved = await api('PUT', `/companies/attendance/${ids.attendanceA1}/approve`, tokens.companyA);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.status, 'APPROVED');
  assert.equal((await api('PUT', `/companies/attendance/${ids.attendanceA1}/approve`, tokens.companyA)).status, 409);

  assert.equal((await api('PUT', `/companies/attendance/${ids.attendanceB}/approve`, tokens.companyA)).status, 403);
  assert.equal((await api('PUT', `/companies/attendance/${ids.attendanceB}/reject`, tokens.companyA)).status, 403);
  assert.equal((await prisma.attendance.findUnique({ where: { id: ids.attendanceB } })).status, 'PENDING');

  assert.equal((await api('GET', '/companies/attendance?status=WRONG', tokens.companyA)).status, 400);
});

test('attendance: reject own with remarks', async () => {
  const res = await api('PUT', `/companies/attendance/${ids.attendanceA2}/reject`, tokens.companyA, { remarks: 'Hours do not match' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'REJECTED');
  assert.equal(res.body.data.remarks, 'Hours do not match');
});

// ---------- work-log approval ----------

test('work logs: list own only, approve/reject own, other company 403', async () => {
  ids.workLogA1 = (await prisma.workLog.create({
    data: { studentId: ids.student1, internshipId: ids.internshipA, date: new Date('2026-01-05'), description: 'A1', hours: 4 },
  })).id;
  ids.workLogA2 = (await prisma.workLog.create({
    data: { studentId: ids.student1, internshipId: ids.internshipA, date: new Date('2026-01-06'), description: 'A2', hours: 4 },
  })).id;

  const list = await api('GET', '/companies/worklogs', tokens.companyA);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.map((w) => w.id).sort(), [ids.workLogA1, ids.workLogA2].sort());

  const approved = await api('PUT', `/companies/worklogs/${ids.workLogA1}/approve`, tokens.companyA);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.status, 'APPROVED');

  const rejected = await api('PUT', `/companies/worklogs/${ids.workLogA2}/reject`, tokens.companyA);
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.data.status, 'REJECTED');
  assert.equal((await api('PUT', `/companies/worklogs/${ids.workLogA2}/approve`, tokens.companyA)).status, 409);

  assert.equal((await api('PUT', `/companies/worklogs/${ids.workLogB}/approve`, tokens.companyA)).status, 403);
  assert.equal((await api('PUT', `/companies/worklogs/${ids.workLogB}/reject`, tokens.companyA)).status, 403);
  assert.equal((await prisma.workLog.findUnique({ where: { id: ids.workLogB } })).status, 'PENDING');
});

// ---------- regression: concurrency and invalid IDs ----------

test('approve + reject sent at the same time: exactly one wins, one notification', async () => {
  const notifications = () => prisma.notification.count({ where: { userId: ids.student1User, type: { in: ['ATTENDANCE', 'WORKLOG'] } } });
  const before = await notifications();

  for (let day = 10; day < 15; day += 1) {
    const attendance = await prisma.attendance.create({
      data: { studentId: ids.student1, internshipId: ids.internshipA, date: new Date(Date.UTC(2026, 0, day)), hours: 8 },
    });
    const workLog = await prisma.workLog.create({
      data: { studentId: ids.student1, internshipId: ids.internshipA, date: new Date(Date.UTC(2026, 0, day)), description: 'race', hours: 8 },
    });
    for (const [url, model, id] of [['attendance', 'attendance', attendance.id], ['worklogs', 'workLog', workLog.id]]) {
      const results = await Promise.all([
        api('PUT', `/companies/${url}/${id}/approve`, tokens.companyA),
        api('PUT', `/companies/${url}/${id}/reject`, tokens.companyA),
      ]);
      const statuses = results.map((r) => r.status).sort();
      assert.deepEqual(statuses, [200, 409], `${url} ${id}: got ${statuses}`);
      const winner = results.find((r) => r.status === 200).body.data.status;
      assert.equal((await prisma[model].findUnique({ where: { id } })).status, winner, 'database matches the winning response');
    }
  }
  assert.equal(await notifications(), before + 10, 'one notification per record, not two');
});

test('complete sent twice at the same time: one 200, one 409', async () => {
  const internship = await prisma.internship.create({ data: { companyId: ids.companyA, title: `${TAG} race close`, status: 'ACTIVE' } });
  const results = await Promise.all([
    api('PUT', `/companies/internships/${internship.id}/complete`, tokens.companyA),
    api('PUT', `/companies/internships/${internship.id}/complete`, tokens.companyA),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});

test('out-of-range and non-numeric IDs -> 400 (not 500)', async () => {
  const huge = '99999999999';
  const cases = [
    ['GET', `/companies/applications/${huge}`],
    ['PUT', `/companies/applications/${huge}/status`, { status: 'SHORTLISTED' }],
    ['PUT', `/companies/internships/${huge}`, { title: 'x' }],
    ['DELETE', `/companies/internships/${huge}`],
    ['PUT', `/companies/internships/${huge}/complete`],
    ['PUT', `/companies/attendance/${huge}/approve`],
    ['PUT', `/companies/worklogs/${huge}/reject`],
    ['GET', `/companies/attendance?internshipId=${huge}`],
    ['POST', '/feedback', { studentId: huge, internshipId: ids.internshipA, rating: 5, comments: 'x' }],
    ['PUT', '/companies/attendance/1.5/approve'],
    ['PUT', '/companies/worklogs/-3/approve'],
    ['GET', '/companies/applications/abc'],
  ];
  for (const [method, url, body] of cases) {
    const res = await api(method, url, tokens.companyA, body);
    assert.equal(res.status, 400, `${method} ${url} should be 400, got ${res.status}`);
  }
});

test('missing records -> 404', async () => {
  assert.equal((await api('PUT', '/companies/attendance/2147483647/approve', tokens.companyA)).status, 404);
  assert.equal((await api('PUT', '/companies/worklogs/2147483647/approve', tokens.companyA)).status, 404);
  assert.equal((await api('GET', '/companies/applications/2147483647', tokens.companyA)).status, 404);
  assert.equal((await api('PUT', '/companies/internships/2147483647/complete', tokens.companyA)).status, 404);
});

// ---------- feedback ----------

test('feedback validation: rating must be an integer 1-5, comments required', async () => {
  const base = { studentId: ids.student1, internshipId: ids.internshipA, comments: 'Great work' };
  for (const rating of [0, -1, 6, 3.5, 'abc']) {
    const res = await api('POST', '/feedback', tokens.companyA, { ...base, rating });
    assert.equal(res.status, 400, `rating ${rating} should be rejected`);
  }
  assert.equal((await api('POST', '/feedback', tokens.companyA, { studentId: ids.student1, internshipId: ids.internshipA, rating: 5 })).status, 400);
  assert.equal((await api('POST', '/feedback', tokens.companyA, { ...base, rating: 5, comments: '   ' })).status, 400);
});

test('feedback: other company internship 403, non-accepted student 400', async () => {
  const otherCompany = await api('POST', '/feedback', tokens.companyA, {
    studentId: ids.student2, internshipId: ids.internshipB, rating: 5, comments: 'x',
  });
  assert.equal(otherCompany.status, 403);

  const notAccepted = await api('POST', '/feedback', tokens.companyA, {
    studentId: ids.student2, internshipId: ids.internshipA, rating: 5, comments: 'x',
  });
  assert.equal(notAccepted.status, 400);
});

test('feedback: valid creates 201, duplicate 409, list shows only own', async () => {
  const body = { studentId: ids.student1, internshipId: ids.internshipA, rating: 5, comments: 'Excellent intern' };
  const created = await api('POST', '/feedback', tokens.companyA, body);
  assert.equal(created.status, 201);
  assert.equal(created.body.data.companyId, ids.companyA);
  assert.equal(created.body.data.rating, 5);

  assert.equal((await api('POST', '/feedback', tokens.companyA, body)).status, 409);

  const list = await api('GET', '/feedback/company', tokens.companyA);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((f) => f.id === created.body.data.id));
  assert.ok(list.body.data.every((f) => f.companyId === ids.companyA));
  assert.ok(!list.body.data.some((f) => f.id === ids.feedbackB));
});

// ---------- completion ----------

test('complete: other company 403, own -> CLOSED, again -> 409', async () => {
  assert.equal((await api('PUT', `/companies/internships/${ids.internshipB}/complete`, tokens.companyA)).status, 403);
  assert.equal((await prisma.internship.findUnique({ where: { id: ids.internshipB } })).status, 'ACTIVE');

  const res = await api('PUT', `/companies/internships/${ids.internshipA}/complete`, tokens.companyA);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'CLOSED');

  assert.equal((await api('PUT', `/companies/internships/${ids.internshipA}/complete`, tokens.companyA)).status, 409);
});
