import { tenant } from './db.mjs';
import { core, onboardingPrincipal } from './core.mjs';
import { validate } from './kbli.mjs';
import { state } from './state.mjs';

export async function complete(req, body) {
  const principal = await onboardingPrincipal(req);
  const primary = body.primaryClassification;
  const secondary = Array.isArray(body.secondaryClassifications) ? body.secondaryClassifications.slice(0, 8) : [];
  const canonical = await validate(primary, secondary);
  if (!body.consents?.terms || !body.consents?.privacy) {
    throw Object.assign(new Error('CONSENT_REQUIRED'), { status: 400 });
  }
  const business = body.business || {};
  if (!String(business.name || '').trim()) {
    throw Object.assign(new Error('BUSINESS_NAME_REQUIRED'), { status: 400 });
  }
  await core(req, '/api/merchant/me', {
    method: 'PATCH',
    body: JSON.stringify({
      name: String(business.name).trim(),
      phoneNumber: business.phoneNumber || null,
      address: business.address || null,
      businessBio: business.bio || null,
      businessCategory: canonical.get(primary.code)?.title || primary.code,
    }),
  });
  if (body.owner?.name) {
    await core(req, `/api/team/users/${encodeURIComponent(principal.userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: String(body.owner.name).trim() }),
    });
  }
  const payload = {
    business,
    owner: body.owner || {},
    primaryClassification: { ...primary, title: canonical.get(primary.code)?.title },
    secondaryClassifications: secondary.map(value => ({ ...value, title: canonical.get(value.code)?.title })),
    consents: { terms: true, privacy: true, acceptedAt: new Date().toISOString() },
  };
  await tenant(
    principal.merchantId,
    'UPDATE "Merchant" SET "countryCode"=$2,"onboardingStatus"=\'COMPLETED\',"onboardingStep"=\'completed\',"onboardingPayload"=$3::jsonb,"onboardingCompletedAt"=now(),"onboardingVersion"=2,"updatedAt"=now() WHERE id=$1',
    [principal.merchantId, body.countryCode || 'ID', JSON.stringify(payload)],
  );
  return state(req, principal);
}
