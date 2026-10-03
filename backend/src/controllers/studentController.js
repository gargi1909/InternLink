const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { getStudentByUserId } = require('../utils/profiles');
const { optionalText, optionalUrl, parseInteger, parseNumber } = require('../utils/validate');

const withUserInfo = (student) => {
  const { user, ...profile } = student;
  return { ...profile, name: user.name, email: user.email };
};

// GET /api/students/profile
const getProfile = asyncHandler(async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user.id },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!student) throw new AppError(404, 'Student profile not found');
  return sendSuccess(res, withUserInfo(student), 'Profile fetched');
});

// PUT /api/students/profile  (email is read-only: it belongs to users.email)
const updateProfile = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const student = await getStudentByUserId(req.user.id);

  const data = {
    college: optionalText(body.college, 'College', 255),
    course: optionalText(body.course, 'Course', 255),
    usn: optionalText(body.usn, 'USN', 50),
    academicStatus: optionalText(body.academicStatus, 'Academic status', 100),
    department: optionalText(body.department, 'Department', 255),
    address: optionalText(body.address, 'Address', 1000),
    phone: optionalText(body.phone, 'Phone', 20),
    resumeUrl: optionalUrl(body.resumeUrl, 'Resume URL'),
  };

  if (data.usn) data.usn = data.usn.toUpperCase();
  if (data.phone && !/^[0-9+\-\s()]{7,20}$/.test(data.phone)) {
    throw new AppError(400, 'Phone number is not valid');
  }

  // Skills can be sent as text or as an array
  if (Array.isArray(body.skills)) {
    data.skills = body.skills.map((skill) => String(skill).trim()).filter(Boolean).join(', ') || null;
  } else {
    data.skills = optionalText(body.skills, 'Skills', 2000);
  }

  // Numeric fields (blank/null clears the value)
  const clearable = (value) => value === null || value === '';
  if (body.year !== undefined) {
    data.year = clearable(body.year) ? null : parseInteger(body.year, 'Year', { min: 1, max: 6 });
  }
  if (body.semester !== undefined) {
    data.semester = clearable(body.semester) ? null : parseInteger(body.semester, 'Semester', { min: 1, max: 12 });
  }
  if (body.cgpa !== undefined) {
    data.cgpa = clearable(body.cgpa) ? null : parseNumber(body.cgpa, 'CGPA', { min: 0, max: 10 });
  }

  // Remove fields that were not sent so they stay unchanged
  Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);

  // Name lives on the users table
  let name;
  if (body.name !== undefined) {
    name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new AppError(400, 'Name cannot be empty');
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (name) await tx.user.update({ where: { id: req.user.id }, data: { name } });
    return tx.student.update({
      where: { id: student.id },
      data,
      include: { user: { select: { name: true, email: true } } },
    });
  });

  return sendSuccess(res, withUserInfo(updated), 'Profile updated');
});

// GET /api/students/applications
const getApplications = asyncHandler(async (req, res) => {
  const student = await getStudentByUserId(req.user.id);
  const applications = await prisma.application.findMany({
    where: { studentId: student.id },
    include: { internship: { include: { company: { select: { id: true, companyName: true, location: true } } } } },
    orderBy: { appliedAt: 'desc' },
  });
  return sendSuccess(res, applications, 'Applications fetched');
});

// GET /api/students/internship  -> the internship the student is currently placed in
const getCurrentInternship = asyncHandler(async (req, res) => {
  const student = await getStudentByUserId(req.user.id);
  const application = await prisma.application.findFirst({
    where: { studentId: student.id, status: 'ACCEPTED', internship: { status: { not: 'CLOSED' } } },
    include: { internship: { include: { company: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  return sendSuccess(
    res,
    application,
    application ? 'Current internship fetched' : 'No current internship'
  );
});

// GET /api/students/dashboard
const getDashboard = asyncHandler(async (req, res) => {
  const student = await getStudentByUserId(req.user.id);
  const where = { studentId: student.id };

  const [applicationGroups, attendanceGroups, workLogGroups, approvedAttendance, approvedWork, current, unread, recent] =
    await Promise.all([
      prisma.application.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.attendance.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.workLog.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.attendance.aggregate({ where: { ...where, status: 'APPROVED' }, _sum: { hours: true } }),
      prisma.workLog.aggregate({ where: { ...where, status: 'APPROVED' }, _sum: { hours: true } }),
      prisma.application.findFirst({
        where: { ...where, status: 'ACCEPTED', internship: { status: { not: 'CLOSED' } } },
        include: { internship: { include: { company: { select: { id: true, companyName: true } } } } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
      prisma.application.findMany({
        where,
        include: { internship: { select: { id: true, title: true, company: { select: { companyName: true } } } } },
        orderBy: { appliedAt: 'desc' },
        take: 5,
      }),
    ]);

  const toCounts = (groups) =>
    groups.reduce((acc, group) => ({ ...acc, [group.status]: group._count._all }), {});
  const sumOf = (aggregate) => Number(aggregate._sum.hours || 0);

  return sendSuccess(
    res,
    {
      currentInternship: current,
      applications: { total: applicationGroups.reduce((sum, g) => sum + g._count._all, 0), byStatus: toCounts(applicationGroups) },
      attendance: { byStatus: toCounts(attendanceGroups), approvedHours: sumOf(approvedAttendance) },
      workLogs: { byStatus: toCounts(workLogGroups), approvedHours: sumOf(approvedWork) },
      unreadNotifications: unread,
      recentApplications: recent,
    },
    'Dashboard fetched'
  );
});

module.exports = { getProfile, updateProfile, getDashboard, getApplications, getCurrentInternship };
