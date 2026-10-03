const prisma = require('../config/prisma');

// Creates a notification. A failure here must never break the main request.
const notifyUser = async (userId, title, message, type = 'GENERAL') => {
  try {
    await prisma.notification.create({ data: { userId, title, message, type } });
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
};

module.exports = { notifyUser };
