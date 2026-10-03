const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const c = require('../controllers/notificationController');

router.use(authenticate);

router.get('/', c.listNotifications);
router.put('/:id/read', c.markAsRead);

module.exports = router;
