const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { notifyUser } = require('../utils/notify');
const { getStudentByUserId, getCompanyByUserId } = require('../utils/profiles');
const { requireFields, parseId, parseEnum } = require('../utils/validate');

const APPLICATION_STATUSES = ['PENDING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'];
const COMPANY_DECISIONS = ['SHORTLISTED', 'ACCEPTED', 'REJECTED'];

const applicationInclude = {
  student: {
    select: {
      id: true, usn: true, college: true, course: true, department: true, year: true,
      semester: true, cgpa: true, phone: true, skills: true, resumeUrl: true,
      user: { select: { name: true, email: true } },
    },
  },
  internship: {
    include: { company: { select: { id: true, companyName: true, location: true, userId: true } } },
  },
};

// POST /api/applications
const applyToInternship = asyncHandler(async (req, res) => {
  requireFields(req.body, ['internshipId']);
  const internshipId = parseId(req.body.internshipId, 'internshipId');
  const student = await getStudentByUserId(req.user.id);

  const internship = await prisma.internship.findUnique({
    where: { id: internshipId },
    include: { company: { select: { userId: true } } },
  });
  if (!internship) throw new AppError(404, 'Internship not found');
  if (internship.status !== 'ACTIVE') throw new AppError(400, 'This internship is not open for applications');

  const existing = await prisma.application.findUnique({
    where: { studentId_internshipId: { studentId: student.id, internshipId } },
  });
  if (existing) throw new AppError(409, 'You have already applied to this internship');

  const application = await prisma.application.create({
    data: { studentId: student.id, internshipId }, // studentId comes from the token
    include: { internship: { select: { id: true, title: true } } },
  });

  await notifyUser(
    internship.company.userId,
    'New application received',
    `A student applied for "${internship.title}".`,
    'APPLICATION'
  );

  return sendSuccess(res, application, 'Application submitted', 201);
});

// GET /api/applications/student
const listStudentApplications = asyncHandler(async (req, res) => {
  const student = await getStudentByUserId(req.user.id);
  const where = { studentId: student.id };
  if (req.query.status) where.status = parseEnum(req.query.status, APPLICATION_STATUSES, 'status');

  const applications = await prisma.application.findMany({
    where,
    include: { internship: { include: { company: { select: { id: true, companyName: true, location: true } } } } },
    orderBy: { appliedAt: 'desc' },
  });
  return sendSuccess(res, applications, 'Applications fetched');
});

// GET /api/applications/company  and  GET /api/companies/applications
const listCompanyApplications = asyncHandler(async (req, res) => {
  const company = await getCompanyByUserId(req.user.id);
  const where = { internship: { companyId: company.id } };
  if (req.query.status) where.status = parseEnum(req.query.status, APPLICATION_STATUSES, 'status');
  if (req.query.internshipId) where.internshipId = parseId(req.query.internshipId, 'internshipId');

  const applications = await prisma.application.findMany({
    where,
    include: applicationInclude,
    orderBy: { appliedAt: 'desc' },
  });
  return sendSuccess(res, applications, 'Applications fetched');
});

// GET /api/applications/:id  and  GET /api/companies/applications/:id
const getApplication = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const application = await prisma.application.findUnique({ where: { id }, include: applicationInclude });
  if (!application) throw new AppError(404, 'Application not found');

  // Ownership check
  if (req.user.role === 'STUDENT') {
    const student = await getStudentByUserId(req.user.id);
    if (application.studentId !== student.id) throw new AppError(403, 'You can only view your own applications');
  } else if (req.user.role === 'COMPANY') {
    if (application.internship.company.userId !== req.user.id) {
      throw new AppError(403, 'This application does not belong to your internships');
    }
  }
  // FACULTY / ADMIN may view any application

  return sendSuccess(res, application, 'Application fetched');
});

// PUT /api/applications/:id/status  and  PUT /api/companies/applications/:id/status
//  - COMPANY: SHORTLISTED / ACCEPTED / REJECTED (own internships only)
//  - STUDENT: WITHDRAWN (own applications only)
const updateApplicationStatus = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  requireFields(req.body, ['status']);
  const newStatus = parseEnum(req.body.status, APPLICATION_STATUSES, 'status');

  const application = await prisma.application.findUnique({ where: { id }, include: applicationInclude });
  if (!application) throw new AppError(404, 'Application not found');

  if (application.status === 'WITHDRAWN') throw new AppError(409, 'This application was withdrawn');
  if (application.status === newStatus) throw new AppError(409, `Application is already ${newStatus}`);

  const internshipTitle = application.internship.title;

  if (req.user.role === 'COMPANY') {
    if (application.internship.company.userId !== req.user.id) {
      throw new AppError(403, 'This application does not belong to your internships');
    }
    if (!COMPANY_DECISIONS.includes(newStatus)) {
      throw new AppError(400, `Companies can set the status to: ${COMPANY_DECISIONS.join(', ')}`);
    }
  } else if (req.user.role === 'STUDENT') {
    const student = await getStudentByUserId(req.user.id);
    if (application.studentId !== student.id) throw new AppError(403, 'You can only change your own applications');
    if (newStatus !== 'WITHDRAWN') throw new AppError(403, 'Students can only withdraw an application');
    if (!['PENDING', 'SHORTLISTED'].includes(application.status)) {
      throw new AppError(409, `An application that is ${application.status} cannot be withdrawn`);
    }
  } else {
    throw new AppError(403, 'You do not have permission to perform this action');
  }

  const updated = await prisma.application.update({
    where: { id },
    data: { status: newStatus },
    include: applicationInclude,
  });

  if (req.user.role === 'COMPANY') {
    const student = await prisma.student.findUnique({ where: { id: application.studentId } });
    await notifyUser(
      student.userId,
      'Application status updated',
      `Your application for "${internshipTitle}" is now ${newStatus}.`,
      'APPLICATION'
    );
  } else {
    await notifyUser(
      application.internship.company.userId,
      'Application withdrawn',
      `A student withdrew their application for "${internshipTitle}".`,
      'APPLICATION'
    );
  }

  return sendSuccess(res, updated, 'Application status updated');
});

module.exports = {
  applyToInternship,
  listStudentApplications,
  listCompanyApplications,
  getApplication,
  updateApplicationStatus,
};
