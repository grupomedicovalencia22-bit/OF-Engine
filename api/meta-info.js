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

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false });

  try {
    const result = { ok: true, graphVersion: GRAPH_VERSION };

    if (process.env.META_WABA_ID) {
      result.waba = await graph(`${process.env.META_WABA_ID}?fields=id,name`);
      result.phoneNumbers = await graph(`${process.env.META_WABA_ID}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`);
      result.subscribedApps = await graph(`${process.env.META_WABA_ID}/subscribed_apps`);
    } else if (process.env.META_PHONE_NUMBER_ID) {
      result.phoneNumber = await graph(`${process.env.META_PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name,quality_rating`);
    } else {
      result.note = 'Set META_WABA_ID or META_PHONE_NUMBER_ID to enable diagnostics.';
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}
