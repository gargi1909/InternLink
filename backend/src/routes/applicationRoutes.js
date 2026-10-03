const router = require('express').Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const c = require('../controllers/applicationController');

router.use(authenticate);

router.post('/', authorizeRoles('STUDENT'), c.applyToInternship);
router.get('/student', authorizeRoles('STUDENT'), c.listStudentApplications);
router.get('/company', authorizeRoles('COMPANY'), c.listCompanyApplications);
router.get('/:id', authorizeRoles('STUDENT', 'COMPANY', 'FACULTY', 'ADMIN'), c.getApplication);
router.put('/:id/status', authorizeRoles('STUDENT', 'COMPANY'), c.updateApplicationStatus);

module.exports = router;
