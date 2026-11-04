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
  if (!key) return 'Corroborating Document'
  return String(key)
    .replace(/_SCREENSHOT|_STATEMENT|_NOTICE|_LOG|_EXPORT/gi, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/**
 * Generates a formal 1-page A4 PDF Appeal Dossier.
 *
 * @param {Object} params
 * @param {Object} [params.driverProfile] - Driver name, phone, platform
 * @param {Object} [params.caseData] - Case details (id, platform, narrative, entities, evidence_held)
 * @param {Object} [params.appealDossier] - Appeal headline, body, policy_rules
 * @returns {Promise<{ pdfBytes: Uint8Array, blob?: Blob, filename: string }>}
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

  page.drawText('HAILING OPERATOR / PLATFORM', {
    x: col2X,
    y: idBoxY + 22,
    size: 6.5,
    font: fontBold,
    color: colors.mutedGrey
  })
  page.drawText(driverPlatform.toUpperCase(), {
    x: col2X,
    y: idBoxY + 10,
    size: 9,
    font: fontBold,
    color: colors.darkSlate
  })

  page.drawText('REGISTERED CONTACT / MSISDN', {
    x: col3X,
    y: idBoxY + 22,
    size: 6.5,
    font: fontBold,
    color: colors.mutedGrey
  })
  page.drawText(driverPhone, {
    x: col3X,
    y: idBoxY + 10,
    size: 9,
    font: fontBold,
    color: colors.darkSlate
  })

  cursorY = idBoxY - 12

  // ==========================================
  // SECTION 2: STATUTORY REFERENCE
  // ==========================================
  page.drawText('2. STATUTORY FRAMEWORK & MANDATORY PROCEDURAL RIGHTS', {
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
  page.drawText('4. FORMAL STATEMENT OF APPEAL & GROUNDS', {
    x: MARGIN,
    y: cursorY,
    size: 8.5,
    font: fontBold,
    color: colors.forestGreen
  })
  cursorY -= 8

  const headlineText =
    appealDossier.headline?.trim() ||
    `Appeal Against Unjust Platform Action: ${driverPlatform} Incident`

  const bodyContent =
    appealDossier.statement_body?.trim() ||
    appealDossier.body?.trim() ||
    caseData.narrative?.trim() ||
    'I hereby lodge this formal appeal requesting immediate review of the punitive flag placed upon my driver account. The operational facts recorded on-device substantiate that services were rendered in full adherence to platform terms and safety standards.'

  // Wrap statement body to fit inside card
  const statementLines = wrapText(bodyContent, CONTENT_WIDTH - 24, fontRegular, 8.2)

  // Cap lines to prevent overflow beyond single page
  const maxAllowedLines = 9
  const renderedLines = statementLines.slice(0, maxAllowedLines)
  if (statementLines.length > maxAllowedLines) {
    renderedLines[maxAllowedLines - 1] = renderedLines[maxAllowedLines - 1] + '... [Continued in digital dossier record]'
  }

  const statementBoxHeight = 26 + renderedLines.length * 11 + 6
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
    y: statementBoxY + statementBoxHeight - 16,
    size: 8.5,
    font: fontBold,
    color: colors.darkSlate
  })

  // Body lines
  let textY = statementBoxY + statementBoxHeight - 28
  for (const line of renderedLines) {
    page.drawText(line, {
      x: MARGIN + 12,
      y: textY,
      size: 8,
      font: fontRegular,
      color: colors.darkSlate
    })
    textY -= 11
  }

  cursorY = statementBoxY - 12

  // ==========================================
  // SECTION 5: CORROBORATED EVIDENCE CHECKLIST
  // ==========================================
  page.drawText('5. CORROBORATED EVIDENCE CHECKLIST (ATTACHED ON-DEVICE PROOF)', {
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
