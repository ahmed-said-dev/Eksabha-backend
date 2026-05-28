import * as Joi from 'joi';

const BLOCKED_PRODUCTION_SECRET_VALUES = new Set([
  'change-me-access-secret',
  'change-me-refresh-secret',
  'changeme',
  'change-me',
  'default',
  'secret',
  'password',
]);

const BLOCKED_PRODUCTION_ADMIN_EMAILS = new Set([
  'admin@worldcupfantasy.local',
]);

const BLOCKED_PRODUCTION_ADMIN_PASSWORDS = new Set([
  'Admin123!',
  'admin123!',
  'password',
  'password123',
]);

function isWeakProductionSecret(value: string) {
  const normalized = value.trim();
  const lowered = normalized.toLowerCase();

  if (normalized.length < 32) {
    return true;
  }

  if (BLOCKED_PRODUCTION_SECRET_VALUES.has(lowered)) {
    return true;
  }

  if (lowered.includes('change-me') || lowered.includes('changeme') || lowered.includes('default')) {
    return true;
  }

  return false;
}

function isWeakProductionAdminPassword(value: string) {
  const normalized = value.trim();
  const lowered = normalized.toLowerCase();

  if (normalized.length < 12) {
    return true;
  }

  if (BLOCKED_PRODUCTION_ADMIN_PASSWORDS.has(normalized) || BLOCKED_PRODUCTION_ADMIN_PASSWORDS.has(lowered)) {
    return true;
  }

  const hasUpper = /[A-Z]/.test(normalized);
  const hasLower = /[a-z]/.test(normalized);
  const hasDigit = /\d/.test(normalized);
  const hasSymbol = /[^A-Za-z0-9]/.test(normalized);

  return !(hasUpper && hasLower && hasDigit && hasSymbol);
}

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),
  APP_NAME: Joi.string().default('fantasy-world-cup-backend'),
  PORT: Joi.number().port().default(4400),
  CORS_ORIGIN: Joi.string().default('*'),
  ACTIVE_COMPETITION_KEY: Joi.string().default('world-cup-2026'),
  ACTIVE_COMPETITION_NAME: Joi.string().default('FIFA World Cup 2026'),
  ACTIVE_COMPETITION_SLUG: Joi.string().default('world-cup-2026'),
  ACTIVE_COMPETITION_FORMAT: Joi.string().valid('world_cup', 'league').default('world_cup'),
  ACTIVE_COMPETITION_COUNTRY: Joi.string().allow('').optional(),
  ACTIVE_COMPETITION_YEAR: Joi.number().integer().default(2026),
  ACTIVE_COMPETITION_CURRENT_PHASE: Joi.string().default('group_stage_md1'),
  ACTIVE_COMPETITION_CURRENT_MATCHDAY_NUMBER: Joi.number().integer().min(1).default(1),
  ACTIVE_COMPETITION_TOTAL_GROUPS: Joi.number().integer().min(0).default(12),
  ACTIVE_COMPETITION_TOTAL_TEAMS: Joi.number().integer().min(2).default(48),
  ACTIVE_COMPETITION_STARTS_AT: Joi.string().isoDate().allow('').optional(),
  ACTIVE_COMPETITION_ENDS_AT: Joi.string().isoDate().allow('').optional(),
  DATABASE_HOST: Joi.string().default('localhost'),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_NAME: Joi.string().default('fantasy_world_cup'),
  DATABASE_USER: Joi.string().default('postgres'),
  DATABASE_PASSWORD: Joi.string().allow('').default('postgres'),
  DATABASE_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  DATABASE_QUERY_LOGGING: Joi.boolean().truthy('true').falsy('false').default(false),
  REDIS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  JWT_ACCESS_TOKEN_SECRET: Joi.string().min(16).default('change-me-access-secret'),
  JWT_ACCESS_TOKEN_EXPIRES_IN: Joi.string().default('7d'),
  JWT_REFRESH_TOKEN_SECRET: Joi.string().min(16).default('change-me-refresh-secret'),
  ADMIN_EMAIL: Joi.string().email().default('admin@worldcupfantasy.local'),
  ADMIN_PASSWORD: Joi.string().min(8).default('Admin123!'),
  ADMIN_DISPLAY_NAME: Joi.string().default('Platform Administrator'),
  EXTERNAL_FEED_BASE_URL: Joi.string().uri().allow('').optional(),
  EXTERNAL_FEED_API_KEY: Joi.string().allow('').optional(),
  EXTERNAL_FEED_PROVIDER: Joi.string().valid('api-football').default('api-football'),
  EXTERNAL_FEED_LEAGUE_ID: Joi.number().integer().default(1),
  EXTERNAL_FEED_SEASON: Joi.number().integer().default(2026),
  EXTERNAL_FEED_SYNC_SECRET: Joi.string().allow('').optional(),
  EXTERNAL_FEED_AUTO_SYNC_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  EXTERNAL_FEED_SYNC_INTERVAL_SECONDS: Joi.number().integer().min(15).default(30),
  EXTERNAL_FEED_AUTO_SYNC_ON_BOOT: Joi.boolean().truthy('true').falsy('false').default(true),
  EGYPT_LIVE_TRACKER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  EGYPT_LIVE_TRACKER_ON_BOOT: Joi.boolean().truthy('true').falsy('false').default(true),
  EGYPT_LIVE_TRACKER_IDLE_INTERVAL_SECONDS: Joi.number().integer().min(15).default(120),
  EGYPT_LIVE_TRACKER_UPCOMING_INTERVAL_SECONDS: Joi.number().integer().min(5).default(15),
  EGYPT_LIVE_TRACKER_LIVE_INTERVAL_SECONDS: Joi.number().integer().min(3).default(5),
  EGYPT_LIVE_TRACKER_COOLDOWN_INTERVAL_SECONDS: Joi.number().integer().min(5).default(20),
  EGYPT_LIVE_TRACKER_UPCOMING_WINDOW_MINUTES: Joi.number().integer().min(1).default(15),
  EGYPT_LIVE_TRACKER_COOLDOWN_WINDOW_MINUTES: Joi.number().integer().min(1).default(5),
})
  .custom((value, helpers) => {
    if (value.NODE_ENV !== 'production') {
      return value;
    }

    const accessSecret = String(value.JWT_ACCESS_TOKEN_SECRET ?? '');
    const refreshSecret = String(value.JWT_REFRESH_TOKEN_SECRET ?? '');
    const adminEmail = String(value.ADMIN_EMAIL ?? '').trim().toLowerCase();
    const adminPassword = String(value.ADMIN_PASSWORD ?? '');

    if (isWeakProductionSecret(accessSecret)) {
      return helpers.error('any.invalid', {
        message: 'JWT_ACCESS_TOKEN_SECRET is weak/default. Use a unique production secret (min 32 chars).',
      });
    }

    if (isWeakProductionSecret(refreshSecret)) {
      return helpers.error('any.invalid', {
        message: 'JWT_REFRESH_TOKEN_SECRET is weak/default. Use a unique production secret (min 32 chars).',
      });
    }

    if (BLOCKED_PRODUCTION_ADMIN_EMAILS.has(adminEmail)) {
      return helpers.error('any.invalid', {
        message: 'ADMIN_EMAIL cannot use the default value in production.',
      });
    }

    if (isWeakProductionAdminPassword(adminPassword)) {
      return helpers.error('any.invalid', {
        message: 'ADMIN_PASSWORD is weak/default. Use a strong production password (min 12 chars with mixed types).',
      });
    }

    return value;
  }, 'production credential hardening')
  .messages({
    'any.invalid': '{{#message}}',
  })
  .unknown(true);
