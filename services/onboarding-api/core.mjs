import {
  decodeValidatedClaims,
  principalFromValidatedContext,
  requireOnboardingAdmin,
  resolveCoreOrigin,
} from './security.mjs';

export const CORE = resolveCoreOrigin(process.env.CORE_API_BASE);
export const auth = req => String(req.headers.authorization || '');

export async function core(req, path, options = {}) {
  const response = await fetch(CORE + path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: auth(req),
      ...(options.headers || {}),
    },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.error || json.message || 'CORE_API_ERROR');
    error.status = response.status;
    throw error;
  }
  return json.data ?? json;
}

export async function principal(req) {
  // The team request validates the bearer signature, account status, and
  // tenant context. Claims from that same token are consumed only after the
  // core succeeds; current access tokens intentionally carry roleId rather
  // than a mutable role-name claim.
  const claims = decodeValidatedClaims(auth(req));
  const users = await core(req, '/api/team/users');
  const actor = Array.isArray(users)
    ? users.find(user => String(user?.id || '') === String(claims.sub))
    : null;
  if (!actor) {
    const error = new Error('UNAUTHORIZED');
    error.status = 401;
    throw error;
  }
  return principalFromValidatedContext({id: claims.merchantId}, claims, actor);
}

export async function onboardingPrincipal(req) {
  return requireOnboardingAdmin(await principal(req));
}
