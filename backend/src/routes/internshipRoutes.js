const router = require('express').Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const c = require('../controllers/internshipController');

router.use(authenticate);

router.get('/', c.listInternships);
router.get('/:id', c.getInternship);
router.post('/', authorizeRoles('COMPANY'), c.createInternship);
router.put('/:id', authorizeRoles('COMPANY'), c.updateInternship);
router.delete('/:id', authorizeRoles('COMPANY'), c.deleteInternship);

module.exports = router;
