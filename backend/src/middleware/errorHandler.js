const { sendError } = require('../utils/response');

const notFound = (req, res) => sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);

// Central error handler - every thrown/forwarded error ends up here
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Errors we threw on purpose
  if (err.isOperational) return sendError(res, err.statusCode, err.message);

  // Prisma: unique constraint violation
  if (err.code === 'P2002') {
    const fields = Array.isArray(err.meta && err.meta.target) ? err.meta.target.join(', ') : 'value';
    return sendError(res, 409, `A record with this ${fields} already exists`);
  }
  // Prisma: record not found (update/delete on missing row)
  if (err.code === 'P2025') return sendError(res, 404, 'Record not found');
  // Prisma: foreign key violation
  if (err.code === 'P2003') return sendError(res, 400, 'Related record does not exist');

  // Bad JSON body
  if (err.type === 'entity.parse.failed') return sendError(res, 400, 'Invalid JSON in request body');

  // CORS rejection
  if (err.message && err.message.startsWith('CORS')) return sendError(res, 403, err.message);

  console.error(err);
  return sendError(res, 500, 'Internal server error');
};

module.exports = { notFound, errorHandler };
