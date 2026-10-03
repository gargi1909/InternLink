const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { parseId, parseEnum, getPagination, paginated } = require('../utils/validate');

const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const studentSummary = { select: { id: true, usn: true, department: true, user: { select: { name: true, email: true } } } };

const sumHours = (records, status) =>
  records.filter((r) => r.status === status).reduce((sum, r) => sum + Number(r.hours), 0);

// GET /api/faculty/dashboard
const getDashboard = asyncHandler(async (req, res) => {
  const [students, activeInternships, placedGroups, pendingAttendance, pendingWorkLogs, applicationGroups] =
    await Promise.all([
      prisma.student.count(),
      prisma.internship.count({ where: { status: 'ACTIVE' } }),
      prisma.application.groupBy({ by: ['studentId'], where: { status: 'ACCEPTED' } }),
      prisma.attendance.count({ where: { status: 'PENDING' } }),
      prisma.workLog.count({ where: { status: 'PENDING' } }),
      prisma.application.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

  return sendSuccess(
    res,
    {
      totalStudents: students,
      activeInternships,
      studentsPlaced: placedGroups.length,
      pendingAttendance,
      pendingWorkLogs,
      applicationsByStatus: applicationGroups.reduce((acc, g) => ({ ...acc, [g.status]: g._count._all }), {}),
    },
    'Faculty dashboard fetched'
  );
});

// GET /api/faculty/students  (?search= &department= &page= &limit=)
const listStudents = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const where = {};
  if (req.query.department) where.department = { contains: String(req.query.department), mode: 'insensitive' };
  if (req.query.search) {
    const search = String(req.query.search);
    where.OR = [
      { usn: { contains: search, mode: 'insensitive' } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
      { user: { email: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
        applications: {
          where: { status: 'ACCEPTED' },
          select: { internship: { select: { id: true, title: true, status: true, company: { select: { companyName: true } } } } },
        },
      },
      orderBy: { id: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.student.count({ where }),
  ]);

  return sendSuccess(res, paginated(items, total, pagination), 'Students fetched');
});

// GET /api/faculty/students/:id/progress   (:id = students.id)
const getStudentProgress = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      applications: { include: { internship: { select: { id: true, title: true, status: true, company: { select: { companyName: true } } } } } },
      attendance: { orderBy: { date: 'desc' } },
      workLogs: { orderBy: { date: 'desc' } },
      feedback: { include: { internship: { select: { id: true, title: true } } } },
    },
  });
  if (!student) throw new AppError(404, 'Student not found');

  const { attendance, workLogs } = student;
  return sendSuccess(
    res,
    {
      student,
      summary: {
        applications: student.applications.length,
        attendanceDays: attendance.length,
        approvedAttendanceHours: sumHours(attendance, 'APPROVED'),
        pendingAttendance: attendance.filter((a) => a.status === 'PENDING').length,
        workLogs: workLogs.length,
        approvedWorkLogHours: sumHours(workLogs, 'APPROVED'),
        pendingWorkLogs: workLogs.filter((w) => w.status === 'PENDING').length,
        averageRating: student.feedback.length
          ? student.feedback.reduce((sum, f) => sum + f.rating, 0) / student.feedback.length
          : null,
      },
    },
    'Student progress fetched'
  );
});

// Shared filters for attendance / worklog lists
const buildFilters = (query) => {
  const where = {};
  if (query.status) where.status = parseEnum(query.status, APPROVAL_STATUSES, 'status');
  if (query.studentId) where.studentId = parseId(query.studentId, 'studentId');
  if (query.internshipId) where.internshipId = parseId(query.internshipId, 'internshipId');
  return where;
};

// GET /api/faculty/attendance
const listAttendance = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query, 50);
  const where = buildFilters(req.query);
  const [items, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      include: { student: studentSummary, internship: { select: { id: true, title: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.attendance.count({ where }),
  ]);
  return sendSuccess(res, paginated(items, total, pagination), 'Attendance records fetched');
});

// GET /api/faculty/worklogs
const listWorkLogs = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query, 50);
  const where = buildFilters(req.query);
  const [items, total] = await Promise.all([
    prisma.workLog.findMany({
      where,
      include: { student: studentSummary, internship: { select: { id: true, title: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.workLog.count({ where }),
  ]);
  return sendSuccess(res, paginated(items, total, pagination), 'Work logs fetched');
});

module.exports = { getDashboard, listStudents, getStudentProgress, listAttendance, listWorkLogs };
