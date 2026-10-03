const AppError = require('./AppError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidEmail = (value) => typeof value === 'string' && EMAIL_REGEX.test(value.trim());

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

// Throws 400 if any of the listed fields is missing/blank
const requireFields = (body, fields) => {
  const missing = fields.filter((field) => isBlank(body ? body[field] : undefined));
  if (missing.length > 0) {
    throw new AppError(400, `Missing required field(s): ${missing.join(', ')}`);
  }
};

// Parses an ID from req.params / body. Throws 400 if not a positive integer.
const parseId = (value, label = 'id') => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, `Invalid ${label}`);
  }
  return id;
};

const parseEnum = (value, allowed, label) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!allowed.includes(normalized)) {
    throw new AppError(400, `Invalid ${label}. Allowed values: ${allowed.join(', ')}`);
  }
  return normalized;
};

// Accepts "YYYY-MM-DD" and returns a Date at UTC midnight (for @db.Date columns)
const parseDateOnly = (value, label = 'date') => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new AppError(400, `Invalid ${label}. Use format YYYY-MM-DD`);
  }
  const date = new Date(`${value.trim()}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.trim()) {
    throw new AppError(400, `Invalid ${label}`);
  }
  return date;
};

// Same as parseDateOnly but rejects dates in the future (1 day slack for time zones)
const parsePastOrTodayDate = (value, label = 'date') => {
  const date = parseDateOnly(value, label);
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    throw new AppError(400, `${label} cannot be in the future`);
  }
  return date;
};

// Number between min (exclusive or inclusive) and max
const parseNumber = (value, label, { min, max, minExclusive = false } = {}) => {
  if (isBlank(value) || typeof value === 'boolean') throw new AppError(400, `${label} must be a number`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new AppError(400, `${label} must be a number`);
  if (min !== undefined && (minExclusive ? number <= min : number < min)) {
    throw new AppError(400, `${label} must be ${minExclusive ? 'greater than' : 'at least'} ${min}`);
  }
  if (max !== undefined && number > max) throw new AppError(400, `${label} must be at most ${max}`);
  return number;
};

const parseInteger = (value, label, options) => {
  const number = parseNumber(value, label, options);
  if (!Number.isInteger(number)) throw new AppError(400, `${label} must be a whole number`);
  return number;
};

// Optional text field: undefined stays undefined (= "don't change"), blank becomes null
const optionalText = (value, label, maxLength = 5000) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new AppError(400, `${label} must be text`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new AppError(400, `${label} is too long`);
  return trimmed === '' ? null : trimmed;
};

// Optional http(s) URL
const optionalUrl = (value, label) => {
  const text = optionalText(value, label, 2000);
  if (text === undefined || text === null) return text;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('bad protocol');
  } catch (err) {
    throw new AppError(400, `${label} must be a valid http(s) URL`);
  }
  return text;
};

// Optional email
const optionalEmail = (value, label) => {
  const text = optionalText(value, label, 255);
  if (text === undefined || text === null) return text;
  if (!isValidEmail(text)) throw new AppError(400, `${label} must be a valid email`);
  return text.toLowerCase();
};

// Reads ?page=&limit= and returns skip/take for Prisma
const getPagination = (query, defaultLimit = 20, maxLimit = 100) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit, take: limit };
};

const paginated = (items, total, { page, limit }) => ({
  items,
  pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
});

module.exports = {
  isValidEmail,
  isBlank,
  requireFields,
  parseId,
  parseEnum,
  parseDateOnly,
  parsePastOrTodayDate,
  parseNumber,
  parseInteger,
  optionalText,
  optionalUrl,
  optionalEmail,
  getPagination,
  paginated,
};
