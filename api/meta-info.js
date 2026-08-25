const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';

async function graph(path) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN missing');

  const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function inspectWaba(wabaId) {
  return {
    waba: await graph(`${wabaId}?fields=id,name`),
    phoneNumbers: await graph(`${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`),
    subscribedApps: await graph(`${wabaId}/subscribed_apps`)
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false });

  try {
    const result = { ok: true, graphVersion: GRAPH_VERSION };

    if (process.env.META_WABA_ID) {
      Object.assign(result, await inspectWaba(process.env.META_WABA_ID));
      return res.status(200).json(result);
    }

    if (process.env.META_BUSINESS_ID) {
      const owned = await graph(`${process.env.META_BUSINESS_ID}/owned_whatsapp_business_accounts?fields=id,name`);
      result.ownedWabas = owned;

      const firstWabaId = owned?.data?.[0]?.id;
      if (firstWabaId) Object.assign(result, await inspectWaba(firstWabaId));
      else result.note = 'No owned WhatsApp Business Accounts visible to this token.';

      return res.status(200).json(result);
    }

    if (process.env.META_PHONE_NUMBER_ID) {
      result.phoneNumber = await graph(`${process.env.META_PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name,quality_rating`);
      return res.status(200).json(result);
    }

    result.note = 'Set META_BUSINESS_ID, META_WABA_ID or META_PHONE_NUMBER_ID to enable diagnostics.';
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}
