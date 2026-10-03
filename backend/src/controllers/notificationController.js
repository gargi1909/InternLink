const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { parseId, getPagination, paginated } = require('../utils/validate');

// GET /api/notifications  (?unread=true &page= &limit=) - only the logged-in user's notifications
const listNotifications = asyncHandler(async (req, res) => {
  const pagination = getPagination(req.query, 20);
  const where = { userId: req.user.id };
  if (req.query.unread === 'true') where.isRead = false;

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
  ]);

  return sendSuccess(res, { ...paginated(items, total, pagination), unreadCount }, 'Notifications fetched');
});

// PUT /api/notifications/:id/read
const markAsRead = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);

  // Look up by id AND userId so nobody can read someone else's notification by changing the id
  const notification = await prisma.notification.findFirst({ where: { id, userId: req.user.id } });
  if (!notification) throw new AppError(404, 'Notification not found');

  const updated = await prisma.notification.update({ where: { id }, data: { isRead: true } });
  return sendSuccess(res, updated, 'Notification marked as read');
});

module.exports = { listNotifications, markAsRead };
