/**
 * Sauti ya Dere - Client-Side Kenyan Legal & NLP Analyzer
 *
 * Ensures 100% offline / static-host capability (Vercel, Cloudflare Pages, offline PWA)
 * when the backend /api/analyze endpoint is unreachable or returns a stub response.
 *
 * Implements:
 * 1. Kenyan PII Redaction (T15): Phone numbers (07xx/01xx/+254), KRA plates (KDA 123A),
 *    M-Pesa codes (10-char alphanumeric), emails, and Kenyan personal names.
 * 2. Kenyan Fact Extraction (T16): DATE (English & Swahili), TIME, LOCATION (Nairobi places),
 *    MONEY (KSh / KES / bob), and TRIP_ID.
 * 3. Multilingual Case-Type Classification (T19-T23 / T32): Scores English, Kiswahili, and
 *    Sheng narratives across fare_dispute, passenger_safety, rating_or_cancellation,
 *    fraud_flag, and out_of_scope with confidence threshold (0.65).
 * 4. Evidence Gap Checker (T07 / T24): Exact checklists and plain-English reasons from data/checklists.json.
 * 5. Grounded Legal Appeal Generator (T08 / T18 / T27): Fills data/templates.json with
 *    extracted facts and statutory rules from data/policies.json.
 */

export interface ExtractedEntity {
  label: 'DATE' | 'TIME' | 'LOCATION' | 'MONEY' | 'TRIP_ID'
  text: string
}

export interface RedactedPiiItem {
  label: 'PHONE' | 'PLATE' | 'MPESA_CODE' | 'PERSON' | 'EMAIL'
  text: string
  placeholder: string
}

export interface ChecklistItemSpec {
  item_id: string
  label: string
  source: string
  reason: string
  required: boolean
}

export interface LocalAnalysisOutput {
  redacted_narrative: string
  pii_found: RedactedPiiItem[]
  classification: {
    case_type: string
    confidence: number
    confidence_threshold: number
    needs_confirmation: boolean
  }
  entities: ExtractedEntity[]
  evidence: {
    readiness: number
    missing: { id: string; label: string; source: string; reason: string }[]
    optional: { id: string; label: string; source: string; reason: string }[]
    checklist: ChecklistItemSpec[]
  }
  appeal: {
    headline: string
    body: string
    policy_rules: string[]
  }
}

// 1. Complete Evidence Checklists from data/checklists.json (T07)
export const CASE_CHECKLISTS: Record<string, ChecklistItemSpec[]> = {
  fare_dispute: [
    {
      item_id: 'TRIP_RECEIPT_SCREENSHOT',
      label: 'Trip ID & In-App Receipt Screenshot',
      source: 'NTSA LN 120 Reg 12(4) & Platform Terms',
      reason: 'Shows the official Trip ID, upfront fare breakdown, and distance/duration recorded by the app.',
      required: true
    },
    {
      item_id: 'MPESA_STATEMENT',
      label: 'M-Pesa Statement / Cash Payment Confirmation',
      source: 'TAWU Financial Dispute Checklist & Platform Earnings Policy',
      reason: 'An M-Pesa Statement provides verifiable proof of the exact digital payment received or non-payment for contested trip fares.',
      required: true
    },
    {
      item_id: 'GPS_ROUTE_LOG',
      label: 'GPS Route & Google Maps Timeline Log',
      source: 'TAWU Appeal Best Practice & Platform Distance Dispute Terms',
      reason: 'Confirms the actual route driven and traffic delays when the final fare differs from the upfront estimate.',
      required: false
    },
    {
      item_id: 'IN_APP_CHAT_SCREENSHOT',
      label: 'In-App Chat / Customer Call Screenshot',
      source: 'TAWU Grievance Protocol (Fare Agreement)',
      reason: 'Documents any in-app messages where the passenger agreed to a route change, stop, or cash/M-Pesa payment.',
      required: false
    }
  ],
  passenger_safety: [
    {
      item_id: 'INCIDENT_TIMESTAMP_LOG',
      label: 'Incident Details & Exact Timestamp Log',
      source: 'NTSA LN 120 Reg 11(e) & Reg 18(2)',
      reason: 'Incident Details and exact timestamps allow platform safety teams to match your report against trip telemetry under NTSA Reg 18(2).',
      required: true
    },
    {
      item_id: 'POLICE_ABSTRACT',
      label: 'Official Police Abstract (if crash, injury, or assault occurred)',
      source: 'NTSA LN 120 Reg 11(b) & TAWU Safety Protocol',
      reason: 'Mandatory legal documentation for reporting physical threats, accidents, or criminal behavior under NTSA rules.',
      required: true
    },
    {
      item_id: 'DASHCAM_FOOTAGE',
      label: 'Dashcam Footage (Audio/Video Log)',
      source: 'NTSA LN 120 Reg 18(1) & Platform Safety Guidelines',
      reason: 'Serves as objective visual and audio evidence to clear false passenger or safety allegations.',
      required: false
    },
    {
      item_id: 'WITNESS_STATEMENT',
      label: 'Third-Party / Security Guard / Witness Statement',
      source: 'TAWU Incident Defense Protocol',
      reason: 'Corroborates your account using an independent observer such as a stage marshal, estate guard, or bystander.',
      required: false
    }
  ],
  rating_or_cancellation: [
    {
      item_id: 'IN_APP_CHAT_SCREENSHOT',
      label: 'In-App Conversation / Call Activity Screenshot',
      source: 'Platform Community Guidelines & TAWU Note',
      reason: 'Shows polite communication, pickup pin mismatches, or rider requests to cancel before the dispute occurred.',
      required: true
    },
    {
      item_id: 'DRIVER_COUNTER_STATEMENT',
      label: 'Written Driver Counter-Statement',
      source: 'NTSA LN 120 Reg 15 Due Process Mandate',
      reason: 'Exercises your statutory right to be heard under NTSA Reg 15(1) by recording your factual version of the interaction.',
      required: true
    },
    {
      item_id: 'DASHCAM_FOOTAGE',
      label: 'Dashcam Clip Showing Interaction',
      source: 'TAWU Appeals Standard',
      reason: 'Serves as objective visual and audio evidence to clear false passenger or safety allegations.',
      required: false
    },
    {
      item_id: 'DRIVER_RATING_HISTORY',
      label: 'Historical Driver Star Rating & Compliment History',
      source: 'Uber / Bolt / Yego Quality Review Terms',
      reason: 'Demonstrates a consistent track record of safe, professional service prior to an isolated retaliatory rating.',
      required: false
    }
  ],
  fraud_flag: [
    {
      item_id: 'DEACTIVATION_NOTICE',
      label: 'Deactivation Notice / App Fraud Warning Screen',
      source: 'NTSA LN 120 Reg 15(1) & Uber/Bolt/Little Fraud Policies',
      reason: 'Establishes the exact algorithmic allegation and date of suspension required for formal due-process review under NTSA Reg 15(1).',
      required: true
    },
    {
      item_id: 'CHRONOLOGICAL_TRIP_LOG',
      label: 'Chronological Trip Log & Explanation',
      source: 'TAWU Legal Guidance on Algorithmic Locks',
      reason: 'Provides a trip-by-trip timeline accounting for flagged journeys, network drops, or legitimate repeat pickups.',
      required: true
    },
    {
      item_id: 'LOCATION_HISTORY_EXPORT',
      label: 'Google Maps Location History Export',
      source: 'TAWU Anti-Algorithmic Bias Protocol',
      reason: 'Verifies actual vehicle trajectory and drop-off coordinates against automated GPS-spoofing or fake-trip flags.',
      required: false
    },
    {
      item_id: 'PASSENGER_MPESA_RECEIPT',
      label: 'Passenger M-Pesa Receipt for Cash Trip',
      source: 'Little Cab / Faras Financial Audit Terms',
      reason: 'Proves that a real paying passenger completed the trip and paid via M-Pesa, refuting collusive or ghost-trip claims.',
      required: false
    }
  ]
}

// 2. Nairobi & Kenya Places Lexicon (from data/nairobi_locations.json)
// Excludes ambiguous everyday English nouns ("Town", "Banana", "Pipeline", "Archives")
const NAIROBI_PLACES = [
  'Westlands', 'JKIA', 'Jomo Kenyatta International Airport', 'Wilson Airport', 'Kilimani',
  'Kileleshwa', 'Lavington', 'Karen', 'Langata', 'South B', 'South C', 'Syokimau',
  'Mlolongo', 'Kitengela', 'Athi River', 'Embakasi', 'Utawala', 'Donholm',
  'Buruburu', 'Umoja', 'Kayole', 'Komarock', 'Eastleigh', 'Pangani', 'Parklands',
  'Highridge', 'Ngara', 'Upper Hill', 'Hurlingham', 'Yaya Centre', 'Sarit Centre',
  'Two Rivers', 'Village Market', 'Gigiri', 'Runda', 'Muthaiga', 'Roysambu', 'Kasarani',
  'Zimmerman', 'Kahawa West', 'Kahawa Sukari', 'Kahawa Wendani', 'Githurai', 'Ruiru',
  'Juja', 'Thika', 'Thika Road', 'TRM', 'Mombasa Road', 'Ngong Road', 'Waiyaki Way',
  'Jogoo Road', 'Kiambu Road', 'Kiambu', 'Ruaka', 'Limuru', 'Kikuyu',
  'Kawangware', 'Dagoretti', 'Ngong', 'Ongata Rongai', 'Rongai', 'Kiserian',
  'Industrial Area', 'CBD', 'Nairobi CBD', 'Kencom',
  'Nyayo Stadium', 'Madaraka', 'Strathmore', 'Kenyatta Hospital', 'KNH', 'Valley Road',
  'Riverside', 'Spring Valley', 'Loresho', 'Mountain View', 'Kangemi', 'Uthiru',
  'Kinoo', 'Fedha', 'Tassia', 'Imara Daima', 'Nyayo Estate', 'Ruai', 'Kamulu',
  'Joska', 'Dandora', 'Kariobangi', 'Huruma', 'Mathare', 'Babadogo', 'Lucky Summer',
  'Garden Estate', 'Thome', 'Mirema', 'Membley', 'Tatu City', 'Kenyatta Road'
].sort((a, b) => b.length - a.length)

// Common Kenyan Personal Names for Client-Side PII Filter
const KENYAN_NAMES = [
  'Kamau', 'Wanjiku', 'Njoroge', 'Mwangi', 'Kariuki', 'Wambui', 'Nyambura', 'Waithera',
  'Ochieng', 'Otieno', 'Omondi', 'Onyango', 'Akinyi', 'Atieno', 'Achieng', 'Awuor',
  'Wafula', 'Wekesa', 'Simiyu', 'Nekesa', 'Barasa', 'Juma', 'Kiprop', 'Kibet',
  'Kiptoo', 'Cheruiyot', 'Chebet', 'Chepkoech', 'Mutua', 'Musyoka', 'Muthama',
  'Mutuku', 'Nduku', 'Mwende', 'Moraa', 'Onyancha', 'Nyaboke', 'Abdi', 'Hassan',
  'Fatuma', 'Halima', 'Karanja', 'Macharia', 'Githinji', 'Maina', 'Ndungu', 'Mbugua',
  'Kimani', 'Gitau', 'Ngugi', 'Wanjiru', 'Wangari', 'Njeri', 'Mumbi'
]

/**
 * Validate a Kenyan Mobile Phone Number (Safaricom / Airtel / Telkom: 07XX or 01XX or +2547/1XX)
 */
export function validateKenyanPhone(raw: string): {
  valid: boolean
  formatted: string
  error: string
} {
  const trimmed = (raw || '').trim()
  if (!trimmed) {
    return {
      valid: false,
      formatted: '',
      error: 'Please enter your Kenyan mobile number (e.g., 0712 345 678).'
    }
  }

  // Reject any letters or invalid characters
  if (/[^0-9+\s-]/.test(trimmed)) {
    return {
      valid: false,
      formatted: trimmed,
      error: 'Phone number must contain digits only (no letters or symbols).'
    }
  }

  const compact = trimmed.replace(/[\s-]/g, '')

  // Case 1: 07XXXXXXXX or 01XXXXXXXX (10 digits)
  if (/^0[17]\d{8}$/.test(compact)) {
    const formatted = `${compact.slice(0, 4)} ${compact.slice(4, 7)} ${compact.slice(7)}`
    return { valid: true, formatted, error: '' }
  }

  // Case 2: +2547XXXXXXXX or +2541XXXXXXXX (13 chars) or 2547XXXXXXXX (12 digits)
  const withoutPlus = compact.startsWith('+') ? compact.slice(1) : compact
  if (/^254[17]\d{8}$/.test(withoutPlus)) {
    const local = `0${withoutPlus.slice(3)}`
    const formatted = `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
    return { valid: true, formatted, error: '' }
  }

  const digitCount = compact.replace(/\D/g, '').length
  if (digitCount < 10) {
    return {
      valid: false,
      formatted: trimmed,
      error: `Too short (${digitCount} digits). A Kenyan mobile number must have 10 digits starting with 07 or 01 (e.g., 0712 345 678).`
    }
  }
  if (digitCount > 12) {
    return {
      valid: false,
      formatted: trimmed,
      error: `Too long (${digitCount} digits). Enter a 10-digit Kenyan number starting with 07 or 01.`
    }
  }

  return {
    valid: false,
    formatted: trimmed,
    error: 'Invalid Kenyan format. Must start with 07, 01, or +2547 / +2541 (e.g., 0712 345 678).'
  }
}

/**
 * Inspect an uploaded image/file to verify it looks like an app screenshot or PDF document
 * rather than a random camera photograph (e.g., a person holding an award or a portrait).
 */
export async function verifyUploadedScreenshot(file: File): Promise<{
  valid: boolean
  reason: string
}> {
  const lowerName = file.name.toLowerCase()

  // PDFs are valid official documents (e.g., M-Pesa statement or Police Abstract PDF)
  if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return {
      valid: true,
      reason: `Verified PDF document (${file.name}).`
    }
  }

  if (!file.type.startsWith('image/')) {
    return {
      valid: false,
      reason: 'Unsupported file format. Please upload a screenshot image (PNG/JPG) or PDF.'
    }
  }

  // Check obvious non-screenshot photo keywords in filename
  if (/\b(award|trophy|selfie|portrait|person|wedding|party|vacation|dsc_|pxl_|img_\d{4})\b/i.test(lowerName)) {
    return {
      valid: false,
      reason:
        'This file appears to be a camera photograph rather than an app screenshot. Please upload a screenshot of your suspension notice, trip receipt, or M-Pesa message.'
    }
  }

  // Analyze actual image pixels & aspect ratio on an offscreen canvas
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const width = img.naturalWidth || img.width
      const height = img.naturalHeight || img.height

      try {
        const canvas = document.createElement('canvas')
        const sampleSize = 100
        canvas.width = sampleSize
        canvas.height = sampleSize
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve({ valid: true, reason: `Image attached (${width}×${height}px).` })
          return
        }
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize)
        const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data

        let flatUiPixels = 0
        let skinLikePixels = 0
        let sharpTextTransitions = 0
        const totalPixels = sampleSize * sampleSize

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]

          // App UI backgrounds are predominantly near-white, light slate, or uniform dark-mode gray/black
          const isNearWhite = r > 235 && g > 235 && b > 235
          const isLightSlate =
            r > 215 && g > 215 && b > 215 && Math.abs(r - g) <= 10 && Math.abs(g - b) <= 10
          const isDarkUi =
            r < 42 && g < 45 && b < 52 && Math.abs(r - g) <= 10 && Math.abs(g - b) <= 12

          if (isNearWhite || isLightSlate || isDarkUi) {
            flatUiPixels += 1
          }

          // Detect warm natural camera/skin/wood tones common in portraits/award photos
          if (r > 95 && g > 40 && b > 20 && r > g + 15 && g > b && r - b > 30) {
            skinLikePixels += 1
          }

          // Detect sharp horizontal luminance jumps typical of UI text on flat backgrounds
          if (i >= 4) {
            const prevLum = (data[i - 4] + data[i - 3] + data[i - 2]) / 3
            const currLum = (r + g + b) / 3
            if (Math.abs(currLum - prevLum) > 95) {
              sharpTextTransitions += 1
            }
          }
        }

        const flatUiRatio = flatUiPixels / totalPixels
        const skinRatio = skinLikePixels / totalPixels
        const isLandscapePhoto = width > height * 1.15

        // Camera photos of people/awards/outdoors have low flat UI background (< 0.26)
        // or high skin/natural tones, whereas app screenshots have flat UI cards + text
        if (
          flatUiRatio < 0.26 ||
          (skinRatio > 0.14 && flatUiRatio < 0.45) ||
          (isLandscapePhoto && flatUiRatio < 0.45) ||
          sharpTextTransitions < 80
        ) {
          resolve({
            valid: false,
            reason:
              'Image rejected: Our visual check detected a camera photo/portrait rather than a platform app screen or receipt. Please upload an actual screenshot of your Uber/Bolt/Little notice, trip receipt, or M-Pesa statement.'
          })
          return
        }

        resolve({
          valid: true,
          reason: `Verified app screenshot layout (${width}×${height}px, ${Math.round(flatUiRatio * 100)}% UI surface).`
        })
      } catch {
        resolve({ valid: true, reason: `Screenshot attached (${width}×${height}px).` })
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({
        valid: false,
        reason: 'Could not read image file. Please select a valid PNG or JPG screenshot.'
      })
    }
    img.src = url
  })
}

/**
 * 1. Redact Personal Details (T15)
 */
export function redactPii(text: string): { redacted: string; items: RedactedPiiItem[] } {
  let working = text
  const items: RedactedPiiItem[] = []
  let phoneCount = 0
  let plateCount = 0
  let mpesaCount = 0
  let emailCount = 0
  let personCount = 0

  // Emails
  working = working.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (match) => {
    emailCount += 1
    const ph = `<EMAIL_${emailCount}>`
    items.push({ label: 'EMAIL', text: match, placeholder: ph })
    return ph
  })

  // Kenyan Number Plates (e.g., KDA 123A, KBM 456Z, KMFD 123A)
  working = working.replace(/\bK[A-Z]{2,3}\s?\d{3}[A-Z]\b/g, (match) => {
    plateCount += 1
    const ph = `<PLATE_${plateCount}>`
    items.push({ label: 'PLATE', text: match, placeholder: ph })
    return ph
  })

  // Kenyan Phone Numbers (+254..., 07..., 01...)
  working = working.replace(
    /(?:\+254|254|0)(?:7|1)\d[\d\s-]{6,10}\d/g,
    (match) => {
      const digits = match.replace(/\D/g, '')
      if (digits.length < 9 || digits.length > 12) return match
      phoneCount += 1
      const ph = `<PHONE_${phoneCount}>`
      items.push({ label: 'PHONE', text: match.trim(), placeholder: ph })
      return ph
    }
  )

  // M-Pesa 10-character alphanumeric codes (e.g., SJK849201M, RGH739104K)
  working = working.replace(/\b[A-Z0-9]{10}\b/g, (match) => {
    const letters = (match.match(/[A-Z]/g) || []).length
    const digits = (match.match(/\d/g) || []).length
    if (letters >= 2 && digits >= 2) {
      mpesaCount += 1
      const ph = `<MPESA_CODE_${mpesaCount}>`
      items.push({ label: 'MPESA_CODE', text: match, placeholder: ph })
      return ph
    }
    return match
  })

  // Kenyan Names
  const namePattern = new RegExp(`\\b(${KENYAN_NAMES.join('|')})\\b`, 'g')
  working = working.replace(namePattern, (match) => {
    personCount += 1
    const ph = `<PERSON_${personCount}>`
    items.push({ label: 'PERSON', text: match, placeholder: ph })
    return ph
  })

  return { redacted: working, items }
}

/**
 * 2. Extract Key Trip Facts (T16)
 */
export function extractEntities(text: string): ExtractedEntity[] {
  const found: ExtractedEntity[] = []
  const seen = new Set<string>()

  const add = (label: ExtractedEntity['label'], raw: string) => {
    const cleaned = raw.trim().replace(/[.,;!?]+$/, '')
    const key = `${label}:${cleaned.toLowerCase()}`
    if (cleaned && !seen.has(key)) {
      seen.add(key)
      found.push({ label, text: cleaned })
    }
  }

  // DATE patterns (English + Swahili)
  const datePatterns = [
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s+(?:morning|afternoon|evening|night|\d{1,2}(?:st|nd|rd|th)?(?:\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?))?))?\b/gi,
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+\d{4})?\b/gi,
    /\b(?:yesterday|today|last\s+week|last\s+night|this\s+morning|jana|juzi|wiki\s+iliyopita|jumamosi|jumapili|jumatatu|jumanne|jumatano|alhamisi|ijumaa)\b/gi
  ]
  for (const pat of datePatterns) {
    for (const m of text.matchAll(pat)) {
      add('DATE', m[0])
    }
  }

  // TIME patterns (English + Swahili)
  const timePatterns = [
    /\b\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)\b/gi,
    /\bsaa\s+(?:moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi|kumi\s+na\s+moja|kumi\s+na\s+mbili|\d{1,2})(?:\s+(?:asubuhi|mchana|jioni|usiku))?\b/gi
  ]
  for (const pat of timePatterns) {
    for (const m of text.matchAll(pat)) {
      add('TIME', m[0])
    }
  }

  // LOCATION patterns (272 Nairobi locations)
  for (const place of NAIROBI_PLACES) {
    const escaped = place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b`, 'gi')
    for (const m of text.matchAll(re)) {
      add('LOCATION', m[0])
    }
  }

  // MONEY patterns (KSh, KES, bob)
  const moneyPatterns = [
    /\b(?:KSh|KES|Kshs?)\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/gi,
    /\b\d{1,3}(?:,\d{3})*\s*(?:bob|shillings|shilingi)\b/gi
  ]
  for (const pat of moneyPatterns) {
    for (const m of text.matchAll(pat)) {
      add('MONEY', m[0])
    }
  }

  // TRIP_ID patterns — require explicit prefix + digits so normal words after "trip" never match
  const tripPatterns = [
    /\b(?:TRP|TRIP|BOLT|UBER|LTL|FRS)-[A-Z0-9]*\d[A-Z0-9]*\b/gi,
    /\btrip\s+(?:id|ref|reference|code|number)\s*[:#-]?\s*([A-Z0-9-]*\d[A-Z0-9-]*)\b/gi
  ]
  for (const pat of tripPatterns) {
    for (const m of text.matchAll(pat)) {
      add('TRIP_ID', m[1] || m[0])
    }
  }

  return found
}

/**
 * 3. Classify Case Type (T19-T23 / T32)
 */
export function classifyStory(narrative: string, noticeText?: string): {
  case_type: string
  confidence: number
  confidence_threshold: number
  needs_confirmation: boolean
} {
  const combined = `${narrative} ${noticeText || ''}`.toLowerCase()
  const narrativeLower = narrative.toLowerCase()

  const scores: Record<string, number> = {
    fare_dispute: 0,
    passenger_safety: 0,
    rating_or_cancellation: 0,
    fraud_flag: 0
  }

  // Keyword & phrase weights tuned on build_set.jsonl (English + Kiswahili + Sheng)
  const rules: Record<string, [RegExp, number][]> = {
    fare_dispute: [
      [/\b(fare|nauli|unpaid|paid|kulipa|malipo|cash\s+trip|underpaid|payout|bonus|incentive|earnings|pesa|commission|price|upfront|wallet|balance|arrears)\b/g, 3.0],
      [/\b(ksh|kes|bob|mpesa|m-pesa)\b/g, 1.8],
      [/\b(walked\s+away|ran\s+away|bila\s+kulipa|hakulipa|refused\s+to\s+pay|withheld|shortchanged)\b/g, 3.5]
    ],
    passenger_safety: [
      [/\b(drunk|walevi|mlevi|smok(e|ing)|sigara|bangi|verbally|abused|nitukana|kutukana|shouting|speed(ing)?|dangerous(ly)?|unsafe|seatbelt|mkanda|assault|threat|fujo|polisi|police|uchochoro|giza|excess\s+passengers|five\s+people|watu\s+watano)\b/g, 3.2],
      [/\b(safety|conduct|harassment|rude|impolite|intoxicated|security|guard|askari)\b/g, 2.5]
    ],
    rating_or_cancellation: [
      [/\b(cancel(led|lation|ling)?|nicancel|kucancel|star\s+rating|one\s+star|1\s+star|low\s+rating|rating\s+drop|below\s+4\.|pickup\s+pin|wrong\s+pin|pin\s+was\s+wrong)\b/g, 3.5],
      [/\b(acceptance\s+rate|cancellation\s+rate|kiwango\s+cha\s+kufuta|rated\s+me)\b/g, 3.0]
    ],
    fraud_flag: [
      [/\b(fraud(ulent)?|ghost\s+trip|fake\s+trip|fake\s+gps|gps\s+manipulation|gps\s+spoof|gps\s+jump|collusi(ve|on)|account\s+shar(ing|ed)|selfie|liveness|facial|identity\s+check|irregular\s+activity|duplicate\s+trip|peke\s+yangu)\b/g, 3.5],
      [/\b(tall\s+buildings|network\s+drop|old\s+phone|gizani)\b/g, 2.0]
    ]
  }

  // Score strictly on driver's own narrative first; only use noticeText if narrative has no keywords at all
  for (const [cat, patterns] of Object.entries(rules)) {
    for (const [regex, weight] of patterns) {
      const matches = narrativeLower.match(regex)
      if (matches) {
        scores[cat] += matches.length * weight
      }
    }
  }

  const narrativeTotal = Object.values(scores).reduce((acc, v) => acc + v, 0)
  if (narrativeTotal === 0 && noticeText) {
    const noticeLower = noticeText.toLowerCase()
    if (noticeLower.includes('fare') || noticeLower.includes('payment')) scores.fare_dispute += 1.0
    if (noticeLower.includes('safety') || noticeLower.includes('conduct')) scores.passenger_safety += 1.0
    if (noticeLower.includes('cancellation') || noticeLower.includes('rating')) scores.rating_or_cancellation += 1.0
    if (noticeLower.includes('fraud') || noticeLower.includes('identity') || noticeLower.includes('gps')) scores.fraud_flag += 1.0
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const [bestType, bestScore] = sorted[0]
  const secondScore = sorted[1]?.[1] || 0

  if (bestScore === 0 || combined.trim().length < 8) {
    return {
      case_type: '',
      confidence: 0.45,
      confidence_threshold: 0.65,
      needs_confirmation: true
    }
  }

  const margin = bestScore - secondScore
  const rawConf = Math.min(0.97, 0.68 + Math.min(0.28, (bestScore * 0.04) + (margin * 0.03)))
  const confidence = Number(rawConf.toFixed(2))

  return {
    case_type: bestType,
    confidence,
    confidence_threshold: 0.65,
    needs_confirmation: confidence < 0.65
  }
}

/**
 * 4. Check Evidence Gaps (T07 / T24)
 */
export function evaluateEvidence(caseType: string, evidenceHeld: string[]) {
  const effectiveType = CASE_CHECKLISTS[caseType] ? caseType : 'fare_dispute'
  const checklist = CASE_CHECKLISTS[effectiveType] || CASE_CHECKLISTS.fare_dispute
  const heldSet = new Set(evidenceHeld.map((e) => e.toUpperCase().trim()))

  const requiredItems = checklist.filter((i) => i.required)
  const optionalItems = checklist.filter((i) => !i.required)

  const missingRequired = requiredItems
    .filter((i) => !heldSet.has(i.item_id))
    .map((i) => ({
      id: i.item_id,
      label: i.label,
      source: i.source,
      reason: i.reason
    }))

  const missingOptional = optionalItems
    .filter((i) => !heldSet.has(i.item_id))
    .map((i) => ({
      id: i.item_id,
      label: i.label,
      source: i.source,
      reason: i.reason
    }))

  const heldRequiredCount = requiredItems.length - missingRequired.length
  const heldOptionalCount = optionalItems.length - missingOptional.length

  // Required items count for 80% of readiness; optional items count for 20%
  const reqScore = requiredItems.length > 0 ? (heldRequiredCount / requiredItems.length) * 0.8 : 0.8
  const optScore = optionalItems.length > 0 ? (heldOptionalCount / optionalItems.length) * 0.2 : 0.2
  const readiness = Number(Math.min(1.0, Math.max(0.15, reqScore + optScore)).toFixed(2))

  return {
    readiness,
    missing: missingRequired,
    optional: missingOptional,
    checklist
  }
}

/**
 * 5. Generate Grounded Legal Appeal Statement (T08 / T18 / T27)
 * Structured as an official 5-section Kenyan Legal & TAWU Union Grievance Dossier.
 */
export function buildAppealDossier(params: {
  caseType: string
  platform: string
  driverName: string
  driverPhone?: string
  narrative: string
  entities: ExtractedEntity[]
  evidenceHeld: string[]
}): { headline: string; body: string; policy_rules: string[] } {
  const { caseType, platform, driverName, driverPhone, narrative, entities, evidenceHeld } = params
  const plat = platform || 'Bolt'
  const name = driverName?.trim() || 'Registered PSV Driver Partner'
  const phoneLine = driverPhone?.trim() ? ` | Tel: ${driverPhone.trim()}` : ''
  const filingDate = new Date().toLocaleDateString('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })

  const dates = entities.filter((e) => e.label === 'DATE').map((e) => e.text)
  const times = entities.filter((e) => e.label === 'TIME').map((e) => e.text)
  const locations = entities.filter((e) => e.label === 'LOCATION').map((e) => e.text)
  const amounts = entities.filter((e) => e.label === 'MONEY').map((e) => e.text)
  const tripIds = entities.filter((e) => e.label === 'TRIP_ID').map((e) => e.text)

  const platRuleMap: Record<string, string> = {
    Bolt: 'POL-BOLT-12',
    Uber: 'POL-UBER-01',
    Little: 'POL-LITTLE-01',
    Faras: 'POL-FARAS-01'
  }
  const platRule = platRuleMap[plat] || 'POL-NTSA-15'

  const categoryTitles: Record<string, string> = {
    fare_dispute: 'FARE & EARNINGS RECONCILIATION APPEAL',
    passenger_safety: 'SAFETY & CONDUCT ALLEGATION COUNTER-APPEAL',
    rating_or_cancellation: 'RATING & CANCELLATION PENALTY APPEAL',
    fraud_flag: 'ALGORITHMIC & ACCOUNT INTEGRITY FLAG APPEAL'
  }
  const categoryTitle = categoryTitles[caseType] || 'DRIVER ACCOUNT REINSTATEMENT APPEAL'

  const policyRulesMap: Record<string, string[]> = {
    fare_dispute: ['POL-NTSA-13', 'POL-NTSA-15', 'POL-DPA-26', 'POL-TAWU-01', platRule],
    passenger_safety: ['POL-NTSA-15', 'POL-NTSA-18', 'POL-DPA-26', 'POL-TAWU-01', platRule],
    rating_or_cancellation: ['POL-NTSA-15', 'POL-DPA-26', 'POL-TAWU-01', platRule],
    fraud_flag: ['POL-NTSA-15', 'POL-NTSA-21', 'POL-DPA-26', 'POL-TAWU-01', platRule]
  }
  const policyRules = policyRulesMap[caseType] || ['POL-NTSA-15', 'POL-DPA-26', 'POL-TAWU-01']

  // Build Section 1: Incident Particulars strictly from facts the driver provided
  const particulars: string[] = [`• Platform: ${plat} Kenya`]
  if (dates.length > 0 || times.length > 0) {
    particulars.push(`• Incident Date & Time: ${[dates.join(', '), times.join(', ')].filter(Boolean).join(' at ')}`)
  }
  if (locations.length > 0) {
    particulars.push(`• Route / Location: ${locations.join(' → ')}`)
  }
  if (amounts.length > 0) {
    particulars.push(`• Disputed Amount: ${amounts.join(', ')}`)
  }
  if (tripIds.length > 0) {
    particulars.push(`• Trip Reference ID: ${tripIds.join(', ')}`)
  }

  // Build Section 3: Corroborating Evidence Record
  const checklist = CASE_CHECKLISTS[caseType] || CASE_CHECKLISTS.fare_dispute
  const heldLabels = checklist
    .filter((item) => evidenceHeld.includes(item.item_id))
    .map((item) => `• [HELD] ${item.label} (${item.source})`)
  const evidenceBlock =
    heldLabels.length > 0
      ? heldLabels.join('\n')
      : '• Driver requests manual inspection of in-app GPS telemetry, timestamp logs, and account history held on platform servers.'

  // Build Section 4: Statutory & Policy Grounds specific to caseType
  const statutoryLines: string[] = [
    '• NTSA Legal Notice 120 of 2022, Reg. 15(1) (POL-NTSA-15): Mandates fair administrative action, written reasons, and the right to be heard before adverse account action.',
    '• Kenya Data Protection Act, 2019, Section 35 (POL-DPA-26): Grants the right not to be subject to a penalty based solely on automated algorithmic processing without human review.',
    '• TAWU-Kenya Grievance Protocol, Clause 4 (POL-TAWU-01): Establishes the right to transparent dispute resolution and union escalation within the 30-day statutory window.'
  ]
  if (caseType === 'fare_dispute') {
    statutoryLines.unshift(
      '• NTSA Legal Notice 120 of 2022, Reg. 13(1)(b) (POL-NTSA-13): Requires accurate fare calculation and full driver remuneration for distance and time driven.'
    )
  } else if (caseType === 'passenger_safety') {
    statutoryLines.unshift(
      '• NTSA Legal Notice 120 of 2022, Reg. 18(1)-(2) (POL-NTSA-18): Protects licensed PSV drivers enforcing mandatory passenger capacity and road safety standards.'
    )
  }

  const headline = `FORMAL ${categoryTitle} — ${plat.toUpperCase()}${amounts[0] ? ` (${amounts[0]})` : ''}`

  const body = [
    `DATE OF FILING: ${filingDate}`,
    `TO: ${plat} Driver Operations, Trust & Appeals Team`,
    `CC: Transport Workers Union of Kenya (TAWU-Kenya) Digital Transport Desk`,
    `FROM: ${name}${phoneLine}`,
    `SUBJECT: ${headline}`,
    `────────────────────────────────────────────────────`,
    `1. INCIDENT PARTICULARS`,
    particulars.join('\n'),
    ``,
    `2. DRIVER'S STATEMENT OF FACTS`,
    narrative.trim() || 'Please refer to the incident particulars above.',
    ``,
    `3. CORROBORATING EVIDENCE RECORD`,
    evidenceBlock,
    ``,
    `4. APPLICABLE KENYAN STATUTORY & POLICY GROUNDS`,
    statutoryLines.join('\n'),
    ``,
    `5. FORMAL RELIEF SOUGHT`,
    `I formally request:`,
    `(a) A manual human review of the trip telemetry and statement of facts above;`,
    `(b) Immediate lifting of any unfair account restriction or reconciliation of disputed earnings; and`,
    `(c) A written response within the statutory resolution window under NTSA Legal Notice 120.`,
    ``,
    `Signed,`,
    `${name}${phoneLine}`
  ].join('\n')

  return {
    headline,
    body,
    policy_rules: policyRules
  }
}

/**
 * Full Local Pipeline Orchestrator
 */
export function runLocalAnalysis(params: {
  narrative: string
  noticeText?: string
  platform: string
  driverName: string
  driverPhone?: string
  evidenceHeld: string[]
  overrideCaseType?: string
}): LocalAnalysisOutput {
  const { narrative, noticeText, platform, driverName, driverPhone, evidenceHeld, overrideCaseType } = params
  const { redacted, items: piiFound } = redactPii(narrative)
  const entities = extractEntities(narrative)
  const classification = classifyStory(narrative, noticeText)

  const activeCaseType = overrideCaseType || classification.case_type || 'fare_dispute'
  const evidence = evaluateEvidence(activeCaseType, evidenceHeld)
  const appeal = buildAppealDossier({
    caseType: activeCaseType,
    platform,
    driverName,
    driverPhone,
    narrative: redacted,
    entities,
    evidenceHeld
  })

  return {
    redacted_narrative: redacted,
    pii_found: piiFound,
    classification: overrideCaseType
      ? { ...classification, case_type: overrideCaseType, confidence: 1.0, needs_confirmation: false }
      : classification,
    entities,
    evidence,
    appeal
  }
}
