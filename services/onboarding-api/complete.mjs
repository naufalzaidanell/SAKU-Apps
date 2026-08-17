import { tenant } from './db.mjs';
import { core, onboardingPrincipal } from './core.mjs';
import { validate } from './kbli.mjs';
import { state } from './state.mjs';

export async function complete(req, body) {
  const principal = await onboardingPrincipal(req);
  const primary = body.primaryClassification;
  const secondary = Array.isArray(body.secondaryClassifications) ? body.secondaryClassifications.slice(0, 8) : [];
  const canonical = await validate(primary, secondary);
  const canonicalPrimary = canonical.get(primary?.code);
  if (!canonicalPrimary) throw Object.assign(new Error('PRIMARY_CLASSIFICATION_REQUIRED'), { status: 400 });
  if (!body.consents?.terms || !body.consents?.privacy) throw Object.assign(new Error('CONSENT_REQUIRED'), { status: 400 });

  const business = body.business || {};
  if (!String(business.name || '').trim()) throw Object.assign(new Error('BUSINESS_NAME_REQUIRED'), { status: 400 });

  await core(req, '/api/merchant/me', {
    method: 'PATCH',
    body: JSON.stringify({
      name: String(business.name).trim(),
      phoneNumber: business.phoneNumber || null,
      address: business.address || null,
      businessBio: business.bio || null,
      businessCategory: canonicalPrimary.title,
    }),
  });

  if (body.owner?.name) {
    await core(req, `/api/team/users/${encodeURIComponent(principal.userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: String(body.owner.name).trim() }),
    });
  }

  // IMPORTANT: persist server-canonical KBLI data. Never trust client title/version.
  const payload = {
    business,
    owner: body.owner || {},
    primaryClassification: {
      code: canonicalPrimary.code,
      title: canonicalPrimary.title,
      category: canonicalPrimary.category || null,
      version: canonicalPrimary.version,
      alias: primary?.alias ? String(primary.alias).slice(0,120) : undefined,
    },
    secondaryClassifications: secondary.map(value => {
      const row = canonical.get(value.code);
      return {
        code: row.code,
        title: row.title,
        category: row.category || null,
        version: row.version,
        alias: value?.alias ? String(value.alias).slice(0,120) : undefined,
      };
    }),
    consents: { terms: true, privacy: true, acceptedAt: new Date().toISOString() },
  };

  await tenant(
    principal.merchantId,
    `UPDATE "Merchant"
        SET "countryCode"=$2,
            "businessCategory"=$4,
            "onboardingStatus"='COMPLETED',
            "onboardingStep"='completed',
            "onboardingPayload"=$3::jsonb,
            "onboardingCompletedAt"=now(),
            "onboardingVersion"=2,
            "updatedAt"=now()
      WHERE id=$1`,
    [principal.merchantId, body.countryCode || 'ID', JSON.stringify(payload), canonicalPrimary.title],
  );
  return state(req, principal);
}
