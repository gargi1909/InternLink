const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { getCompanyByUserId } = require('../utils/profiles');
const {
  requireFields,
  parseId,
  parseEnum,
  optionalText,
  getPagination,
  paginated,
} = require('../utils/validate');

const INTERNSHIP_STATUSES = ['DRAFT', 'ACTIVE', 'CLOSED'];
const companySummary = { select: { id: true, companyName: true, location: true, website: true } };

// Builds the data object from the request body (undefined fields are left unchanged)
const buildInternshipData = (body) => {
  const data = {
    description: optionalText(body.description, 'Description'),
    department: optionalText(body.department, 'Department', 255),
    location: optionalText(body.location, 'Location', 255),
    workMode: optionalText(body.workMode, 'Work mode', 100),
    duration: optionalText(body.duration, 'Duration', 100),
    requirements: optionalText(body.requirements, 'Requirements'),
  };
  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) throw new AppError(400, 'Title cannot be empty');
    if (title.length > 255) throw new AppError(400, 'Title is too long');
    data.title = title;
  }
  if (body.status !== undefined) data.status = parseEnum(body.status, INTERNSHIP_STATUSES, 'status');
  Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
  return data;
};

// Loads an internship and makes sure it belongs to the logged-in company
const getOwnedInternship = async (internshipId, userId) => {
  const company = await getCompanyByUserId(userId);
  const internship = await prisma.internship.findUnique({ where: { id: internshipId } });
  if (!internship) throw new AppError(404, 'Internship not found');
  if (internship.companyId !== company.id) throw new AppError(403, 'You can only manage your own internships');
  return { company, internship };
};

// GET /api/internships  (browse; students only ever see ACTIVE ones)
const listInternships = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query);
  const { search, department, location, workMode, companyId, status } = req.query;

  const where = {};
  if (['ADMIN', 'FACULTY'].includes(req.user.role) && status) {
    where.status = parseEnum(status, INTERNSHIP_STATUSES, 'status');
  } else if (!['ADMIN', 'FACULTY'].includes(req.user.role)) {
    where.status = 'ACTIVE';
  }
  if (department) where.department = { contains: String(department), mode: 'insensitive' };
  if (location) where.location = { contains: String(location), mode: 'insensitive' };
  if (workMode) where.workMode = { equals: String(workMode), mode: 'insensitive' };
  if (companyId) where.companyId = parseId(companyId, 'companyId');
  if (search) {
    where.OR = [
      { title: { contains: String(search), mode: 'insensitive' } },
      { description: { contains: String(search), mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.internship.findMany({
      where,
      include: { company: companySummary },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.internship.count({ where }),
  ]);

  return sendSuccess(res, paginated(items, total, pagination), 'Internships fetched');
});

// GET /api/internships/:id
const getInternship = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const internship = await prisma.internship.findUnique({
    where: { id },
    include: { company: companySummary },
  });
  if (!internship) throw new AppError(404, 'Internship not found');

  // Non-active internships are only visible to the owning company, faculty and admins
  if (internship.status !== 'ACTIVE') {
    let allowed = ['ADMIN', 'FACULTY'].includes(req.user.role);
    if (req.user.role === 'COMPANY') {
      const company = await prisma.company.findUnique({ where: { userId: req.user.id } });
      allowed = Boolean(company && company.id === internship.companyId);
    }
    if (!allowed) throw new AppError(404, 'Internship not found');
  }

  // Let students see whether they already applied
  let myApplication = null;
  if (req.user.role === 'STUDENT') {
    const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
    if (student) {
      myApplication = await prisma.application.findUnique({
        where: { studentId_internshipId: { studentId: student.id, internshipId: id } },
        select: { id: true, status: true, appliedAt: true },
      });
    }
  }

  return sendSuccess(res, { ...internship, myApplication }, 'Internship fetched');
});

// POST /api/internships  and  POST /api/companies/internships
const createInternship = asyncHandler(async (req, res) => {
  requireFields(req.body, ['title']);
  const company = await getCompanyByUserId(req.user.id);
  const data = buildInternshipData(req.body);

  const internship = await prisma.internship.create({
    data: { ...data, companyId: company.id }, // companyId always comes from the token, never from the body
    include: { company: companySummary },
  });
  return sendSuccess(res, internship, 'Internship created', 201);
});

// PUT /api/internships/:id  and  PUT /api/companies/internships/:id
const updateInternship = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  await getOwnedInternship(id, req.user.id);
  const data = buildInternshipData(req.body || {});
  if (Object.keys(data).length === 0) throw new AppError(400, 'No valid fields to update');

  const internship = await prisma.internship.update({
    where: { id },
    data,
    include: { company: companySummary },
  });
  return sendSuccess(res, internship, 'Internship updated');
});

// DELETE /api/internships/:id  and  DELETE /api/companies/internships/:id
const deleteInternship = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  await getOwnedInternship(id, req.user.id);

  // Protect student data: internships that already have applications must be closed, not deleted
  const applicationCount = await prisma.application.count({ where: { internshipId: id } });
  if (applicationCount > 0) {
    throw new AppError(409, 'This internship already has applications. Close it instead of deleting it');
  }

  await prisma.internship.delete({ where: { id } });
  return sendSuccess(res, null, 'Internship deleted');
});

// GET /api/companies/internships  -> only the logged-in company's internships
const listCompanyInternships = asyncHandler(async (req, res) => {
  const company = await getCompanyByUserId(req.user.id);
  const where = { companyId: company.id };
  if (req.query.status) where.status = parseEnum(req.query.status, INTERNSHIP_STATUSES, 'status');

  const internships = await prisma.internship.findMany({
    where,
    include: { _count: { select: { applications: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return sendSuccess(res, internships, 'Company internships fetched');
});

module.exports = {
  listInternships,
  getInternship,
  createInternship,
  updateInternship,
  deleteInternship,
  listCompanyInternships,
  getOwnedInternship,
};
