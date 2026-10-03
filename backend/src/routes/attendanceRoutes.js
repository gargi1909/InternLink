const router = require('express').Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const c = require('../controllers/attendanceController');

router.use(authenticate, authorizeRoles('STUDENT'));

router.post('/', c.submitAttendance);
router.get('/student', c.listStudentAttendance);

module.exports = router;
