const router = require('express').Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const c = require('../controllers/adminController');

router.use(authenticate, authorizeRoles('ADMIN'));

router.post('/users', c.createUser);
router.get('/users', c.listUsers);
router.put('/users/:id', c.updateUser);
router.delete('/users/:id', c.deleteUser);

router.get('/students', c.listStudents);
router.get('/companies', c.listCompanies);
router.get('/internships', c.listInternships);
router.get('/reports', c.getReports);

module.exports = router;
