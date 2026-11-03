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
  Edit2
} from 'lucide-react'
import {
  getLocalProfile,
  saveLocalProfile,
  saveCase,
  getAllCases
} from '../../db/db.js'

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
  readiness: number
  missing: MissingItem[]
  optional: string[]
}

export interface ClassificationData {
  case_type: string
  confidence: number
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

function Header({
  step,
  onMenu,
  onBack
}: {
  step?: string
  onMenu: () => void
  onBack?: () => void
}) {
  const [notifications, setNotifications] = useState(false)
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
            className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <Menu />
          </button>
          {notifications && (
            <div className="absolute right-0 top-12 z-10 w-64 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-xl">
              <p className="font-black text-[#0F172A]">Local alerts</p>
              <p className="mt-2 leading-5 text-slate-600">Day 4 of statutory window: Awaiting platform reply.</p>
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
function Splash({ go }: { go: (n: number) => void }) {
  return (
    <>
      <Header onMenu={() => {}} />
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
  onSave
}: {
  go: (n: number) => void
  profile: ProfileData
  onSave: (p: ProfileData) => Promise<void>
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
      <Header onMenu={() => {}} onBack={() => go(0)} />
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
  onChangeNotice
}: {
  go: (n: number) => void
  menu: () => void
  platform: string
  noticeText: string
  onChangePlatform: (p: string) => void
  onChangeNotice: (n: string) => void
}) {
  return (
    <>
      <Header step={steps[0]} onMenu={menu} onBack={() => go(1)} />
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
        <div className="flex items-center justify-between rounded-2xl border border-dashed border-slate-300 bg-white p-4">
          <div>
            <b className="text-sm">Upload Suspension Notice Screenshot</b>
            <p className="mt-1 text-xs text-slate-500">Attach the deactivation message</p>
          </div>
          <button
            aria-label="Upload notice"
            className="flex size-12 items-center justify-center rounded-xl bg-[#E9F3ED] text-[#1E5E3A] hover:bg-[#D5EADB]"
          >
            <Upload />
          </button>
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

/* Screen 3: Chat & Backend Analysis (Task T24/T26 integration) */
function Chat({
  go,
  menu,
  onAnalyze,
  narrative
}: {
  go: (n: number) => void
  menu: () => void
  onAnalyze: () => Promise<void>
  narrative: string
}) {
  const [processing, setProcessing] = useState(false)

  const review = async () => {
    setProcessing(true)
    try {
      await onAnalyze()
      go(4)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <>
      <Header step={steps[1]} onMenu={menu} onBack={() => go(2)} />
      <main className="flex flex-1 flex-col px-5 py-5">
        <div className="mb-5 flex items-center gap-2 text-xs text-slate-500">
          <div className="flex size-8 items-center justify-center rounded-full bg-[#E9F3ED] text-[#1E5E3A]">
            <Scale size={15} />
          </div>
          <span>DereBot • Plain English Guidance</span>
        </div>
        <div className="flex flex-1 flex-col gap-4">
          <p className="max-w-[295px] rounded-2xl rounded-tl-sm bg-[#EEF2F4] p-4 text-sm leading-6">
            When did the disputed trip happen?
          </p>
          <p className="self-end rounded-2xl rounded-tr-sm bg-[#1E5E3A] p-4 text-sm leading-6 text-white">
            14 May around 4:30pm <span className="ml-2 text-[10px] text-white/70">4:31pm</span>
          </p>
          <p className="max-w-[295px] rounded-2xl rounded-tl-sm bg-[#EEF2F4] p-4 text-sm leading-6">
            Where was the pickup and drop-off?
          </p>
          <p className="self-end rounded-2xl rounded-tr-sm bg-[#1E5E3A] p-4 text-sm leading-6 text-white">
            Westlands to JKIA. The passenger said the fare was too high.
          </p>
          <p className="max-w-[295px] rounded-2xl rounded-tl-sm bg-[#EEF2F4] p-4 text-sm leading-6">
            What caused the disagreement with the passenger?
          </p>
        </div>
        <div className="mt-5 flex items-center gap-2">
          <button
            aria-label="Attach file"
            className="flex size-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500"
          >
            <Paperclip />
          </button>
          <button
            aria-label="Record voice note"
            className="flex size-12 items-center justify-center rounded-xl bg-[#E9F3ED] text-[#1E5E3A]"
          >
            <Mic />
          </button>
          <div className="flex min-h-12 flex-1 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-400">
            Type your answer…
            <Send className="text-[#1E5E3A]" />
          </div>
        </div>
        <div className="mt-4">
          {processing && (
            <p className="mb-3 rounded-xl bg-[#FFF7ED] p-3 text-xs font-bold text-[#A34F00]">
              🛡️ Removing phone numbers &amp; analyzing trip details...
            </p>
          )}
          <Btn onClick={review} disabled={processing}>
            {processing ? 'Analyzing…' : 'Review Extracted Facts'} {!processing && <ArrowRight />}
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 4: Verify (Task T26 integration) */
function Verify({
  go,
  menu,
  analysis,
  onUpdateEntity,
  onSelectCaseType
}: {
  go: (n: number) => void
  menu: () => void
  analysis: AnalysisResult
  onUpdateEntity: (index: number, newText: string) => void
  onSelectCaseType: (t: string) => void
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const confidencePct = Math.round((analysis.classification.confidence ?? 0.89) * 100)
  const currentCaseType = analysis.classification.case_type || 'fare_dispute'

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

  return (
    <>
      <Header step={steps[2]} onMenu={menu} onBack={() => go(3)} />
      <main className="flex flex-1 flex-col gap-5 px-5 py-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">Inversion test</p>
          <h1 className="mt-2 text-2xl font-black">Does this look right?</h1>
        </div>
        <div className="rounded-2xl border border-[#B9DCC6] bg-[#F1F9F3] p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-base font-black">{formatCaseType(currentCaseType)}</p>
              <p className="mt-1 text-xs text-slate-500">Our reading of your story</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#1E5E3A]">
              {confidencePct}% confidence
            </span>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-[#CDE5D4]">
            <div
              className="h-full rounded-full bg-[#1E5E3A]"
              style={{ width: `${Math.min(100, Math.max(10, confidencePct))}%` }}
            />
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">Not right? Select the actual issue:</legend>
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
                  : 'border-slate-200 bg-white text-slate-700'
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

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400">
            Extracted facts · click pencil to edit
          </p>
          {analysis.entities.length === 0 && (
            <p className="text-sm text-slate-500">
              No dates, places or amounts found in your story yet. Go back and add when and where the
              trip happened, and the fare.
            </p>
          )}
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
                  <button
                    onClick={() => handleStartEdit(idx, item.text)}
                    className="flex items-center gap-1 rounded-full bg-[#E9F3ED] px-3 py-2 text-xs font-bold text-[#1E5E3A] hover:bg-[#D5EADB]"
                  >
                    <span>
                      {item.label}: {item.text}
                    </span>
                    <Edit2 size={12} className="ml-1 opacity-70" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto">
          <Btn onClick={() => go(5)}>
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
  evidenceHeld
}: {
  go: (n: number) => void
  menu: () => void
  analysis: AnalysisResult
  evidenceHeld: string[]
}) {
  const readiness = analysis.evidence.readiness ?? 0.6
  const readinessPct = Math.round(readiness * 100)
  const readinessLabel = readiness >= 0.8 ? 'Strong' : readiness >= 0.5 ? 'Moderate' : 'Low'

  return (
    <>
      <Header step={steps[3]} onMenu={menu} onBack={() => go(4)} />
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

/* Screen 6: Preview & Dossier Persistence (Task T26 integration) */
function Preview({
  go,
  menu,
  analysis,
  platform,
  onSaveDossier
}: {
  go: (n: number) => void
  menu: () => void
  analysis: AnalysisResult
  platform: string
  onSaveDossier: () => Promise<void>
}) {
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const headline = analysis.appeal.headline || `Appeal against account restriction: ${platform} Dispute`
  const bodyText = analysis.appeal.body || 'Appeal statement body...'

  const handleCopy = () => {
    navigator.clipboard?.writeText?.(`${headline}\n\n${bodyText}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
      <Header step={steps[4]} onMenu={menu} onBack={() => go(5)} />
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
          <Btn secondary>
            <Download size={16} /> Download PDF
          </Btn>
        </div>
        <Btn secondary onClick={handleFinalSave}>
          Forward to TAWU-Kenya <ArrowRight />
        </Btn>
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
  cases
}: {
  go: (n: number) => void
  menu: () => void
  cases: CaseRecord[]
}) {
  return (
    <>
      <Header onMenu={menu} />
      <main className="flex flex-1 flex-col gap-5 px-5 py-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">Your offline case log</p>
          <h1 className="mt-2 text-2xl font-black">Case &amp; timeline</h1>
        </div>

        {cases.length > 0 ? (
          cases.map((c, index) => {
            const dateStr = c.created_at ? new Date(c.created_at).toLocaleDateString() : 'Recent'
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
          <Btn secondary onClick={() => go(2)}>
            + Start Another Case
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 8: Feedback */
function Feedback({ go, menu }: { go: (n: number) => void; menu: () => void }) {
  return (
    <>
      <Header onMenu={menu} onBack={() => go(7)} />
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
        <div className="rounded-xl bg-white p-4 text-sm text-slate-600">
          <p className="flex items-center gap-2">
            <Phone className="text-[#1E5E3A]" size={16} /> Email: sautiyadere@gmail.com
          </p>
          <p className="mt-3 flex items-center gap-2">
            <Phone className="text-[#1E5E3A]" size={16} /> Call TAWU Dispute Hotline
          </p>
        </div>
        <div className="mt-auto">
          <Btn onClick={() => go(7)}>Submit Feedback</Btn>
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
  profile
}: {
  close: () => void
  go: (n: number) => void
  profile: ProfileData
}) {
  return (
    <div className="fixed inset-0 z-20 bg-[#0F172A]/40">
      <aside className="ml-auto min-h-full w-[min(310px,85vw)] bg-white p-5 shadow-2xl">
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
          ].map(([icon, label, screen]) => (
            <button
              key={label as string}
              onClick={() => {
                go(screen as number)
                close()
              }}
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-[#F1F9F3]"
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <Trust text="Your evidence is never uploaded." />
      </aside>
    </div>
  )
}

/* Root Page Component orchestrating state & backend API */
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
  const narrative = '14 May around 4:30pm. Westlands to JKIA. The passenger said the fare was too high.'
  const evidenceHeld = ['SUSPENSION_NOTICE', 'TRIP_RECEIPT_SCREENSHOT']

  // 3. Analysis Result from Backend (Task T24/T26)
  const [analysis, setAnalysis] = useState<AnalysisResult>({
    classification: {
      case_type: 'fare_dispute',
      confidence: 0.89,
      needs_confirmation: false
    },
    // Facts and missing evidence start empty and only ever come from the API.
    // Sample values here would reach the driver's appeal as if they were theirs.
    entities: [],
    evidence: {
      readiness: 0,
      missing: [],
      optional: []
    },
    appeal: {
      headline: 'Formal Appeal: Contested Fare Dispute on 14 May',
      body: `Dear Bolt Driver Support,\n\nI am writing to request a fair review of my account suspension related to a Fare & Payment Dispute on 14 May at approximately 4:30 PM. The trip travelled from Westlands to JKIA, with a fare of KSh 1,250.\n\nPlease review the attached evidence and provide the reasons and records relied upon. I respectfully request reinstatement while this matter is reviewed under NTSA Legal Notice 120 and the platform's fair process obligations.\n\nKind regards,\nMwangi`,
      policy_rules: ['POL-NTSA-13', 'POL-NTSA-15', 'POL-BOLT-12', 'POL-BOLT-13']
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

  // Refresh cases list when entering Log screen (screen 7)
  const refreshCases = async () => {
    try {
      const records = await getAllCases()
      setCasesList(records as CaseRecord[])
    } catch (err) {
      console.error('Error loading cases from IndexedDB:', err)
    }
  }

  useEffect(() => {
    if (screen === 7) {
      refreshCases()
    }
  }, [screen])

  const go = (n: number) => setScreen(n)
  const menu = () => setDrawer(true)

  // Save profile to IndexedDB
  const handleSaveProfile = async (newProfile: ProfileData) => {
    await saveLocalProfile(newProfile)
    setProfile(newProfile)
    if (newProfile.platform) {
      setCasePlatform(newProfile.platform)
    }
  }

  // Orchestrate Backend API call to /api/analyze (Task T24/T26)
  const handleAnalyze = async () => {
    const payload = {
      narrative: narrative,
      platform: casePlatform || 'Bolt',
      notice_text: noticeText || 'Fare or payment dispute',
      evidence_held: evidenceHeld
    }

    try {
      const endpoints = ['/api/analyze', 'http://localhost:8000/api/analyze']
      let resData: any = null

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
          // Continue to next endpoint if failed
        }
      }

      if (resData) {
        setAnalysis((prev) => ({
          classification: {
            case_type: resData.classification?.case_type || prev.classification.case_type,
            confidence: resData.classification?.confidence ?? prev.classification.confidence,
            needs_confirmation: resData.classification?.needs_confirmation ?? prev.classification.needs_confirmation
          },
          // An empty list from the API means "none found": show it as empty.
          entities: Array.isArray(resData.entities) ? resData.entities : [],
          evidence: {
            readiness: resData.evidence?.readiness ?? prev.evidence.readiness,
            missing: Array.isArray(resData.evidence?.missing) ? resData.evidence.missing : [],
            optional: resData.evidence?.optional ?? prev.evidence.optional
          },
          appeal: {
            headline: resData.appeal?.headline || prev.appeal.headline,
            body: resData.appeal?.body || prev.appeal.body,
            policy_rules: resData.appeal?.policy_rules || prev.appeal.policy_rules
          }
        }))
      }
    } catch (err) {
      console.warn('API call to /api/analyze failed, using verified state defaults:', err)
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

  // Override case type
  const handleSelectCaseType = (t: string) => {
    setAnalysis((prev) => ({
      ...prev,
      classification: {
        ...prev.classification,
        case_type: t
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
        narrative: narrative,
        evidence_held: evidenceHeld,
        appeal_dossier: {
          headline: analysis.appeal.headline,
          statement_body: analysis.appeal.body,
          policy_rules: analysis.appeal.policy_rules
        }
      })
      await refreshCases()
    } catch (err) {
      console.error('Failed to save case dossier to IndexedDB:', err)
    }
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <div className="mx-auto flex min-h-screen w-full max-w-[390px] flex-col bg-[#F8FAFC] shadow-xl">
        <div className="flex-1">
          {screen === 0 && <Splash go={go} />}
          {screen === 1 && <Profile go={go} profile={profile} onSave={handleSaveProfile} />}
          {screen === 2 && (
            <Intake
              go={go}
              menu={menu}
              platform={casePlatform}
              noticeText={noticeText}
              onChangePlatform={setCasePlatform}
              onChangeNotice={setNoticeText}
            />
          )}
          {screen === 3 && <Chat go={go} menu={menu} onAnalyze={handleAnalyze} narrative={narrative} />}
          {screen === 4 && (
            <Verify
              go={go}
              menu={menu}
              analysis={analysis}
              onUpdateEntity={handleUpdateEntity}
              onSelectCaseType={handleSelectCaseType}
            />
          )}
          {screen === 5 && (
            <Evidence
              go={go}
              menu={menu}
              analysis={analysis}
              evidenceHeld={evidenceHeld}
            />
          )}
          {screen === 6 && (
            <Preview
              go={go}
              menu={menu}
              analysis={analysis}
              platform={casePlatform}
              onSaveDossier={handleSaveDossier}
            />
          )}
          {screen === 7 && <Log go={go} menu={menu} cases={casesList} />}
          {screen === 8 && <Feedback go={go} menu={menu} />}
        </div>
      </div>
      {drawer && <Drawer close={() => setDrawer(false)} go={go} profile={profile} />}
    </main>
  )
}
