import crypto from 'node:crypto';

export const CORE_ORIGINS = Object.freeze({
  uat: 'https://saku-backend-uat-production.up.railway.app',
  production: 'https://saku-backend-production.up.railway.app',
});

export function resolveCoreOrigin(raw, environment = process.env.SAKU_ENVIRONMENT) {
  const envName = String(environment || '').trim().toLowerCase();
  const expected = CORE_ORIGINS[envName];
  if (!expected) throw new Error('SAKU_ENVIRONMENT_REQUIRED');
  const value = String(raw || '').trim().replace(/\/$/, '');
  if (value !== expected) throw new Error('CORE_API_ORIGIN_NOT_APPROVED');
  return value;
}

export function decodeValidatedClaims(authorization) {
  const token = String(authorization || '').replace(/^Bearer\s+/i, '');
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString());
    if (!claims.sub) throw new Error('SUB_REQUIRED');
    return claims;
  } catch {
    const error = new Error('UNAUTHORIZED');
    error.status = 401;
    throw error;
  }
}

export function principalFromValidatedContext(merchant, claims, actor) {
  const merchantId = merchant?.id || merchant?.merchant?.id;
  if (!merchantId || !claims?.sub) {
    const error = new Error('UNAUTHORIZED');
    error.status = 401;
    throw error;
  }
  if (actor && (String(actor.id || '') !== String(claims.sub)
      || actor.isActive === false
      || (claims.roleId && actor.roleId && String(actor.roleId) !== String(claims.roleId)))) {
    const error = new Error('UNAUTHORIZED');
    error.status = 401;
    throw error;
  }
  const role = String(actor?.role_name || actor?.roleName || actor?.role
    || claims.role || claims.merchantRole || '').toUpperCase();
  const rawPermissions = actor?.permissions ?? claims.permissions;
  const permissions = new Set(
    (Array.isArray(rawPermissions) ? rawPermissions : [])
      .map(value => String(value).toLowerCase()),
  );
  return { merchantId, merchant, userId: String(claims.sub), role, permissions };
}

export function requireOnboardingAdmin(principal) {
  if (!['OWNER', 'MERCHANT_OWNER', 'ADMIN'].includes(principal?.role)
      && !principal?.permissions?.has('onboarding:write')) {
    const error = new Error('ONBOARDING_FORBIDDEN');
    error.status = 403;
    throw error;
  }
  return principal;
}

export function mayReadAllOutlets(principal) {
  return ['OWNER', 'MERCHANT_OWNER', 'ADMIN'].includes(principal?.role)
    || principal?.permissions?.has('analytics:all_outlets');
}

export function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function publicError(error) {
  const status = Number(error?.status || 500);
  const known = new Set([
    'INVALID_QUERY', 'PAYLOAD_TOO_LARGE', 'RATE_LIMITED', 'UNAUTHORIZED',
    'ONBOARDING_FORBIDDEN', 'OUTLET_FORBIDDEN', 'OUTLET_REQUIRED',
    'INVALID_ONBOARDING_STEP', 'CONSENT_REQUIRED', 'BUSINESS_NAME_REQUIRED',
    'PRIMARY_CLASSIFICATION_REQUIRED', 'INVALID_KBLI_CLASSIFICATION',
  ]);
  const code = String(error?.message || 'REQUEST_FAILED');
  return { status, code: known.has(code) ? code : 'REQUEST_FAILED' };
}

export function createTokenBucket({ capacity, refillPerSecond, now = () => Date.now() }) {
  const buckets = new Map();
  return {
    consume(key) {
      const timestamp = now();
      const previous = buckets.get(key) || { tokens: capacity, at: timestamp };
      const tokens = Math.min(capacity, previous.tokens + ((timestamp - previous.at) / 1000) * refillPerSecond);
      if (tokens < 1) {
        buckets.set(key, { tokens, at: timestamp });
        return false;
      }
      buckets.set(key, { tokens: tokens - 1, at: timestamp });
      if (buckets.size > 10_000) {
        for (const [bucketKey, value] of buckets) {
          if (timestamp - value.at > 10 * 60_000) buckets.delete(bucketKey);
        }
      }
      return true;
    },
  };
}

export function requestId(value) {
  const candidate = String(value || '').trim();
  return /^[a-zA-Z0-9._-]{8,128}$/.test(candidate) ? candidate : crypto.randomUUID();
}
