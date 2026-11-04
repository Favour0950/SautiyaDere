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
  Plus
} from 'lucide-react'
import {
  getLocalProfile,
  saveLocalProfile,
  saveCase,
  getAllCases
} from '../../db/db.js'
import { generateAppealPdf } from '../../utils/pdfGenerator.js'
import { getApiUrl } from '../../config.js'

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
 * Client-Side Fallback Extraction (Demo-Safe):
 * Extracts TIME, ROUTE/LOCATIONS, and FARE if the backend API is unreachable or returns empty facts.
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
  const dateRegex = /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\b/gi
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
    <>
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
    </>
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

/* Screen 1: Profile (Task T25 integration) */
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

  useEffect(() => {
    setName(profile.name || '')
    setPhone(profile.phone || '')
    setPlatform(profile.platform || 'Bolt')
  }, [profile])

  const handleSubmit = async () => {
    setSaving(true)
    try {
      await onSave({ name, phone, platform })
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
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-[#1E5E3A]"
            placeholder="e.g. 0712 345 678 (for timeline reminders)"
          />
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
          <Btn onClick={handleSubmit} disabled={saving}>
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
  noticeText,
  onChangePlatform,
  onChangeNotice,
  onTriggerUpload,
  attachedFileName,
  activeCase
}: {
  go: (n: number) => void
  menu: () => void
  platform: string
  noticeText: string
  onChangePlatform: (p: string) => void
  onChangeNotice: (n: string) => void
  onTriggerUpload: () => void
  attachedFileName: string | null
  activeCase?: CaseRecord | null
}) {
  return (
    <>
      <Header step={steps[0]} onMenu={menu} onBack={() => go(1)} activeCase={activeCase} />
      <main className="flex flex-1 flex-col gap-5 px-5 py-6">
        <div>
          <h1 className="text-2xl font-black">Let&apos;s protect your work.</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Tell us what happened so we can build a verified appeal.</p>
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
        <Select
          label="What reason did they give?"
          value={noticeText}
          onChange={(e) => onChangeNotice(e.target.value)}
        >
          <option value="Fare or payment dispute">Fare or payment dispute</option>
          <option value="Safety violation allegation">Safety violation allegation</option>
          <option value="Cancellation or rating drop">Cancellation or rating drop</option>
          <option value="Account or identity flag">Account or identity flag</option>
          <option value="I don't know / Notice was vague or gave no details">
            I don&apos;t know / Notice was vague or gave no details
          </option>
        </Select>
        <div
          onClick={onTriggerUpload}
          className="flex flex-col gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-4 cursor-pointer hover:border-[#1E5E3A] transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <b className="text-sm">Upload Suspension Notice Screenshot</b>
              <p className="mt-1 text-xs text-slate-500">Attach the deactivation message</p>
            </div>
            <button
              type="button"
              aria-label="Upload notice"
              className="flex size-12 items-center justify-center rounded-xl bg-[#E9F3ED] text-[#1E5E3A] hover:bg-[#D5EADB]"
            >
              <Upload />
            </button>
          </div>
          {attachedFileName && (
            <div className="mt-2 flex items-center gap-1.5 rounded-full bg-[#E9F3ED] px-3 py-1 text-xs font-bold text-[#1E5E3A] border border-[#B9DCC6] w-fit">
              <span>📎 {attachedFileName} attached</span>
              <Check size={14} className="text-[#1E5E3A]" />
            </div>
          )}
        </div>
        <Trust />
        <div className="mt-auto">
          <Btn onClick={() => go(3)}>
            Start Guided Appeal <ArrowRight />
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 3: Chat / Story Input (Task T26 & Audio/File Placeholders) */
function Chat({
  go,
  menu,
  narrative,
  onChangeNarrative,
  onAnalyze,
  evidenceHeld,
  onTriggerUpload,
  attachedFileName,
  activeCase
}: {
  go: (n: number) => void
  menu: () => void
  narrative: string
  onChangeNarrative: (text: string) => void
  onAnalyze: (customNarrative?: string) => Promise<void>
  evidenceHeld: string[]
  onTriggerUpload: () => void
  attachedFileName: string | null
  activeCase?: CaseRecord | null
}) {
  const [driverInput, setDriverInput] = useState(narrative || '')
  const [processing, setProcessing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  const review = async () => {
    const textToAnalyze = driverInput.trim()
    onChangeNarrative(textToAnalyze)
    setProcessing(true)
    try {
      await onAnalyze(textToAnalyze)
      go(4)
    } finally {
      setProcessing(false)
    }
  }

  const handleMicClick = () => {
    if (isRecording) return
    setIsRecording(true)
    setTimeout(() => {
      const sampleStatement =
        'On 14 May around 4:30pm from Westlands to JKIA, the passenger said the fare of KSh 1,250 was too high and threatened to report me. The trip was completed normally and M-Pesa payment was received.'
      setDriverInput(sampleStatement)
      onChangeNarrative(sampleStatement)
      setIsRecording(false)
    }, 3000)
  }

  return (
    <>
      <Header step={steps[1]} onMenu={menu} onBack={() => go(2)} activeCase={activeCase} />
      <main className="flex flex-1 flex-col px-5 py-5">
        <div className="mb-4 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-[#E9F3ED] text-[#1E5E3A]">
              <Scale size={15} />
            </div>
            <span className="font-bold text-slate-700">DereBot • Plain English Guidance</span>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
            Step 2 of 5
          </span>
        </div>

        {/* Conversation and narrative display */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-3">
          <div className="flex items-start gap-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#E9F3ED] text-[#1E5E3A] mt-0.5">
              <Scale size={13} />
            </div>
            <div className="max-w-[290px] rounded-2xl rounded-tl-sm bg-[#EEF2F4] p-3.5 text-xs leading-5 text-slate-800">
              Tell me what happened in your own words. Mention:
              <ul className="mt-1 list-disc pl-4 space-y-0.5 text-slate-600">
                <li>When the trip occurred (date &amp; time)</li>
                <li>Pickup and destination locations</li>
                <li>What caused the dispute or account flag</li>
              </ul>
            </div>
          </div>

          {driverInput.trim() && (
            <div className="self-end max-w-[290px] rounded-2xl rounded-tr-sm bg-[#1E5E3A] p-3.5 text-xs leading-5 text-white shadow-xs">
              <p className="whitespace-pre-wrap">{driverInput}</p>
            </div>
          )}
        </div>

        {/* Dynamic Story Input Area */}
        <div className="flex flex-col gap-2">
          {attachedFileName && (
            <div className="flex items-center gap-1.5 rounded-full bg-[#E9F3ED] px-3 py-1 text-xs font-bold text-[#1E5E3A] border border-[#B9DCC6] w-fit">
              <span>📎 {attachedFileName} attached</span>
              <Check size={14} className="text-[#1E5E3A]" />
            </div>
          )}

          {isRecording && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs font-bold text-red-600 animate-pulse">
              <div className="size-2 rounded-full bg-red-600 animate-ping" />
              <span>🎙️ Recording audio (3s)... DereBot listening to your account...</span>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs focus-within:border-[#1E5E3A] focus-within:ring-1 focus-within:ring-[#1E5E3A]">
            <textarea
              value={driverInput}
              onChange={(e) => {
                setDriverInput(e.target.value)
                onChangeNarrative(e.target.value)
              }}
              placeholder="Type your story here (e.g., On 14 May around 4:30pm from Westlands to JKIA, passenger said the fare was too high...)"
              rows={4}
              className="w-full resize-none bg-transparent text-xs leading-5 text-[#0F172A] placeholder-slate-400 outline-none"
            />
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400">
              <span>{driverInput.trim().length} characters</span>
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
            >
              <Mic size={18} />
            </button>
            <button
              type="button"
              onClick={review}
              disabled={processing || isRecording || !driverInput.trim()}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-xs font-extrabold transition ${
                !driverInput.trim() || isRecording
                  ? 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-[#1E5E3A] text-white hover:bg-[#174A2E] shadow-xs'
              }`}
            >
              {processing ? 'Analyzing…' : 'Review Extracted Facts'} {!processing && <ArrowRight size={14} />}
            </button>
          </div>
        </div>

        {processing && (
          <p className="mt-3 rounded-xl bg-[#FFF7ED] p-2.5 text-center text-xs font-bold text-[#A34F00]">
            🛡️ Removing phone numbers &amp; analyzing trip details...
          </p>
        )}
      </main>
      <Footer />
    </>
  )
}

/* Screen 4: Verify (Task T26 & Dynamic Facts Update) */
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

        {/* Extracted Facts with Empty-State & Add Fact */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">
              Extracted facts · click pencil to edit
            </p>
            <button
              onClick={() => setIsAddingFact(!isAddingFact)}
              className="flex items-center gap-1 text-xs font-bold text-[#1E5E3A] hover:underline"
            >
              <Plus size={14} /> Add Fact
            </button>
          </div>

          {analysis.entities.length === 0 ? (
            <p className="text-xs text-slate-500">
              No trip facts detected yet. Click &apos;+ Add Fact&apos; to add date, time, route, or fare.
            </p>
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
                <option value="LOCATION">LOCATION</option>
                <option value="FARE">FARE</option>
              </select>
              <input
                type="text"
                value={newFactText}
                onChange={(e) => setNewFactText(e.target.value)}
                placeholder="Fact detail..."
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

/* Screen 5: Evidence (Task T26 integration) */
function Evidence({
  go,
  menu,
  analysis,
  evidenceHeld,
  activeCase
}: {
  go: (n: number) => void
  menu: () => void
  analysis: AnalysisResult
  evidenceHeld: string[]
  activeCase?: CaseRecord | null
}) {
  const readiness = analysis.evidence.readiness ?? 0.6
  const readinessPct = Math.round(readiness * 100)
  const readinessLabel = readiness >= 0.8 ? 'Strong' : readiness >= 0.5 ? 'Moderate' : 'Low'

  return (
    <>
      <Header step={steps[3]} onMenu={menu} onBack={() => go(4)} activeCase={activeCase} />
      <main className="flex flex-1 flex-col gap-5 px-5 py-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">Evidence readiness</p>
            <h1 className="mt-2 text-2xl font-black">Almost complete</h1>
          </div>
          <b className="text-sm text-[#1E5E3A]">
            Evidence Readiness: {readinessPct}% ({readinessLabel})
          </b>
        </div>
        <div>
          <div className="h-2 rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[#1E5E3A] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(5, readinessPct))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">Strong evidence makes a faster, fairer review.</p>
        </div>

        <div className="flex flex-col gap-3">
          {/* Held evidence list */}
          {evidenceHeld.map((key) => {
            const friendlyName = key
              .replace(/_SCREENSHOT|_STATEMENT|_NOTICE|_LOG/g, '')
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase())
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded-xl border border-[#B9DCC6] bg-white p-4"
              >
                <div className="flex size-9 items-center justify-center rounded-full bg-[#E9F3ED] text-[#1E5E3A]">
                  <Check />
                </div>
                <div className="flex-1">
                  <b className="text-sm">{friendlyName}</b>
                  <p className="text-xs text-slate-500">Attached from your phone</p>
                </div>
                <span className="text-xs font-black text-[#1E5E3A]">Added</span>
              </div>
            )
          })}

          {/* Missing items from backend / gap checker */}
          {analysis.evidence.missing.map((item) => {
            const friendlyName = item.id
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase())
            return (
              <div
                key={item.id}
                className="rounded-xl border-l-4 border-[#D97706] bg-[#FFF7ED] p-4"
              >
                <b className="text-sm">{friendlyName}</b>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.reason}</p>
                <button className="mt-3 flex min-h-10 items-center gap-2 text-xs font-black text-[#A34F00] hover:underline">
                  <Upload size={14} /> + Add {friendlyName} / Screenshot
                </button>
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

/* Screen 6: Preview & Dossier Persistence (Task T26 & T35 integration) */
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

  const headline =
    analysis.appeal.headline ||
    `Appeal against account restriction: ${platform} Dispute`

  const bodyText =
    analysis.appeal.body ||
    (narrative.trim()
      ? `Dear ${platform} Driver Support,\n\nI am writing to formally appeal the restriction placed on my driver account regarding the following incident:\n\n"${narrative.trim()}"\n\nPlease review the attached evidence and the facts recorded on my device. In accordance with NTSA Legal Notice 120 Regulation 15 and Kenya Data Protection Act 2019 Section 26, I respectfully request a fair hearing and prompt resolution within the 30-day statutory timeline.\n\nKind regards,\n${profile.name || 'Authorized Driver'}`
      : `Dear ${platform} Driver Support,\n\nI am writing to formally appeal the restriction placed on my driver account. Please review my account records and attached corroborating evidence in accordance with NTSA Legal Notice 120 Regulation 15.\n\nKind regards,\n${profile.name || 'Authorized Driver'}`)

  const mailtoBody = `${headline}\n\n${bodyText}\n\nAttached Evidence:\n${evidenceHeld.join(', ')}\n\nDriver: ${profile.name || 'Mwangi'} (${profile.phone || ''})`
  const mailtoUrl = `mailto:info@twu.or.ke?subject=${encodeURIComponent(
    `Formal Dispute Dossier - Sauti ya Dere - ${platform}`
  )}&body=${encodeURIComponent(mailtoBody)}`

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
        <article className="flex-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">TO</p>
              <b className="text-sm">{platform} Driver Support</b>
            </div>
            <FileText className="text-[#1E5E3A]" />
          </div>
          <h3 className="mb-3 text-sm font-extrabold text-[#0F172A]">{headline}</h3>
          <p className="whitespace-pre-line text-sm leading-6 text-slate-700">{bodyText}</p>
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
          href={mailtoUrl}
          onClick={handleFinalSave}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-[#1E5E3A] hover:bg-slate-50 transition active:scale-[.98]"
        >
          <Send size={16} /> Forward to TAWU-Kenya <ArrowRight size={16} />
        </a>
        <Btn onClick={handleFinalSave} disabled={submitting}>
          {submitting ? 'Saving to Device...' : 'Save to Case Log & Exit'}
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
  activeCase
}: {
  go: (n: number) => void
  menu: () => void
  cases: CaseRecord[]
  onStartNewCase: () => void
  activeCase?: CaseRecord | null
}) {
  return (
    <>
      <Header onMenu={menu} activeCase={activeCase} />
      <main className="flex flex-1 flex-col gap-5 px-5 py-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">Your offline case log</p>
          <h1 className="mt-2 text-2xl font-black">Case &amp; timeline</h1>
        </div>

        {cases.length > 0 ? (
          cases.map((c, index) => {
            const elapsedDays = c.created_at
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
                    {c.status || 'Awaiting Platform Reply'}
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
                    <b className="text-lg text-[#FBBF24]">{countdownDays} days left</b>
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            <Scale className="mx-auto mb-2 text-slate-400" size={32} />
            <b className="text-sm text-slate-700">No cases saved yet</b>
            <p className="mt-1 text-xs">Start a new appeal to generate and track a dispute dossier on this phone.</p>
          </div>
        )}

        <div className="rounded-xl border border-[#F2C78F] bg-[#FFF7ED] p-4 text-sm leading-5 text-slate-600">
          <b className="text-[#0F172A]">Statutory response window</b>
          <br />
          Under NTSA Legal Notice 120, the platform should respond within 30 days.
        </div>

        <section>
          <h2 className="mb-3 text-sm font-black">Timeline Protocol</h2>
          <div className="flex flex-col gap-4 border-l-2 border-[#CDE5D4] pl-4">
            <div>
              <p className="text-xs font-black text-[#1E5E3A]">Step 1 · Completed</p>
              <p className="mt-1 text-sm text-slate-600">Appeal dossier generated &amp; saved on device</p>
            </div>
            <div>
              <p className="text-xs font-black text-slate-400">Step 2 · In Progress</p>
              <p className="mt-1 text-sm text-slate-600">Submit copy to platform driver dispute channel</p>
            </div>
            <div>
              <p className="text-xs font-black text-slate-400">Step 3 · Due in 30 Days</p>
              <p className="mt-1 text-sm text-slate-600">Escalate to TAWU if platform fails to respond</p>
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
  const [submittingFeedback, setSubmittingFeedback] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)

  const handleSubmitFeedback = () => {
    setSubmittingFeedback(true)
    setTimeout(() => {
      setSubmittingFeedback(false)
      setFeedbackSubmitted(true)
      setTimeout(() => {
        go(7)
      }, 1000)
    }, 1200)
  }

  return (
    <>
      <Header onMenu={menu} onBack={() => go(7)} activeCase={activeCase} />
      <main className="flex flex-1 flex-col gap-6 px-5 py-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">Help us improve</p>
          <h1 className="mt-2 text-2xl font-black">Give us your feedback</h1>
        </div>
        <fieldset>
          <legend className="mb-3 text-sm font-bold">How would you rate Sauti ya Dere?</legend>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} stars`}
                className="flex size-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl text-[#D97706]"
              >
                ★
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-2 text-sm font-bold">
          Your thoughts
          <textarea
            className="min-h-32 rounded-xl border border-slate-200 bg-white p-4 font-normal outline-none focus:border-[#1E5E3A]"
            placeholder="Tell us how Sauti ya Dere worked for you or report an issue."
          />
          <span className="text-xs font-normal text-slate-500">Sends directly to team at sautiyadere@gmail.com</span>
        </label>
        <div className="rounded-xl bg-white p-4 text-sm text-slate-600 flex flex-col gap-3">
          <a
            href="mailto:sautiyadere@gmail.com"
            className="flex items-center gap-2 hover:underline"
          >
            <Send className="text-[#1E5E3A]" size={16} /> Email: sautiyadere@gmail.com
          </a>
          <a
            href="tel:+254700000000"
            className="flex items-center gap-2 font-bold text-[#1E5E3A] hover:underline"
          >
            <Phone className="text-[#1E5E3A]" size={16} /> Call TAWU Dispute Hotline (+254 700 000 000)
          </a>
        </div>
        <div className="mt-auto">
          <Btn
            onClick={handleSubmitFeedback}
            disabled={submittingFeedback || feedbackSubmitted}
          >
            {feedbackSubmitted
              ? '✓ Feedback Submitted to Team Sonic!'
              : submittingFeedback
              ? 'Submitting Feedback...'
              : 'Submit Feedback'}
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Slide-out Drawer */
function Drawer({
  close,
  go,
  profile,
  onStartNewCase
}: {
  close: () => void
  go: (n: number) => void
  profile: ProfileData
  onStartNewCase: () => void
}) {
  return (
    <div className="fixed inset-0 z-40 bg-[#0F172A]/40">
      <aside className="ml-auto min-h-full w-[min(310px,85vw)] bg-white p-5 shadow-2xl flex flex-col">
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
          <button aria-label="Close menu" onClick={close}>
            <X />
          </button>
        </div>
        <nav className="flex flex-col gap-2 py-5">
          {[
            ['📋', 'Active Appeal / Start New', 2],
            ['📁', 'My Case Log & History', 7],
            ['👤', 'Driver Profile Settings', 1],
            ['🔔', 'In-App Notifications · 1', 7],
            ['📞', 'TAWU-Kenya Union Help', 7],
            ['💬', 'Give Feedback', 8],
            ['🛡️', 'Privacy & Clear Local Data', 0]
          ].map(([icon, label, screenNum]) => (
            <button
              key={label as string}
              onClick={() => {
                if (label === 'Active Appeal / Start New') {
                  onStartNewCase()
                } else {
                  go(screenNum as number)
                }
                close()
              }}
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-[#F1F9F3]"
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto">
          <a
            href="tel:+254700000000"
            className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-[#E9F3ED] p-3 text-xs font-bold text-[#1E5E3A] hover:bg-[#D5EADB]"
          >
            <Phone size={14} /> Call TAWU Hotline (+254 700 000 000)
          </a>
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

  // 1. Driver Profile State (Task T25)
  const [profile, setProfile] = useState<ProfileData>({
    name: '',
    phone: '',
    platform: 'Bolt'
  })

  // 2. Active Case State
  const [casePlatform, setCasePlatform] = useState('Bolt')
  const [noticeText, setNoticeText] = useState('Fare or payment dispute')
  const [narrative, setNarrative] = useState('')
  const [evidenceHeld, setEvidenceHeld] = useState<string[]>([
    'SUSPENSION_NOTICE',
    'TRIP_RECEIPT_SCREENSHOT'
  ])
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null)

  // 3. Analysis Result from Backend (Task T24/T26 & Dynamic Update)
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

  // Case Reset Handler ("Start Another Case" & Drawer "Active Appeal / Start New")
  const startNewCase = () => {
    setNarrative('')
    setNoticeText('Fare or payment dispute')
    setAttachedFileName(null)
    setEvidenceHeld([
      'SUSPENSION_NOTICE',
      'TRIP_RECEIPT_SCREENSHOT'
    ])
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

  // Working File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAttachedFileName(file.name)
      const docKey = screen === 2 ? 'SUSPENSION_NOTICE' : 'TRIP_RECEIPT_SCREENSHOT'
      setEvidenceHeld((prev) => (prev.includes(docKey) ? prev : [...prev, docKey]))
    }
  }

  const triggerFileUpload = () => {
    const el = document.getElementById('notice-upload') as HTMLInputElement | null
    if (el) {
      el.value = ''
      el.click()
    }
  }

  // Save profile to IndexedDB
  const handleSaveProfile = async (newProfile: ProfileData) => {
    await saveLocalProfile(newProfile)
    setProfile(newProfile)
    if (newProfile.platform) {
      setCasePlatform(newProfile.platform)
    }
  }

  // Orchestrate Backend API call with Client-Side Fallback Extraction (Demo-Safe)
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

    // Local readiness calculation: Math.min(100, Math.round((evidenceHeld.length / 3) * 100))
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

    // If API responded with entities, use backend data; otherwise, run client-side regex fallback
    if (resData && Array.isArray(resData.entities) && resData.entities.length > 0) {
      setAnalysis({
        classification: {
          case_type: resData.classification?.case_type || 'fare_dispute',
          confidence: resData.classification?.confidence ?? 0.9,
          needs_confirmation: resData.classification?.needs_confirmation ?? false
        },
        entities: resData.entities,
        evidence: {
          readiness: resData.evidence?.readiness ?? localReadinessRatio,
          missing: Array.isArray(resData.evidence?.missing) ? resData.evidence.missing : [],
          optional: resData.evidence?.optional ?? []
        },
        appeal: {
          headline: resData.appeal?.headline || `Appeal against account restriction: ${casePlatform} Dispute`,
          body: resData.appeal?.body || (textToAnalyze ? `Dear ${casePlatform} Driver Support,\n\nI am writing to formally appeal the restriction placed on my driver account regarding the following incident:\n\n"${textToAnalyze}"\n\nPlease review the attached evidence (${evidenceHeld.join(', ')}) and the facts recorded on my device. In accordance with NTSA Legal Notice 120 Regulation 15 and Kenya Data Protection Act 2019 Section 26, I respectfully request a fair hearing and prompt resolution within the 30-day statutory timeline.\n\nKind regards,\n${profile.name || 'Authorized Driver'}` : ''),
          policy_rules: resData.appeal?.policy_rules || ['NTSA-LN120-REG15', 'KDPA-2019-SEC26']
        }
      })
    } else {
      // Client-Side Regex Fallback Extraction
      const fallbackEntities = extractFallbackFacts(textToAnalyze)

      // Guess classification from notice text or narrative keywords
      let fallbackType = 'fare_dispute'
      const lower = (textToAnalyze + ' ' + noticeText).toLowerCase()
      if (lower.includes('safe') || lower.includes('threat') || lower.includes('violat') || lower.includes('harass')) {
        fallbackType = 'passenger_safety'
      } else if (lower.includes('cancel') || lower.includes('rating') || lower.includes('star')) {
        fallbackType = 'rating_or_cancellation'
      } else if (lower.includes('fraud') || lower.includes('ident') || lower.includes('document')) {
        fallbackType = 'fraud_flag'
      }

      setAnalysis((prev) => ({
        classification: {
          case_type: resData?.classification?.case_type || fallbackType,
          confidence: resData?.classification?.confidence ?? 0.88,
          needs_confirmation: false
        },
        entities: (resData?.entities && resData.entities.length > 0) ? resData.entities : fallbackEntities,
        evidence: {
          readiness: resData?.evidence?.readiness ?? localReadinessRatio,
          missing: resData?.evidence?.missing?.length ? resData.evidence.missing : [
            { id: 'M_PESA_STATEMENT', reason: 'Proof of fare payment or lack thereof corroborates driver account.' }
          ],
          optional: resData?.evidence?.optional || ['IN_APP_CHAT_SCREENSHOT']
        },
        appeal: {
          headline: resData?.appeal?.headline || `Formal Appeal: ${casePlatform} Account Restriction (${formatCaseType(fallbackType)})`,
          body: resData?.appeal?.body || (textToAnalyze ? `Dear ${casePlatform} Driver Support,\n\nI am writing to formally appeal the restriction placed on my driver account regarding the following incident:\n\n"${textToAnalyze}"\n\nPlease review the attached evidence (${evidenceHeld.join(', ')}) and the facts recorded on my device. In accordance with NTSA Legal Notice 120 Regulation 15 and Kenya Data Protection Act 2019 Section 26, I respectfully request a fair hearing and prompt resolution within the 30-day statutory timeline.\n\nKind regards,\n${profile.name || 'Authorized Driver'}\n${profile.phone || ''}` : ''),
          policy_rules: resData?.appeal?.policy_rules?.length ? resData.appeal.policy_rules : ['NTSA-LN120-REG15', 'KDPA-2019-SEC26']
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

  // Override case type
  const handleSelectCaseType = (t: string) => {
    setAnalysis((prev) => ({
      ...prev,
      classification: {
        ...prev.classification,
        case_type: t,
        confidence: prev.classification.confidence ?? 1.0,
        needs_confirmation: false
      }
    }))
  }

  // Save finalized dossier to IndexedDB (Task T25/T26)
  const handleSaveDossier = async () => {
    try {
      await saveCase({
        platform: casePlatform || 'Bolt',
        case_type: analysis.classification.case_type || 'fare_dispute',
        status: 'Awaiting Platform Reply',
        created_at: new Date().toISOString(),
        narrative: narrative || 'Driver dispute submission.',
        evidence_held: evidenceHeld,
        appeal_dossier: {
          headline: analysis.appeal.headline || `Appeal: ${casePlatform} Dispute`,
          statement_body: analysis.appeal.body || narrative || 'Appeal statement body',
          policy_rules: analysis.appeal.policy_rules
        }
      })
      await refreshCases()
    } catch (err) {
      console.error('Failed to save case dossier to IndexedDB:', err)
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

      {/* Responsive Root Container (Laptop View: max-w-4xl md:grid md:grid-cols-12 md:gap-8 md:p-8 md:items-start) */}
      <div className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col bg-[#F8FAFC] shadow-xl md:max-w-4xl md:grid md:grid-cols-12 md:gap-8 md:p-8 md:items-start md:shadow-none md:bg-transparent">
        {/* Persistent Brand Sidebar (Screens >= 768px) */}
        <aside className="hidden md:flex md:col-span-5 lg:col-span-4 flex-col gap-5 sticky top-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
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
              onClick={() => go(8)}
              className={`flex min-h-11 items-center gap-2.5 rounded-xl px-4 text-xs font-bold transition ${
                screen === 8 ? 'bg-[#E9F3ED] text-[#1E5E3A]' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Bell size={16} /> Give Feedback
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
        <div className="col-span-12 md:col-span-7 lg:col-span-8 flex flex-col min-h-screen md:min-h-[640px] w-full bg-[#F8FAFC] md:bg-white md:rounded-3xl md:border md:border-slate-200 md:shadow-lg overflow-hidden">
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
                noticeText={noticeText}
                onChangePlatform={setCasePlatform}
                onChangeNotice={setNoticeText}
                onTriggerUpload={triggerFileUpload}
                attachedFileName={attachedFileName}
                activeCase={activeCaseRecord}
              />
            )}
            {screen === 3 && (
              <Chat
                go={go}
                menu={menu}
                onAnalyze={handleAnalyze}
                narrative={narrative}
                onChangeNarrative={setNarrative}
                evidenceHeld={evidenceHeld}
                onTriggerUpload={triggerFileUpload}
                attachedFileName={attachedFileName}
                activeCase={activeCaseRecord}
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
        />
      )}
    </main>
  )
}
