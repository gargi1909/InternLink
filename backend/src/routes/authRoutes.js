const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { register, login, me } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, me);

module.exports = router;
