import OpenAI from 'openai';

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6';

const DEFAULT_PROMPT = `Eres MBS Radar, asistente comercial de Grupo Médico Valencia y Obesity Fix.
Objetivo: responder con tono profesional, cálido y breve, buscando convertir prospectos en citas pagadas sin diagnosticar, prescribir ni cambiar tratamientos.
Reglas:
- Si preguntan precio sin especificar sede: GMV Ejido Hermosillo $400 MXN; Obesity Fix/PROMED Mexicali valoración inicial $1,000 MXN.
- Para Obesity Fix/PROMED Mexicali, horarios habituales: lunes a viernes 09:00–11:00 y 17:00–19:00. Si no hay acceso a agenda, aclara que están sujetos a disponibilidad y pide día/hora preferidos.
- Para GMV: consulta médica/urgencias, radiografías, electrocardiograma, laboratorio, traumatología/ortopedia coordinada, aplicación de medicamentos, soluciones IV, curaciones y procedimientos. Horario L-V 7:00–20:00. Teléfonos 658 596 3847 y 686 221 8298.
- No prometas disponibilidad que no puedas verificar.
- Si hay dolor intenso, dificultad respiratoria, sangrado importante, pérdida del estado de alerta u otro dato de alarma, indica atención urgente/911.
- Si falta un dato, pregunta sólo lo mínimo necesario.
- No menciones que eres IA salvo que te lo pregunten.`;

function extractIncomingWhatsApp(body) {
  const entries = body?.entry || [];
  const out = [];
  for (const entry of entries) {
    for (const change of entry?.changes || []) {
      if (change?.field !== 'messages') continue;
      const value = change?.value || {};
      const phoneNumberId = value?.metadata?.phone_number_id;
      for (const msg of value?.messages || []) {
        if (!msg?.from || !phoneNumberId) continue;
        let text = '';
        if (msg.type === 'text') text = msg?.text?.body || '';
        else if (msg.type === 'button') text = msg?.button?.text || '';
        else if (msg.type === 'interactive') {
          text = msg?.interactive?.button_reply?.title || msg?.interactive?.list_reply?.title || '';
        }
        if (!text) continue;
        out.push({ from: msg.from, text, messageId: msg.id, phoneNumberId });
      }
    }
  }
  return out;
}

async function generateReply(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const openai = new OpenAI({ apiKey });
  const response = await openai.responses.create({
    model: MODEL,
    instructions: process.env.MBS_SYSTEM_PROMPT || DEFAULT_PROMPT,
    input: text,
    max_output_tokens: 300
  });
  return response.output_text?.trim() || 'Gracias por escribirnos. ¿En qué ciudad se encuentra y qué servicio desea agendar?';
}

async function sendWhatsApp({ to, text, phoneNumberId }) {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) throw new Error('META_ACCESS_TOKEN missing');

  const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text }
    })
  });

  const data = await r.json();
  if (!r.ok) throw new Error(`Meta send failed: ${JSON.stringify(data)}`);
  return data;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ ok: false, error: 'verification_failed' });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    const messages = extractIncomingWhatsApp(req.body);
    for (const message of messages) {
      const reply = await generateReply(message.text);
      await sendWhatsApp({ to: message.from, text: reply, phoneNumberId: message.phoneNumberId });
    }
    return res.status(200).json({ ok: true, processed: messages.length });
  } catch (error) {
    console.error('MBS Radar webhook error', error);
    return res.status(200).json({ ok: false, error: 'processing_failed' });
  }
}
