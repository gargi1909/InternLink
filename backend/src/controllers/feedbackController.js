const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { notifyUser } = require('../utils/notify');
const { getCompanyByUserId } = require('../utils/profiles');
const { requireFields, parseId, parseInteger, optionalText } = require('../utils/validate');

// POST /api/feedback  (company gives feedback to a student for one of its internships)
const createFeedback = asyncHandler(async (req, res) => {
  requireFields(req.body, ['studentId', 'internshipId', 'rating', 'comments']);
  const studentId = parseId(req.body.studentId, 'studentId');
  const internshipId = parseId(req.body.internshipId, 'internshipId');
  const rating = parseInteger(req.body.rating, 'Rating', { min: 1, max: 5 });
  const comments = optionalText(req.body.comments, 'Comments', 2000);

  const company = await getCompanyByUserId(req.user.id);

  const internship = await prisma.internship.findUnique({ where: { id: internshipId } });
  if (!internship) throw new AppError(404, 'Internship not found');
  if (internship.companyId !== company.id) throw new AppError(403, 'You can only give feedback for your own internships');

  const application = await prisma.application.findUnique({
    where: { studentId_internshipId: { studentId, internshipId } },
    include: { student: { select: { userId: true } } },
  });
  if (!application || application.status !== 'ACCEPTED') {
    throw new AppError(400, 'Feedback can only be given to students accepted into this internship');
  }

  const existing = await prisma.feedback.findUnique({
    where: { studentId_internshipId: { studentId, internshipId } },
  });
  if (existing) throw new AppError(409, 'Feedback has already been given for this student and internship');

  const feedback = await prisma.feedback.create({
    data: { companyId: company.id, studentId, internshipId, rating, comments: comments || null },
  });

  await notifyUser(
    application.student.userId,
    'New feedback received',
    `You received feedback for "${internship.title}".`,
    'FEEDBACK'
  );

  return sendSuccess(res, feedback, 'Feedback submitted', 201);
});

// GET /api/feedback/company  -> feedback given by the logged-in company
const listCompanyFeedback = asyncHandler(async (req, res) => {
  const company = await getCompanyByUserId(req.user.id);
  const where = { companyId: company.id };
  if (req.query.internshipId) where.internshipId = parseId(req.query.internshipId, 'internshipId');

  const feedback = await prisma.feedback.findMany({
    where,
    include: {
      student: { select: { id: true, usn: true, user: { select: { name: true } } } },
      internship: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return sendSuccess(res, feedback, 'Feedback fetched');
});

module.exports = { createFeedback, listCompanyFeedback };
