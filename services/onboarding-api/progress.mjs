import { tenant } from './db.mjs';
import { onboardingPrincipal } from './core.mjs';
import { state } from './state.mjs';

const allowed = new Set(['country', 'country-confirm', 'business', 'classification', 'owner', 'consent', 'provisioning']);

export async function progress(req, body) {
  const principal = await onboardingPrincipal(req);
  const step = String(body.step || '');
  if (!allowed.has(step)) throw Object.assign(new Error('INVALID_ONBOARDING_STEP'), { status: 400 });
  const current = await tenant(
    principal.merchantId,
    'SELECT "onboardingStatus","onboardingPayload" FROM "Merchant" WHERE id=$1',
    [principal.merchantId],
  );
  if (current.rows[0]?.onboardingStatus === 'COMPLETED') {
    throw Object.assign(new Error('ONBOARDING_FORBIDDEN'), { status: 403 });
  }
  const payload = { ...(current.rows[0]?.onboardingPayload || {}), ...(body.data || {}) };
  await tenant(
    principal.merchantId,
    'UPDATE "Merchant" SET "countryCode"=COALESCE($2,"countryCode"),"onboardingStep"=$3,"onboardingPayload"=$4::jsonb,"onboardingStatus"=\'IN_PROGRESS\',"onboardingVersion"=2,"updatedAt"=now() WHERE id=$1 AND "onboardingStatus"<>\'COMPLETED\'',
    [principal.merchantId, body.countryCode || null, step, JSON.stringify(payload)],
  );
  return state(req, principal);
}
