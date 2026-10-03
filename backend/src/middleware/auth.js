const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

// Reads "Authorization: Bearer <token>", verifies it and sets req.user = { id, role }
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'Authentication required. Send "Authorization: Bearer <token>"');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    throw new AppError(401, 'Invalid or expired token');
  }

  // Make sure the user still exists (e.g. not deleted by an admin) and use the current role
  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, role: true },
  });
  if (!user) throw new AppError(401, 'Invalid or expired token');

  req.user = { id: user.id, role: user.role };
  next();
});

// authorizeRoles('COMPANY', 'ADMIN') -> 403 for any other role
const authorizeRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError(403, 'You do not have permission to perform this action'));
  }
  return next();
};

module.exports = { authenticate, authorizeRoles };
