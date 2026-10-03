// Run with: npx prisma db seed
require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function seedAdmin() {
  const name = process.env.ADMIN_NAME || 'InternLink Admin';
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file before seeding.');
  }
  if (password.length < 6) throw new Error('ADMIN_PASSWORD must be at least 6 characters.');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists (${email}) - skipped.`);
    return;
  }
  await prisma.user.create({
    data: { name, email, password: await bcrypt.hash(password, SALT_ROUNDS), role: 'ADMIN' },
  });
  console.log(`Admin created: ${email}`);
}

// ---------- OPTIONAL DEVELOPMENT / TEST DATA ----------
// Only runs when SEED_SAMPLE_DATA=true. Never use in production.
async function seedSampleData() {
  const password = process.env.SAMPLE_DATA_PASSWORD;
  if (!password || password.length < 6) {
    throw new Error('Set SAMPLE_DATA_PASSWORD (min 6 chars) in .env to create sample data.');
  }
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  const upsertUser = (name, email, role, profile) =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: { name, email, password: hash, role, ...profile },
    });

  await upsertUser('[DEV] Prof. Sample', 'faculty@sample.test', 'FACULTY', {
    faculty: { create: { department: 'Computer Science', employeeId: 'DEV-EMP-001', phone: '9000000001' } },
  });

  const companyUser = await upsertUser('[DEV] Sample Tech Pvt Ltd', 'company@sample.test', 'COMPANY', {
    company: {
      create: {
        companyName: '[DEV] Sample Tech Pvt Ltd',
        description: 'Development/test company',
        location: 'Mumbai',
        contactEmail: 'hr@sample.test',
      },
    },
  });

  const studentUser = await upsertUser('[DEV] Sample Student', 'student@sample.test', 'STUDENT', {
    student: {
      create: {
        college: 'Sample College of Engineering',
        course: 'B.E.',
        year: 3,
        semester: 6,
        usn: 'DEV0001',
        cgpa: 8.5,
        department: 'Computer Science',
        academicStatus: 'Regular',
        skills: 'JavaScript, SQL, Node.js',
        phone: '9000000002',
      },
    },
  });

  const company = await prisma.company.findUnique({ where: { userId: companyUser.id } });
  const student = await prisma.student.findUnique({ where: { userId: studentUser.id } });

  let internship = await prisma.internship.findFirst({ where: { companyId: company.id, title: '[DEV] Backend Intern' } });
  if (!internship) {
    internship = await prisma.internship.create({
      data: {
        companyId: company.id,
        title: '[DEV] Backend Intern',
        description: 'Sample internship for testing',
        department: 'Computer Science',
        location: 'Mumbai',
        workMode: 'Hybrid',
        duration: '3 months',
        requirements: 'Node.js basics',
        status: 'ACTIVE',
      },
    });
  }
  if (!(await prisma.internship.findFirst({ where: { companyId: company.id, title: '[DEV] Draft Internship' } }))) {
    await prisma.internship.create({ data: { companyId: company.id, title: '[DEV] Draft Internship', status: 'DRAFT' } });
  }

  await prisma.application.upsert({
    where: { studentId_internshipId: { studentId: student.id, internshipId: internship.id } },
    update: {},
    create: { studentId: student.id, internshipId: internship.id, status: 'ACCEPTED' },
  });

  const day = new Date(Date.UTC(2025, 0, 6));
  await prisma.attendance.upsert({
    where: { studentId_internshipId_date: { studentId: student.id, internshipId: internship.id, date: day } },
    update: {},
    create: { studentId: student.id, internshipId: internship.id, date: day, hours: 6, remarks: '[DEV] sample' },
  });

  if ((await prisma.workLog.count({ where: { studentId: student.id } })) === 0) {
    await prisma.workLog.create({
      data: { studentId: student.id, internshipId: internship.id, date: day, description: '[DEV] Set up project', hours: 6 },
    });
  }

  console.log('Sample DEV data ready: faculty@sample.test, company@sample.test, student@sample.test');
}

async function main() {
  await seedAdmin();
  if (String(process.env.SEED_SAMPLE_DATA).toLowerCase() === 'true') await seedSampleData();
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
