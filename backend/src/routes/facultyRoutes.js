const router = require('express').Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const c = require('../controllers/facultyController');

router.use(authenticate, authorizeRoles('FACULTY', 'ADMIN'));

router.get('/dashboard', c.getDashboard);
router.get('/students', c.listStudents);
router.get('/students/:id/progress', c.getStudentProgress);
router.get('/attendance', c.listAttendance);
router.get('/worklogs', c.listWorkLogs);

module.exports = router;
