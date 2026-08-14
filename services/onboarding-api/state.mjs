import { tenant } from './db.mjs';
import { onboardingPrincipal } from './core.mjs';

export async function state(req, verifiedPrincipal) {
  const principal = verifiedPrincipal || await onboardingPrincipal(req);
  const result = await tenant(
    principal.merchantId,
    'SELECT "countryCode","onboardingStatus","onboardingStep","onboardingPayload","onboardingCompletedAt","onboardingVersion" FROM "Merchant" WHERE id=$1',
    [principal.merchantId],
  );
  const merchant = result.rows[0];
  return {
    status: merchant?.onboardingStatus || 'IN_PROGRESS',
    step: merchant?.onboardingStep || 'country',
    payload: merchant?.onboardingPayload || {},
    countryCode: merchant?.countryCode || null,
    completedAt: merchant?.onboardingCompletedAt || null,
    version: merchant?.onboardingVersion || 2,
  };
}
