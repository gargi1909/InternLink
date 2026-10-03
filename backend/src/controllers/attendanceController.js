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
  parseDateOnly,
  parseNumber,
  optionalText,
} = require('../utils/validate');

// POST /api/attendance  (student submits attendance for one day)
const submitAttendance = asyncHandler(async (req, res) => {
  requireFields(req.body, ['internshipId', 'date', 'hours']);
  const internshipId = parseId(req.body.internshipId, 'internshipId');
  const date = parsePastOrTodayDate(req.body.date);
  const hours = parseNumber(req.body.hours, 'Hours', { min: 0, max: 24, minExclusive: true });
  const remarks = optionalText(req.body.remarks, 'Remarks', 1000);

  const student = await getStudentByUserId(req.user.id);
  await assertStudentAccepted(student.id, internshipId);

  const duplicate = await prisma.attendance.findUnique({
    where: { studentId_internshipId_date: { studentId: student.id, internshipId, date } },
  });
  if (duplicate) throw new AppError(409, 'Attendance for this date has already been submitted');

  const attendance = await prisma.attendance.create({
    data: { studentId: student.id, internshipId, date, hours, remarks: remarks || null },
    include: { internship: { select: { id: true, title: true, company: { select: { userId: true } } } } },
  });

  await notifyUser(
    attendance.internship.company.userId,
    'Attendance submitted',
    `A student submitted attendance for ${req.body.date} on "${attendance.internship.title}".`,
    'ATTENDANCE'
  );

  const { company, ...internship } = attendance.internship;
  return sendSuccess(res, { ...attendance, internship }, 'Attendance submitted', 201);
});

// GET /api/attendance/student  (?internshipId= &status= &from= &to=)
const listStudentAttendance = asyncHandler(async (req, res) => {
  const student = await getStudentByUserId(req.user.id);
  const where = { studentId: student.id };

  if (req.query.internshipId) where.internshipId = parseId(req.query.internshipId, 'internshipId');
  if (req.query.status) where.status = parseEnum(req.query.status, ['PENDING', 'APPROVED', 'REJECTED'], 'status');
  if (req.query.from || req.query.to) {
    where.date = {};
    if (req.query.from) where.date.gte = parseDateOnly(req.query.from, 'from');
    if (req.query.to) where.date.lte = parseDateOnly(req.query.to, 'to');
  }

  const records = await prisma.attendance.findMany({
    where,
    include: { internship: { select: { id: true, title: true, company: { select: { companyName: true } } } } },
    orderBy: { date: 'desc' },
  });

  const approvedHours = records
    .filter((record) => record.status === 'APPROVED')
    .reduce((sum, record) => sum + Number(record.hours), 0);

  return sendSuccess(res, { records, summary: { total: records.length, approvedHours } }, 'Attendance fetched');
});

module.exports = { submitAttendance, listStudentAttendance };
