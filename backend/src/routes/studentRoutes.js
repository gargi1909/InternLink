const router = require('express').Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const c = require('../controllers/studentController');

router.use(authenticate, authorizeRoles('STUDENT'));

router.get('/profile', c.getProfile);
router.put('/profile', c.updateProfile);
router.get('/dashboard', c.getDashboard);
router.get('/applications', c.getApplications);
router.get('/internship', c.getCurrentInternship);

module.exports = router;
