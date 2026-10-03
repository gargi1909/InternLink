const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { notifyUser } = require('../utils/notify');
const { getCompanyByUserId } = require('../utils/profiles');
const { getOwnedInternship } = require('./internshipController');
const { parseId, parseEnum, optionalText, optionalUrl, optionalEmail } = require('../utils/validate');

const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

// ---------- Profile ----------

// GET /api/companies/profile
const getProfile = asyncHandler(async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { userId: req.user.id },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!company) throw new AppError(404, 'Company profile not found');
  return sendSuccess(res, company, 'Company profile fetched');
});

// PUT /api/companies/profile
const updateProfile = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const company = await getCompanyByUserId(req.user.id);

  const data = {
    description: optionalText(body.description, 'Description'),
    website: optionalUrl(body.website, 'Website'),
    location: optionalText(body.location, 'Location', 255),
    contactEmail: optionalEmail(body.contactEmail, 'Contact email'),
    contactPhone: optionalText(body.contactPhone, 'Contact phone', 20),
  };
  if (body.companyName !== undefined) {
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    if (!companyName) throw new AppError(400, 'Company name cannot be empty');
    if (companyName.length > 255) throw new AppError(400, 'Company name is too long');
    data.companyName = companyName;
  }
  if (data.contactPhone && !/^[0-9+\-\s()]{7,20}$/.test(data.contactPhone)) {
    throw new AppError(400, 'Contact phone is not valid');
  }
  Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
  if (Object.keys(data).length === 0) throw new AppError(400, 'No valid fields to update');

  const updated = await prisma.company.update({
    where: { id: company.id },
    data,
    include: { user: { select: { name: true, email: true } } },
  });
  return sendSuccess(res, updated, 'Company profile updated');
});

// ---------- Internship completion ----------

// PUT /api/companies/internships/:id/complete  -> marks the internship CLOSED
const completeInternship = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const { internship } = await getOwnedInternship(id, req.user.id);
  if (internship.status === 'CLOSED') throw new AppError(409, 'This internship is already completed/closed');

  const updated = await prisma.internship.update({ where: { id }, data: { status: 'CLOSED' } });

  // Tell every accepted student
  const accepted = await prisma.application.findMany({
    where: { internshipId: id, status: 'ACCEPTED' },
    include: { student: { select: { userId: true } } },
  });
  await Promise.all(
    accepted.map((application) =>
      notifyUser(
        application.student.userId,
        'Internship completed',
        `The internship "${internship.title}" has been marked as completed.`,
        'INTERNSHIP'
      )
    )
  );

  return sendSuccess(res, updated, 'Internship marked as completed');
});

// ---------- Attendance approval ----------

const attendanceInclude = {
  student: { select: { id: true, usn: true, department: true, user: { select: { name: true, email: true } } } },
  internship: { select: { id: true, title: true } },
};

// GET /api/companies/attendance
const listAttendance = asyncHandler(async (req, res) => {
  const company = await getCompanyByUserId(req.user.id);
  const where = { internship: { companyId: company.id } };
  if (req.query.status) where.status = parseEnum(req.query.status, APPROVAL_STATUSES, 'status');
  if (req.query.internshipId) where.internshipId = parseId(req.query.internshipId, 'internshipId');
  if (req.query.studentId) where.studentId = parseId(req.query.studentId, 'studentId');

  const records = await prisma.attendance.findMany({
    where,
    include: attendanceInclude,
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
  });
  return sendSuccess(res, records, 'Attendance records fetched');
});

// Shared logic for approve / reject
const reviewAttendance = (newStatus) =>
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const company = await getCompanyByUserId(req.user.id);

    const record = await prisma.attendance.findUnique({
      where: { id },
      include: { internship: true, student: { select: { userId: true } } },
    });
    if (!record) throw new AppError(404, 'Attendance record not found');
    if (record.internship.companyId !== company.id) {
      throw new AppError(403, 'This attendance record does not belong to your internships');
    }
    if (record.status !== 'PENDING') throw new AppError(409, `Attendance is already ${record.status}`);

    const data = { status: newStatus };
    const remarks = optionalText(req.body && req.body.remarks, 'Remarks', 1000);
    if (remarks) data.remarks = remarks; // company can leave a note, e.g. reason for rejection

    const updated = await prisma.attendance.update({ where: { id }, data, include: attendanceInclude });
    await notifyUser(
      record.student.userId,
      `Attendance ${newStatus.toLowerCase()}`,
      `Your attendance for "${record.internship.title}" on ${record.date.toISOString().slice(0, 10)} was ${newStatus.toLowerCase()}.`,
      'ATTENDANCE'
    );
    return sendSuccess(res, updated, `Attendance ${newStatus.toLowerCase()}`);
  });

// ---------- Work log approval ----------

const workLogInclude = {
  student: { select: { id: true, usn: true, department: true, user: { select: { name: true, email: true } } } },
  internship: { select: { id: true, title: true } },
};

// GET /api/companies/worklogs
const listWorkLogs = asyncHandler(async (req, res) => {
  const company = await getCompanyByUserId(req.user.id);
  const where = { internship: { companyId: company.id } };
  if (req.query.status) where.status = parseEnum(req.query.status, APPROVAL_STATUSES, 'status');
  if (req.query.internshipId) where.internshipId = parseId(req.query.internshipId, 'internshipId');
  if (req.query.studentId) where.studentId = parseId(req.query.studentId, 'studentId');

  const logs = await prisma.workLog.findMany({
    where,
    include: workLogInclude,
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
  });
  return sendSuccess(res, logs, 'Work logs fetched');
});

const reviewWorkLog = (newStatus) =>
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const company = await getCompanyByUserId(req.user.id);

    const log = await prisma.workLog.findUnique({
      where: { id },
      include: { internship: true, student: { select: { userId: true } } },
    });
    if (!log) throw new AppError(404, 'Work log not found');
    if (log.internship.companyId !== company.id) {
      throw new AppError(403, 'This work log does not belong to your internships');
    }
    if (log.status !== 'PENDING') throw new AppError(409, `Work log is already ${log.status}`);

    const updated = await prisma.workLog.update({ where: { id }, data: { status: newStatus }, include: workLogInclude });
    await notifyUser(
      log.student.userId,
      `Work log ${newStatus.toLowerCase()}`,
      `Your work log for "${log.internship.title}" dated ${log.date.toISOString().slice(0, 10)} was ${newStatus.toLowerCase()}.`,
      'WORKLOG'
    );
    return sendSuccess(res, updated, `Work log ${newStatus.toLowerCase()}`);
  });

module.exports = {
  getProfile,
  updateProfile,
  completeInternship,
  listAttendance,
  approveAttendance: reviewAttendance('APPROVED'),
  rejectAttendance: reviewAttendance('REJECTED'),
  listWorkLogs,
  approveWorkLog: reviewWorkLog('APPROVED'),
  rejectWorkLog: reviewWorkLog('REJECTED'),
};
