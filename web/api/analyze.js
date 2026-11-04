/**
 * Vercel Serverless Backend Endpoint (/api/analyze)
 * Strictly grounded in the driver's actual text:
 * - Zero hallucinated placeholders
 * - Prioritizes driver's narrative over default dropdown notice
 * - Quotes the driver's exact redacted statement in the appeal letter
 */

const NAIROBI_PLACES = [
  'Westlands', 'JKIA', 'Jomo Kenyatta International Airport', 'Kilimani',
  'Syokimau', 'Utawala', 'Embakasi', 'Karen', 'CBD', 'Nairobi CBD',
  'Upper Hill', 'Roysambu', 'Kasarani', 'Thika Road', 'Mombasa Road',
  'Waiyaki Way', 'Ngong Road', 'Langata', 'South B', 'South C',
  'Eastleigh', 'Kawangware', 'Lavington', 'Kileleshwa', 'Parklands',
  'Rongai', 'Ongata Rongai', 'Ruiru', 'Juja', 'Kitengela', 'Athi River',
  'Kikuyu', 'Ruaka', 'Two Rivers', 'Gigiri', 'Muthaiga', 'Runda',
  'Pangani', 'Ngara', 'Hurlingham', 'Yaya Centre', 'Sarit Centre',
  'Buruburu', 'Donholm', 'Umoja', 'Kayole', 'Komarock',
  'Fedha', 'Imara Daima', 'Nyayo Estate', 'Mlolongo', 'Wilson Airport'
]

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ detail: 'Method Not Allowed' })
    return
  }

  const body = req.body || {}
  const narrative = String(body.narrative || '').trim()
  const noticeText = String(body.notice_text || body.selected_notice_type || '').trim()
  const platform = String(body.platform || 'Bolt').trim()
  const evidenceHeld = Array.isArray(body.evidence_held || body.attached_evidence_keys)
    ? body.evidence_held || body.attached_evidence_keys
    : []

  if (!narrative) {
    res.status(422).json({ detail: [{ loc: ['body', 'narrative'], msg: 'Field required' }] })
    return
  }

  // 1. Redact Kenyan PII
  const redacted = narrative
    .replace(/(?<![\w+])(?:\+?254|[0O])[\s-]?[17](?:[\s-]?[\dO]){8}(?!\w)/g, '<PHONE_1>')
    .replace(/\bKM?[A-Z]{2}\s?\d{3}[A-Z]\b/g, '<PLATE_1>')
    .replace(/\b(?=(?:[0-9]*[A-Z]){2})(?=(?:[A-Z]*[0-9]){2})[A-Z0-9]{10}\b/g, '<MPESA_CODE_1>')

  // 2. Extract ONLY facts actually present in the driver's text
  const entities = []
  const seen = new Set()
  const addEnt = (label, text) => {
    const cleaned = String(text || '').trim().replace(/[.,;!?]+$/, '')
    const k = `${label}:${cleaned.toLowerCase()}`
    if (cleaned && !seen.has(k)) {
      seen.add(k)
      entities.push({ label, text: cleaned })
    }
  }

  const dateMatches =
    redacted.match(
      /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s+\d{4})?|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|yesterday|today|jana|juzi)\b/gi
    ) || []
  dateMatches.forEach((m) => addEnt('DATE', m))

  const timeMatches =
    redacted.match(
      /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|saa\s+(?:moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi)(?:\s+(?:asubuhi|mchana|jioni|usiku))?)\b/gi
    ) || []
  timeMatches.forEach((m) => addEnt('TIME', m))

  const moneyMatches =
    redacted.match(/\b(?:KShs?\.?|KES|Shs?\.?)\s*\d[\d,]*(?:\.\d{2})?|\b\d[\d,]*\s*(?:bob|shillings|shilingi)\b/gi) || []
  moneyMatches.forEach((m) => addEnt('MONEY', m))

  NAIROBI_PLACES.forEach((place) => {
    const rx = new RegExp(`\\b${place.replace(/\s+/g, '\\s+')}\\b`, 'i')
    const match = redacted.match(rx)
    if (match) addEnt('LOCATION', match[0])
  })

  // 3. Classify strictly from the driver's narrative first
  const narLower = redacted.toLowerCase()
  const scores = {
    fare_dispute: 0,
    passenger_safety: 0,
    rating_or_cancellation: 0,
    fraud_flag: 0
  }
  ;['fare', 'paid', 'pay', 'payment', 'cash', 'mpesa', 'm-pesa', 'ksh', 'commission', 'malipo', 'nauli', 'kulipa', 'walked away'].forEach(
    (k) => {
      if (narLower.includes(k)) scores.fare_dispute += 2.0
    }
  )
  ;['safety', 'drunk', 'threat', 'abuse', 'assault', '5 passengers', 'five passengers', 'smoke', 'usalama', 'conduct', 'rude'].forEach(
    (k) => {
      if (narLower.includes(k)) scores.passenger_safety += 2.0
    }
  )
  ;['rating', 'star', 'cancel', 'cancellation', 'pickup pin', 'wrong pin', 'ghairi'].forEach((k) => {
    if (narLower.includes(k)) scores.rating_or_cancellation += 2.0
  })
  ;['fraud', 'gps', 'spoof', 'collusion', 'duplicate', 'selfie', 'identity', 'verification'].forEach((k) => {
    if (narLower.includes(k)) scores.fraud_flag += 2.0
  })

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0)
  if (totalScore === 0 && noticeText) {
    const nl = noticeText.toLowerCase()
    if (nl.includes('safety') || nl.includes('conduct')) scores.passenger_safety += 1.0
    else if (nl.includes('cancel') || nl.includes('rating')) scores.rating_or_cancellation += 1.0
    else if (nl.includes('fraud') || nl.includes('identity')) scores.fraud_flag += 1.0
    else if (nl.includes('fare') || nl.includes('payment')) scores.fare_dispute += 1.0
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const bestScore = sorted[0][1]
  const caseType = bestScore > 0 ? sorted[0][0] : 'fare_dispute'
  const confidence = bestScore >= 2 ? Math.min(0.95, 0.75 + bestScore * 0.03) : 0.58

  // 4. Build Appeal strictly from the driver's own words + verified entities
  const dates = entities.filter((e) => e.label === 'DATE').map((e) => e.text)
  const times = entities.filter((e) => e.label === 'TIME').map((e) => e.text)
  const locs = entities.filter((e) => e.label === 'LOCATION').map((e) => e.text)
  const moneys = entities.filter((e) => e.label === 'MONEY').map((e) => e.text)

  const parts = []
  if (dates[0] || times[0]) parts.push(`on ${[dates[0], times[0]].filter(Boolean).join(' at ')}`)
  if (locs.length >= 2) parts.push(`from ${locs[0]} to ${locs[1]}`)
  else if (locs.length === 1) parts.push(`in ${locs[0]}`)
  if (moneys[0]) parts.push(`involving ${moneys[0]}`)
  const contextClause = parts.length > 0 ? ` (${parts.join(', ')})` : ''

  const appealBody = [
    `Dear ${platform} Support Team,`,
    `I am writing to formally request a review regarding my account/trip${contextClause}.`,
    `Driver's Statement of Facts:\n"${redacted}"`,
    `Statutory & Policy Grounds:\nPursuant to NTSA Legal Notice 120 of 2022 Regulation 15(1) (POL-NTSA-15) on fair administrative action, Kenya Data Protection Act 2019 Section 35 (POL-DPA-26) on human review of automated decisions, and TAWU Grievance Protocol (POL-TAWU-01), I respectfully request a manual review of this matter.`
  ].join('\n\n')

  res.status(200).json({
    stub: false,
    redacted_narrative: redacted,
    classification: {
      case_type: caseType,
      confidence: Number(confidence.toFixed(2)),
      confidence_threshold: 0.7,
      needs_confirmation: confidence < 0.7
    },
    entities,
    evidence: {
      readiness: evidenceHeld.length > 0 ? Math.min(1.0, 0.35 + evidenceHeld.length * 0.25) : 0.15,
      missing: [],
      optional: []
    },
    appeal: {
      headline: `Formal Driver Appeal — ${platform}`,
      body: appealBody,
      policy_rules: ['POL-NTSA-15', 'POL-DPA-26', 'POL-TAWU-01']
    }
  })
}
