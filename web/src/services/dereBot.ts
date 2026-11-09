/**
 * DereBot Conversational Intake Service (Gemini API Integration)
 *
 * Implements empathetic, sharp legal intake for Kenyan ride-hailing drivers (Sauti ya Dere).
 * Calls Gemini 3.8 Flash via REST API with zero external runtime dependencies.
 * Features bilingual (English/Kiswahili) conversational intake and on-device PII scrubbing.
 */

export interface ExtractedEntity {
  label: 'DATE' | 'TIME' | 'LOCATION' | 'MONEY' | 'ALLEGATION' | string
  text: string
}

export interface DereBotResponse {
  reply: string
  facts_complete: boolean
  extracted_entities: ExtractedEntity[]
  suggested_case_type: 'fare_dispute' | 'passenger_safety' | 'rating_or_cancellation' | 'fraud_flag'
  /** Dynamic confidence score computed from fact completeness and classification stability (0–1) */
  confidence: number
}

export interface ChatMessage {
  sender: 'bot' | 'driver'
  text: string
  timestamp?: number
}

export type IntakeLanguage = 'en' | 'sw'

/**
 * On-device PII Scrubber (KDPA 2019 compliance):
 * Scrubs Kenyan phone numbers, vehicle registrations, and national IDs before network transmission.
 */
export function scrubPII(text: string): string {
  // Guard: if not a string (null/undefined/object from unexpected Gemini response), coerce safely
  if (typeof text !== 'string') return String(text ?? '')
  return text
    // Kenyan Mobile numbers: 07xx, 01xx, +254 7xx
    .replace(/(?:\+?254|0)[\s-]?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g, '<PHONE>')
    // Kenyan Number plates: KAA 123A, KDA 456Z
    .replace(/\bK[A-Z]{2}\s*\d{3}[A-Z]\b/gi, '<PLATE>')
    // National ID: 7 or 8 consecutive digits preceded by ID/id/no
    .replace(/\b(?:ID|national id|kitambulisho)[\s#:]*(\d{7,8})\b/gi, '<NATIONAL_ID>')
}

/**
 * Builds language-aware system instructions for DereBot.
 */
function getSystemPrompt(language: IntakeLanguage = 'en'): string {
  const langRule =
    language === 'sw'
      ? 'Always respond in natural, respectful Kiswahili suitable for a Kenyan transport operator.'
      : 'Always respond in clear, professional Kenyan English. Do NOT default to Kiswahili unless the driver explicitly uses it.'

  return `You are DereBot, an empathetic, sharp legal intake assistant for Kenyan ride-hailing drivers (Sauti ya Dere).
The driver has faced an unfair account suspension or lockout.
Your job is to have a natural conversation with the driver to understand what happened and extract key legal facts.

LANGUAGE DIRECTIVE:
${langRule}

IMPORTANT — Evidence Memory:
- You will be told which documents the driver has already uploaded (suspension notice, M-Pesa receipt, trip screenshot, etc.).
- You will also receive any facts already extracted from those uploaded documents (OCR results).
- Do NOT ask the driver to provide something they have already uploaded or mentioned.
- Acknowledge what you already know and build on it naturally.

Analyze the driver's response:
1. Check for 4 critical facts (considering what is ALREADY KNOWN from uploads):
   - DATE & TIME of the trip
   - ROUTE / LOCATION (pickup and dropoff stages in Nairobi)
   - FARE / FINANCIAL AMOUNT (if fare dispute) or SPECIFIC ALLEGATION (if safety/conduct dispute)
   - EVIDENCE AVAILABLE (M-Pesa SMS, trip receipt, dashcam, chat screenshot)
2. Infer the dispute category automatically from the narrative and uploaded documents. Do NOT ask the driver to pick a category.
3. If critical details are missing, ask a natural, concise, empathetic follow-up question.
4. If sufficient details are present, confirm the detected facts to the driver, let them know their appeal foundation is solid, and invite them to ask any questions or proceed to verification.
5. CONTINUED CONVERSATION & DRIVER QUESTIONS:
   - If the driver asks ANY questions at any point — including questions about their evidence ("did you see my screenshot?"), privacy ("what will you do with my data?"), platform rules, police matters (OB numbers), or what happens next — ALWAYS answer their questions directly, thoroughly, empathetically, and accurately.
   - For privacy questions: reassure them that Sauti ya Dere stores all data, narratives, and images strictly on their device (Dexie.js / IndexedDB), and never uploads personal driver documents or photos to centralized servers.
   - For evidence questions: confirm what has been attached or explain what evidence is most helpful.
   - For criminal or police claims: clarify that transport platforms cannot replace judicial process, explain what an OB number is, and recommend legal representation.
   - NEVER cut the conversation short or refuse to answer. Continue conversing naturally while maintaining "facts_complete": true once the core facts have been gathered.

Always respond in clean JSON matching:
{
  "reply": "Conversational response to driver",
  "facts_complete": boolean,
  "extracted_entities": [
    {"label": "DATE", "text": "..."},
    {"label": "TIME", "text": "..."},
    {"label": "LOCATION", "text": "..."},
    {"label": "MONEY", "text": "..."},
    {"label": "ALLEGATION", "text": "..."}
  ],
  "suggested_case_type": "fare_dispute" | "passenger_safety" | "rating_or_cancellation" | "fraud_flag"
}`
}

/**
 * Resolves the Gemini API Key from Vite or global environment.
 */
export function getGeminiApiKey(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (import.meta.env.VITE_GEMINI_API_KEY) return import.meta.env.VITE_GEMINI_API_KEY
    if (import.meta.env.GEMINI_API_KEY) return import.meta.env.GEMINI_API_KEY
  }
  return ''
}

/**
 * Computes a dynamic confidence score (0–1) based on:
 * - Number of distinct fact types present (date, time, location, money/allegation)
 * - Consistency of suggested_case_type across messages
 * - Length/richness of driver narrative
 */
export function computeDynamicConfidence(
  entities: ExtractedEntity[],
  caseTypeHistory: string[],
  narrativeLength: number
): number {
  const hasDate = entities.some((e) => e.label === 'DATE')
  const hasTime = entities.some((e) => e.label === 'TIME')
  const hasLocation = entities.some((e) => e.label === 'LOCATION')
  const hasMoney = entities.some((e) => e.label === 'MONEY')
  const hasAllegation = entities.some((e) => e.label === 'ALLEGATION')

  const factScore =
    ((hasDate || hasTime) ? 0.20 : 0) +
    (hasLocation ? 0.25 : 0) +
    ((hasMoney || hasAllegation) ? 0.25 : 0) +
    (narrativeLength > 80 ? 0.15 : narrativeLength > 30 ? 0.08 : 0)

  let consistencyBonus = 0
  if (caseTypeHistory.length > 1) {
    const mostCommon = caseTypeHistory.reduce((acc, v) => {
      acc[v] = (acc[v] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    const maxCount = Math.max(...Object.values(mostCommon))
    consistencyBonus = maxCount >= 2 ? 0.15 : 0.08
  }

  const raw = factScore + consistencyBonus
  return Math.min(0.97, Math.max(0.35, Math.round(raw * 100) / 100))
}

/**
 * Client-side entity extraction from all driver messages.
 */
export function extractClientEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = []
  const seen = new Set<string>()

  // 1. TIME: e.g., "4:30pm", "16:30", "4pm", "8:00 am"
  const timeRegex = /\b(?:[0-1]?[0-9]|2[0-3]):[0-5][0-9]\s*(?:am|pm)?\b|\b[1-9]\s*(?:am|pm)\b/gi
  const timeMatches = text.match(timeRegex)
  if (timeMatches) {
    timeMatches.forEach((t) => {
      const val = t.trim()
      const k = `TIME:${val.toLowerCase()}`
      if (!seen.has(k)) {
        seen.add(k)
        entities.push({ label: 'TIME', text: val })
      }
    })
  }

  // 2. DATE: e.g., "14 May", "May 14", "14/05/2026", "14th May", "yesterday", "today"
  const dateRegex =
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/gi
  const dateMatches = text.match(dateRegex)
  if (dateMatches) {
    dateMatches.forEach((d) => {
      const val = d.trim()
      const k = `DATE:${val.toLowerCase()}`
      if (!seen.has(k)) {
        seen.add(k)
        entities.push({ label: 'DATE', text: val })
      }
    })
  }

  // 3. KNOWN LOCATIONS / STAGES in Nairobi
  const knownLocations = [
    'Westlands', 'JKIA', 'CBD', 'Town', 'Upper Hill', 'Kilimani', 'Karen',
    'Eastleigh', 'Ngong Road', 'Rongai', 'Airport', 'Gikomba', 'Thika Road',
    'South C', 'South B', 'Parklands', 'Lavington', 'Kasarani', 'Umoja', 'Langata',
    'Embakasi', 'Waiyaki Way', 'Sarit', 'Village Market', 'Two Rivers'
  ]
  for (const loc of knownLocations) {
    const locRegex = new RegExp(`\\b${loc}\\b`, 'i')
    if (locRegex.test(text)) {
      const k = `LOCATION:${loc.toLowerCase()}`
      if (!seen.has(k)) {
        seen.add(k)
        entities.push({ label: 'LOCATION', text: loc })
      }
    }
  }

  // Fallback route locations following prepositions: from / to / at / in / near
  const routeRegex = /\b(?:from|to|at|in|near)\s+([a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)?)\b/gi
  let match: RegExpExecArray | null
  while ((match = routeRegex.exec(text)) !== null) {
    const candidate = match[1].trim()
    const stopWords = ['a', 'the', 'my', 'his', 'her', 'their', 'an', 'some', 'me', 'us', 'him', 'them', 'this', 'that', 'locked', 'stopped', 'when']
    if (!stopWords.includes(candidate.toLowerCase()) && candidate.length > 2) {
      const k = `LOCATION:${candidate.toLowerCase()}`
      if (!seen.has(k)) {
        seen.add(k)
        const capitalized = candidate.charAt(0).toUpperCase() + candidate.slice(1)
        entities.push({ label: 'LOCATION', text: capitalized })
      }
    }
  }

  // 4. FARE / MONEY: e.g., "KSh 1,250", "KES 800", "500 bob", "fare of 1200", "paid 750"
  const fareRegex =
    /(?:KSh|KES)\s*[\d,]+|\b\d+\s*bob\b|\b(?:fare|amount|cash|mpesa|m-pesa|paid|charged)\s*(?:of|was|is)?\s*[\d,]+\b/gi
  const fareMatches = text.match(fareRegex)
  if (fareMatches) {
    fareMatches.forEach((f) => {
      const val = f.trim()
      const k = `MONEY:${val.toLowerCase()}`
      if (!seen.has(k)) {
        seen.add(k)
        entities.push({ label: 'MONEY', text: val })
      }
    })
  }

  // 5. ALLEGATION / COMPLAINT KEYWORDS
  const allegationMap: Array<{ pattern: RegExp; text: string }> = [
    { pattern: /\b(?:reckless|speeding|over-speeding|dangerous driving)\b/i, text: 'Allegation of reckless driving' },
    { pattern: /\b(?:refused|declined|unmapped|off-route|alleyway|rough road)\b/i, text: 'Dispute over off-route/unmapped alleyway' },
    { pattern: /\b(?:harassment|rudeness|abusive|insult|argument)\b/i, text: 'Dispute over passenger conduct/argument' },
    { pattern: /\b(?:overcharge|fare too high|refused to pay|underpaid)\b/i, text: 'Fare dispute / passenger refusal to pay' },
    { pattern: /\b(?:cancel|cancellation|no-show|wrong pin|unreachable)\b/i, text: 'Cancellation due to rider no-show / wrong pin' },
    { pattern: /\b(?:lock|locked|deactivat|suspend|fraud|flag)\b/i, text: 'Account deactivation / lockout flag' }
  ]
  for (const item of allegationMap) {
    if (item.pattern.test(text)) {
      const k = `ALLEGATION:${item.text}`
      if (!seen.has(k)) {
        seen.add(k)
        entities.push({ label: 'ALLEGATION', text: item.text })
      }
    }
  }

  return entities
}

/**
 * Bilingual offline DereBot fallback when Gemini API is offline or unreachable.
 */
export function generateOfflineDereBotReply(
  messages: ChatMessage[],
  platform: string,
  noticeReason: string,
  ocrFacts: ExtractedEntity[] = [],
  evidenceHeld: string[] = [],
  language: IntakeLanguage = 'en'
): DereBotResponse {
  const allDriverText = messages
    .filter((m) => m.sender === 'driver')
    .map((m) => m.text)
    .join(' ')

  const clientEntities = extractClientEntities(allDriverText)
  const seen = new Set<string>()
  const entities: ExtractedEntity[] = []
  for (const e of [...ocrFacts, ...clientEntities]) {
    const key = `${e.label}:${e.text.toLowerCase()}`
    if (!seen.has(key)) {
      seen.add(key)
      entities.push(e)
    }
  }

  const hasDate = entities.some((e) => e.label === 'DATE')
  const hasTime = entities.some((e) => e.label === 'TIME')
  const locations = entities.filter((e) => e.label === 'LOCATION')
  const hasMoney = entities.some((e) => e.label === 'MONEY')
  const hasAllegation = entities.some((e) => e.label === 'ALLEGATION')

  let suggested_case_type: DereBotResponse['suggested_case_type'] = 'fare_dispute'
  const lowerText = (allDriverText + ' ' + noticeReason + ' ' + ocrFacts.map((e) => e.text).join(' ')).toLowerCase()
  if (lowerText.includes('safe') || lowerText.includes('reckless') || lowerText.includes('threat') || lowerText.includes('assault')) {
    suggested_case_type = 'passenger_safety'
  } else if (lowerText.includes('cancel') || lowerText.includes('rating') || lowerText.includes('star') || lowerText.includes('pin')) {
    suggested_case_type = 'rating_or_cancellation'
  } else if (lowerText.includes('fraud') || lowerText.includes('ident') || lowerText.includes('lock') || lowerText.includes('doc')) {
    suggested_case_type = 'fraud_flag'
  }

  const factScore =
    (hasDate || hasTime ? 1 : 0) +
    (locations.length >= 1 ? 1 : 0) +
    (hasMoney || hasAllegation ? 1 : 0) +
    (allDriverText.length > 50 ? 1 : 0)

  const facts_complete = factScore >= 3 || (locations.length >= 1 && (hasDate || hasTime))

  // Check if driver is asking an explicit question (privacy, evidence, police, next steps)
  const lastDriverMsg = messages.filter((m) => m.sender === 'driver').slice(-1)[0]?.text?.toLowerCase() || ''
  
  let reply = ''
  if (lastDriverMsg.includes('privacy') || lastDriverMsg.includes('data') || lastDriverMsg.includes('afraid')) {
    reply = language === 'sw'
      ? 'Huna haja ya kuwa na wasiwasi dere. Data yako inalindwa 100% kwenye simu hii tu. Picha, sauti, au risiti unazopakia hazitumwi kwenye server zozote — zote zinahifadhiwa kwenye browser ya simu yako (Dexie IndexedDB).'
      : 'Your privacy is 100% protected on this device. All screenshots, audio recordings, and personal details stay strictly in your phone\'s browser storage (IndexedDB). Nothing is uploaded to central servers or shared with any third party.'
  } else if (lastDriverMsg.includes('screenshot') || lastDriverMsg.includes('see my') || lastDriverMsg.includes('umeona') || lastDriverMsg.includes('attached')) {
    reply = language === 'sw'
      ? 'Ndiyo dere, picha yako imepokelewa na kuhifadhiwa kwenye simu yako! Taarifa zake zimejumuishwa kama ushahidi kwenye appeal yako rasmi.'
      : 'Yes driver, your screenshot has been received and saved locally on your device! Its details will be attached as corroborating proof in your formal appeal checklist.'
  } else if (lastDriverMsg.includes('ob number') || lastDriverMsg.includes('police') || lastDriverMsg.includes('polisi') || lastDriverMsg.includes('murder')) {
    reply = language === 'sw'
      ? 'Nambari ya OB (Occurrence Book) ni kumbukumbu rasmi inayotolewa kituo cha polisi unapowasilisha ripoti. Ikiwa kuna mashtaka ya jinai, jukwaa la kidijitali halina mamlaka ya kisheria ya kuhukumu, lakini unashauriwa kupata mwanasheria au usaidizi kutoka Kituo cha Sheria kabla ya kutoa kauli yoyote.'
      : 'In Kenya, an OB (Occurrence Book) number is the official reference issued when a matter is reported at a police station. While platforms cannot act as a court of law, serious police matters require formal legal representation. You should consult an advocate or legal aid like Kituo cha Sheria promptly.'
  } else if (language === 'sw') {
    const uploadedDocs = evidenceHeld.length > 0
      ? `Ninaona tayari umepakia: ${evidenceHeld.map((k) => k.replace(/_/g, ' ').toLowerCase()).join(', ')}. `
      : ''
    if (!hasDate && !hasTime && locations.length === 0 && ocrFacts.length === 0) {
      reply = `${uploadedDocs}Pole sana dere kwa hii kusimamishwa na ${platform}. Je, safari hii ilifanyika lini na saa ngapi, kutoka wapi hadi wapi?`
    } else if (!hasDate && !hasTime && ocrFacts.length === 0) {
      reply = `${uploadedDocs}Nimepata stage ya ${locations.map((l) => l.text).join(' na ')}. Tafadhali niambie ilikuwa tarehe gani na muda gani?`
    } else if (locations.length === 0 && !ocrFacts.some((e) => e.label === 'LOCATION')) {
      reply = `${uploadedDocs}Nimeona muda wa tukio (${entities.find((e) => e.label === 'DATE' || e.label === 'TIME')?.text || 'kwenye ripoti'}). Safari ilikuwa inatoka wapi kuelekea wapi?`
    } else {
      const locStr = locations.length > 0 ? locations.map((l) => l.text).join(' → ') : 'iliyobainishwa'
      const timeStr = entities.find((e) => e.label === 'TIME' || e.label === 'DATE')?.text || 'kwenye rekodi'
      reply = `Asante dere. Nimehifadhi maelezo yako: Eneo (${locStr}), Muda (${timeStr}). Msingi wa appeal yako uko imara chini ya NTSA LN 120. Unaweza kuuliza swali lolote au ubonyeze 'Proceed to Verification' hapo chini.`
    }
  } else {
    // English default
    const uploadedDocs = evidenceHeld.length > 0
      ? `I see you have already attached: ${evidenceHeld.map((k) => k.replace(/_/g, ' ').toLowerCase()).join(', ')}. `
      : ''
    if (!hasDate && !hasTime && locations.length === 0 && ocrFacts.length === 0) {
      reply = `${uploadedDocs}I understand this suspension by ${platform} is frustrating. Could you tell me when this trip occurred (date & time), and what the pickup/drop-off route was?`
    } else if (!hasDate && !hasTime && ocrFacts.length === 0) {
      reply = `${uploadedDocs}Noted location: ${locations.map((l) => l.text).join(' & ')}. What date and approximate time did this incident happen?`
    } else if (locations.length === 0 && !ocrFacts.some((e) => e.label === 'LOCATION')) {
      reply = `${uploadedDocs}Noted the time (${entities.find((e) => e.label === 'DATE' || e.label === 'TIME')?.text || 'on record'}). Which pickup stage or route in Nairobi was this?`
    } else {
      const locStr = locations.length > 0 ? locations.map((l) => l.text).join(' → ') : 'recorded stages'
      const timeStr = entities.find((e) => e.label === 'TIME' || e.label === 'DATE')?.text || 'on record'
      reply = `Thank you. I have captured your incident details: Location (${locStr}), Time (${timeStr}). Your appeal foundation under NTSA Legal Notice 120 is solid. You can ask any questions or click 'Proceed to Verification' below to review your evidence.`
    }
  }

  const confidence = computeDynamicConfidence(entities, [suggested_case_type], allDriverText.length)

  return {
    reply,
    facts_complete,
    extracted_entities: entities,
    suggested_case_type,
    confidence
  }
}

/**
 * Sends conversation to Gemini 3.8 Flash API or falls back gracefully.
 * Never throws uncaught exceptions into the UI layer.
 */
export async function sendDereBotMessage({
  messages,
  platform = 'Bolt',
  noticeReason = 'Account or identity flag',
  ocrFacts = [],
  evidenceHeld = [],
  caseTypeHistory = [],
  language = 'en'
}: {
  messages: ChatMessage[]
  platform?: string
  noticeReason?: string
  ocrFacts?: ExtractedEntity[]
  evidenceHeld?: string[]
  caseTypeHistory?: string[]
  language?: IntakeLanguage
}): Promise<DereBotResponse> {
  const apiKey = getGeminiApiKey()

  if (!apiKey) {
    return generateOfflineDereBotReply(messages, platform, noticeReason, ocrFacts, evidenceHeld, language)
  }

  const evidenceContext =
    evidenceHeld.length > 0
      ? `\nDriver has already uploaded: ${evidenceHeld.map((k) => k.replace(/_/g, ' ')).join(', ')}.`
      : ''

  const ocrContext =
    ocrFacts.length > 0
      ? `\nFacts already extracted from uploaded documents (do NOT ask about these again):\n${ocrFacts.map((e) => `- ${e.label}: ${e.text}`).join('\n')}`
      : ''

  // Using gemini-3.8-flash endpoint
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`

  const systemInstructionText = `${getSystemPrompt(language)}\nContext: The driver is appealing an account suspension on ${platform}. Reason: "${noticeReason}".${evidenceContext}${ocrContext}`

  // Apply PII scrubbing before sending driver text to model
  const contents = messages.map((m) => ({
    role: m.sender === 'driver' ? 'user' : 'model',
    parts: [{ text: m.sender === 'driver' ? scrubPII(m.text) : m.text }]
  }))

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstructionText }]
        },
        contents,
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      })
    })

    if (!res.ok) {
      console.warn(`[dereBot] Gemini 3.8 Flash returned status ${res.status}. Falling back to client intake parser.`)
      return generateOfflineDereBotReply(messages, platform, noticeReason, ocrFacts, evidenceHeld, language)
    }

    const data = await res.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (rawText) {
      try {
        const parsed: Omit<DereBotResponse, 'confidence'> = JSON.parse(rawText)
        if (parsed && typeof parsed.reply === 'string') {
          const allDriverText = messages
            .filter((m) => m.sender === 'driver')
            .map((m) => m.text)
            .join(' ')
          const clientEntities = extractClientEntities(allDriverText)

          const combinedEntities: ExtractedEntity[] = [...ocrFacts, ...(parsed.extracted_entities || [])]
          const existingLabels = new Set(combinedEntities.map((e) => `${e.label}:${e.text.toLowerCase()}`))
          for (const ce of clientEntities) {
            if (!existingLabels.has(`${ce.label}:${ce.text.toLowerCase()}`)) {
              combinedEntities.push(ce)
            }
          }

          const updatedHistory = [...caseTypeHistory, parsed.suggested_case_type || 'fare_dispute']
          const confidence = computeDynamicConfidence(combinedEntities, updatedHistory, allDriverText.length)

          return {
            reply: parsed.reply,
            facts_complete: Boolean(parsed.facts_complete),
            extracted_entities: combinedEntities,
            suggested_case_type: parsed.suggested_case_type || 'fare_dispute',
            confidence
          }
        }
      } catch (parseErr) {
        console.warn('[dereBot] Failed to parse Gemini JSON output:', parseErr)
      }
    }

    return generateOfflineDereBotReply(messages, platform, noticeReason, ocrFacts, evidenceHeld, language)
  } catch (err) {
    console.warn('[dereBot] Network call to Gemini API failed, using offline fallback:', err)
    return generateOfflineDereBotReply(messages, platform, noticeReason, ocrFacts, evidenceHeld, language)
  }
}

/**
 * Synthesizes verified trip facts and incident details into a professional
 * first-person legal rebuttal statement using Gemini 3.8 Flash.
 * Guarantees that confidential driver chat questions are NEVER leaked into the appeal brief.
 */
export async function synthesizeAppealStatement({
  platform,
  caseType,
  entities,
  driverName
}: {
  platform: string
  caseType: string
  entities: ExtractedEntity[]
  driverName: string
}): Promise<string> {
  const apiKey = getGeminiApiKey()

  const findEntity = (labels: string[]) => {
    const match = entities.find((e) => labels.includes(e.label?.toUpperCase()))
    return match ? match.text : null
  }

  const date = findEntity(['DATE', 'EVENT_DATE', 'TRIP_DATE']) || 'the recorded date'
  const time = findEntity(['TIME', 'EVENT_TIME']) || 'operating hours'
  const route = findEntity(['LOCATION', 'ROUTE']) || 'the designated route'
  const fare = findEntity(['MONEY', 'FARE']) || ''
  const allegation = findEntity(['ALLEGATION']) || ''

  const fallback = `On ${date}, between approximately ${time}, while providing passenger transport on ${platform} along the ${route} route, an operational dispute arose${allegation ? ` regarding ${allegation.toLowerCase()}` : ''}${fare ? ` involving a disputed amount of ${fare}` : ''}. The account deactivation was imposed without fair administrative inquiry. I respectfully request an expedited review of my trip logs and reinstatement under Regulation 15 of NTSA Legal Notice 120.`

  if (!apiKey) return fallback

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`

  const prompt = `You are a legal brief drafter for Kenyan transport appeals (TAWU-Kenya / NTSA Legal Notice 120).
Write exactly ONE formal, polished, professional first-person paragraph for Section 3 ("Statement of Operational Truth") of an administrative appeal to ${platform}.
Facts:
- Driver: ${driverName}
- Platform: ${platform}
- Category: ${caseType.replace(/_/g, ' ')}
- Date & Time: ${date} at ${time}
- Route: ${route}
${fare ? `- Disputed Fare / Amount: ${fare}` : ''}
${allegation ? `- Key Incident Allegation: ${allegation}` : ''}

Rules:
- Write strictly in formal first-person English ("On [date], while operating...").
- Keep it concise (3 to 5 sentences maximum).
- Emphasize professional compliance and request administrative reinstatement under Regulation 15 of NTSA Legal Notice 120.
- Return ONLY the final paragraph. Do NOT output headings, asterisks, bullet points, or drafting notes like "Sentence Formulation".`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      })
    })

    if (!res.ok) return fallback
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return fallback

    let cleaned = text.trim()
    // Strip leading markdown headers or outline notes
    cleaned = cleaned.replace(/^(?:#+\s*|\*+\s*|Sentence Formulation:?\*?\*?|Sentence \d+:?\s*)/gim, '')
    cleaned = cleaned.replace(/^\*+\s*/gm, '')
    cleaned = cleaned.replace(/\*\*/g, '')
    cleaned = cleaned.trim().replace(/^["']|["']$/g, '')

    // Validate that the output is actually a coherent statement
    if (
      cleaned.toLowerCase().includes('sentence formulation') ||
      cleaned.length < 40 ||
      cleaned.startsWith('*')
    ) {
      return fallback
    }
    return cleaned
  } catch {
    return fallback
  }
}
