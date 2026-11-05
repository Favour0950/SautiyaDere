'use client'

import React, { useState, useEffect } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  Menu,
  Mic,
  Paperclip,
  Phone,
  Scale,
  Send,
  ShieldCheck,
  Upload,
  X,
  Edit2,
  Plus,
  HelpCircle,
  Mail,
  ExternalLink
} from 'lucide-react'
import {
  db,
  getLocalProfile,
  saveLocalProfile,
  saveCase,
  getAllCases,
  clearAllLocalData,
  updateCaseStatus
} from '../../db/db.js'
import { generateAppealPdf, formatFormalAppealBody } from '../../utils/pdfGenerator.js'
import { getApiUrl } from '../../config.js'
import { sendDereBotMessage, ChatMessage, ExtractedEntity, computeDynamicConfidence, synthesizeAppealStatement } from '../../services/dereBot'
import { ocrExtractFromImage, analyzeNoticeText, OcrResult } from '../../services/visionOcr'

const steps = ['Notice & Platform', 'Incident Details', 'Case Verification', 'Evidence Audit', 'Appeal Dossier']

export interface ProfileData {
  id?: string
  name: string
  phone: string
  platform: string
}

export interface EntityItem {
  label: string
  text: string
}

export interface MissingItem {
  id: string
  reason: string
}

export interface EvidenceData {
  readiness?: number | null
  missing: MissingItem[]
  optional: string[]
}

export interface ClassificationData {
  case_type: string
  confidence?: number | null
  confidence_threshold?: number
  needs_confirmation?: boolean
}

export interface AppealData {
  headline: string
  body: string
  policy_rules: string[]
}

export interface AnalysisResult {
  classification: ClassificationData
  entities: EntityItem[]
  evidence: EvidenceData
  appeal: AppealData
}

export interface CaseRecord {
  id?: number
  platform: string
  case_type: string
  status: string
  created_at: string
  narrative: string
  evidence_held: string[]
  appeal_dossier?: {
    headline: string
    statement_body: string
    policy_rules?: string[]
  } | null
}

function formatCaseType(rawType: string): string {
  const map: Record<string, string> = {
    fare_dispute: 'Fare & Payment Dispute',
    passenger_safety: 'Passenger Safety Complaint',
    rating_or_cancellation: 'Cancellation & Rating Dispute',
    fraud_flag: 'Account & Fraud Flag',
    out_of_scope: 'General / Out of Scope'
  }
  return map[rawType] || rawType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Context-Aware Probing Helper for Screen 3 (Chat)
 */
function getContextProbing(noticeReason: string) {
  const lower = (noticeReason || '').toLowerCase()
  if (lower.includes('safety') || lower.includes('violation')) {
    return {
      title: 'Tell me about the safety complaint in your own words. Mention:',
      bullets: [
        'When the trip occurred (date & time)',
        'Pickup and drop-off route',
        'The specific interaction with the passenger and what actually happened'
      ],
      placeholder:
        'e.g., On 14 May around 4:30pm from Westlands to JKIA, passenger claimed I drove recklessly after I declined an unmapped alleyway...'
    }
  }
  if (lower.includes('fare') || lower.includes('payment')) {
    return {
      title: 'Tell me about the fare or payment dispute in your own words. Mention:',
      bullets: [
        'When the trip occurred (date & time)',
        'Trip route (pickup to destination)',
        'The app fare amount and payment method used (e.g. M-Pesa, cash)'
      ],
      placeholder:
        'e.g., On 14 May around 4:30pm from Westlands to JKIA, the passenger said the fare of KSh 1,250 was too high and threatened to report me. Payment was received via M-Pesa...'
    }
  }
  if (lower.includes('cancel') || lower.includes('rating')) {
    return {
      title: 'Tell me about the cancellation or rating issue in your own words. Mention:',
      bullets: [
        'Dates and pickup locations for the disputed trips',
        'Why cancellations occurred (e.g. rider no-show, wrong pin, unreachable rider)'
      ],
      placeholder:
        'e.g., On 14 May at 8:00am in CBD, rider set the wrong pin on a one-way street. Waited 7 minutes with calls unanswered before cancelling as rider no-show...'
    }
  }
  // Vague / Unknown / Identity / Account
  return {
    title: 'Tell me what happened leading up to the account flag. Mention:',
    bullets: [
      'Trip date and estimated operating time',
      'Route or designated trip locations',
      'Incident summary and when you discovered the deactivation'
    ],
    placeholder:
      'e.g., On 14 May around 5:00pm, I completed trips normally along Ngong Road. At 7:30pm my account was locked without any clear incident description...'
  }
}

/**
 * Client-Side Fallback Extraction (Demo-Safe):
 * Extracts TIME, ROUTE/LOCATIONS, and FARE if the backend API is unreachable.
 */
function extractFallbackFacts(text: string): EntityItem[] {
  const entities: EntityItem[] = []

  // 1. TIME regex: \b([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s*(am|pm)?\b|\b[1-9]\s*(am|pm)\b
  const timeRegex = /\b([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s*(am|pm)?\b|\b[1-9]\s*(am|pm)\b/gi
  const timeMatches = text.match(timeRegex)
  if (timeMatches) {
    Array.from(new Set(timeMatches)).forEach((t) => {
      entities.push({ label: 'TIME', text: t.trim() })
    })
  }

  // 2. DATE regex: e.g. "14 May", "14th May", "May 14"
  const dateRegex =
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\b/gi
  const dateMatches = text.match(dateRegex)
  if (dateMatches) {
    Array.from(new Set(dateMatches)).forEach((d) => {
      entities.push({ label: 'DATE', text: d.trim() })
    })
  }

  // 3. ROUTE/LOCATIONS: matches known stops or capitalized words
  const knownLocations = [
    'Westlands',
    'JKIA',
    'CBD',
    'Town',
    'Upper Hill',
    'Kilimani',
    'Karen',
    'Eastleigh',
    'Ngong Road',
    'Rongai',
    'Airport',
    'Gikomba'
  ]
  const matchedLocations = new Set<string>()
  for (const loc of knownLocations) {
    const locRegex = new RegExp(`\\b${loc}\\b`, 'i')
    if (locRegex.test(text) && !matchedLocations.has(loc.toUpperCase())) {
      matchedLocations.add(loc.toUpperCase())
      entities.push({ label: 'LOCATION', text: loc })
    }
  }

  // Fallback: check capitalized route words following from / to / at / in
  const routeRegex = /\b(?:from|to|at|in|near)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/g
  let match: RegExpExecArray | null
  while ((match = routeRegex.exec(text)) !== null) {
    const candidate = match[1].trim()
    if (!matchedLocations.has(candidate.toUpperCase()) && candidate.length > 2) {
      matchedLocations.add(candidate.toUpperCase())
      entities.push({ label: 'LOCATION', text: candidate })
    }
  }

  // 4. FARE regex: matches `KSh \d+` or `\d+ bob` or `KES \d+`
  const fareRegex = /(?:KSh|KES)\s*\d+(?:,\d+)?|\b\d+\s*bob\b/gi
  const fareMatches = text.match(fareRegex)
  if (fareMatches) {
    Array.from(new Set(fareMatches)).forEach((f) => {
      entities.push({ label: 'FARE', text: f.trim() })
    })
  }

  return entities
}

function Header({
  step,
  onMenu,
  onBack,
  activeCase
}: {
  step?: string
  onMenu: () => void
  onBack?: () => void
  activeCase?: CaseRecord | null
}) {
  const [notifications, setNotifications] = useState(false)
  const [alertText, setAlertText] = useState('Checking statutory timeline...')

  useEffect(() => {
    async function loadAlert() {
      try {
        let latest = activeCase
        if (!latest) {
          const records = await getAllCases()
          if (records && records.length > 0) {
            latest = records[0] as CaseRecord
          }
        }
        if (latest) {
          const elapsedDays = latest.created_at
            ? Math.max(0, Math.floor((Date.now() - new Date(latest.created_at).getTime()) / (1000 * 60 * 60 * 24)))
            : 0
          const daysRemaining = Math.max(0, 30 - elapsedDays)
          setAlertText(
            `Day ${elapsedDays + 1} of statutory window: ${daysRemaining} days remaining for ${latest.platform || 'platform'} reply.`
          )
        } else {
          setAlertText('No active dispute. Start an appeal to track NTSA LN 120 30-day countdown.')
        }
      } catch {
        setAlertText('Day 1 of statutory window: 30 days remaining for platform reply.')
      }
    }
    loadAlert()
  }, [notifications, activeCase])

  return (
    <div className="sticky top-0 z-30 bg-white shadow-xs">
      <header className="flex min-h-[68px] items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-3">
          {onBack ? (
            <button
              aria-label="Go back"
              onClick={onBack}
              className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            >
              <ArrowLeft />
            </button>
          ) : (
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#1E5E3A] text-white">
              <Scale />
            </div>
          )}
          <div>
            <p className="text-[15px] font-extrabold text-[#0F172A]">Sauti ya Dere</p>
            <p className="text-[10px] text-slate-500">Your voice. Your evidence.</p>
          </div>
        </div>
        <div className="relative flex items-center gap-2">
          <button
            aria-label="Notifications"
            onClick={() => setNotifications(!notifications)}
            className="relative flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <Bell />
            <i className="absolute right-2 top-2 size-2 rounded-full bg-[#D97706]" />
          </button>
          <button
            aria-label="Open menu"
            onClick={onMenu}
            className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 md:hidden"
          >
            <Menu />
          </button>
          {notifications && (
            <div className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-xl">
              <p className="font-black text-[#0F172A]">Local alerts</p>
              <p className="mt-2 leading-5 text-slate-600">{alertText}</p>
              <p className="mt-2 font-bold text-[#1E5E3A]">Stored only on this phone</p>
            </div>
          )}
        </div>
      </header>
      {step && (
        <div className="border-b border-slate-200 bg-white px-5 pb-3 pt-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span>
              Step {steps.indexOf(step) + 1}: {step}
            </span>
            <span>{Math.round(((steps.indexOf(step) + 1) / 5) * 100)}% Complete</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#1E5E3A]"
              style={{ width: `${((steps.indexOf(step) + 1) / 5) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 px-5 py-4 text-center text-[10px] leading-4 text-slate-400">
      © 2026 Sauti ya Dere · In partnership with TAWU-Kenya · Stored Locally on Device
    </footer>
  )
}

function Btn({
  children,
  onClick,
  secondary = false,
  disabled = false
}: {
  children: React.ReactNode
  onClick?: () => void
  secondary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold transition active:scale-[.98] ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      } ${
        secondary
          ? 'border border-slate-200 bg-white text-[#1E5E3A] hover:bg-slate-50'
          : 'bg-[#1E5E3A] text-white shadow-sm shadow-[#1E5E3A]/20 hover:bg-[#174A2E]'
      }`}
    >
      {children}
    </button>
  )
}

function Select({
  label,
  value,
  onChange,
  children
}: {
  label: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-bold text-[#0F172A]">
      {label}
      <span className="relative">
        <select
          value={value}
          onChange={onChange}
          className="min-h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 font-normal text-slate-600 outline-none focus:border-[#1E5E3A]"
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-3.5 text-slate-400" />
      </span>
    </label>
  )
}

function Trust({ text = 'Evidence stays on your phone.' }: { text?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#B9DCC6] bg-[#F1F9F3] p-3 text-xs text-[#1E5E3A]">
      <ShieldCheck />
      <span>
        <b>100% On-Device Storage</b>
        <br />
        {text}
      </span>
    </div>
  )
}

/* Screen 0: Splash */
function Splash({
  go,
  activeCase
}: {
  go: (n: number) => void
  activeCase?: CaseRecord | null
}) {
  return (
    <>
      <Header onMenu={() => {}} activeCase={activeCase} />
      <main className="flex flex-1 flex-col justify-center gap-6 px-6 py-10">
        <div className="flex size-20 items-center justify-center rounded-[26px] bg-[#1E5E3A] text-white shadow-lg shadow-[#1E5E3A]/20">
          <Scale size={42} strokeWidth={1.5} />
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">For Kenya&apos;s drivers</p>
          <h1 className="text-4xl font-black tracking-tight text-[#0F172A]">
            Sauti ya<br />Dere
          </h1>
          <p className="mt-4 max-w-[310px] text-base leading-7 text-slate-500">
            Turn an unfair account suspension into an organized, evidence-backed appeal.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-[#0F172A]">A safer way to challenge a suspension</p>
          <p className="text-sm text-slate-600">
            🔒 Your data stays on this phone. Nothing is uploaded to any company or server.
          </p>
          <p className="text-sm text-slate-600">• Supported by TAWU-Kenya</p>
        </div>
        <div className="mt-auto flex flex-col gap-3">
          <Btn onClick={() => go(1)}>
            Start Your Appeal <ArrowRight />
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 1: Profile (Task T25 integration & Strict Kenyan Phone Validation) */
function Profile({
  go,
  profile,
  onSave,
  activeCase
}: {
  go: (n: number) => void
  profile: ProfileData
  onSave: (p: ProfileData) => Promise<void>
  activeCase?: CaseRecord | null
}) {
  const [name, setName] = useState(profile.name || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [platform, setPlatform] = useState(profile.platform || 'Bolt')
  const [saving, setSaving] = useState(false)

  // Strict Kenyan Phone Validation: Accepts 07xx, 01xx, +254 7xx, 254 1xx
  const isValidKenyanPhone = (val: string) => /^(?:(?:\+?254)|0)?[17]\d{8}$/.test(val.replace(/[\s-]/g, ''))
  const isPhoneValid = isValidKenyanPhone(phone)
  const showPhoneError = phone.trim().length > 0 && !isPhoneValid

  useEffect(() => {
    setName(profile.name || '')
    setPhone(profile.phone || '')
    setPlatform(profile.platform || 'Bolt')
  }, [profile])

  const handleSubmit = async () => {
    if (!isPhoneValid) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), phone: phone.trim(), platform })
      go(2)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Header onMenu={() => {}} onBack={() => go(0)} activeCase={activeCase} />
      <main className="flex flex-1 flex-col gap-6 px-5 py-6">
        <div className="rounded-xl border border-[#B9DCC6] bg-[#F1F9F3] p-4 text-sm leading-5 text-[#1E5E3A]">
          <b>Your details stay on this phone only.</b>
          <br />
          This profile is saved only inside your phone&apos;s browser storage.
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">First, a little about you</p>
          <h1 className="mt-2 text-2xl font-black">Set up your local profile</h1>
        </div>
        <label className="flex flex-col gap-2 text-sm font-bold">
          Driver Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-[#1E5E3A]"
            placeholder="e.g. Mwangi"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-bold">
          Phone number
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`min-h-12 rounded-xl border bg-white px-4 font-normal outline-none transition ${
              showPhoneError ? 'border-amber-400 focus:border-amber-500' : 'border-slate-200 focus:border-[#1E5E3A]'
            }`}
            placeholder="e.g. 0712 345 678 (for timeline reminders)"
          />
          {showPhoneError && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 font-normal">
              ⚠️ Tafadhali enter a valid 10-digit Kenyan mobile number (e.g., 0712 345 678 or 0110 123 456).
            </p>
          )}
        </label>
        <Select
          label="Primary platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          <option value="Bolt">Bolt</option>
          <option value="Uber">Uber</option>
          <option value="Little">Little Cab</option>
          <option value="Faras">Faras</option>
          <option value="Yego">Yego</option>
        </Select>
        <div className="mt-auto">
          <Btn onClick={handleSubmit} disabled={saving || !isPhoneValid}>
            {saving ? 'Saving...' : 'Save & Continue'} {!saving && <ArrowRight />}
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 2: Intake */
function Intake({
  go,
  menu,
  platform,
  onChangePlatform,
  onTriggerUpload,
  attachedFileName,
  ocrResult,
  ocrLoading,
  pasteNoticeText,
  onChangePasteNotice,
  onAnalyzePasteText,
  onAdvance,
  activeCase
}: {
  go: (n: number) => void
  menu: () => void
  platform: string
  onChangePlatform: (p: string) => void
  onTriggerUpload: () => void
  attachedFileName: string | null
  ocrResult: OcrResult | null
  ocrLoading: boolean
  pasteNoticeText: string
  onChangePasteNotice: (t: string) => void
  onAnalyzePasteText: () => void
  onAdvance?: () => void
  activeCase?: CaseRecord | null
}) {
  return (
    <>
      <Header step={steps[0]} onMenu={menu} onBack={() => go(1)} activeCase={activeCase} />
      <main className="flex flex-1 flex-col gap-5 px-5 py-6">
        <div>
          <h1 className="text-2xl font-black">Let&apos;s protect your work.</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Upload your suspension notice or paste the message — DereBot will read it and start building your case.
          </p>
        </div>
        <Select
          label="Which platform is this about?"
          value={platform}
          onChange={(e) => onChangePlatform(e.target.value)}
        >
          <option value="Bolt">Bolt</option>
          <option value="Uber">Uber</option>
          <option value="Little">Little Cab</option>
          <option value="Faras">Faras</option>
        </Select>

        {/* Upload section */}
        <div
          onClick={onTriggerUpload}
          className="flex flex-col gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-4 cursor-pointer hover:border-[#1E5E3A] transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <b className="text-sm">Upload Suspension Notice Screenshot</b>
              <p className="mt-1 text-xs text-slate-500">
                Photo, PDF or screenshot — details are extracted locally for your appeal
              </p>
            </div>
            <button
              type="button"
              aria-label="Upload notice"
              className="flex size-12 items-center justify-center rounded-xl bg-[#E9F3ED] text-[#1E5E3A] hover:bg-[#D5EADB]"
            >
              <Upload />
            </button>
          </div>
          {attachedFileName && !ocrLoading && (
            <div className="mt-2 flex items-center gap-1.5 rounded-full bg-[#E9F3ED] px-3 py-1 text-xs font-bold text-[#1E5E3A] border border-[#B9DCC6] w-fit">
              <span>📎 {attachedFileName} attached</span>
              <Check size={14} className="text-[#1E5E3A]" />
            </div>
          )}
          {ocrLoading && (
            <div className="mt-2 flex items-center gap-2 text-xs text-[#1E5E3A] animate-pulse">
              <span>🔍 Scanning document details...</span>
            </div>
          )}
        </div>

        {/* Show OCR result summary if extracted */}
        {ocrResult && ocrResult.detected_category !== 'unknown' && (
          <div className="rounded-xl border border-[#B9DCC6] bg-[#F1F9F3] p-3 text-sm">
            <p className="font-bold text-[#1E5E3A] text-xs uppercase tracking-wider mb-1">📋 Extracted Notice Details</p>
            <p className="text-slate-700 leading-5">{ocrResult.summary}</p>
            {ocrResult.entities.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ocrResult.entities.map((e, i) => (
                  <span key={i} className="rounded-full bg-white border border-[#B9DCC6] px-2 py-0.5 text-xs font-mono text-[#1E5E3A]">
                    {e.label}: {e.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Paste text alternative */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-[.15em] text-slate-500">
            Or paste the notice text
          </p>
          <textarea
            value={pasteNoticeText}
            onChange={(e) => onChangePasteNotice(e.target.value)}
            placeholder="Paste the deactivation/suspension message here..."
            className="min-h-[90px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal outline-none focus:border-[#1E5E3A] resize-none"
          />
          {pasteNoticeText.trim().length > 10 && (
            <button
              type="button"
              onClick={onAnalyzePasteText}
              className="self-start rounded-lg bg-[#E9F3ED] px-3 py-1.5 text-xs font-bold text-[#1E5E3A] hover:bg-[#D5EADB] transition"
            >
              Scan Notice Details
            </button>
          )}
        </div>

        <Trust />
        <div className="mt-auto">
          <Btn onClick={onAdvance || (() => go(3))}>
            Start Guided Appeal <ArrowRight />
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 3: Chat / Story Input (DereBot Conversational Intake & Fact Binding) */
function Chat({
  go,
  menu,
  narrative,
  noticeText,
  platform,
  onChangeNarrative,
  evidenceHeld,
  ocrFacts,
  onTriggerUpload,
  attachedFileName,
  activeCase,
  entities,
  onSetEntities,
  onSelectCaseType,
  onUpdateConfidence,
  messages,
  onSetMessages,
  language,
  onSetLanguage
}: {
  go: (n: number) => void
  menu: () => void
  narrative: string
  noticeText: string
  platform: string
  onChangeNarrative: (text: string) => void
  evidenceHeld: string[]
  ocrFacts: EntityItem[]
  onTriggerUpload: () => void
  attachedFileName: string | null
  activeCase?: CaseRecord | null
  entities: EntityItem[]
  onSetEntities: (entities: EntityItem[]) => void
  onSelectCaseType: (t: string) => void
  onUpdateConfidence: (confidence: number) => void
  messages: ChatMessage[]
  onSetMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> | ((msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void)
  language: 'en' | 'sw'
  onSetLanguage: (lang: 'en' | 'sw') => void
}) {
  const [showFactsDetails, setShowFactsDetails] = useState(false)

  const getGreeting = (lang: 'en' | 'sw') => {
    const ocrSummary = ocrFacts.length > 0
      ? lang === 'sw'
        ? ` Nimeona tayari umepakia nyaraka ya ushahidi.`
        : ` I see you have already attached supporting evidence.`
      : ''
    return lang === 'sw'
      ? `Habari dere. Pole sana kwa changamoto ya kusimamishwa akaunti na ${platform}. Mimi ni DereBot, msaidizi wako wa kisheria.${ocrSummary}\n\nNiambie kwa maneno yako mwenyewe nini kilitokea — tarehe, mahali (stage), na kilichosababisha hii kusimamishwa?`
      : `Hello driver. We understand your account suspension on ${platform} is frustrating. I am DereBot, your legal intake assistant.${ocrSummary}\n\nPlease describe what happened in your own words — including the trip date, time, pickup and drop-off stages in Nairobi, and what led to this deactivation.`
  }

  // Initialize greeting if empty
  useEffect(() => {
    if (messages.length === 0) {
      onSetMessages([{ sender: 'bot', text: getGreeting(language) }])
    }
  }, [])

  // Switch greeting when user toggles language if they haven't started chatting
  const handleToggleLanguage = (newLang: 'en' | 'sw') => {
    onSetLanguage(newLang)
    if (messages.length === 1 && messages[0].sender === 'bot') {
      onSetMessages([{ sender: 'bot', text: getGreeting(newLang) }])
    }
  }

  const [driverInput, setDriverInput] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [factsComplete, setFactsComplete] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [localCaseTypeHistory, setLocalCaseTypeHistory] = useState<string[]>([])
  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, analyzing])

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : driverInput).trim()
    if (!text || analyzing) return

    const newDriverMsg: ChatMessage = { sender: 'driver', text }
    const nextMessages = [...messages, newDriverMsg]
    onSetMessages(nextMessages)
    setDriverInput('')

    // Aggregate narrative for case record
    const fullNarrative = nextMessages
      .filter((m) => m.sender === 'driver')
      .map((m) => m.text)
      .join('\n\n')
    onChangeNarrative(fullNarrative)

    // Immediate local extraction to guarantee facts (e.g. Westlands, 4pm) are NEVER dropped
    const localFacts = extractFallbackFacts(fullNarrative)
    if (localFacts.length > 0) {
      const combined = [...entities]
      const existing = new Set(combined.map((e) => `${e.label}:${e.text.toLowerCase()}`))
      for (const lf of localFacts) {
        if (!existing.has(`${lf.label}:${lf.text.toLowerCase()}`)) {
          combined.push(lf)
        }
      }
      onSetEntities(combined)
    }

    setAnalyzing(true)
    try {
      const response = await sendDereBotMessage({
        messages: nextMessages,
        platform,
        noticeReason: noticeText,
        ocrFacts: ocrFacts as any,
        evidenceHeld,
        caseTypeHistory: localCaseTypeHistory,
        language
      })

      onSetMessages((prev) => [
        ...prev,
        { sender: 'bot', text: response.reply }
      ])

      if (Array.isArray(response.extracted_entities) && response.extracted_entities.length > 0) {
        const mappedEntities: EntityItem[] = response.extracted_entities.map((e) => ({
          label: e.label.toUpperCase(),
          text: e.text
        }))
        onSetEntities(mappedEntities)
      }

      if (response.suggested_case_type) {
        onSelectCaseType(response.suggested_case_type)
        setLocalCaseTypeHistory((prev) => [...prev, response.suggested_case_type])
      }

      if (typeof response.confidence === 'number') {
        onUpdateConfidence(response.confidence)
      }

      if (response.facts_complete) {
        setFactsComplete(true)
      }
    } catch (err) {
      console.warn('DereBot conversation error:', err)
      const fallbackMsg =
        language === 'sw'
          ? 'Nimehifadhi maelezo yako dere. Unaweza kuendelea kueleza ama ubonyeze "Proceed to Verification" hapa chini tukague ushahidi wako.'
          : 'I have recorded your trip details. You can continue adding details or tap "Proceed to Verification" below to audit your evidence.'
      onSetMessages((prev) => [
        ...prev,
        { sender: 'bot', text: fallbackMsg }
      ])
    } finally {
      setAnalyzing(false)
    }
  }

  const handleMicClick = () => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        const recognition = new SpeechRecognition()
        recognition.lang = 'en-KE'
        recognition.interimResults = false
        recognition.maxAlternatives = 1

        setIsRecording(true)
        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript
          setDriverInput((prev) => (prev ? `${prev} ${transcript}` : transcript))
          setIsRecording(false)
        }
        recognition.onerror = () => {
          setIsRecording(false)
        }
        recognition.onend = () => {
          setIsRecording(false)
        }
        recognition.start()
        return
      } catch {
        // Fallback
      }
    }

    if (isRecording) return
    setIsRecording(true)
    setTimeout(() => {
      setIsRecording(false)
      const promptText = window.prompt('Voice recognition is simulated or unavailable. You can enter or speak your message:')
      if (promptText && promptText.trim()) {
        handleSendMessage(promptText.trim())
      }
    }, 400)
  }

  const handleProceed = () => {
    const fullNarrative = messages
      .filter((m) => m.sender === 'driver')
      .map((m) => m.text)
      .join('\n\n')
    onChangeNarrative(fullNarrative || narrative)
    go(4)
  }

  const hasDriverSpoken = messages.some((m) => m.sender === 'driver')

  return (
    <>
      <Header step={steps[1]} onMenu={menu} onBack={() => go(2)} activeCase={activeCase} />
      <main className="flex flex-1 flex-col px-4 py-4 md:px-5 md:py-5 max-h-[calc(100dvh-120px)] md:max-h-none overflow-hidden">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-[#E9F3ED] text-[#1E5E3A]">
              <Scale size={15} />
            </div>
            <div>
              <span className="font-bold text-slate-800">DereBot • AI Legal Assistant</span>
              <p className="text-[10px] text-slate-400">Gemini-Powered Multi-Turn Intake</p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
            Step 2 of 5
          </span>
        </div>

        {/* Language Selection: English | Kiswahili */}
        <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 shrink-0">
          <span className="text-[11px] font-bold text-slate-600">Language:</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => handleToggleLanguage('en')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                language === 'en'
                  ? 'bg-[#1E5E3A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => handleToggleLanguage('sw')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                language === 'sw'
                  ? 'bg-[#1E5E3A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
              }`}
            >
              Kiswahili
            </button>
          </div>
        </div>

        {/* Sleek Collapsible Fact Bar */}
        {entities.length > 0 && (
          <div className="mb-2 shrink-0 rounded-xl bg-[#F1F9F3] border border-[#B9DCC6] p-2 text-xs transition">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-[#1E5E3A] flex items-center gap-1.5 text-xs">
                🎯 {entities.length} Key Facts Captured
              </span>
              <button
                type="button"
                onClick={() => setShowFactsDetails((prev) => !prev)}
                className="text-[11px] font-bold text-[#1E5E3A] hover:underline cursor-pointer"
              >
                {showFactsDetails ? 'Hide Details ▲' : 'View Details ▼'}
              </button>
            </div>
            {showFactsDetails && (
              <div className="mt-2 pt-2 border-t border-[#B9DCC6]/60 flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {entities.map((item, idx) => (
                  <span
                    key={idx}
                    className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-[#1E5E3A] border border-[#B9DCC6] shadow-2xs"
                  >
                    {item.label}: {item.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dynamic Multi-Turn Conversation Feed */}
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3.5 pb-3">
          {messages.map((m, idx) => (
            <div key={idx} className={`flex flex-col ${m.sender === 'driver' ? 'items-end' : 'items-start'}`}>
              {m.sender === 'bot' ? (
                <div className="flex items-start gap-2 max-w-[90%]">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#E9F3ED] text-[#1E5E3A] mt-0.5">
                    <Scale size={13} />
                  </div>
                  <div className="rounded-2xl rounded-tl-xs bg-[#EEF2F4] p-3.5 text-xs leading-5 text-slate-800 shadow-2xs whitespace-pre-wrap">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div className="max-w-[85%] rounded-2xl rounded-tr-xs bg-[#1E5E3A] p-3.5 text-xs leading-5 text-white shadow-xs whitespace-pre-wrap">
                  {m.text}
                </div>
              )}
            </div>
          ))}

          {/* Typing Indicator */}
          {analyzing && (
            <div className="flex items-start gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#E9F3ED] text-[#1E5E3A] mt-0.5">
                <Scale size={13} />
              </div>
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-xs bg-[#EEF2F4] px-4 py-3 text-xs font-bold text-slate-600 shadow-2xs animate-pulse">
                <div className="flex gap-1">
                  <span className="size-1.5 rounded-full bg-[#1E5E3A] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="size-1.5 rounded-full bg-[#1E5E3A] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="size-1.5 rounded-full bg-[#1E5E3A] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span>DereBot is analyzing your case...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar & Actions */}
        <div className="shrink-0 flex flex-col gap-2 pt-2 border-t border-slate-100">
          {attachedFileName && (
            <div className="flex items-center gap-1.5 rounded-full bg-[#E9F3ED] px-3 py-1 text-xs font-bold text-[#1E5E3A] border border-[#B9DCC6] w-fit">
              <span>📎 {attachedFileName} attached</span>
              <Check size={14} className="text-[#1E5E3A]" />
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xs focus-within:border-[#1E5E3A] focus-within:ring-1 focus-within:ring-[#1E5E3A]">
            <textarea
              value={driverInput}
              onChange={(e) => setDriverInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              placeholder={language === 'sw' ? 'Andika jibu lako hapa...' : 'Type your reply here...'}
              rows={2}
              className="w-full resize-none bg-transparent text-xs leading-5 text-[#0F172A] placeholder-slate-400 outline-none"
            />
            <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-[10px] text-slate-400">
              <span>{language === 'sw' ? 'Bonyeza Enter kutuma' : 'Press Enter to send'}</span>
              <span className="flex items-center gap-1 font-semibold text-[#1E5E3A]">
                <ShieldCheck size={12} /> Stored on-device
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Attach evidence"
              onClick={onTriggerUpload}
              className="flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition"
              title="Attach document or screenshot"
            >
              <Paperclip size={18} />
            </button>
            <button
              type="button"
              aria-label="Voice note"
              onClick={handleMicClick}
              disabled={isRecording}
              className={`flex size-11 items-center justify-center rounded-xl transition ${
                isRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-[#E9F3ED] text-[#1E5E3A] hover:bg-[#D5EADB]'
              }`}
              title="Speak your account"
            >
              <Mic size={18} />
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={analyzing || !driverInput.trim()}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold transition ${
                !driverInput.trim() || analyzing
                  ? 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-[#1E5E3A] text-white hover:bg-[#174A2E] shadow-xs'
              }`}
            >
              <Send size={14} /> Send Response
            </button>
          </div>

          <div className="mt-1">
            <Btn
              onClick={handleProceed}
              secondary={!factsComplete}
              disabled={!hasDriverSpoken && !narrative}
            >
              {factsComplete
                ? '✓ Appeal Foundation Ready — Proceed to Verification'
                : 'Proceed to Verification (Screen 4)'} <ArrowRight />
            </Btn>
          </div>
        </div>
      </main>
      <div className="hidden md:block">
        <Footer />
      </div>
    </>
  )
}

/* Screen 4: Verify (True Fact Binding & Backward Navigation Loop) */
function Verify({
  go,
  menu,
  analysis,
  onUpdateEntity,
  onAddEntity,
  onDeleteEntity,
  onSelectCaseType,
  activeCase
}: {
  go: (n: number) => void
  menu: () => void
  analysis: AnalysisResult
  onUpdateEntity: (index: number, newText: string) => void
  onAddEntity: (entity: EntityItem) => void
  onDeleteEntity: (index: number) => void
  onSelectCaseType: (t: string) => void
  activeCase?: CaseRecord | null
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isAddingFact, setIsAddingFact] = useState(false)
  const [newFactLabel, setNewFactLabel] = useState('DATE')
  const [newFactText, setNewFactText] = useState('')

  const currentCaseType = analysis.classification.case_type || ''
  const hasPrediction = Boolean(
    currentCaseType &&
    analysis.classification.confidence !== null &&
    analysis.classification.confidence !== undefined
  )
  const confidencePct = hasPrediction ? Math.round(Number(analysis.classification.confidence) * 100) : null

  const handleStartEdit = (index: number, currentText: string) => {
    setEditingIndex(index)
    setEditValue(currentText)
  }

  const handleSaveEdit = (index: number) => {
    if (editValue.trim()) {
      onUpdateEntity(index, editValue.trim())
    }
    setEditingIndex(null)
  }

  const handleSaveNewFact = () => {
    if (newFactText.trim()) {
      onAddEntity({
        label: newFactLabel.toUpperCase(),
        text: newFactText.trim()
      })
      setNewFactText('')
      setIsAddingFact(false)
    }
  }

  const hasEntities = Array.isArray(analysis.entities) && analysis.entities.length > 0

  return (
    <>
      <Header step={steps[2]} onMenu={menu} onBack={() => go(3)} activeCase={activeCase} />
      <main className="flex flex-1 flex-col gap-5 px-5 py-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">Inversion test</p>
          <h1 className="mt-2 text-2xl font-black">Does this look right?</h1>
        </div>

        {/* Dynamic Case Classification Card */}
        {hasPrediction ? (
          <div className="rounded-2xl border border-[#B9DCC6] bg-[#F1F9F3] p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-base font-black text-[#0F172A]">{formatCaseType(currentCaseType)}</p>
                <p className="mt-1 text-xs text-slate-500">Our reading of your story</p>
              </div>
              {confidencePct !== null && (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#1E5E3A] shadow-xs">
                  {confidencePct}% confidence
                </span>
              )}
            </div>
            {confidencePct !== null && (
              <div className="mt-4 h-1.5 rounded-full bg-[#CDE5D4]">
                <div
                  className="h-full rounded-full bg-[#1E5E3A]"
                  style={{ width: `${Math.min(100, Math.max(10, confidencePct))}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-[#FFF7ED] p-4 text-amber-950">
            <div className="flex items-start gap-2.5">
              <span className="text-base leading-none mt-0.5">⚠️</span>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#A34F00]">
                  Classification Needed
                </p>
                <p className="mt-1 text-sm font-extrabold text-[#0F172A]">
                  Please select the dispute category that best matches your situation.
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  DereBot needs your dispute category to evaluate required evidence and formulate statutory appeal grounds.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Dispute Category Selection */}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold text-[#0F172A]">
            {hasPrediction ? 'Not right? Select the actual issue:' : 'Dispute categories:'}
          </legend>
          {[
            { label: 'Passenger Complaint', value: 'passenger_safety' },
            { label: 'Fare Dispute', value: 'fare_dispute' },
            { label: 'Cancellation / Rating', value: 'rating_or_cancellation' },
            { label: 'Identity / Fraud Flag', value: 'fraud_flag' }
          ].map((item) => (
            <label
              key={item.value}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm transition ${
                currentCaseType === item.value
                  ? 'border-[#1E5E3A] bg-[#F1F9F3] font-bold text-[#1E5E3A]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="caseTypeOverride"
                checked={currentCaseType === item.value}
                onChange={() => onSelectCaseType(item.value)}
                className="accent-[#1E5E3A]"
              />
              {item.label}
            </label>
          ))}
        </fieldset>

        {/* Extracted Facts with Unblocked Flow */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">
              {hasEntities ? 'Extracted facts · click pencil to edit' : 'Extracted facts'}
            </p>
            <button
              onClick={() => setIsAddingFact(!isAddingFact)}
              className="flex items-center gap-1 text-xs font-bold text-[#1E5E3A] hover:underline"
            >
              <Plus size={14} /> Add Fact Manually
            </button>
          </div>

          {!hasEntities ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-center">
              <p className="text-xs font-bold text-slate-700">
                No specific trip facts detected yet. You can add key details below or continue directly.
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Adding key trip details (date, stage, or fare) strengthens your formal NTSA LN 120 appeal.
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingFact(true)}
                  className="rounded-lg bg-[#E9F3ED] px-3 py-1.5 text-xs font-black text-[#1E5E3A] hover:bg-[#D5EADB] transition"
                >
                  <Plus size={13} className="inline mr-1" /> Add Fact Manually
                </button>
                <button
                  type="button"
                  onClick={() => go(3)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  ← Return to Chat
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {analysis.entities.map((item, idx) => (
                <div key={idx} className="flex items-center">
                  {editingIndex === idx ? (
                    <div className="flex items-center gap-1 rounded-full border border-[#1E5E3A] bg-white px-2 py-1">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="text-xs font-bold text-[#1E5E3A] outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(idx)
                          if (e.key === 'Escape') setEditingIndex(null)
                        }}
                      />
                      <button
                        onClick={() => handleSaveEdit(idx)}
                        className="text-xs font-extrabold text-[#1E5E3A]"
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center rounded-full bg-[#E9F3ED] pl-3 pr-1 py-1 text-xs font-bold text-[#1E5E3A]">
                      <button
                        onClick={() => handleStartEdit(idx, item.text)}
                        className="flex items-center gap-1 hover:underline"
                      >
                        <span>
                          {item.label}: {item.text}
                        </span>
                        <Edit2 size={12} className="ml-1 opacity-70" />
                      </button>
                      <button
                        onClick={() => onDeleteEntity(idx)}
                        className="ml-1 size-5 rounded-full text-slate-400 hover:text-red-500 flex items-center justify-center"
                        title="Remove fact"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {isAddingFact && (
            <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
              <select
                value={newFactLabel}
                onChange={(e) => setNewFactLabel(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white p-1 text-xs font-bold outline-none"
              >
                <option value="DATE">DATE</option>
                <option value="TIME">TIME</option>
                <option value="ROUTE">ROUTE</option>
                <option value="FARE">FARE</option>
                <option value="LOCATION">LOCATION</option>
                <option value="ALLEGATION">ALLEGATION</option>
              </select>
              <input
                type="text"
                value={newFactText}
                onChange={(e) => setNewFactText(e.target.value)}
                placeholder="Fact detail (e.g., 14 May, 4:30 PM, Westlands, KSh 1,250)..."
                className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none"
              />
              <button
                onClick={handleSaveNewFact}
                className="rounded-lg bg-[#1E5E3A] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#174A2E]"
              >
                Add
              </button>
            </div>
          )}
        </div>

        <div className="mt-auto">
          <Btn
            onClick={() => {
              if (!currentCaseType) {
                onSelectCaseType('fare_dispute')
              }
              go(5)
            }}
          >
            Confirm &amp; Check Evidence <ArrowRight />
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 5: Evidence (Dynamic Evidence Audit & Per-Item File Upload) */
function Evidence({
  go,
  menu,
  analysis,
  evidenceHeld,
  onTriggerUpload,
  onRemoveEvidence,
  activeCase
}: {
  go: (n: number) => void
  menu: () => void
  analysis: AnalysisResult
  evidenceHeld: string[]
  onTriggerUpload: (docKey: string) => void
  onRemoveEvidence: (docKey: string) => void
  activeCase?: CaseRecord | null
}) {
  const readinessPct = Math.min(100, Math.round((evidenceHeld.length / 3) * 100))
  const readinessLabel = readinessPct >= 80 ? 'Strong' : readinessPct >= 33 ? 'Moderate' : 'Low'

  // Standard recommended items for case type
  const standardEvidenceItems = [
    { id: 'SUSPENSION_NOTICE', label: 'Suspension Notice', btnLabel: 'Suspension Notice', reason: 'Deactivation or violation message from the platform.' },
    { id: 'TRIP_RECEIPT_SCREENSHOT', label: 'Trip Receipt Screenshot', btnLabel: 'Trip Receipt', reason: 'Waybill or trip fare receipt showing trip completion.' },
    { id: 'M_PESA_STATEMENT', label: 'M-Pesa Statement / SMS', btnLabel: 'M-Pesa Statement', reason: 'Proof of fare payment or transaction history.' },
    { id: 'IN_APP_CHAT_SCREENSHOT', label: 'In-App Chat Screenshot', btnLabel: 'Chat Screenshot', reason: 'Passenger messaging exchange prior to or after dispute.' },
    { id: 'DASHCAM_OR_AUDIO_RECORDING', label: 'Audio / Dashcam Recording', btnLabel: 'Audio / Dashcam', reason: 'Objective audio or video record of rider conduct.' }
  ]

  return (
    <>
      <Header step={steps[3]} onMenu={menu} onBack={() => go(4)} activeCase={activeCase} />
      <main className="flex flex-1 flex-col gap-5 px-5 py-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">Evidence readiness</p>
            <h1 className="mt-2 text-2xl font-black">Supporting Evidence &amp; Proof</h1>
          </div>
          <b className="text-sm text-[#1E5E3A]">
            Evidence Readiness: {readinessPct}% ({readinessLabel})
          </b>
        </div>
        <div>
          <div className="h-2 rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[#1E5E3A] transition-all duration-300"
              style={{ width: `${Math.max(4, readinessPct)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {evidenceHeld.length === 0
              ? 'No documents attached yet. Upload files below to strengthen your appeal.'
              : `${evidenceHeld.length} item${evidenceHeld.length > 1 ? 's' : ''} attached. Strong evidence makes a faster, fairer review.`}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {standardEvidenceItems.map((item) => {
            const isHeld = evidenceHeld.includes(item.id)
            return (
              <div
                key={item.id}
                className={`flex flex-col gap-2 rounded-xl border p-4 transition ${
                  isHeld
                    ? 'border-[#B9DCC6] bg-[#F1F9F3]'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <b className="text-sm text-[#0F172A]">{item.label}</b>
                    <p className="mt-1 text-xs text-slate-500">{item.reason}</p>
                  </div>
                  <div>
                    {isHeld ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#E9F3ED] px-3 py-1 text-xs font-black text-[#1E5E3A] border border-[#B9DCC6]">
                          ✓ Attached from phone
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemoveEvidence(item.id)}
                          className="text-xs font-bold text-slate-400 hover:text-red-500"
                          title="Remove attached file"
                        >
                          Detach
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onTriggerUpload(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E5E3A] bg-white px-3 py-1.5 text-xs font-black text-[#1E5E3A] shadow-xs hover:bg-[#F1F9F3] transition active:scale-95"
                      >
                        <Upload size={13} /> + Upload {item.btnLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-auto">
          <Btn onClick={() => go(6)}>
            Continue to Appeal Preview <ArrowRight />
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 6: Preview & Dossier Persistence (Formal Appeal Synthesis) */
function Preview({
  go,
  menu,
  analysis,
  platform,
  profile,
  narrative,
  evidenceHeld,
  onSaveDossier,
  activeCase
}: {
  go: (n: number) => void
  menu: () => void
  analysis: AnalysisResult
  platform: string
  profile: ProfileData
  narrative: string
  evidenceHeld: string[]
  onSaveDossier: () => Promise<void>
  activeCase?: CaseRecord | null
}) {
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfSuccess, setPdfSuccess] = useState(false)
  const [synthesizedStatement, setSynthesizedStatement] = useState('')

  useEffect(() => {
    let isMounted = true
    async function loadStatement() {
      try {
        const stmt = await synthesizeAppealStatement({
          platform,
          caseType: analysis.classification.case_type || 'fare_dispute',
          entities: analysis.entities as any,
          driverName: profile.name || 'Registered Driver'
        })
        if (isMounted) setSynthesizedStatement(stmt)
      } catch {
        // Fallback handled inside helper
      }
    }
    loadStatement()
    return () => { isMounted = false }
  }, [platform, analysis.classification.case_type, analysis.entities, profile.name])

  const caseRef = activeCase?.id
    ? `SYD-APP-${new Date().getFullYear()}-${String(activeCase.id).padStart(4, '0')}`
    : `SYD-APP-${new Date().getFullYear()}-0001`

  const headline =
    analysis.appeal.headline ||
    `Formal Administrative Appeal: ${platform} Account Restriction`

  // Synthesize formal professional appeal body (No raw narrative quotes)
  const bodyText = formatFormalAppealBody({
    platform,
    driverName: profile.name || 'Mwangi',
    driverPhone: profile.phone || '',
    caseRef,
    entities: analysis.entities as any,
    narrative,
    evidenceHeld: evidenceHeld as any,
    synthesizedStatement
  })

  const getPlatformEmail = (p: string) => {
    const lower = (p || '').toLowerCase()
    if (lower.includes('bolt')) return 'kenya@bolt.eu'
    if (lower.includes('uber')) return 'support@uber.com'
    if (lower.includes('little')) return 'support@little.biz'
    if (lower.includes('faras')) return 'support@faras.ke'
    return `support@${lower.replace(/\s+/g, '')}.com`
  }
  const platformEmail = getPlatformEmail(platform)
  const platformMailto = `mailto:${platformEmail}?subject=${encodeURIComponent(
    `Formal Administrative Appeal: ${platform} Account Restriction (#${caseRef})`
  )}&body=${encodeURIComponent(
    `To ${platform} Driver Support & Appeals Division,\n\nPlease find my formal administrative appeal and statutory reinstatement demand regarding my account restriction (Case #${caseRef}), formally lodged pursuant to Regulation 15 of NTSA Legal Notice 120 (2022) and Section 26 of the Kenya Data Protection Act 2019.\n\nDriver: ${profile.name || 'Registered Driver'} (${profile.phone || ''})\nPlatform: ${platform}\nCase Reference: #${caseRef}\n\n[Full 1-page Legal PDF Dispute Dossier generated via Sauti ya Dere attached]`
  )}`

  const handleCopy = () => {
    navigator.clipboard?.writeText?.(`${headline}\n\n${bodyText}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadPdf = async () => {
    setGeneratingPdf(true)
    try {
      await generateAppealPdf({
        driverProfile: profile,
        caseData: {
          platform: platform || profile.platform || 'Bolt',
          narrative,
          entities: analysis.entities,
          evidence_held: evidenceHeld
        },
        appealDossier: {
          headline,
          statement_body: bodyText,
          policy_rules: analysis.appeal.policy_rules,
          evidence_held: evidenceHeld
        }
      })
      setPdfSuccess(true)
      setTimeout(() => setPdfSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to generate appeal PDF:', err)
    } finally {
      setGeneratingPdf(false)
    }
  }

  const handleFinalSave = async () => {
    setSubmitting(true)
    try {
      await onSaveDossier()
      go(7)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Header step={steps[4]} onMenu={menu} onBack={() => go(5)} activeCase={activeCase} />
      <main className="flex flex-1 flex-col gap-5 px-5 py-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">Appeal dossier</p>
          <h1 className="mt-2 text-2xl font-black">A clear case, in your words.</h1>
        </div>
        <article className="flex-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm max-h-[380px] overflow-y-auto">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">TO</p>
              <b className="text-sm">{platform} Driver Appeals &amp; Partner Operations</b>
            </div>
            <FileText className="text-[#1E5E3A]" />
          </div>
          <h3 className="mb-3 text-sm font-extrabold text-[#0F172A]">{headline}</h3>
          <p className="whitespace-pre-line text-xs leading-6 text-slate-700 font-mono bg-slate-50 p-3 rounded-xl border border-slate-100">
            {bodyText}
          </p>
        </article>

        <div className="grid grid-cols-2 gap-3">
          <Btn secondary onClick={handleCopy}>
            <Clipboard size={16} /> {copied ? 'Copied!' : 'Copy Text'}
          </Btn>
          <Btn secondary onClick={handleDownloadPdf} disabled={generatingPdf}>
            <Download size={16} /> {generatingPdf ? 'Generating…' : pdfSuccess ? 'Downloaded!' : 'Download 1-Page PDF'}
          </Btn>
        </div>

        <a
          href={platformMailto}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#B9DCC6] bg-[#F1F9F3] px-4 text-xs font-black text-[#1E5E3A] hover:bg-[#E2F2E7] transition active:scale-[.98]"
        >
          <Mail size={16} /> Email Appeal to {platform} Support ({platformEmail})
        </a>

        <Btn onClick={handleFinalSave} disabled={submitting}>
          {submitting ? 'Saving Case...' : 'Save Case & Track 30-Day Timeline →'}
        </Btn>
      </main>
      <Footer />
    </>
  )
}

/* Screen 7: Case Log (Task T25/T26 integration) */
function Log({
  go,
  menu,
  cases,
  onStartNewCase,
  activeCase,
  onUpdateCaseStatus,
  onSaveCurrentDraft
}: {
  go: (n: number) => void
  menu: () => void
  cases: CaseRecord[]
  onStartNewCase: () => void
  activeCase?: CaseRecord | null
  onUpdateCaseStatus?: (caseId: number, status: string) => Promise<void>
  onSaveCurrentDraft?: () => Promise<void>
}) {
  const [selectedStatus, setSelectedStatus] = useState<string>(cases[0]?.status || 'Awaiting Platform Reply')
  const [markedToday, setMarkedToday] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)

  const handleStatusChange = async (newStatus: string) => {
    setSelectedStatus(newStatus)
    if (cases.length > 0 && cases[0]?.id && onUpdateCaseStatus) {
      await onUpdateCaseStatus(cases[0].id, newStatus)
    }
  }

  const handleMarkSubmitted = async () => {
    setMarkedToday(true)
    if (cases.length > 0 && cases[0]?.id && onUpdateCaseStatus) {
      await onUpdateCaseStatus(cases[0].id, 'Awaiting Platform Reply (Submitted Today)')
    }
  }

  return (
    <>
      <Header onMenu={menu} onBack={() => go(6)} activeCase={activeCase} />
      <main className="flex flex-1 flex-col gap-5 px-5 py-6 overflow-y-auto">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">Your offline case log</p>
          <h1 className="mt-2 text-2xl font-black">Case &amp; timeline</h1>
        </div>

        {cases.length > 0 ? (
          cases.map((c, index) => {
            const elapsedDays = markedToday
              ? 0
              : c.created_at
              ? Math.max(0, Math.floor((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)))
              : 0
            const countdownDays = Math.max(0, 30 - elapsedDays)

            return (
              <div key={c.id || index} className="rounded-2xl bg-[#0F172A] p-5 text-white shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wider">
                      {c.platform || 'BOLT'} · CASE #SYD-{c.id || index + 1}
                    </p>
                    <h2 className="mt-2 text-xl font-black">{formatCaseType(c.case_type)}</h2>
                  </div>
                  <span className="rounded-full bg-[#D8F0DE] px-2.5 py-1 text-[10px] font-black text-[#1E5E3A]">
                    {selectedStatus === 'Platform Reinstated Account' ? '✓ Reinstated & Closed' : selectedStatus}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-300">
                  {c.narrative}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                  <div>
                    <p className="text-xs text-slate-400">Days elapsed</p>
                    <b className="text-lg">{elapsedDays} days</b>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">NTSA LN 120 countdown</p>
                    <b className="text-lg text-[#FBBF24]">
                      {selectedStatus === 'Platform Reinstated Account' ? 'Resolved' : `${countdownDays} days left`}
                    </b>
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500 flex flex-col items-center gap-3">
            <Scale className="mx-auto text-slate-400" size={32} />
            <div>
              <b className="text-sm text-slate-700">No cases saved in local log yet</b>
              <p className="mt-1 text-xs text-slate-500">Save your active appeal to track the statutory 30-day countdown on this phone.</p>
            </div>
            {onSaveCurrentDraft && (
              <button
                type="button"
                onClick={async () => {
                  setSavingDraft(true)
                  try {
                    await onSaveCurrentDraft()
                  } finally {
                    setSavingDraft(false)
                  }
                }}
                disabled={savingDraft}
                className="mt-1 rounded-xl bg-[#1E5E3A] px-4 py-2 text-xs font-bold text-white hover:bg-[#174A2E] shadow-sm transition"
              >
                {savingDraft ? 'Saving Case...' : '💾 Save Current Appeal to Case Log'}
              </button>
            )}
          </div>
        )}

        {/* Mark Submitted Button */}
        {cases.length > 0 && !markedToday && (
          <button
            type="button"
            onClick={handleMarkSubmitted}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#B9DCC6] bg-[#F1F9F3] px-4 text-xs font-black text-[#1E5E3A] hover:bg-[#E2F2E7] transition active:scale-[.98]"
          >
            <Check size={16} /> Mark as Submitted to Platform Today (Start 30-Day Window)
          </button>
        )}

        {/* Interactive Case Status Selector */}
        {cases.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Update Dispute Status</p>
            <div className="flex flex-col gap-1.5 text-xs">
              {[
                { id: 'Awaiting Platform Reply', label: '⏳ Awaiting Platform Reply (In statutory window)' },
                { id: 'Platform Reinstated Account', label: '🎉 Platform Reinstated Account (Resolved & Closed)' },
                { id: 'Platform Rejected Appeal', label: '❌ Platform Rejected Appeal (Escalate to TAWU)' }
              ].map((opt) => (
                <label key={opt.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                  <input
                    type="radio"
                    name="case_status"
                    value={opt.id}
                    checked={selectedStatus === opt.id}
                    onChange={() => handleStatusChange(opt.id)}
                    className="accent-[#1E5E3A]"
                  />
                  <span className="font-semibold text-slate-800">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Success / Case Closed Card */}
        {selectedStatus === 'Platform Reinstated Account' && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs flex flex-col gap-1.5 text-emerald-900">
            <div className="flex items-center gap-2 font-black text-sm text-[#1E5E3A]">
              🎉 Account Reinstated — Dispute Resolved &amp; Case Closed
            </div>
            <p className="leading-5 text-emerald-800">
              Congratulations! Your dispute has been resolved under NTSA Legal Notice 120. This case record is safely preserved in your offline case log for future reference.
            </p>
          </div>
        )}

        {/* Rejection / Escalation to TAWU Card */}
        {selectedStatus === 'Platform Rejected Appeal' && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-red-900 font-extrabold text-sm">
              <Scale size={16} /> Statutory Trade Union Conciliation
            </div>
            <p className="text-red-800 leading-5">
              The platform has rejected or failed to resolve your appeal within the 30-day statutory window. Under Regulation 15 of NTSA Legal Notice 120, you are entitled to formal conciliation through TAWU-Kenya.
            </p>
            <a
              href={`mailto:disputes@tawu.or.ke?subject=${encodeURIComponent(
                `Statutory Conciliation Request: Case #SYD-APP-2026-0001 - ${cases[0]?.platform || 'Platform'}`
              )}&body=${encodeURIComponent(
                `To TAWU-Kenya Dispute Desk,\n\nThe platform has rejected my formal administrative appeal. I hereby request trade union conciliation pursuant to Regulation 15 of NTSA Legal Notice 120.\n\nPlatform: ${cases[0]?.platform || 'Platform'}\nCase Ref: #SYD-APP-2026-0001\nStatus: Platform Rejected Appeal`
              )}`}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white hover:bg-red-700 transition"
            >
              <Send size={14} /> Escalate to TAWU-Kenya Conciliation Desk
            </a>
          </div>
        )}

        <div className="rounded-xl border border-[#F2C78F] bg-[#FFF7ED] p-4 text-sm leading-5 text-slate-600">
          <b className="text-[#0F172A]">Statutory response window</b>
          <br />
          Under NTSA Legal Notice 120, the platform is under legal obligation to respond within 30 days.
        </div>

        <section>
          <h2 className="mb-3 text-sm font-black">Timeline Protocol</h2>
          <div className="flex flex-col gap-4 border-l-2 border-[#CDE5D4] pl-4">
            <div>
              <p className="text-xs font-black text-[#1E5E3A]">Step 1 · Completed</p>
              <p className="mt-1 text-sm text-slate-600">Appeal dossier generated &amp; saved on device</p>
            </div>
            <div>
              <p className="text-xs font-black text-[#1E5E3A]">Step 2 · {markedToday ? 'Completed' : 'In Progress'}</p>
              <p className="mt-1 text-sm text-slate-600">Submit copy to platform driver dispute channel</p>
            </div>
            <div>
              <p className="text-xs font-black text-slate-400">Step 3 · Due in 30 Days</p>
              <p className="mt-1 text-sm text-slate-600">Escalate to TAWU if platform fails to respond or rejects</p>
            </div>
          </div>
        </section>

        <div className="mt-auto">
          <Btn secondary onClick={onStartNewCase}>
            + Start Another Case
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 8: Feedback */
function Feedback({
  go,
  menu,
  activeCase
}: {
  go: (n: number) => void
  menu: () => void
  activeCase?: CaseRecord | null
}) {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [feedbackText, setFeedbackText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const mailtoUrl = `mailto:sautiyadere@gmail.com?subject=${encodeURIComponent(
    `Sauti ya Dere Feedback${rating > 0 ? ` (${rating}/5 Stars)` : ''}`
  )}&body=${encodeURIComponent(
    `Driver Rating: ${rating > 0 ? `${rating}/5 Stars` : 'Not specified'}\n\nFeedback / Suggestions:\n${feedbackText || 'No comments provided'}\n\n---\nSent via Sauti ya Dere PWA`
  )}`

  return (
    <>
      <Header onMenu={menu} onBack={() => go(7)} activeCase={activeCase} />
      <main className="flex flex-1 flex-col gap-5 px-5 py-6 overflow-y-auto">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">Help us improve</p>
          <h1 className="mt-2 text-2xl font-black">Give us your feedback</h1>
          <p className="mt-1 text-xs text-slate-500">Your direct input shapes how DereBot advocates for drivers.</p>
        </div>

        {/* Rating Stars */}
        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4">
          <legend className="mb-2 text-xs font-black uppercase tracking-wider text-slate-600">
            How would you rate Sauti ya Dere?
          </legend>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => {
              const isFilled = n <= (hoverRating || rating)
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  className={`flex size-11 items-center justify-center rounded-xl border text-xl transition cursor-pointer ${
                    isFilled
                      ? 'border-amber-300 bg-amber-50 text-[#D97706]'
                      : 'border-slate-200 bg-white text-slate-300 hover:border-slate-300'
                  }`}
                >
                  ★
                </button>
              )
            })}
          </div>
          {rating > 0 && (
            <p className="mt-2 text-xs font-bold text-[#D97706]">
              {rating} of 5 stars selected
            </p>
          )}
        </fieldset>

        {/* Feedback text input */}
        <label className="flex flex-col gap-2 text-xs font-black uppercase tracking-wider text-slate-600">
          Your Comments &amp; Suggestions
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            className="min-h-28 rounded-xl border border-slate-200 bg-white p-3.5 text-xs font-normal text-slate-800 outline-none focus:border-[#1E5E3A] resize-none"
            placeholder="Tell us what worked well, what was confusing, or what features you would like added to DereBot..."
          />
        </label>

        {submitted ? (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-900 flex flex-col gap-2">
            <div className="flex items-center gap-2 font-black text-sm text-[#1E5E3A]">
              <Check size={18} /> Thank You for Your Feedback!
            </div>
            <p className="leading-5 text-emerald-800">
              Your email client was opened to send your feedback to <b>sautiyadere@gmail.com</b>. If your email didn&apos;t open automatically, tap below:
            </p>
            <a
              href={mailtoUrl}
              className="mt-1 flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#1E5E3A] px-4 text-xs font-bold text-white hover:bg-[#174A2E] transition"
            >
              <Send size={14} /> Open Email &amp; Send Feedback
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <a
              href={mailtoUrl}
              onClick={() => setSubmitted(true)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1E5E3A] px-4 text-xs font-black text-white shadow-sm hover:bg-[#174A2E] transition active:scale-[.98]"
            >
              <Send size={15} /> Send Feedback via Email (sautiyadere@gmail.com)
            </a>
          </div>
        )}

        {/* Direct Contacts Card */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 flex flex-col gap-2.5">
          <p className="font-extrabold text-[#0F172A]">Direct Contacts &amp; Union Hotline</p>
          <a
            href="mailto:sautiyadere@gmail.com"
            className="flex items-center gap-2 text-[#1E5E3A] font-bold hover:underline"
          >
            <Send size={14} /> Email: sautiyadere@gmail.com
          </a>
          <a
            href="tel:+254700000000"
            className="flex items-center gap-2 text-[#1E5E3A] font-bold hover:underline"
          >
            <Phone size={14} /> TAWU Dispute Hotline: +254 700 000 000
          </a>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Driver Rights & DereBot Guide Modal */
function GuideModal({
  isOpen,
  onClose
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [tab, setTab] = useState<'how' | 'privacy' | 'rights'>('how')
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/50 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#1E5E3A] text-white">
              <Scale size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#0F172A]">Driver Rights &amp; DereBot Guide</h3>
              <p className="text-xs text-slate-500">Legal backing, AI logic, and privacy safeguards</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 bg-white px-6 pt-2">
          <button
            onClick={() => setTab('how')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition ${
              tab === 'how'
                ? 'border-[#1E5E3A] text-[#1E5E3A]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            🤖 How DereBot Works
          </button>
          <button
            onClick={() => setTab('privacy')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition ${
              tab === 'privacy'
                ? 'border-[#1E5E3A] text-[#1E5E3A]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            🛡️ Privacy &amp; Data Dignity
          </button>
          <button
            onClick={() => setTab('rights')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition ${
              tab === 'rights'
                ? 'border-[#1E5E3A] text-[#1E5E3A]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            ⚖️ Statutory Legal Rights
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6 text-xs text-slate-700 space-y-4">
          {tab === 'how' && (
            <>
              <div>
                <b className="text-sm font-extrabold text-[#0F172A]">1. Conversational Fact Gathering</b>
                <p className="mt-1 leading-5 text-slate-600">
                  DereBot acts as an intake paralegal. Rather than asking you to fill complex legal forms, it asks you natural questions in English or Kiswahili to capture 5 vital trip facts: <b>Date</b>, <b>Time</b>, <b>Route (pickup &amp; drop-off)</b>, <b>Fare/Payment</b>, and <b>Incident details</b>.
                </p>
              </div>
              <div>
                <b className="text-sm font-extrabold text-[#0F172A]">2. AI Dispute Classification &amp; Bounding</b>
                <p className="mt-1 leading-5 text-slate-600">
                  Your incident narrative is analyzed with a specialized Kenyan transport dispute classifier (SetFit model fine-tuned on Kenyan transport grievances + Gemini 3.8 Flash). It classifies cases under standard NTSA categories: Fare &amp; Payment Disputes, Passenger Safety Allegations, Rating &amp; Cancellation Drops, or Account/Fraud Flags.
                </p>
                <p className="mt-1 leading-5 text-slate-600">
                  <b>Strict Scope:</b> DereBot is dedicated exclusively to digital hailing platform disputes. Queries unrelated to driver appeals or account rights are flagged as out-of-scope.
                </p>
              </div>
              <div>
                <b className="text-sm font-extrabold text-[#0F172A]">3. Formal Legal Affidavit Synthesis</b>
                <p className="mt-1 leading-5 text-slate-600">
                  Instead of copying messy chat logs or personal conversational questions into your appeal, DereBot structures verified facts into a formal, first-person legal rebuttal tailored to platform review standards.
                </p>
              </div>
            </>
          )}

          {tab === 'privacy' && (
            <>
              <div className="rounded-2xl border border-[#B9DCC6] bg-[#F1F9F3] p-4 text-[#1E5E3A]">
                <b className="font-extrabold">The Dignity Principle: Zero Centralized Evidence Storage</b>
                <p className="mt-1 text-slate-600 leading-5">
                  Your suspension screenshot, M-Pesa receipts, dashcam audio, and personal profile are saved strictly in your phone&apos;s browser database (IndexedDB via Dexie.js). They are never uploaded to a cloud server.
                </p>
              </div>
              <div>
                <b className="text-sm font-extrabold text-[#0F172A]">Client-Side PII Scrubbing</b>
                <p className="mt-1 leading-5 text-slate-600">
                  Before any incident context is processed by Gemini 3.8 Flash, our on-device redaction scrubber removes sensitive personally identifiable data:
                </p>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-slate-600">
                  <li>Kenyan mobile phone numbers (07xx, 01xx, +254...)</li>
                  <li>Motor vehicle registration numbers (e.g., KDA 123X)</li>
                  <li>National Identity Card numbers</li>
                </ul>
              </div>
              <div>
                <b className="text-sm font-extrabold text-[#0F172A]">Driver Data Control</b>
                <p className="mt-1 leading-5 text-slate-600">
                  You can purge your entire dispute history, profile, and cached evidence at any time by tapping <b>Privacy &amp; Clear Data</b> in the sidebar.
                </p>
              </div>
            </>
          )}

          {tab === 'rights' && (
            <>
              <div>
                <b className="text-sm font-extrabold text-[#0F172A]">NTSA Legal Notice No. 120 (2022) — Regulation 15</b>
                <p className="mt-1 leading-5 text-slate-600">
                  Under the National Transport and Safety Authority (Operation of Digital Hailing Operators) Regulations, 2022:
                </p>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-slate-600">
                  <li>Digital hailing operators are legally required to establish an internal dispute resolution mechanism.</li>
                  <li>All driver appeals must be resolved within an enforceable <b>30-day statutory window</b>.</li>
                  <li>Drivers are entitled to objective evidence review and fair administrative hearing before permanent deactivation.</li>
                </ul>
              </div>
              <div>
                <b className="text-sm font-extrabold text-[#0F172A]">Kenya Data Protection Act, 2019 — Section 26</b>
                <p className="mt-1 leading-5 text-slate-600">
                  As a data subject, every driver has the statutory right to:
                </p>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-slate-600">
                  <li>Receive written reasons for algorithmic decisions or automatic deactivations.</li>
                  <li>Challenge automated profiling that affects their livelihood.</li>
                  <li>Demand rectification of misleading or false passenger allegations.</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <b className="font-extrabold text-[#0F172A]">Trade Union Conciliation Desk</b>
                <p className="mt-1 leading-5 text-slate-600">
                  If the platform rejects your appeal or fails to reply within 30 days, your generated dossier serves as official evidence for escalation to the <b>Transport &amp; Allied Workers Union (TAWU-Kenya)</b> conciliation desk (disputes@tawu.or.ke).
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-[#1E5E3A] px-5 py-2 text-xs font-bold text-white hover:bg-[#174A2E]"
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  )
}

/* Slide-out Drawer (Fix z-index z-50 & Privacy Data Purge) */
function Drawer({
  close,
  go,
  profile,
  onStartNewCase,
  onClearAllData,
  onOpenGuide,
  appealText
}: {
  close: () => void
  go: (n: number) => void
  profile: ProfileData
  onStartNewCase: () => void
  onClearAllData: () => Promise<void>
  onOpenGuide?: () => void
  appealText?: string
}) {
  const mailtoBody = encodeURIComponent(
    appealText ||
    `Formal Dispute Dossier submitted via Sauti ya Dere.\nDriver: ${profile.name || 'Mwangi'} (${profile.phone || ''})\nPlatform: ${profile.platform || 'Bolt'}`
  )
  const mailtoUrl = `mailto:info@twu.or.ke?subject=Formal%20Dispute%20Dossier%20-%20Sauti%20ya%20Dere&body=${mailtoBody}`

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/40">
      <aside className="ml-auto min-h-full w-[min(310px,85vw)] bg-white p-5 shadow-2xl flex flex-col z-50">
        <div className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-[#E9F3ED] font-black text-[#1E5E3A]">
              {(profile.name || 'M')[0].toUpperCase()}
            </div>
            <div>
              <b>{profile.name || 'Mwangi'}</b>
              <p className="text-xs text-slate-500">{profile.phone || '0712 345 678'}</p>
            </div>
          </div>
          <button aria-label="Close menu" onClick={close} className="p-1 rounded-lg hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <nav className="flex flex-col gap-2 py-5 flex-1 overflow-y-auto">
          <button
            onClick={() => {
              onStartNewCase()
              close()
            }}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-[#F1F9F3]"
          >
            <span>📋</span> Active Appeal / Start New
          </button>
          <button
            onClick={() => {
              go(7)
              close()
            }}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-[#F1F9F3]"
          >
            <span>📁</span> My Case Log &amp; History
          </button>
          <button
            onClick={() => {
              go(1)
              close()
            }}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-[#F1F9F3]"
          >
            <span>👤</span> Driver Profile Settings
          </button>
          <button
            onClick={() => {
              close()
              onOpenGuide?.()
            }}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-[#F1F9F3]"
          >
            <span>📖</span> Driver Rights &amp; DereBot Guide
          </button>
          <button
            onClick={() => {
              go(7)
              close()
            }}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-[#F1F9F3]"
          >
            <span>🔔</span> In-App Notifications
          </button>
          <a
            href="tel:+254700000000"
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-[#F1F9F3]"
          >
            <span>📞</span> Call TAWU Hotline (+254 700 000 000)
          </a>
          <a
            href={mailtoUrl}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-[#F1F9F3]"
          >
            <span>📤</span> Forward to TAWU-Kenya
          </a>
          <button
            onClick={() => {
              go(8)
              close()
            }}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-[#F1F9F3]"
          >
            <span>💬</span> Give Feedback
          </button>
          <button
            onClick={async () => {
              await onClearAllData()
              close()
            }}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-red-600 hover:bg-red-50"
          >
            <span>🛡️</span> Privacy &amp; Clear Local Data
          </button>
        </nav>
        <div className="mt-auto pt-4 border-t border-slate-100">
          <Trust text="Your evidence is never uploaded." />
        </div>
      </aside>
    </div>
  )
}

/* Root Page Component orchestrating state & responsive laptop layout */
export default function Page() {
  const [screen, setScreen] = useState(0)
  const [drawer, setDrawer] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  // 1. Driver Profile State (Task T25)
  const [profile, setProfile] = useState<ProfileData>({
    name: '',
    phone: '',
    platform: 'Bolt'
  })

  // 2. Active Case State: Initial evidenceHeld MUST start as empty []
  const [casePlatform, setCasePlatform] = useState('Bolt')
  const [noticeText, setNoticeText] = useState('Fare or payment dispute')
  const [narrative, setNarrative] = useState('')
  const [evidenceHeld, setEvidenceHeld] = useState<string[]>([])
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null)
  const [uploadTargetDoc, setUploadTargetDoc] = useState<string | null>(null)
  // Conversational intake messages & language (preserved across screen navigation)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatLanguage, setChatLanguage] = useState<'en' | 'sw'>('en')
  // OCR state: facts extracted from uploaded images / pasted notice text
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [pasteNoticeText, setPasteNoticeText] = useState('')
  // Case type history for dynamic confidence tracking
  const [caseTypeHistory, setCaseTypeHistory] = useState<string[]>([])

  // 3. Analysis Result from Backend: Initial Evidence Readiness starts at 0%
  const [analysis, setAnalysis] = useState<AnalysisResult>({
    classification: {
      case_type: '',
      confidence: null,
      needs_confirmation: true
    },
    entities: [],
    evidence: {
      readiness: 0,
      missing: [],
      optional: []
    },
    appeal: {
      headline: '',
      body: '',
      policy_rules: []
    }
  })

  // 4. Saved Cases in IndexedDB
  const [casesList, setCasesList] = useState<CaseRecord[]>([])

  // Load driver profile on initial mount
  useEffect(() => {
    async function initProfile() {
      try {
        const stored = await getLocalProfile()
        if (stored) {
          setProfile({
            name: stored.name || '',
            phone: stored.phone || '',
            platform: stored.platform || 'Bolt'
          })
          if (stored.platform) {
            setCasePlatform(stored.platform)
          }
        }
      } catch (err) {
        console.error('Error reading local profile from IndexedDB:', err)
      }
    }
    initProfile()
  }, [])

  // Refresh cases list when entering Log screen (screen 7) or on mount
  const refreshCases = async () => {
    try {
      const records = await getAllCases()
      setCasesList(records as CaseRecord[])
    } catch (err) {
      console.error('Error loading cases from IndexedDB:', err)
    }
  }

  useEffect(() => {
    refreshCases()
  }, [screen])

  const go = (n: number) => setScreen(n)
  const menu = () => setDrawer(true)

  // Dynamic Evidence Reset Handler ("Start Another Case" & Drawer "Active Appeal / Start New")
  const startNewCase = () => {
    setNarrative('')
    setChatMessages([])
    setChatLanguage('en')
    setNoticeText('Fare or payment dispute')
    setAttachedFileName(null)
    setUploadTargetDoc(null)
    setEvidenceHeld([])
    setOcrResult(null)
    setPasteNoticeText('')
    setCaseTypeHistory([])
    setAnalysis({
      classification: {
        case_type: '',
        confidence: null,
        needs_confirmation: true
      },
      entities: [],
      evidence: {
        readiness: 0,
        missing: [],
        optional: []
      },
      appeal: {
        headline: '',
        body: '',
        policy_rules: []
      }
    })
    go(2)
  }

  // Privacy & Clear Local Data: Purge all local data and reset in-memory state
  const handleClearAllData = async () => {
    try {
      await clearAllLocalData()
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear()
      }
      setProfile({ name: '', phone: '', platform: 'Bolt' })
      setCasePlatform('Bolt')
      setNoticeText('Fare or payment dispute')
      setNarrative('')
      setChatMessages([])
      setChatLanguage('en')
      setEvidenceHeld([])
      setAttachedFileName(null)
      setUploadTargetDoc(null)
      setCasesList([])
      setOcrResult(null)
      setPasteNoticeText('')
      setCaseTypeHistory([])
      setAnalysis({
        classification: { case_type: '', confidence: null, needs_confirmation: true },
        entities: [],
        evidence: { readiness: 0, missing: [], optional: [] },
        appeal: { headline: '', body: '', policy_rules: [] }
      })
      alert('All local profile and case data purged from this device in accordance with our Dignity Principle.')
      go(0)
    } catch (err) {
      console.error('Error clearing local data:', err)
    }
  }

  // Working File Upload Handler — with Gemini Vision OCR
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAttachedFileName(file.name)
      const docKey = uploadTargetDoc || (screen === 2 ? 'SUSPENSION_NOTICE' : 'TRIP_RECEIPT_SCREENSHOT')
      setEvidenceHeld((prev) => {
        const next = prev.includes(docKey) ? prev : [...prev, docKey]
        const nextReadiness = Math.min(100, Math.round((next.length / 3) * 100)) / 100
        setAnalysis((a) => ({
          ...a,
          evidence: {
            ...a.evidence,
            readiness: nextReadiness
          }
        }))
        return next
      })
      setUploadTargetDoc(null)

      // Run OCR if the file is an image or PDF and we have an API key
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || ''
      if (apiKey && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
        setOcrLoading(true)
        try {
          const result = await ocrExtractFromImage(file, apiKey)
          if (result) {
            setOcrResult(result)
            // Auto-infer notice category from OCR if detected
            if (result.detected_category && result.detected_category !== 'unknown') {
              const catMap: Record<string, string> = {
                fare_dispute: 'Fare or payment dispute',
                passenger_safety: 'Safety violation allegation',
                rating_or_cancellation: 'Cancellation or rating drop',
                fraud_flag: 'Account or identity flag'
              }
              if (catMap[result.detected_category]) {
                setNoticeText(catMap[result.detected_category])
              }
            }
            // Merge OCR entities into analysis
            if (result.entities && result.entities.length > 0) {
              setAnalysis((a) => ({
                ...a,
                entities: [
                  ...a.entities,
                  ...result.entities.filter(
                    (ne) => !a.entities.some((e) => e.label === ne.label && e.text === ne.text)
                  )
                ]
              }))
            }
          }
        } finally {
          setOcrLoading(false)
        }
      }
    }
  }

  const triggerFileUpload = (targetDoc?: string) => {
    setUploadTargetDoc(targetDoc || null)
    const el = document.getElementById('notice-upload') as HTMLInputElement | null
    if (el) {
      el.value = ''
      el.click()
    }
  }

  // Remove evidence from held list (Screen 5)
  const handleRemoveEvidence = (docKey: string) => {
    setEvidenceHeld((prev) => {
      const next = prev.filter((k) => k !== docKey)
      const nextReadiness = Math.min(100, Math.round((next.length / 3) * 100)) / 100
      setAnalysis((a) => ({
        ...a,
        evidence: {
          ...a.evidence,
          readiness: nextReadiness
        }
      }))
      return next
    })
  }

  // Toggle evidence in held list (Screen 5)
  const handleToggleEvidence = (docKey: string) => {
    setEvidenceHeld((prev) => {
      const exists = prev.includes(docKey)
      const next = exists ? prev.filter((k) => k !== docKey) : [...prev, docKey]
      const nextReadiness = Math.min(100, Math.round((next.length / 3) * 100)) / 100
      setAnalysis((a) => ({
        ...a,
        evidence: {
          ...a.evidence,
          readiness: nextReadiness
        }
      }))
      return next
    })
  }

  // Save profile to IndexedDB
  const handleSaveProfile = async (newProfile: ProfileData) => {
    await saveLocalProfile(newProfile)
    setProfile(newProfile)
    if (newProfile.platform) {
      setCasePlatform(newProfile.platform)
    }
  }

  // Orchestrate Backend API call with True Fact Binding
  const handleAnalyze = async (overrideNarrative?: string) => {
    const textToAnalyze = (overrideNarrative !== undefined ? overrideNarrative : narrative).trim()
    if (textToAnalyze && textToAnalyze !== narrative) {
      setNarrative(textToAnalyze)
    }

    const payload = {
      narrative: textToAnalyze || 'Dispute regarding account suspension.',
      platform: casePlatform || 'Bolt',
      notice_text: noticeText || 'Fare or payment dispute',
      evidence_held: evidenceHeld
    }

    const localReadinessPct = Math.min(100, Math.round((evidenceHeld.length / 3) * 100))
    const localReadinessRatio = localReadinessPct / 100

    let resData: any = null

    try {
      const configuredEndpoint = getApiUrl('/api/analyze')
      const endpoints = Array.from(new Set([
        configuredEndpoint,
        '/api/analyze',
        'http://localhost:8000/api/analyze'
      ]))

      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
          if (res.ok) {
            resData = await res.json()
            break
          }
        } catch {
          // Continue to next endpoint if network fails
        }
      }
    } catch (err) {
      console.warn('API call to /api/analyze failed, falling back to client extraction:', err)
    }

    // Bind analysis.entities directly from /api/analyze response if available
    if (resData) {
      setAnalysis((prev) => {
        const backendEntities = Array.isArray(resData.entities) ? resData.entities : []
        // Merge in OCR facts too
        const ocrEntities: EntityItem[] = ocrResult?.entities || []
        const baseEntities = backendEntities.length > 0 ? backendEntities : (prev.entities.length > 0 ? prev.entities : extractFallbackFacts(textToAnalyze))
        const seen = new Set<string>(baseEntities.map((e: EntityItem) => `${e.label}:${e.text.toLowerCase()}`))
        const mergedEntities = [...baseEntities, ...ocrEntities.filter((e) => !seen.has(`${e.label}:${e.text.toLowerCase()}`))]

        // Dynamic confidence: use backend value if real, otherwise compute from facts
        const rawConf = resData.classification?.confidence
        const dynamicConf = rawConf != null && rawConf > 0
          ? rawConf
          : computeDynamicConfidence(mergedEntities, caseTypeHistory, textToAnalyze.length)

        return {
          classification: {
            case_type: resData.classification?.case_type || prev.classification.case_type || 'fare_dispute',
            confidence: dynamicConf,
            needs_confirmation: resData.classification?.needs_confirmation ?? false
          },
          entities: mergedEntities,
          evidence: {
            readiness: resData.evidence?.readiness ?? localReadinessRatio,
            missing: Array.isArray(resData.evidence?.missing) ? resData.evidence.missing : [],
            optional: resData.evidence?.optional ?? []
          },
          appeal: {
            headline: resData.appeal?.headline || `Formal Appeal: ${casePlatform} Account Restriction`,
            body: resData.appeal?.body || '',
            policy_rules: resData.appeal?.policy_rules || ['NTSA-LN120-REG15', 'KDPA-2019-SEC26']
          }
        }
      })
    } else {
      // Client-Side Fallback: use OCR entities + regex extraction
      const regexEntities = extractFallbackFacts(textToAnalyze)
      const ocrEntities: EntityItem[] = ocrResult?.entities || []
      const seen = new Set<string>(regexEntities.map((e: EntityItem) => `${e.label}:${e.text.toLowerCase()}`))
      const fallbackEntities = [...regexEntities, ...ocrEntities.filter((e) => !seen.has(`${e.label}:${e.text.toLowerCase()}`))]

      // Auto-classify from OCR + narrative (no hardcoded type)
      let fallbackType = ocrResult?.detected_category || 'fare_dispute'
      if (!ocrResult || ocrResult.detected_category === 'unknown') {
        const lower = (textToAnalyze + ' ' + noticeText).toLowerCase()
        if (lower.includes('safe') || lower.includes('threat') || lower.includes('violat') || lower.includes('harass')) {
          fallbackType = 'passenger_safety'
        } else if (lower.includes('cancel') || lower.includes('rating') || lower.includes('star')) {
          fallbackType = 'rating_or_cancellation'
        } else if (lower.includes('fraud') || lower.includes('ident') || lower.includes('document')) {
          fallbackType = 'fraud_flag'
        }
      }

      // Dynamic confidence — computed, not hardcoded
      const dynamicConf = computeDynamicConfidence(fallbackEntities, [...caseTypeHistory, fallbackType], textToAnalyze.length)

      setAnalysis((prev) => ({
        classification: {
          case_type: fallbackType,
          confidence: dynamicConf,
          needs_confirmation: dynamicConf < 0.6
        },
        entities: fallbackEntities,
        evidence: {
          readiness: localReadinessRatio,
          missing: [
            { id: 'M_PESA_STATEMENT', reason: 'Proof of fare payment or transaction history.' }
          ],
          optional: ['IN_APP_CHAT_SCREENSHOT']
        },
        appeal: {
          headline: `Formal Appeal: ${casePlatform} Account Restriction (${formatCaseType(fallbackType)})`,
          body: '',
          policy_rules: ['NTSA-LN120-REG15', 'KDPA-2019-SEC26']
        }
      }))
    }
  }

  // Update entity pill text from user edit
  const handleUpdateEntity = (index: number, newText: string) => {
    setAnalysis((prev) => {
      const next = [...prev.entities]
      if (next[index]) {
        next[index] = { ...next[index], text: newText }
      }
      return { ...prev, entities: next }
    })
  }

  // Add new entity manually
  const handleAddEntity = (entity: EntityItem) => {
    setAnalysis((prev) => ({
      ...prev,
      entities: [...prev.entities, entity]
    }))
  }

  // Delete entity manually
  const handleDeleteEntity = (index: number) => {
    setAnalysis((prev) => {
      const next = [...prev.entities]
      next.splice(index, 1)
      return { ...prev, entities: next }
    })
  }

  // Override case type — also track in history for dynamic confidence
  const handleSelectCaseType = (t: string) => {
    setCaseTypeHistory((prev) => [...prev, t])
    setAnalysis((prev) => {
      // Keep real confidence if present and valid; otherwise compute dynamically from facts
      const currentConf = prev.classification.confidence
      const computed = computeDynamicConfidence(prev.entities, [...caseTypeHistory, t], narrative.length)
      const finalConf = currentConf != null && currentConf > 0 && currentConf < 1 ? currentConf : computed
      return {
        ...prev,
        classification: {
          ...prev.classification,
          case_type: t,
          confidence: finalConf,
          needs_confirmation: false
        }
      }
    })
  }

  // Save finalized dossier to IndexedDB (Task T25/T26)
  const handleSaveDossier = async () => {
    try {
      const caseRef = `SYD-APP-${new Date().getFullYear()}-${String((casesList[0]?.id || 0) + 1).padStart(4, '0')}`
      const synthesizedBody = formatFormalAppealBody({
        platform: casePlatform || 'Bolt',
        driverName: profile.name || 'Mwangi',
        driverPhone: profile.phone || '',
        caseRef,
        entities: analysis.entities as any,
        narrative,
        evidenceHeld: evidenceHeld as any
      })

      await saveCase({
        platform: casePlatform || 'Bolt',
        case_type: analysis.classification.case_type || 'fare_dispute',
        status: 'Awaiting Platform Reply',
        created_at: new Date().toISOString(),
        narrative: narrative || 'Driver dispute submission.',
        evidence_held: evidenceHeld,
        appeal_dossier: {
          headline: analysis.appeal.headline || `Formal Appeal: ${casePlatform} Account Restriction`,
          statement_body: synthesizedBody,
          policy_rules: analysis.appeal.policy_rules
        }
      })
      await refreshCases()
    } catch (err) {
      console.error('Failed to save case dossier to IndexedDB:', err)
    }
  }

  // Update status of an existing case in IndexedDB (Screen 7)
  const handleUpdateCaseStatus = async (caseId: number, newStatus: string) => {
    try {
      await updateCaseStatus(caseId, newStatus)
      await refreshCases()
    } catch (err) {
      console.error('Failed to update case status in db:', err)
    }
  }

  const activeCaseRecord = casesList.length > 0 ? casesList[0] : null

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Hidden File Input for Screen 2 Upload & Screen 3 Paperclip */}
      <input
        type="file"
        accept="image/*,application/pdf"
        id="notice-upload"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Responsive Root Container (Laptop View: max-w-6xl fluid responsive grid) */}
      <div className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col bg-[#F8FAFC] shadow-xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl md:grid md:grid-cols-12 md:gap-8 md:p-8 md:items-start md:shadow-none md:bg-transparent">
        {/* Persistent Brand Sidebar (Screens >= 768px) */}
        <aside className="hidden md:flex md:col-span-4 lg:col-span-4 flex-col gap-5 sticky top-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          {/* Brand header */}
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-[#1E5E3A] text-white shadow-md shadow-[#1E5E3A]/20">
              <Scale size={24} />
            </div>
            <div>
              <p className="text-lg font-black text-[#0F172A]">Sauti ya Dere</p>
              <p className="text-xs text-slate-500">Your voice. Your evidence.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#B9DCC6] bg-[#F1F9F3] p-4 text-xs leading-5 text-[#1E5E3A]">
            <b>100% On-Device Privacy</b>
            <p className="mt-1 text-slate-600">
              Personal narratives, audio recordings, and evidence files never leave this device.
            </p>
          </div>

          {/* Quick Actions & Navigation */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Navigation</p>
            <button
              onClick={startNewCase}
              className="flex min-h-11 items-center gap-2.5 rounded-xl bg-[#1E5E3A] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#174A2E] transition"
            >
              <Plus size={16} /> Start New Appeal
            </button>
            <button
              onClick={() => go(7)}
              className={`flex min-h-11 items-center gap-2.5 rounded-xl px-4 text-xs font-bold transition ${
                screen === 7 ? 'bg-[#E9F3ED] text-[#1E5E3A]' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <FileText size={16} /> My Case Log ({casesList.length})
            </button>
            <button
              onClick={() => go(1)}
              className={`flex min-h-11 items-center gap-2.5 rounded-xl px-4 text-xs font-bold transition ${
                screen === 1 ? 'bg-[#E9F3ED] text-[#1E5E3A]' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ShieldCheck size={16} /> Driver Profile
            </button>
            <button
              onClick={() => setShowGuide(true)}
              className="flex min-h-11 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              <HelpCircle size={16} className="text-[#1E5E3A]" /> Driver Rights &amp; Guide
            </button>
            <button
              onClick={() => go(8)}
              className={`flex min-h-11 items-center gap-2.5 rounded-xl px-4 text-xs font-bold transition ${
                screen === 8 ? 'bg-[#E9F3ED] text-[#1E5E3A]' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Bell size={16} /> Give Feedback
            </button>
            <button
              onClick={handleClearAllData}
              className="flex min-h-11 items-center gap-2.5 rounded-xl px-4 text-xs font-bold text-red-600 hover:bg-red-50 transition"
            >
              <X size={16} /> Privacy &amp; Clear Data
            </button>
          </div>

          {/* Statutory Support Card */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <p className="font-extrabold text-[#0F172A]">NTSA Legal Notice 120</p>
            <p className="mt-1 leading-5 text-slate-500">
              Reg. 15 provides a 30-day statutory resolution window for transport platform deactivations.
            </p>
            <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3">
              <a
                href="tel:+254700000000"
                className="flex items-center gap-2 font-bold text-[#1E5E3A] hover:underline"
              >
                <Phone size={14} /> Call TAWU Dispute Hotline
              </a>
              <a
                href="mailto:info@twu.or.ke?subject=Formal%20Dispute%20Dossier%20-%20Sauti%20ya%20Dere"
                className="flex items-center gap-2 font-bold text-[#1E5E3A] hover:underline"
              >
                <Send size={14} /> Email TAWU-Kenya Union
              </a>
            </div>
          </div>
        </aside>

        {/* Wizard Main Column (Right on Desktop, Full Width on Mobile) */}
        <div className="col-span-12 md:col-span-8 lg:col-span-8 flex flex-col min-h-screen md:min-h-[640px] w-full bg-[#F8FAFC] md:bg-white md:rounded-3xl md:border md:border-slate-200 md:shadow-lg md:overflow-hidden">
          <div className="flex-1 flex flex-col">
            {screen === 0 && <Splash go={go} activeCase={activeCaseRecord} />}
            {screen === 1 && (
              <Profile
                go={go}
                profile={profile}
                onSave={handleSaveProfile}
                activeCase={activeCaseRecord}
              />
            )}
            {screen === 2 && (
              <Intake
                go={go}
                menu={menu}
                platform={casePlatform}
                onChangePlatform={setCasePlatform}
                onTriggerUpload={triggerFileUpload}
                attachedFileName={attachedFileName}
                ocrResult={ocrResult}
                ocrLoading={ocrLoading}
                pasteNoticeText={pasteNoticeText}
                onChangePasteNotice={setPasteNoticeText}
                onAdvance={() => {
                  if (pasteNoticeText.trim() || attachedFileName) {
                    setEvidenceHeld((prev) => {
                      const next = prev.includes('SUSPENSION_NOTICE') ? prev : [...prev, 'SUSPENSION_NOTICE']
                      const nextReadiness = Math.min(100, Math.round((next.length / 3) * 100)) / 100
                      setAnalysis((a) => ({
                        ...a,
                        evidence: {
                          ...a.evidence,
                          readiness_score: nextReadiness
                        }
                      }))
                      return next
                    })
                  }
                  go(3)
                }}
                onAnalyzePasteText={async () => {
                  if (!pasteNoticeText.trim()) return
                  setEvidenceHeld((prev) => {
                    const next = prev.includes('SUSPENSION_NOTICE') ? prev : [...prev, 'SUSPENSION_NOTICE']
                    const nextReadiness = Math.min(100, Math.round((next.length / 3) * 100)) / 100
                    setAnalysis((a) => ({
                      ...a,
                      evidence: {
                        ...a.evidence,
                        readiness_score: nextReadiness
                      }
                    }))
                    return next
                  })
                  const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || ''
                  if (apiKey) {
                    setOcrLoading(true)
                    try {
                      const result = await analyzeNoticeText(pasteNoticeText, apiKey)
                      if (result) {
                        setOcrResult(result)
                        if (result.detected_category && result.detected_category !== 'unknown') {
                          const catMap: Record<string, string> = {
                            fare_dispute: 'Fare or payment dispute',
                            passenger_safety: 'Safety violation allegation',
                            rating_or_cancellation: 'Cancellation or rating drop',
                            fraud_flag: 'Account or identity flag'
                          }
                          if (catMap[result.detected_category]) setNoticeText(catMap[result.detected_category])
                        }
                        if (result.entities?.length > 0) {
                          setAnalysis((a) => ({
                            ...a,
                            entities: [
                              ...a.entities,
                              ...result.entities.filter((ne) => !a.entities.some((e) => e.label === ne.label && e.text === ne.text))
                            ]
                          }))
                        }
                      }
                    } finally {
                      setOcrLoading(false)
                    }
                  }
                }}
                activeCase={activeCaseRecord}
              />
            )}
            {screen === 3 && (
              <Chat
                go={go}
                menu={menu}
                platform={casePlatform}
                noticeText={noticeText}
                narrative={narrative}
                onChangeNarrative={setNarrative}
                entities={analysis.entities}
                onSetEntities={(newEntities) =>
                  setAnalysis((prev) => ({
                    ...prev,
                    entities: newEntities
                  }))
                }
                onSelectCaseType={handleSelectCaseType}
                onUpdateConfidence={(confidence) => {
                  setAnalysis((prev) => ({
                    ...prev,
                    classification: {
                      ...prev.classification,
                      confidence
                    }
                  }))
                  setCaseTypeHistory((prev) => [...prev])
                }}
                evidenceHeld={evidenceHeld}
                ocrFacts={ocrResult?.entities || []}
                onTriggerUpload={triggerFileUpload}
                attachedFileName={attachedFileName}
                activeCase={activeCaseRecord}
                messages={chatMessages}
                onSetMessages={setChatMessages}
                language={chatLanguage}
                onSetLanguage={setChatLanguage}
              />
            )}
            {screen === 4 && (
              <Verify
                go={go}
                menu={menu}
                analysis={analysis}
                onUpdateEntity={handleUpdateEntity}
                onAddEntity={handleAddEntity}
                onDeleteEntity={handleDeleteEntity}
                onSelectCaseType={handleSelectCaseType}
                activeCase={activeCaseRecord}
              />
            )}
            {screen === 5 && (
              <Evidence
                go={go}
                menu={menu}
                analysis={analysis}
                evidenceHeld={evidenceHeld}
                onTriggerUpload={triggerFileUpload}
                onRemoveEvidence={handleRemoveEvidence}
                activeCase={activeCaseRecord}
              />
            )}
            {screen === 6 && (
              <Preview
                go={go}
                menu={menu}
                analysis={analysis}
                platform={casePlatform}
                profile={profile}
                narrative={narrative}
                evidenceHeld={evidenceHeld}
                onSaveDossier={handleSaveDossier}
                activeCase={activeCaseRecord}
              />
            )}
            {screen === 7 && (
              <Log
                go={go}
                menu={menu}
                cases={casesList}
                onStartNewCase={startNewCase}
                activeCase={activeCaseRecord}
                onUpdateCaseStatus={handleUpdateCaseStatus}
                onSaveCurrentDraft={handleSaveDossier}
              />
            )}
            {screen === 8 && <Feedback go={go} menu={menu} activeCase={activeCaseRecord} />}
          </div>
        </div>
      </div>
      {drawer && (
        <Drawer
          close={() => setDrawer(false)}
          go={go}
          profile={profile}
          onStartNewCase={startNewCase}
          onClearAllData={handleClearAllData}
          onOpenGuide={() => setShowGuide(true)}
          appealText={formatFormalAppealBody({
            platform: casePlatform,
            driverName: profile.name,
            driverPhone: profile.phone,
            entities: analysis.entities as any,
            narrative,
            evidenceHeld: evidenceHeld as any
          })}
        />
      )}
      <GuideModal isOpen={showGuide} onClose={() => setShowGuide(false)} />
    </main>
  )
}
