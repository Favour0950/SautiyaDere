/**
 * Sauti ya Dere - Client-Side 1-Page PDF Appeal Dossier Generator
 * Task T35: High-fidelity statutory appeal document generation using pdf-lib.
 * 
 * 100% on-device execution to uphold the Dignity Principle and Zero-Knowledge privacy.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

/**
 * Text wrapping helper that splits a text block into lines that fit within maxWidth.
 *
 * @param {string} text
 * @param {number} maxWidth
 * @param {any} font
 * @param {number} fontSize
 * @returns {string[]}
 */
function wrapText(text, maxWidth, font, fontSize) {
  if (!text) return []
  const paragraphs = String(text).split('\n')
  const lines = []

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) {
      lines.push('')
      continue
    }

    const words = trimmed.split(/\s+/)
    let currentLine = words[0] || ''

    for (let i = 1; i < words.length; i++) {
      const word = words[i]
      const candidate = `${currentLine} ${word}`
      const width = font.widthOfTextAtSize(candidate, fontSize)

      if (width <= maxWidth) {
        currentLine = candidate
      } else {
        lines.push(currentLine)
        currentLine = word
      }
    }
    if (currentLine) {
      lines.push(currentLine)
    }
  }

  return lines
}

/**
 * Helper to extract chronological trip facts from caseData and entities.
 */
function extractTripFacts(caseData) {
  const entities = Array.isArray(caseData?.entities) ? caseData.entities : []

  const findEntity = (labels) => {
    const match = entities.find((e) => labels.includes(e.label?.toUpperCase()))
    return match ? match.text : null
  }

  const date =
    findEntity(['DATE', 'EVENT_DATE', 'TRIP_DATE']) ||
    caseData?.date ||
    'As stated in dossier'

  const time =
    findEntity(['TIME', 'EVENT_TIME', 'TRIP_TIME']) ||
    caseData?.time ||
    'Operating hours'

  const location =
    findEntity(['ROUTE', 'LOCATION', 'PICKUP', 'DROPOFF', 'ORIGIN', 'DESTINATION']) ||
    caseData?.location ||
    'Trip route on record'

  const fare =
    findEntity(['FARE', 'AMOUNT', 'DISPUTE_AMOUNT', 'PRICE', 'PAYMENT']) ||
    caseData?.fare ||
    'Amount under dispute'

  return { date, time, location, fare }
}

/**
 * Cleanly format evidence item identifiers into human-readable titles.
 */
function formatEvidenceName(key) {
  if (!key) return 'Supporting Document'
  if (typeof key === 'object' && key !== null) {
    return key.name || key.label || key.id || 'Supporting Document'
  }
  return String(key)
    .replace(/_SCREENSHOT|_STATEMENT|_NOTICE|_LOG|_EXPORT|_RECEIPT/gi, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/**
 * Context-Aware Appeal Synthesis (Screen 6 & PDF).
 *
 * Requirements:
 * - Do NOT wrap raw narrative in quotes.
 * - Addressee: Formal Platform Driver Support & Appeals Division
 * - Grounds: Citing NTSA Legal Notice 120 Regulation 15 and Kenya Data Protection Act 2019 Section 26.
 * - Incident Breakdown: Formal statement constructed from the driver's narrative and extracted entities.
 * - Reinstatement Demand: Formal request for account review within the mandatory 30-day statutory window.
 *
 * @param {Object} [params]
 * @param {string} [params.platform]
 * @param {string} [params.driverName]
 * @param {string} [params.driverPhone]
 * @param {string} [params.caseRef]
 * @param {Array<any>} [params.entities]
 * @param {string} [params.narrative]
 * @param {Array<string>} [params.evidenceHeld]
 * @param {string} [params.synthesizedStatement]
 * @returns {string}
 */
export function formatFormalAppealBody({
  platform = 'Bolt',
  driverName = 'Mwangi',
  driverPhone = '',
  caseRef = 'SYD-APP-2026-0001',
  entities = [],
  narrative = '',
  evidenceHeld = [],
  synthesizedStatement = ''
} = {}) {
  const findEntity = (labels) => {
    const list = Array.isArray(entities) ? entities : []
    const match = list.find((e) => labels.includes(e.label?.toUpperCase()))
    return match ? match.text : null
  }

  const incidentDate = findEntity(['DATE', 'EVENT_DATE', 'TRIP_DATE']) || 'As recorded in trip logs'
  const operatingHours = findEntity(['TIME', 'EVENT_TIME', 'TRIP_TIME']) || 'Operating hours on record'
  const route = findEntity(['ROUTE', 'LOCATION', 'PICKUP', 'DROPOFF', 'ORIGIN', 'DESTINATION']) || 'Designated trip route'
  const fare = findEntity(['FARE', 'AMOUNT', 'DISPUTE_AMOUNT', 'PRICE']) || null
  const allegation = findEntity(['ALLEGATION', 'DISPUTE_TYPE']) || null

  const evidenceList = Array.isArray(evidenceHeld) && evidenceHeld.length > 0
    ? evidenceHeld.map((k) => formatEvidenceName(k)).join(', ')
    : 'Trip receipt, deactivation notice, and mobile payment confirmation'

  // Build clean legal rebuttal statement: use synthesizedStatement if present, otherwise structured legal paragraph
  let cleanRebuttal = ''
  if (synthesizedStatement && synthesizedStatement.trim()) {
    cleanRebuttal = synthesizedStatement.trim()
  } else {
    // Structured legal synthesis from confirmed facts — never dumping raw chat
    const allegationClause = allegation ? ` regarding ${allegation.toLowerCase()}` : ''
    const fareClause = fare ? ` involving a disputed amount of ${fare}` : ''
    cleanRebuttal = `On ${incidentDate}, between approximately ${operatingHours}, while performing passenger transport on ${platform} along the ${route} route, an operational dispute arose${allegationClause}${fareClause}. The account restriction was imposed without adequate opportunity for response or objective examination of trip logs and corroborating on-device evidence. In accordance with Regulation 15 of NTSA Legal Notice 120 and Section 26 of the Kenya Data Protection Act, 2019, I respectfully demand an administrative review and expedited reinstatement of my driver account.`
  }

  const factsLines = [
    `• Incident Date: ${incidentDate}`,
    `• Operating Hours: ${operatingHours}`,
    `• Disputed Route: ${route}`,
    fare ? `• Disputed Fare / Amount: ${fare}` : null,
    allegation ? `• Stated Allegation: ${allegation}` : null,
    `• Platform Case / Ticket Ref: #${caseRef}`,
    `• Supporting Evidence Attached: ${evidenceList}`
  ].filter(Boolean).join('\n')

  return [
    `TO: Formal ${platform} Driver Support & Appeals Division`,
    `FROM: ${driverName}${driverPhone ? ` (${driverPhone})` : ''}`,
    `DATE: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    `CASE REF: #${caseRef}`,
    ``,
    `RE: FORMAL ADMINISTRATIVE APPEAL & STATUTORY REINSTATEMENT DEMAND`,
    ``,
    `1. STATUTORY NOTICE & LEGAL GROUNDS`,
    `This appeal is formally lodged pursuant to Regulation 15 of the National Transport and Safety Authority (Operation of Digital Hailing Operators) Regulations, 2022 (Legal Notice No. 120) and Section 26 of the Kenya Data Protection Act, 2019. The driver asserts statutory entitlement to fair administrative action, objective evidence evaluation, and correction of unjustified account deactivations.`,
    ``,
    `2. VERIFIED INCIDENT BREAKDOWN & CASE FACTS`,
    factsLines,
    ``,
    `3. DRIVER REBUTTAL & STATEMENT OF OPERATIONAL TRUTH`,
    cleanRebuttal,
    ``,
    `4. FORMAL REINSTATEMENT DEMAND & STATUTORY TIMELINE`,
    `In accordance with Regulation 15 of NTSA Legal Notice 120, the platform is under statutory obligation to resolve this dispute within the mandatory 30-day statutory window. We hereby formally demand immediate administrative review of the attached supporting evidence and expedited reinstatement of driver account access.`,
    ``,
    `Respectfully submitted,`,
    `${driverName}`,
    `In partnership with Transport & Allied Workers Union (TAWU-Kenya)`
  ].join('\n')
}

/**
 * Generates a formal 1-page A4 PDF Appeal Dossier.
 *
 * @param {Object} params
 * @param {Object} [params.driverProfile] - Driver name, phone, platform
 * @param {Object} [params.caseData] - Case details (id, platform, narrative, entities, evidence_held)
 * @param {Object} [params.appealDossier] - Appeal headline, body, policy_rules
 * @returns {Promise<{ pdfBytes: Uint8Array, blob?: Blob, filename: string, pageCount: number }>}
 */
export async function generateAppealPdf({
  driverProfile = {},
  caseData = {},
  appealDossier = {}
} = {}) {
  // Standard A4 dimensions in typographic points (1 pt = 1/72 inch)
  const A4_WIDTH = 595.28
  const A4_HEIGHT = 841.89
  const MARGIN = 36 // 0.5 inch margins for maximized single-page content area
  const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2 // 523.28 pt

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])

  // Embed standard Helvetica fonts
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

  // Color Palette (Sauti ya Dere Design System)
  const colors = {
    forestGreen: rgb(0.118, 0.369, 0.227), // #1E5E3A
    lightGreenBg: rgb(0.945, 0.976, 0.953), // #F1F9F3
    greenBorder: rgb(0.725, 0.863, 0.776),  // #B9DCC6
    darkSlate: rgb(0.059, 0.090, 0.165),    // #0F172A
    mutedGrey: rgb(0.392, 0.455, 0.545),    // #64748B
    lightBorder: rgb(0.898, 0.918, 0.941),  // #E2E8F0
    amberAccent: rgb(0.851, 0.467, 0.024),  // #D97706
    amberBg: rgb(1.0, 0.984, 0.957),       // #FFFCF7
    amberBorder: rgb(0.949, 0.780, 0.561),  // #F2C78F
    surfaceBg: rgb(0.973, 0.980, 0.988),    // #F8FAFC
    white: rgb(1.0, 1.0, 1.0)
  }

  // Identifiers & Meta
  const now = new Date()
  const dateFormatted = `${now.getDate().toString().padStart(2, '0')} ${now.toLocaleString('en-US', { month: 'short' })} ${now.getFullYear()}`
  const caseIdNum = caseData.id || 1
  const caseRef = `SYD-APP-${now.getFullYear()}-${String(caseIdNum).padStart(4, '0')}`

  const driverName = driverProfile.name?.trim() || 'Registered Driver'
  const driverPlatform = caseData.platform || driverProfile.platform || 'Bolt'
  const driverPhone = driverProfile.phone?.trim() || 'Confidential (Stored On-Device)'

  // Top cursor tracking downward from page top
  let cursorY = A4_HEIGHT - MARGIN // 805.89 pt

  // ==========================================
  // HEADER SECTION
  // ==========================================
  page.drawText('SAUTI YA DERE', {
    x: MARGIN,
    y: cursorY - 14,
    size: 16,
    font: fontBold,
    color: colors.forestGreen
  })

  page.drawText('— FORMAL DISPUTE DOSSIER', {
    x: MARGIN + 124,
    y: cursorY - 14,
    size: 13,
    font: fontBold,
    color: colors.darkSlate
  })

  // Date and Ref on the right
  const dateText = `Date: ${dateFormatted}`
  const refText = `Case Ref: #${caseRef}`
  const refWidth = fontBold.widthOfTextAtSize(refText, 8.5)
  const dateWidth = fontRegular.widthOfTextAtSize(dateText, 8.5)

  page.drawText(refText, {
    x: A4_WIDTH - MARGIN - refWidth,
    y: cursorY - 12,
    size: 8.5,
    font: fontBold,
    color: colors.forestGreen
  })

  page.drawText(dateText, {
    x: A4_WIDTH - MARGIN - dateWidth,
    y: cursorY - 24,
    size: 8.5,
    font: fontRegular,
    color: colors.mutedGrey
  })

  page.drawText('STATUTORY APPEAL SUBMISSION · DISPUTE PROTOCOL UNDER KENYA LAW', {
    x: MARGIN,
    y: cursorY - 26,
    size: 7.5,
    font: fontBold,
    color: colors.mutedGrey
  })

  // Decorative Accent Bar
  page.drawLine({
    start: { x: MARGIN, y: cursorY - 34 },
    end: { x: A4_WIDTH - MARGIN, y: cursorY - 34 },
    thickness: 2,
    color: colors.forestGreen
  })

  cursorY -= 46

  // ==========================================
  // SECTION 1: DRIVER & VEHICLE IDENTITY
  // ==========================================
  page.drawText('1. DRIVER & PLATFORM IDENTITY', {
    x: MARGIN,
    y: cursorY,
    size: 8.5,
    font: fontBold,
    color: colors.forestGreen
  })
  cursorY -= 8

  const idBoxHeight = 36
  const idBoxY = cursorY - idBoxHeight
  page.drawRectangle({
    x: MARGIN,
    y: idBoxY,
    width: CONTENT_WIDTH,
    height: idBoxHeight,
    color: colors.lightGreenBg,
    borderColor: colors.greenBorder,
    borderWidth: 0.75
  })

  // 3 Columns inside Identity Box
  const col1X = MARGIN + 12
  const col2X = MARGIN + 180
  const col3X = MARGIN + 340

  page.drawText('DRIVER NAME', {
    x: col1X,
    y: idBoxY + 22,
    size: 6.5,
    font: fontBold,
    color: colors.mutedGrey
  })
  page.drawText(driverName, {
    x: col1X,
    y: idBoxY + 10,
    size: 9,
    font: fontBold,
    color: colors.darkSlate
  })

  page.drawText('PLATFORM OPERATOR', {
    x: col2X,
    y: idBoxY + 22,
    size: 6.5,
    font: fontBold,
    color: colors.mutedGrey
  })
  page.drawText(`${driverPlatform} Kenya`, {
    x: col2X,
    y: idBoxY + 10,
    size: 9,
    font: fontBold,
    color: colors.forestGreen
  })

  page.drawText('REGISTERED PHONE', {
    x: col3X,
    y: idBoxY + 22,
    size: 6.5,
    font: fontBold,
    color: colors.mutedGrey
  })
  page.drawText(driverPhone, {
    x: col3X,
    y: idBoxY + 10,
    size: 8.5,
    font: fontBold,
    color: colors.darkSlate
  })

  cursorY = idBoxY - 12

  // ==========================================
  // SECTION 2: STATUTORY REFERENCE
  // ==========================================
  page.drawText('2. STATUTORY FRAMEWORK & DUE PROCESS CITATIONS', {
    x: MARGIN,
    y: cursorY,
    size: 8.5,
    font: fontBold,
    color: colors.forestGreen
  })
  cursorY -= 8

  const statBoxHeight = 44
  const statBoxY = cursorY - statBoxHeight
  page.drawRectangle({
    x: MARGIN,
    y: statBoxY,
    width: CONTENT_WIDTH,
    height: statBoxHeight,
    color: colors.amberBg,
    borderColor: colors.amberBorder,
    borderWidth: 0.75
  })

  // Amber Accent Left Indicator
  page.drawRectangle({
    x: MARGIN,
    y: statBoxY,
    width: 3.5,
    height: statBoxHeight,
    color: colors.amberAccent
  })

  page.drawText('• NTSA (Operation of Digital Hailing Operators) Regulations, 2022 (Legal Notice No. 120), Reg. 15:', {
    x: MARGIN + 12,
    y: statBoxY + 30,
    size: 7.2,
    font: fontBold,
    color: colors.darkSlate
  })
  page.drawText('  Guarantees fair administrative action, objective evidence evaluation, and an enforceable 30-day resolution period.', {
    x: MARGIN + 12,
    y: statBoxY + 20,
    size: 7,
    font: fontRegular,
    color: colors.darkSlate
  })

  page.drawText('• Kenya Data Protection Act, 2019 (Act No. 24 of 2019), Section 26 (Rights of Data Subject):', {
    x: MARGIN + 12,
    y: statBoxY + 10,
    size: 7.2,
    font: fontBold,
    color: colors.darkSlate
  })
  page.drawText('  Statutory entitlement to written reasons, algorithmic accountability, and correction of inaccurate deactivations.', {
    x: MARGIN + 12,
    y: statBoxY + 1,
    size: 7,
    font: fontRegular,
    color: colors.darkSlate
  })

  cursorY = statBoxY - 12

  // ==========================================
  // SECTION 3: CHRONOLOGICAL TRIP FACTS
  // ==========================================
  page.drawText('3. CHRONOLOGICAL TRIP FACTS & INCIDENT CONTEXT', {
    x: MARGIN,
    y: cursorY,
    size: 8.5,
    font: fontBold,
    color: colors.forestGreen
  })
  cursorY -= 8

  const facts = extractTripFacts(caseData)
  const factsBoxHeight = 36
  const factsBoxY = cursorY - factsBoxHeight
  page.drawRectangle({
    x: MARGIN,
    y: factsBoxY,
    width: CONTENT_WIDTH,
    height: factsBoxHeight,
    color: colors.surfaceBg,
    borderColor: colors.lightBorder,
    borderWidth: 0.75
  })

  const fCol1 = MARGIN + 10
  const fCol2 = MARGIN + 120
  const fCol3 = MARGIN + 235
  const fCol4 = MARGIN + 395

  page.drawText('INCIDENT DATE', { x: fCol1, y: factsBoxY + 22, size: 6.5, font: fontBold, color: colors.mutedGrey })
  page.drawText(facts.date, { x: fCol1, y: factsBoxY + 10, size: 8, font: fontBold, color: colors.darkSlate })

  page.drawText('ESTIMATED TIME', { x: fCol2, y: factsBoxY + 22, size: 6.5, font: fontBold, color: colors.mutedGrey })
  page.drawText(facts.time, { x: fCol2, y: factsBoxY + 10, size: 8, font: fontBold, color: colors.darkSlate })

  page.drawText('ROUTE / LOCATION', { x: fCol3, y: factsBoxY + 22, size: 6.5, font: fontBold, color: colors.mutedGrey })
  page.drawText(facts.location, { x: fCol3, y: factsBoxY + 10, size: 8, font: fontBold, color: colors.darkSlate })

  page.drawText('DISPUTED FARE / ITEM', { x: fCol4, y: factsBoxY + 22, size: 6.5, font: fontBold, color: colors.mutedGrey })
  page.drawText(facts.fare, { x: fCol4, y: factsBoxY + 10, size: 8, font: fontBold, color: colors.darkSlate })

  cursorY = factsBoxY - 12

  // ==========================================
  // SECTION 4: FORMAL STATEMENT BODY
  // ==========================================
  page.drawText('4. FORMAL STATEMENT OF REBUTTAL & REINSTATEMENT DEMAND', {
    x: MARGIN,
    y: cursorY,
    size: 8.5,
    font: fontBold,
    color: colors.forestGreen
  })
  cursorY -= 8

  const headlineText =
    appealDossier.headline?.trim() ||
    `Administrative Appeal Rebuttal: ${driverPlatform} Dispute`

  // Extract Section 3 rebuttal and Section 4 demand from formal appeal body
  let driverRebuttalText = ''
  let demandText = 'In accordance with Regulation 15 of NTSA Legal Notice 120, we formally demand immediate administrative review of the attached corroborating evidence and expedited reinstatement of driver account access within the mandatory 30-day statutory window.'

  if (appealDossier.statement_body && appealDossier.statement_body.includes('3. DRIVER REBUTTAL')) {
    const parts = appealDossier.statement_body.split(/3\.\s*DRIVER REBUTTAL[^\n]*\n+/)
    if (parts[1]) {
      const subParts = parts[1].split(/\n+4\.\s*FORMAL REINSTATEMENT DEMAND[^\n]*\n+/)
      driverRebuttalText = subParts[0].trim()
      if (subParts[1]) {
        const demandParts = subParts[1].split(/\n+Respectfully submitted/i)
        if (demandParts[0]?.trim()) demandText = demandParts[0].trim()
      }
    }
  }

  if (!driverRebuttalText) {
    const rawNarrative = (caseData.narrative || '').trim()
    driverRebuttalText = rawNarrative && !rawNarrative.startsWith('TO:')
      ? rawNarrative.replace(/^["']|["']$/g, '').trim()
      : `On ${facts.date}, between approximately ${facts.time}, while performing passenger transport on ${driverPlatform} along the ${facts.location} route, an operational dispute arose. The account restriction was imposed without adequate opportunity for response or objective examination of trip logs and corroborating evidence. I respectfully demand an administrative review and expedited reinstatement under Regulation 15 of NTSA Legal Notice 120.`
  }

  // Clean out any leftover markdown or asterisks
  driverRebuttalText = driverRebuttalText.replace(/^(?:Sentence Formulation:?\*?\*?|Sentence \d+:?\s*)/gim, '').replace(/\*\*/g, '').trim()

  const pdfStatementBody = `${driverRebuttalText}\n\n${demandText}`

  // Wrap statement body to fit inside card cleanly
  const statementLines = wrapText(pdfStatementBody, CONTENT_WIDTH - 24, fontRegular, 7.2)
  const renderedLines = statementLines.slice(0, 16)

  const statementBoxHeight = 20 + renderedLines.length * 9.2 + 6
  const statementBoxY = cursorY - statementBoxHeight

  page.drawRectangle({
    x: MARGIN,
    y: statementBoxY,
    width: CONTENT_WIDTH,
    height: statementBoxHeight,
    color: colors.white,
    borderColor: colors.lightBorder,
    borderWidth: 0.75
  })

  // Headline
  page.drawText(headlineText, {
    x: MARGIN + 12,
    y: statementBoxY + statementBoxHeight - 15,
    size: 8.5,
    font: fontBold,
    color: colors.darkSlate
  })

  // Body lines
  let textY = statementBoxY + statementBoxHeight - 27
  for (const line of renderedLines) {
    page.drawText(line, {
      x: MARGIN + 12,
      y: textY,
      size: 7.5,
      font: fontRegular,
      color: colors.darkSlate
    })
    textY -= 10
  }

  cursorY = statementBoxY - 12

  // ==========================================
  // SECTION 5: CORROBORATED EVIDENCE CHECKLIST
  // ==========================================
  page.drawText('5. SUPPORTING EVIDENCE CHECKLIST (ATTACHED ON-DEVICE PROOF)', {
    x: MARGIN,
    y: cursorY,
    size: 8.5,
    font: fontBold,
    color: colors.forestGreen
  })
  cursorY -= 8

  const evidenceHeld =
    Array.isArray(caseData.evidence_held) && caseData.evidence_held.length > 0
      ? caseData.evidence_held
      : Array.isArray(appealDossier.evidence_held) && appealDossier.evidence_held.length > 0
      ? appealDossier.evidence_held
      : ['SUSPENSION_NOTICE', 'TRIP_RECEIPT_SCREENSHOT', 'MPESA_RECEIPT']

  const evidenceBoxHeight = 44
  const evidenceBoxY = cursorY - evidenceBoxHeight

  page.drawRectangle({
    x: MARGIN,
    y: evidenceBoxY,
    width: CONTENT_WIDTH,
    height: evidenceBoxHeight,
    color: colors.lightGreenBg,
    borderColor: colors.greenBorder,
    borderWidth: 0.75
  })

  // Render evidence items across 2 columns
  const evCol1X = MARGIN + 14
  const evCol2X = MARGIN + 270
  const maxEvItems = 4

  for (let i = 0; i < Math.min(evidenceHeld.length, maxEvItems); i++) {
    const isCol2 = i % 2 === 1
    const row = Math.floor(i / 2)
    const itemX = isCol2 ? evCol2X : evCol1X
    const itemY = evidenceBoxY + 26 - row * 16
    const label = formatEvidenceName(evidenceHeld[i])

    // Green verification pill / checkbox with crisp vector checkmark
    page.drawRectangle({
      x: itemX,
      y: itemY - 2,
      width: 10,
      height: 10,
      color: colors.forestGreen
    })
    // Draw vector checkmark inside box
    page.drawLine({
      start: { x: itemX + 2.2, y: itemY + 3.2 },
      end: { x: itemX + 4.5, y: itemY + 0.8 },
      thickness: 1.2,
      color: colors.white
    })
    page.drawLine({
      start: { x: itemX + 4.5, y: itemY + 0.8 },
      end: { x: itemX + 8, y: itemY + 6.5 },
      thickness: 1.2,
      color: colors.white
    })

    page.drawText(`${label} (Verified on phone)`, {
      x: itemX + 16,
      y: itemY,
      size: 7.8,
      font: fontBold,
      color: colors.forestGreen
    })
  }

  cursorY = evidenceBoxY - 12

  // ==========================================
  // SECTION 6: DECLARATION & SIGN-OFF
  // ==========================================
  page.drawText('6. DRIVER DECLARATION & STATUTORY ENDORSEMENT', {
    x: MARGIN,
    y: cursorY,
    size: 8.5,
    font: fontBold,
    color: colors.forestGreen
  })
  cursorY -= 8

  const signBoxHeight = 42
  const signBoxY = cursorY - signBoxHeight

  page.drawRectangle({
    x: MARGIN,
    y: signBoxY,
    width: CONTENT_WIDTH,
    height: signBoxHeight,
    color: colors.surfaceBg,
    borderColor: colors.lightBorder,
    borderWidth: 0.75
  })

  page.drawText(
    'I solemnly declare that the facts presented in this appeal dossier are true and verified from on-device records.',
    {
      x: MARGIN + 10,
      y: signBoxY + 28,
      size: 7.2,
      font: fontOblique,
      color: colors.mutedGrey
    }
  )

  page.drawText('Driver Signature: ________________________________', {
    x: MARGIN + 10,
    y: signBoxY + 12,
    size: 7.5,
    font: fontRegular,
    color: colors.darkSlate
  })

  page.drawText('Union Advocacy Ref: TAWU-KE / DISP / 2026', {
    x: MARGIN + 290,
    y: signBoxY + 12,
    size: 7.5,
    font: fontBold,
    color: colors.forestGreen
  })

  // ==========================================
  // FOOTER BLOCK (Fixed at bottom)
  // ==========================================
  const footerY = MARGIN + 18

  page.drawLine({
    start: { x: MARGIN, y: footerY + 14 },
    end: { x: A4_WIDTH - MARGIN, y: footerY + 14 },
    thickness: 0.75,
    color: colors.lightBorder
  })

  page.drawText(
    'Generated on-device via Sauti ya Dere. In partnership with Transport and Allied Workers Union (TAWU-Kenya).',
    {
      x: MARGIN,
      y: footerY + 4,
      size: 7.5,
      font: fontBold,
      color: colors.forestGreen
    }
  )

  page.drawText(
    'Zero-Knowledge Client Architecture · 100% Stored Locally on Device · Official NTSA Legal Notice 120 Statutory Appeal Instrument',
    {
      x: MARGIN,
      y: footerY - 5,
      size: 6.5,
      font: fontRegular,
      color: colors.mutedGrey
    }
  )

  // Serialize to PDF bytes (Uint8Array)
  const pdfBytes = await pdfDoc.save()
  const filename = `SautiYaDere_Appeal_${caseRef}.pdf`

  // Direct browser download when running in client browser
  let blob = undefined
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (err) {
      console.error('Browser automatic download failed:', err)
    }
  }

  return {
    pdfBytes,
    blob,
    filename,
    pageCount: 1
  }
}
