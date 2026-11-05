/**
 * Vision OCR Service — Sauti ya Dere
 *
 * Sends uploaded images/screenshots to Gemini Vision API (gemini-2.0-flash)
 * to extract text and legal facts from suspension notices, M-Pesa receipts,
 * and trip screenshots. Returns structured facts that feed directly into DereBot.
 */

import { ExtractedEntity } from './dereBot'

export interface OcrResult {
  raw_text: string
  entities: ExtractedEntity[]
  detected_category: 'fare_dispute' | 'passenger_safety' | 'rating_or_cancellation' | 'fraud_flag' | 'unknown'
  confidence: number
  summary: string
}

const OCR_SYSTEM_PROMPT = `You are a legal document reader for Kenyan ride-hailing drivers (Sauti ya Dere).
You are reading an image that is likely a suspension notice, M-Pesa SMS, trip receipt, or passenger chat screenshot.

Extract all relevant information and return ONLY valid JSON in this exact format:
{
  "raw_text": "Full text visible in the image",
  "entities": [
    {"label": "DATE", "text": "..."},
    {"label": "TIME", "text": "..."},
    {"label": "LOCATION", "text": "..."},
    {"label": "MONEY", "text": "..."},
    {"label": "ALLEGATION", "text": "..."},
    {"label": "TRIP_ID", "text": "..."}
  ],
  "detected_category": "fare_dispute" | "passenger_safety" | "rating_or_cancellation" | "fraud_flag" | "unknown",
  "confidence": 0.0 to 1.0,
  "summary": "One sentence describing what this document shows"
}

Rules:
- Only include entity labels that have actual values in the image
- detected_category should be inferred from the document content (e.g., "low fare rating" → fare_dispute, "safety complaint" → passenger_safety)
- confidence reflects how clearly you can read the document (0.9 = clear, 0.5 = partially obscured)
- If the image is not a relevant document, set detected_category to "unknown" and confidence to 0.3`

/**
 * Convert a File or Blob to base64 string
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Send an image file to Gemini Vision API for OCR and fact extraction.
 * Falls back gracefully if API is unavailable.
 */
export async function ocrExtractFromImage(
  file: File,
  apiKey: string
): Promise<OcrResult | null> {
  if (!apiKey) {
    console.warn('[visionOcr] No API key — skipping OCR')
    return null
  }

  let base64Data: string
  try {
    base64Data = await fileToBase64(file)
  } catch (err) {
    console.warn('[visionOcr] Failed to read file:', err)
    return null
  }

  const mimeType = file.type || 'image/jpeg'
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: OCR_SYSTEM_PROMPT }]
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data
                }
              },
              {
                text: 'Please extract all text, facts, and legal details from this document image.'
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    })

    if (!res.ok) {
      console.warn(`[visionOcr] Gemini Vision returned ${res.status}`)
      return null
    }

    const data = await res.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (rawText) {
      try {
        const parsed: OcrResult = JSON.parse(rawText)
        if (parsed && typeof parsed.summary === 'string') {
          return parsed
        }
      } catch (parseErr) {
        console.warn('[visionOcr] Failed to parse Gemini OCR JSON:', parseErr)
      }
    }

    return null
  } catch (err) {
    console.warn('[visionOcr] Network error calling Gemini Vision:', err)
    return null
  }
}

/**
 * Extract facts from raw pasted text (no image) using Gemini text analysis.
 * Used for the "Paste Notice Text" input.
 */
export async function analyzeNoticeText(
  text: string,
  apiKey: string
): Promise<OcrResult | null> {
  if (!apiKey || !text.trim()) return null

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: OCR_SYSTEM_PROMPT }]
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Please analyze this suspension/deactivation notice text and extract all relevant facts:\n\n"${text}"`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    })

    if (!res.ok) return null

    const data = await res.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (rawText) {
      try {
        const parsed: OcrResult = JSON.parse(rawText)
        if (parsed && typeof parsed.summary === 'string') {
          return parsed
        }
      } catch {
        return null
      }
    }

    return null
  } catch {
    return null
  }
}
