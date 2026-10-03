const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { toSafeUser, SALT_ROUNDS } = require('./authController');
const {
  requireFields,
  isValidEmail,
  parseId,
  parseEnum,
  optionalText,
  getPagination,
  paginated,
} = require('../utils/validate');

// Admin may only create these two roles. STUDENT / COMPANY must self-register.
const ADMIN_CREATABLE_ROLES = ['FACULTY', 'ADMIN'];
const ALL_ROLES = ['STUDENT', 'COMPANY', 'FACULTY', 'ADMIN'];

const userSelect = {
  id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true,
  faculty: true,
};

// POST /api/admin/users
const createUser = asyncHandler(async (req, res) => {
  requireFields(req.body, ['name', 'email', 'password', 'role']);
  const name = String(req.body.name).trim();
  const email = String(req.body.email).trim().toLowerCase();
  const password = String(req.body.password);
  const role = String(req.body.role).trim().toUpperCase();

  if (!isValidEmail(email)) throw new AppError(400, 'Please enter a valid email address');
  if (password.length < 6) throw new AppError(400, 'Password must be at least 6 characters');
  if (!ADMIN_CREATABLE_ROLES.includes(role)) {
    throw new AppError(400, `Admins can only create these roles: ${ADMIN_CREATABLE_ROLES.join(', ')}`);
  }

  if (await prisma.user.findUnique({ where: { email } })) throw new AppError(409, 'Email is already registered');

  const data = { name, email, password: await bcrypt.hash(password, SALT_ROUNDS), role };
  if (role === 'FACULTY') {
    data.faculty = {
      create: {
        department: optionalText(req.body.department, 'Department', 255) || null,
        employeeId: optionalText(req.body.employeeId, 'Employee ID', 50) || null,
        phone: optionalText(req.body.phone, 'Phone', 20) || null,
      },
    };
  }

  const user = await prisma.user.create({ data, include: { faculty: true } });
  return sendSuccess(res, { user: toSafeUser(user), profile: user.faculty }, 'User created', 201);
});

// GET /api/admin/users  (?role= &search= &page= &limit=)
const listUsers = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const where = {};
  if (req.query.role) where.role = parseEnum(req.query.role, ALL_ROLES, 'role');
  if (req.query.search) {
    where.OR = [
      { name: { contains: String(req.query.search), mode: 'insensitive' } },
      { email: { contains: String(req.query.search), mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, select: userSelect, orderBy: { id: 'asc' }, skip: pagination.skip, take: pagination.take }),
    prisma.user.count({ where }),
  ]);
  return sendSuccess(res, paginated(items, total, pagination), 'Users fetched');
});

// PUT /api/admin/users/:id  (name, email, password; faculty profile fields for FACULTY users)
const updateUser = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body || {};

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'User not found');

  // Changing a role would leave the user with the wrong profile table
  if (body.role !== undefined && String(body.role).trim().toUpperCase() !== user.role) {
    throw new AppError(400, 'A user role cannot be changed. Create a new user instead');
  }

  const data = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new AppError(400, 'Name cannot be empty');
    data.name = name;
  }
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!isValidEmail(email)) throw new AppError(400, 'Please enter a valid email address');
    data.email = email;
  }
  if (body.password !== undefined) {
    if (String(body.password).length < 6) throw new AppError(400, 'Password must be at least 6 characters');
    data.password = await bcrypt.hash(String(body.password), SALT_ROUNDS);
  }

  if (user.role === 'FACULTY') {
    const facultyData = {
      department: optionalText(body.department, 'Department', 255),
      employeeId: optionalText(body.employeeId, 'Employee ID', 50),
      phone: optionalText(body.phone, 'Phone', 20),
    };
    Object.keys(facultyData).forEach((key) => facultyData[key] === undefined && delete facultyData[key]);
    if (Object.keys(facultyData).length > 0) data.faculty = { update: facultyData };
  }

  if (Object.keys(data).length === 0) throw new AppError(400, 'No valid fields to update');

  const updated = await prisma.user.update({ where: { id }, data, select: userSelect });
  return sendSuccess(res, updated, 'User updated');
});

// DELETE /api/admin/users/:id  (profile + notifications are removed by DB cascade)
const deleteUser = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (id === req.user.id) throw new AppError(400, 'You cannot delete your own account');

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'User not found');

  await prisma.user.delete({ where: { id } });
  return sendSuccess(res, null, 'User deleted');
});

// GET /api/admin/students
const listStudents = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const [items, total] = await Promise.all([
    prisma.student.findMany({
      include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
      orderBy: { id: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.student.count(),
  ]);
  return sendSuccess(res, paginated(items, total, pagination), 'Students fetched');
});

// GET /api/admin/companies
const listCompanies = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const [items, total] = await Promise.all([
    prisma.company.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, createdAt: true } },
        _count: { select: { internships: true } },
      },
      orderBy: { id: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.company.count(),
  ]);
  return sendSuccess(res, paginated(items, total, pagination), 'Companies fetched');
});

// GET /api/admin/internships  (?status=)
const listInternships = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const where = {};
  if (req.query.status) where.status = parseEnum(req.query.status, ['DRAFT', 'ACTIVE', 'CLOSED'], 'status');
  const [items, total] = await Promise.all([
    prisma.internship.findMany({
      where,
      include: { company: { select: { id: true, companyName: true } }, _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.internship.count({ where }),
  ]);
  return sendSuccess(res, paginated(items, total, pagination), 'Internships fetched');
});

// GET /api/admin/reports
const getReports = asyncHandler(async (req, res) => {
  const toCounts = (groups, key) => groups.reduce((acc, g) => ({ ...acc, [g[key]]: g._count._all }), {});

  const [
    userGroups, internshipGroups, applicationGroups, attendanceGroups, workLogGroups,
    approvedAttendance, approvedWork, feedbackAgg, placedStudents, totalStudents, topCompanies,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.internship.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.application.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.workLog.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.attendance.aggregate({ where: { status: 'APPROVED' }, _sum: { hours: true } }),
    prisma.workLog.aggregate({ where: { status: 'APPROVED' }, _sum: { hours: true } }),
    prisma.feedback.aggregate({ _avg: { rating: true }, _count: { _all: true } }),
    prisma.application.groupBy({ by: ['studentId'], where: { status: 'ACCEPTED' } }),
    prisma.student.count(),
    prisma.company.findMany({
      select: { id: true, companyName: true, _count: { select: { internships: true } } },
      orderBy: { internships: { _count: 'desc' } },
      take: 5,
    }),
  ]);

  return sendSuccess(
    res,
    {
      usersByRole: toCounts(userGroups, 'role'),
      internshipsByStatus: toCounts(internshipGroups, 'status'),
      applicationsByStatus: toCounts(applicationGroups, 'status'),
      attendanceByStatus: toCounts(attendanceGroups, 'status'),
      workLogsByStatus: toCounts(workLogGroups, 'status'),
      approvedAttendanceHours: Number(approvedAttendance._sum.hours || 0),
      approvedWorkLogHours: Number(approvedWork._sum.hours || 0),
      feedback: { count: feedbackAgg._count._all, averageRating: feedbackAgg._avg.rating },
      placement: {
        totalStudents,
        studentsPlaced: placedStudents.length,
        placementRate: totalStudents ? Math.round((placedStudents.length / totalStudents) * 1000) / 10 : 0,
      },
      topCompaniesByInternships: topCompanies.map((c) => ({
        id: c.id, companyName: c.companyName, internships: c._count.internships,
      })),
    },
    'Report generated'
  );
});

module.exports = {
  createUser, listUsers, updateUser, deleteUser,
  listStudents, listCompanies, listInternships, getReports,
};
