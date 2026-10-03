const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { notifyUser } = require('../utils/notify');
const { getStudentByUserId, assertStudentAccepted } = require('../utils/profiles');
const {
  requireFields,
  parseId,
  parseEnum,
  parsePastOrTodayDate,
  parseNumber,
} = require('../utils/validate');

const workLogInclude = {
  internship: { select: { id: true, title: true, company: { select: { id: true, companyName: true, userId: true } } } },
  student: { select: { id: true, usn: true, user: { select: { name: true } } } },
};

// Hide company.userId from API responses
const clean = (log) => {
  const { company, ...internship } = log.internship;
  return { ...log, internship: { ...internship, company: { id: company.id, companyName: company.companyName } } };
};

const readDescription = (value) => {
  if (typeof value !== 'string' || value.trim() === '') throw new AppError(400, 'Description is required');
  if (value.length > 5000) throw new AppError(400, 'Description is too long');
  return value.trim();
};

// POST /api/worklogs
const createWorkLog = asyncHandler(async (req, res) => {
  requireFields(req.body, ['internshipId', 'date', 'description', 'hours']);
  const internshipId = parseId(req.body.internshipId, 'internshipId');
  const date = parsePastOrTodayDate(req.body.date);
  const description = readDescription(req.body.description);
  const hours = parseNumber(req.body.hours, 'Hours', { min: 0, max: 24, minExclusive: true });

  const student = await getStudentByUserId(req.user.id);
  await assertStudentAccepted(student.id, internshipId);

  const workLog = await prisma.workLog.create({
    data: { studentId: student.id, internshipId, date, description, hours },
    include: workLogInclude,
  });

  await notifyUser(
    workLog.internship.company.userId,
    'Work log submitted',
    `A student submitted a work log for "${workLog.internship.title}".`,
    'WORKLOG'
  );

  return sendSuccess(res, clean(workLog), 'Work log submitted', 201);
});

// GET /api/worklogs/student
const listStudentWorkLogs = asyncHandler(async (req, res) => {
  const student = await getStudentByUserId(req.user.id);
  const where = { studentId: student.id };
  if (req.query.internshipId) where.internshipId = parseId(req.query.internshipId, 'internshipId');
  if (req.query.status) where.status = parseEnum(req.query.status, ['PENDING', 'APPROVED', 'REJECTED'], 'status');

  const logs = await prisma.workLog.findMany({ where, include: workLogInclude, orderBy: { date: 'desc' } });
  return sendSuccess(res, logs.map(clean), 'Work logs fetched');
});

// GET /api/worklogs/:id  (student owner, company owner, faculty, admin)
const getWorkLog = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const log = await prisma.workLog.findUnique({ where: { id }, include: workLogInclude });
  if (!log) throw new AppError(404, 'Work log not found');

  if (req.user.role === 'STUDENT') {
    const student = await getStudentByUserId(req.user.id);
    if (log.studentId !== student.id) throw new AppError(403, 'You can only view your own work logs');
  } else if (req.user.role === 'COMPANY') {
    if (log.internship.company.userId !== req.user.id) {
      throw new AppError(403, 'This work log does not belong to your internships');
    }
  }
  return sendSuccess(res, clean(log), 'Work log fetched');
});

// PUT /api/worklogs/:id  (student edits own log while it is PENDING or REJECTED; it goes back to PENDING)
const updateWorkLog = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body || {};
  const student = await getStudentByUserId(req.user.id);

  const log = await prisma.workLog.findUnique({ where: { id } });
  if (!log) throw new AppError(404, 'Work log not found');
  if (log.studentId !== student.id) throw new AppError(403, 'You can only edit your own work logs');
  if (log.status === 'APPROVED') throw new AppError(409, 'An approved work log cannot be edited');

  const data = { status: 'PENDING' };
  if (body.date !== undefined) data.date = parsePastOrTodayDate(body.date);
  if (body.description !== undefined) data.description = readDescription(body.description);
  if (body.hours !== undefined) data.hours = parseNumber(body.hours, 'Hours', { min: 0, max: 24, minExclusive: true });
  if (Object.keys(data).length === 1) throw new AppError(400, 'Nothing to update. Send date, description or hours');

  const updated = await prisma.workLog.update({ where: { id }, data, include: workLogInclude });
  return sendSuccess(res, clean(updated), 'Work log updated');
});

module.exports = { createWorkLog, listStudentWorkLogs, getWorkLog, updateWorkLog };
