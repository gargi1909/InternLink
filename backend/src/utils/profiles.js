const prisma = require('../config/prisma');
const AppError = require('./AppError');

// Logged-in user -> their profile row. Used for ownership checks.
const getStudentByUserId = async (userId) => {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw new AppError(404, 'Student profile not found');
  return student;
};

const getCompanyByUserId = async (userId) => {
  const company = await prisma.company.findUnique({ where: { userId } });
  if (!company) throw new AppError(404, 'Company profile not found');
  return company;
};

// A student may only submit attendance / work logs for internships where they were ACCEPTED
const assertStudentAccepted = async (studentId, internshipId) => {
  const application = await prisma.application.findUnique({
    where: { studentId_internshipId: { studentId, internshipId } },
  });
  if (!application || application.status !== 'ACCEPTED') {
    throw new AppError(403, 'You can only do this for internships where your application was accepted');
  }
  return application;
};

module.exports = { getStudentByUserId, getCompanyByUserId, assertStudentAccepted };
