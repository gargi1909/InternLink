const router = require('express').Router();
const { sendSuccess } = require('../utils/response');

router.get('/health', (req, res) =>
  sendSuccess(res, { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }, 'InternLink API is running')
);

router.use('/auth', require('./authRoutes'));
router.use('/students', require('./studentRoutes'));
router.use('/internships', require('./internshipRoutes'));
router.use('/applications', require('./applicationRoutes'));
router.use('/worklogs', require('./worklogRoutes'));
router.use('/attendance', require('./attendanceRoutes'));
router.use('/companies', require('./companyRoutes'));
router.use('/feedback', require('./feedbackRoutes'));
router.use('/faculty', require('./facultyRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/notifications', require('./notificationRoutes'));

module.exports = router;
