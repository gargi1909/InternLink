const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { requireFields, isValidEmail } = require('../utils/validate');

const SALT_ROUNDS = 10;
const SELF_REGISTER_ROLES = ['STUDENT', 'COMPANY'];
const ALL_ROLES = ['STUDENT', 'COMPANY', 'FACULTY', 'ADMIN'];

// Never send the password hash to the client
const toSafeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  requireFields(req.body, ['name', 'email', 'password', 'role']);

  const name = String(req.body.name).trim();
  const email = String(req.body.email).trim().toLowerCase();
  const password = String(req.body.password);
  const role = String(req.body.role).trim().toUpperCase();

  if (!isValidEmail(email)) throw new AppError(400, 'Please enter a valid email address');
  if (password.length < 6) throw new AppError(400, 'Password must be at least 6 characters');
  if (!ALL_ROLES.includes(role)) throw new AppError(400, `Invalid role. Allowed: ${SELF_REGISTER_ROLES.join(', ')}`);
  if (!SELF_REGISTER_ROLES.includes(role)) {
    throw new AppError(403, 'Only STUDENT and COMPANY accounts can self-register');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, 'Email is already registered');

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  // Nested create = user + profile are saved in ONE transaction
  const profileData =
    role === 'STUDENT' ? { student: { create: {} } } : { company: { create: { companyName: name } } };

  const user = await prisma.user.create({
    data: { name, email, password: hashedPassword, role, ...profileData },
    include: { student: true, company: true },
  });

  const { student, company } = user;
  return sendSuccess(
    res,
    { user: toSafeUser(user), profile: role === 'STUDENT' ? student : company },
    'Registration successful',
    201
  );
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  requireFields(req.body, ['email', 'password']);

  const email = String(req.body.email).trim().toLowerCase();
  const password = String(req.body.password);

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordMatches = user ? await bcrypt.compare(password, user.password) : false;

  // Same message for wrong email and wrong password (don't reveal which one)
  if (!user || !passwordMatches) throw new AppError(401, 'Invalid credentials');

  return sendSuccess(res, { token: signToken(user), user: toSafeUser(user) }, 'Login successful');
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { student: true, company: true, faculty: true },
  });
  if (!user) throw new AppError(404, 'User not found');

  const profile = user.student || user.company || user.faculty || null;
  return sendSuccess(res, { user: toSafeUser(user), profile }, 'Current user fetched');
});

module.exports = { register, login, me, toSafeUser, SALT_ROUNDS };
