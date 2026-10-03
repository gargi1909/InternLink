const router = require('express').Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const company = require('../controllers/companyController');
const internships = require('../controllers/internshipController');
const applications = require('../controllers/applicationController');

router.use(authenticate, authorizeRoles('COMPANY'));

// Profile
router.get('/profile', company.getProfile);
router.put('/profile', company.updateProfile);

// Internships (same handlers as /api/internships, ownership is checked inside)
router.get('/internships', internships.listCompanyInternships);
router.post('/internships', internships.createInternship);
router.put('/internships/:id/complete', company.completeInternship);
router.put('/internships/:id', internships.updateInternship);
router.delete('/internships/:id', internships.deleteInternship);

// Applications
router.get('/applications', applications.listCompanyApplications);
router.get('/applications/:id', applications.getApplication);
router.put('/applications/:id/status', applications.updateApplicationStatus);

// Attendance approval
router.get('/attendance', company.listAttendance);
router.put('/attendance/:id/approve', company.approveAttendance);
router.put('/attendance/:id/reject', company.rejectAttendance);

// Work log approval
router.get('/worklogs', company.listWorkLogs);
router.put('/worklogs/:id/approve', company.approveWorkLog);
router.put('/worklogs/:id/reject', company.rejectWorkLog);

module.exports = router;
