const sendSuccess = (res, data = null, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const sendError = (res, statusCode, message) =>
  res.status(statusCode).json({ success: false, message, data: null });

module.exports = { sendSuccess, sendError };
