const router = require('express').Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const c = require('../controllers/feedbackController');

router.use(authenticate, authorizeRoles('COMPANY'));

router.post('/', c.createFeedback);
router.get('/company', c.listCompanyFeedback);

module.exports = router;
