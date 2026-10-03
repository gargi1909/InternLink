const router = require('express').Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const c = require('../controllers/worklogController');

router.use(authenticate);

router.post('/', authorizeRoles('STUDENT'), c.createWorkLog);
router.get('/student', authorizeRoles('STUDENT'), c.listStudentWorkLogs);
router.get('/:id', authorizeRoles('STUDENT', 'COMPANY', 'FACULTY', 'ADMIN'), c.getWorkLog);
router.put('/:id', authorizeRoles('STUDENT'), c.updateWorkLog);

module.exports = router;
