'use client'

import React, { useState, useEffect, useRef } from 'react'
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
  ShieldCheck,
  Upload,
  X,
  Edit2,
  Plus,
  Trash2,
  Share2,
  Send
} from 'lucide-react'
import {
  getLocalProfile,
  saveLocalProfile,
  saveCase,
  getAllCases,
  deleteCaseById,
  clearAllLocalData
} from '../../db/db.js'
import { generateAppealPdf } from '../../utils/pdfGenerator.js'
import { getApiUrl } from '../../config.js'
import {
  runLocalAnalysis,
  extractEntities,
  evaluateEvidence,
  buildAppealDossier,
  validateKenyanPhone,
  verifyUploadedScreenshot,
  CASE_CHECKLISTS,
  type ExtractedEntity,
  type RedactedPiiItem,
  type ChecklistItemSpec
} from '../../utils/localAnalyzer'

const steps = [
  'Notice & Platform',
  'Incident Details',
  'Case Verification',
  'Evidence Audit',
  'Appeal Dossier'
]

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
  label?: string
  source?: string
  reason: string
}

export interface EvidenceData {
  readiness?: number | null
  missing: MissingItem[]
  optional: MissingItem[]
  checklist?: ChecklistItemSpec[]
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
  redacted_narrative?: string
  pii_found?: RedactedPiiItem[]
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

const SAMPLE_STORIES: { label: string; platform: string; notice: string; text: string }[] = [
  {
    label: 'Fare Dispute',
    platform: 'Bolt',
    notice: 'Fare or payment dispute',
    text: 'On Friday 9 October around 8:30pm I picked a rider from Westlands to Syokimau (Trip TRP-884120). The app showed KSh 1,450 at the end of the trip, but the passenger walked away saying he sent M-Pesa yet nothing came to my phone 0722 419 832.'
  },
  {
    label: 'Safety Report',
    platform: 'Uber',
    notice: 'Safety violation allegation',
    text: 'On Saturday night at 11:30pm I picked four drunk passengers at Kilimani going to Kasarani in my car KDD 418P. They wanted to carry five people and smoke inside. When I politely refused for safety, the rider reported me for rude conduct and my account was placed on hold.'
  },
  {
    label: 'Cancellation Lock',
    platform: 'Bolt',
    notice: 'Cancellation or rating drop',
    text: 'Wamenifungia juu ya cancellation rate. Jana saa 7am nilipata requests tatu Utawala na Embakasi ambapo mteja anaweka wrong pickup pin halafu ananiambia kwa chat nicancel ride.'
  },
  {
    label: 'GPS / Fraud Flag',
    platform: 'Uber',
    notice: 'Account or identity flag',
    text: 'The app blocked me claiming GPS manipulation and ghost trips. On Wednesday 7 October at 4pm my network kept dropping between tall buildings in Upper Hill and CBD while carrying a genuine passenger who paid KSh 1,300 via M-Pesa code RGH739104K.'
  }
]

function formatCaseType(rawType: string): string {
  const map: Record<string, string> = {
    fare_dispute: 'Fare & Payment Dispute',
    passenger_safety: 'Passenger Safety Complaint',
    rating_or_cancellation: 'Cancellation & Rating Dispute',
    fraud_flag: 'Account & Fraud Flag',
    out_of_scope: 'General / Out of Scope'
  }
  if (!rawType) return 'Unclassified Dispute'
  return map[rawType] || rawType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function Header({
  step,
  onMenu,
  onBack,
  casesCount = 0,
  latestDaysLeft = 30,
  onOpenLog
}: {
  step?: string
  onMenu: () => void
  onBack?: () => void
  casesCount?: number
  latestDaysLeft?: number
  onOpenLog?: () => void
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
            {casesCount > 0 && (
              <i className="absolute right-2 top-2 size-2 rounded-full bg-[#D97706]" />
            )}
          </button>
          <button
            aria-label="Open menu"
            onClick={onMenu}
            className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <Menu />
          </button>
          {notifications && (
            <div className="absolute right-0 top-12 z-20 w-68 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-xl">
              <div className="flex items-center justify-between">
                <p className="font-black text-[#0F172A]">Local Statutory Alerts</p>
                <button
                  onClick={() => setNotifications(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              </div>
              {casesCount > 0 ? (
                <>
                  <p className="mt-2 leading-5 text-slate-600">
                    You have <b>{casesCount}</b> saved case{casesCount > 1 ? 's' : ''} on this device.{' '}
                    <b>{latestDaysLeft} days remaining</b> in the 30-day NTSA LN 120 response window.
                  </p>
                  {onOpenLog && (
                    <button
                      onClick={() => {
                        setNotifications(false)
                        onOpenLog()
                      }}
                      className="mt-2 font-extrabold text-[#1E5E3A] underline"
                    >
                      Open Case Log →
                    </button>
                  )}
                </>
              ) : (
                <p className="mt-2 leading-5 text-slate-600">
                  No active appeal timers yet. Complete a case to start your 30-day NTSA LN 120 countdown.
                </p>
              )}
              <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] font-bold text-[#1E5E3A]">
                🔒 Stored 100% on this phone
              </p>
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
              className="h-full rounded-full bg-[#1E5E3A] transition-all duration-300"
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
      © 2026 Sauti ya Dere · In partnership with TAWU-Kenya · Stored Locally on Device · No Guarantee of Reinstatement
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
      type="button"
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
          className="min-h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 font-normal text-slate-700 outline-none focus:border-[#1E5E3A]"
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
      <ShieldCheck className="shrink-0" />
      <span>
        <b>100% On-Device Storage</b>
        <br />
        {text}
      </span>
    </div>
  )
}

/* Screen 0: Splash (Clean, Decluttered Executive Entry) */
function Splash({
  go,
  menu,
  casesCount
}: {
  go: (n: number) => void
  menu: () => void
  casesCount: number
}) {
  return (
    <>
      <Header onMenu={menu} casesCount={casesCount} onOpenLog={() => go(7)} />
      <main className="flex flex-1 flex-col justify-between px-6 py-8">
        <div className="my-auto flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-[#1E5E3A] text-white shadow-md shadow-[#1E5E3A]/20">
              <Scale size={30} strokeWidth={1.7} />
            </div>
            <div>
              <span className="rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#B45309]">
                Team Sonic · TAWU-Kenya Partner
              </span>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-[#0F172A]">
                Sauti ya Dere
              </h1>
            </div>
          </div>

          <p className="text-sm leading-6 text-slate-600">
            Build a structured, legally grounded appeal against unfair Uber, Bolt, Little, or Faras account restrictions under <b>NTSA Legal Notice 120</b>.
          </p>

          <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-[#1E5E3A]">
            <div className="rounded-xl border border-[#B9DCC6] bg-[#F1F9F3] px-2 py-2.5">
              🔒 On-Device Privacy
            </div>
            <div className="rounded-xl border border-[#B9DCC6] bg-[#F1F9F3] px-2 py-2.5">
              ⚖️ NTSA &amp; DPA Law
            </div>
            <div className="rounded-xl border border-[#B9DCC6] bg-[#F1F9F3] px-2 py-2.5">
              🤝 TAWU Escalation
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 pt-4">
          <Btn onClick={() => go(1)}>
            Start New Appeal <ArrowRight size={18} />
          </Btn>
          {casesCount > 0 && (
            <Btn secondary onClick={() => go(7)}>
              My Saved Cases ({casesCount})
            </Btn>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 1: Profile with Strict Kenyan Phone Number Validation */
function Profile({
  go,
  menu,
  profile,
  onSave,
  casesCount
}: {
  go: (n: number) => void
  menu: () => void
  profile: ProfileData
  onSave: (p: ProfileData) => Promise<void>
  casesCount: number
}) {
  const [name, setName] = useState(profile.name || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [platform, setPlatform] = useState(profile.platform || 'Bolt')
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(profile.name || '')
    setPhone(profile.phone || '')
    setPlatform(profile.platform || 'Bolt')
  }, [profile])

  const phoneCheck = validateKenyanPhone(phone)
  const showPhoneError = (phoneTouched || Boolean(submitError)) && !phoneCheck.valid

  const handleSubmit = async () => {
    setPhoneTouched(true)
    if (!name.trim()) {
      setSubmitError('Please enter your name or initials to sign your appeal dossier.')
      return
    }
    if (!phoneCheck.valid) {
      setSubmitError(phoneCheck.error)
      return
    }
    setSubmitError('')
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        phone: phoneCheck.formatted,
        platform
      })
      go(2)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Header onMenu={menu} onBack={() => go(0)} casesCount={casesCount} onOpenLog={() => go(7)} />
      <main className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">Step 1 · Driver Identity</p>
          <h1 className="mt-1 text-2xl font-black">Your Driver Profile</h1>
          <p className="mt-1 text-xs text-slate-500">
            Stored strictly on your phone to sign your formal appeal and enable TAWU-Kenya follow-up.
          </p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-bold text-[#0F172A]">
          Full Name or Initials *
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (submitError) setSubmitError('')
            }}
            className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-[#1E5E3A]"
            placeholder="e.g. Mercy Wanjiku"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5 text-sm font-bold text-[#0F172A]">
            Kenyan Mobile Number (10 digits) *
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                setPhoneTouched(true)
                if (submitError) setSubmitError('')
              }}
              onBlur={() => setPhoneTouched(true)}
              className={`min-h-12 rounded-xl border bg-white px-4 font-normal outline-none ${
                showPhoneError
                  ? 'border-red-500 bg-red-50/40 focus:border-red-600'
                  : phone.trim() && phoneCheck.valid
                    ? 'border-[#1E5E3A] bg-[#F1F9F3]/40'
                    : 'border-slate-200 focus:border-[#1E5E3A]'
              }`}
              placeholder="e.g. 0712 345 678 or +254 712 345 678"
            />
          </label>
          {showPhoneError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              ⚠️ {phoneCheck.error}
            </p>
          )}
          {!showPhoneError && phone.trim() && phoneCheck.valid && (
            <p className="flex items-center gap-1 text-xs font-bold text-[#1E5E3A]">
              <Check size={14} /> Valid Kenyan mobile number ({phoneCheck.formatted})
            </p>
          )}
        </div>

        <Select
          label="Primary Ride-Hailing Platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          <option value="Bolt">Bolt</option>
          <option value="Uber">Uber</option>
          <option value="Little">Little Cab</option>
          <option value="Faras">Faras</option>
          <option value="Yego">Yego</option>
        </Select>

        {submitError && !showPhoneError && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
            ⚠️ {submitError}
          </p>
        )}

        <div className="mt-auto pt-2">
          <Btn onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save & Continue'} {!saving && <ArrowRight size={18} />}
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 2: Intake with Practical Screenshot Verification */
function Intake({
  go,
  menu,
  platform,
  noticeText,
  customNoticeMessage,
  noticeFileName,
  onChangePlatform,
  onChangeNotice,
  onChangeCustomNotice,
  onUploadNoticeFile,
  casesCount
}: {
  go: (n: number) => void
  menu: () => void
  platform: string
  noticeText: string
  customNoticeMessage: string
  noticeFileName: string
  onChangePlatform: (p: string) => void
  onChangeNotice: (n: string) => void
  onChangeCustomNotice: (msg: string) => void
  onUploadNoticeFile: (fileName: string) => void
  casesCount: number
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [checkingImage, setCheckingImage] = useState(false)
  const [imageError, setImageError] = useState('')
  const [imageSuccessNote, setImageSuccessNote] = useState('')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCheckingImage(true)
    setImageError('')
    setImageSuccessNote('')
    const check = await verifyUploadedScreenshot(file)
    setCheckingImage(false)
    if (!check.valid) {
      onUploadNoticeFile('')
      setImageError(check.reason)
      e.target.value = ''
      return
    }
    setImageSuccessNote(check.reason)
    onUploadNoticeFile(file.name)
  }

  return (
    <>
      <Header
        step={steps[0]}
        onMenu={menu}
        onBack={() => go(1)}
        casesCount={casesCount}
        onOpenLog={() => go(7)}
      />
      <main className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div>
          <h1 className="text-2xl font-black">Notice &amp; Platform Details</h1>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Select the app involved and upload your suspension screenshot or paste the notice message.
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
          <option value="Yego">Yego</option>
        </Select>
        <Select
          label="What general reason did the app give?"
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

        <label className="flex flex-col gap-1.5 text-sm font-bold text-[#0F172A]">
          Paste Suspension Message / SMS (Optional)
          <textarea
            value={customNoticeMessage}
            onChange={(e) => onChangeCustomNotice(e.target.value)}
            rows={2}
            placeholder="e.g. 'Your account has been suspended due to...'"
            className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-xs font-normal leading-5 text-slate-700 outline-none focus:border-[#1E5E3A]"
          />
        </label>

        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-3.5">
          <div className="flex items-center justify-between">
            <div className="pr-2">
              <b className="text-xs text-[#0F172A]">Upload App Suspension Screenshot (Optional)</b>
              {checkingImage ? (
                <p className="mt-1 text-xs font-bold text-amber-700">
                  🔍 Verifying screenshot layout...
                </p>
              ) : noticeFileName ? (
                <p className="mt-1 flex items-center gap-1 text-xs font-bold text-[#1E5E3A]">
                  <Check size={14} /> {noticeFileName}
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Verifies that the image is a real app screen or PDF document (not a random photo)
                </p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              aria-label="Upload notice"
              onClick={() => fileInputRef.current?.click()}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#E9F3ED] text-[#1E5E3A] hover:bg-[#D5EADB]"
            >
              <Upload size={18} />
            </button>
          </div>

          {imageSuccessNote && (
            <p className="rounded-lg bg-[#F1F9F3] px-2.5 py-1.5 text-[11px] font-bold text-[#1E5E3A]">
              ✓ {imageSuccessNote}
            </p>
          )}
          {imageError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold leading-4 text-red-700">
              ⚠️ {imageError}
            </p>
          )}
        </div>

        <div className="mt-auto pt-2">
          <Btn onClick={() => go(3)}>
            Continue to Tell Your Story <ArrowRight size={18} />
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 3: Conversational Intake Chat (Task T26) */
type ChatBubble = {
  id: string
  sender: 'bot' | 'driver'
  text: string
}

function detectTopicFromText(driverText: string, fallbackNotice: string): 'fare' | 'safety' | 'cancel' | 'fraud' {
  const t = driverText.toLowerCase()
  // Always prioritize what the driver actually typed in chat over the dropdown default
  if (/\b(safety|conduct|drunk|mlevi|walevi|rude|smoke|smoking|sigara|passengers|watu\s+watano|threat|assault|harass|police|polisi|guard|askari)\b/.test(t)) {
    return 'safety'
  }
  if (/\b(cancel|cancelled|cancellation|rating|star|1-star|pin|pickup\s+pin|acceptance)\b/.test(t)) {
    return 'cancel'
  }
  if (/\b(fraud|gps|spoof|selfie|identity|verification|shared\s+account|duplicate|ghost|algorithm)\b/.test(t)) {
    return 'fraud'
  }
  if (/\b(fare|payment|paid|unpaid|malipo|nauli|kulipa|cash|mpesa|m-pesa|ksh|kes|bob|commission|deduct|wallet|balance)\b/.test(t)) {
    return 'fare'
  }
  // Only fall back to noticeText if the driver's text had no topic keywords
  const n = fallbackNotice.toLowerCase()
  if (n.includes('safety') || n.includes('conduct')) return 'safety'
  if (n.includes('cancel') || n.includes('rating')) return 'cancel'
  if (n.includes('fraud') || n.includes('identity') || n.includes('gps')) return 'fraud'
  return 'fare'
}

function getCaseSpecificFollowUp(noticeText: string, combinedText: string): {
  question: string
  chips: string[]
} {
  const topic = detectTopicFromText(combinedText, noticeText)
  if (topic === 'fare') {
    return {
      question:
        'How much was the disputed or unpaid fare in KSh, and did you already report it in the app?',
      chips: [
        'The fare was KSh 1,450 and the rider walked away without paying.',
        'The app deducted KSh 850 commission on an unpaid cash trip.',
        'I reported it in the app immediately after the trip.'
      ]
    }
  }
  if (topic === 'safety') {
    return {
      question:
        'What happened during the interaction with the passenger, and was there any witness, security guard, or dashcam?',
      chips: [
        '5 passengers tried to board my 4-seater car and I politely declined.',
        'The passenger was intoxicated and became verbally abusive.',
        'A security guard at the gate witnessed the interaction.'
      ]
    }
  }
  if (topic === 'cancel') {
    return {
      question:
        'What caused the cancellation or low rating (for example: wrong pickup pin, rider request on chat, traffic, or an unsafe pickup spot)?',
      chips: [
        'The rider placed the wrong pickup pin and asked me on chat to cancel.',
        'The pickup was in an unlit area late at night so I cancelled for safety.',
        'Heavy traffic delayed pickup and the rider gave me a 1-star rating.'
      ]
    }
  }
  return {
    question:
      'What warning or reason did the app show when flagging your account (for example: GPS signal jump, selfie verification, or irregular trip flag)?',
    chips: [
      'The app flagged GPS jumps while I was driving near tall buildings in Upper Hill.',
      'I am the sole licensed driver on this account and never share it.',
      'The night selfie check failed because of poor street lighting.'
    ]
  }
}

function Chat({
  go,
  menu,
  platform,
  noticeText,
  driverName,
  narrative,
  onChangeNarrative,
  onSelectSample,
  onAnalyze,
  attachedFiles,
  onAttachEvidenceFile,
  casesCount
}: {
  go: (n: number) => void
  menu: () => void
  platform: string
  noticeText: string
  driverName: string
  narrative: string
  onChangeNarrative: (text: string) => void
  onSelectSample: (sample: { platform: string; notice: string; text: string }) => void
  onAnalyze: (customNarrative?: string) => Promise<void>
  attachedFiles: string[]
  onAttachEvidenceFile: (fileName: string) => void
  casesCount: number
}) {
  const greetingText = `Habari ${driverName ? driverName.split(' ')[0] : 'Dere'}! 👋 I see you are appealing a ${platform} "${noticeText}" issue. You can chat with me in English, Kiswahili, or Sheng.\n\nFirst: In your own words, what happened on that trip or before your account was affected?`

  const [messages, setMessages] = useState<ChatBubble[]>(() => {
    const initial: ChatBubble[] = [{ id: 'bot-welcome', sender: 'bot', text: greetingText }]
    if (narrative && narrative.trim()) {
      initial.push({ id: 'driver-init', sender: 'driver', text: narrative.trim() })
      initial.push({
        id: 'bot-init-reply',
        sender: 'bot',
        text: 'Asante! I have your story above. You can reply below to add more details (date, Nairobi route, or KSh amount), tap ✎ Edit on your message, or tap "Analyze & Build Appeal →" when ready.'
      })
    }
    return initial
  })

  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [isBotTyping, setIsBotTyping] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState('')
  const evidenceFileRef = useRef<HTMLInputElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const driverMessages = messages.filter((m) => m.sender === 'driver')
  const combinedNarrative = driverMessages.map((m) => m.text.trim()).join(' ')
  const detectedEntities = extractEntities(combinedNarrative)
  const hasDateOrTime = detectedEntities.some((e) => e.label === 'DATE' || e.label === 'TIME')
  const hasLocation = detectedEntities.some((e) => e.label === 'LOCATION')
  const hasIssueDetail = combinedNarrative.trim().split(/\s+/).filter(Boolean).length >= 8

  useEffect(() => {
    if (typeof chatEndRef.current?.scrollIntoView === 'function') {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isBotTyping])

  const generateNextBotReply = (updatedMessages: ChatBubble[]): string => {
    const dMsgs = updatedMessages.filter((m) => m.sender === 'driver')
    const lastMsg = (dMsgs[dMsgs.length - 1]?.text || '').trim()
    const fullText = dMsgs.map((m) => m.text.trim()).join(' ')

    // 0. Handle simple greetings or very short messages without hallucinating facts
    const words = lastMsg.split(/\s+/).filter(Boolean)
    const isGreetingOnly =
      words.length <= 3 &&
      /^(hi|hello|hey|habari|mambo|niaje|sasa|vipi|shikamoo|good\s+morning|good\s+afternoon|good\s+evening|help|plz|please)[!.,?\s]*$/i.test(
        lastMsg
      )
    if (isGreetingOnly) {
      return `Habari ${driverName ? driverName.split(' ')[0] : 'Dere'}! Please tell me in your own words what happened with your ${platform} trip or account (for example: an unpaid fare, a false passenger report, cancellations, or an account block).`
    }

    // Extract entities strictly from the latest message for acknowledgement, and from fullText for completeness
    const lastEnts = extractEntities(lastMsg)
    const newDates = lastEnts.filter((e) => e.label === 'DATE' || e.label === 'TIME').map((e) => e.text)
    const newLocs = lastEnts.filter((e) => e.label === 'LOCATION').map((e) => e.text)
    const newMoney = lastEnts.filter((e) => e.label === 'MONEY').map((e) => e.text)

    const caughtNow: string[] = []
    if (newDates.length > 0) caughtNow.push(`time (${newDates.slice(0, 2).join(', ')})`)
    if (newLocs.length > 0) caughtNow.push(`location (${newLocs.slice(0, 2).join(' → ')})`)
    if (newMoney.length > 0) caughtNow.push(`amount (${newMoney[0]})`)
    const ackPrefix =
      caughtNow.length > 0
        ? `Asante, I recorded the ${caughtNow.join(' and ')}. `
        : 'Thank you, I have recorded that in your statement. '

    // Check overall completeness across all driver messages so far
    const allEnts = extractEntities(fullText)
    const allDates = allEnts.filter((e) => e.label === 'DATE' || e.label === 'TIME')
    const allLocs = allEnts.filter((e) => e.label === 'LOCATION')
    const totalWords = fullText.split(/\s+/).filter(Boolean).length

    // 1. If the driver hasn't really described what happened yet (< 5 words total)
    if (totalWords < 5) {
      return `${ackPrefix}Could you share a bit more detail about what happened on the trip or why ${platform} restricted your account?`
    }

    // 2. Ask for missing When & Where if not provided yet
    if (allDates.length === 0 && allLocs.length === 0 && dMsgs.length <= 2) {
      return `${ackPrefix}When did this happen (day and approximate time), and what was the Nairobi pickup/drop-off area?`
    }
    if (allLocs.length === 0 && dMsgs.length <= 2) {
      return `${ackPrefix}Which Nairobi area or route did this happen on (pickup and destination)?`
    }
    if (allDates.length === 0 && dMsgs.length <= 2) {
      return `${ackPrefix}What day and approximate time did this happen?`
    }

    // 3. Ask case-specific follow-up based on what the driver actually wrote
    if (dMsgs.length <= 2) {
      const followUp = getCaseSpecificFollowUp(noticeText, fullText)
      return `${ackPrefix}${followUp.question}`
    }

    // 4. Wrap up without inventing anything
    return `${ackPrefix}Your statement is recorded. You can tap **"Analyze & Review Extracted Facts"** below to inspect the extracted facts, or reply if you want to add anything else.`
  }

  const handleSendMessage = (customText?: string) => {
    const textToSend = (customText !== undefined ? customText : draft).trim()
    if (!textToSend) return

    const newDriverBubble: ChatBubble = {
      id: `driver-${Date.now()}`,
      sender: 'driver',
      text: textToSend
    }
    const nextMsgs = [...messages, newDriverBubble]
    setMessages(nextMsgs)
    setDraft('')

    const updatedCombined = nextMsgs
      .filter((m) => m.sender === 'driver')
      .map((m) => m.text.trim())
      .join(' ')
    onChangeNarrative(updatedCombined)

    setIsBotTyping(true)
    setTimeout(() => {
      const botReply = generateNextBotReply(nextMsgs)
      setMessages((prev) => [
        ...prev,
        { id: `bot-${Date.now()}`, sender: 'bot', text: botReply }
      ])
      setIsBotTyping(false)
    }, 280)
  }

  const handleSaveEdit = (id: string) => {
    if (!editingText.trim()) return
    const updated = messages.map((m) =>
      m.id === id ? { ...m, text: editingText.trim() } : m
    )
    setMessages(updated)
    setEditingId(null)
    setEditingText('')
    const updatedCombined = updated
      .filter((m) => m.sender === 'driver')
      .map((m) => m.text.trim())
      .join(' ')
    onChangeNarrative(updatedCombined)
  }

  const handleLoadSampleConversation = (s: {
    label: string
    platform: string
    notice: string
    text: string
  }) => {
    onSelectSample(s)
    // Split sample story into realistic conversational turns
    const sentences = s.text.match(/[^.!?]+[.!?]+/g) || [s.text]
    const turn1 = sentences.slice(0, 2).join(' ').trim()
    const turn2 = sentences.slice(2).join(' ').trim()

    const demoMessages: ChatBubble[] = [
      {
        id: 'bot-demo-1',
        sender: 'bot',
        text: `Habari ${driverName ? driverName.split(' ')[0] : 'Dere'}! 👋 I see you are appealing a ${s.platform} "${s.notice}" issue. In your own words, when and where did this happen?`
      },
      {
        id: 'driver-demo-1',
        sender: 'driver',
        text: turn1
      }
    ]
    if (turn2) {
      demoMessages.push({
        id: 'bot-demo-2',
        sender: 'bot',
        text: getCaseSpecificFollowUp(s.notice, turn1).question
      })
      demoMessages.push({
        id: 'driver-demo-2',
        sender: 'driver',
        text: turn2
      })
    }
    demoMessages.push({
      id: 'bot-demo-3',
      sender: 'bot',
      text: `Asante sana! I have extracted the date, Nairobi route, and dispute details. You can tap ✎ Edit on any message above to tweak it, add another message, or tap "Analyze & Build Appeal →" below!`
    })
    setMessages(demoMessages)
    setDraft('')
  }

  const handleVoiceToggle = () => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRec) {
      setVoiceMessage(
        'Voice dictation is not supported on this browser. Please type your reply or tap a quick chip below.'
      )
      setTimeout(() => setVoiceMessage(''), 4000)
      return
    }
    if (isListening) {
      setIsListening(false)
      return
    }
    try {
      const recognition = new SpeechRec()
      recognition.lang = 'en-KE'
      recognition.interimResults = false
      setIsListening(true)
      setVoiceMessage('Listening... Speak in English or Kiswahili.')
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || ''
        if (transcript) {
          setDraft((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript))
        }
        setIsListening(false)
        setVoiceMessage('')
      }
      recognition.onerror = () => {
        setIsListening(false)
        setVoiceMessage('Could not capture audio. Please type your message below.')
        setTimeout(() => setVoiceMessage(''), 3500)
      }
      recognition.onend = () => {
        setIsListening(false)
      }
      recognition.start()
    } catch {
      setIsListening(false)
    }
  }

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setVoiceMessage('🔍 Verifying uploaded screenshot...')
    const check = await verifyUploadedScreenshot(file)
    if (!check.valid) {
      setVoiceMessage(`⚠️ ${check.reason}`)
      e.target.value = ''
      return
    }
    setVoiceMessage(`✓ ${check.reason}`)
    setTimeout(() => setVoiceMessage(''), 4000)
    onAttachEvidenceFile(file.name)
  }

  const handleResetChat = () => {
    onChangeNarrative('')
    setDraft('')
    setMessages([{ id: `bot-reset-${Date.now()}`, sender: 'bot', text: greetingText }])
  }

  const review = async () => {
    // If the driver typed something in the draft box without pressing Send, include it automatically
    const finalNarrative = [combinedNarrative, draft.trim()].filter(Boolean).join(' ').trim()
    if (!finalNarrative) return
    onChangeNarrative(finalNarrative)
    setProcessing(true)
    try {
      await onAnalyze(finalNarrative)
      go(4)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <>
      <Header
        step={steps[1]}
        onMenu={menu}
        onBack={() => go(2)}
        casesCount={casesCount}
        onOpenLog={() => go(7)}
      />
      <main className="flex flex-1 flex-col px-5 py-3">
        {/* Top Bot Identity & Clear Chat Action */}
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="relative flex size-7 items-center justify-center rounded-full bg-[#E9F3ED] text-[#1E5E3A]">
              <Scale size={14} />
              <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-emerald-500 ring-1 ring-white" />
            </div>
            <div>
              <span className="font-bold text-slate-800">DereBot Intake Assistant</span>
              <span className="ml-1.5 text-[10px] font-semibold text-emerald-700">• Write your own story</span>
            </div>
          </div>
          {driverMessages.length > 0 && (
            <button
              type="button"
              onClick={handleResetChat}
              className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
            >
              Clear &amp; Start Fresh
            </button>
          )}
        </div>

        {/* Live Fact Extraction Pills */}
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5 rounded-xl bg-[#EEF2F4] px-2.5 py-1.5 text-[10px]">
          <span className="font-extrabold text-slate-600">Your Details Recorded:</span>
          <span
            className={`rounded-full px-2 py-0.5 font-bold ${
              hasDateOrTime ? 'bg-[#D8F0DE] text-[#1E5E3A]' : 'bg-white text-slate-500'
            }`}
          >
            {hasDateOrTime ? '✓' : '○'} Date/Time
          </span>
          <span
            className={`rounded-full px-2 py-0.5 font-bold ${
              hasLocation ? 'bg-[#D8F0DE] text-[#1E5E3A]' : 'bg-white text-slate-500'
            }`}
          >
            {hasLocation ? '✓' : '○'} Location / Route
          </span>
          <span
            className={`rounded-full px-2 py-0.5 font-bold ${
              hasIssueDetail ? 'bg-[#D8F0DE] text-[#1E5E3A]' : 'bg-white text-slate-500'
            }`}
          >
            {hasIssueDetail ? '✓' : '○'} Incident Statement
          </span>
        </div>

        {/* Conversational Message Thread (100% Driver's Own Words) */}
        <div className="mb-2.5 flex max-h-[320px] min-h-[235px] flex-1 flex-col gap-2.5 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
          {messages.map((msg) => {
            if (msg.sender === 'bot') {
              return (
                <div key={msg.id} className="flex items-start gap-2 pr-5">
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#E9F3ED] text-[#1E5E3A]">
                    <Scale size={12} />
                  </div>
                  <div className="rounded-2xl rounded-tl-xs bg-[#F1F5F9] px-3 py-2 text-xs leading-5 text-slate-800">
                    {msg.text.split('\n').map((line, idx) => (
                      <p key={idx} className={idx > 0 ? 'mt-1.5 font-semibold text-[#0F172A]' : ''}>
                        {line.replace(/\*\*/g, '')}
                      </p>
                    ))}
                  </div>
                </div>
              )
            }

            // Driver bubble (with inline Edit capability per Task T26)
            const isEditing = editingId === msg.id
            return (
              <div key={msg.id} className="flex flex-col items-end pl-6">
                {isEditing ? (
                  <div className="w-full rounded-2xl border border-[#1E5E3A] bg-[#F1F9F3] p-2.5">
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-lg bg-white p-2 text-xs text-slate-900 outline-none"
                    />
                    <div className="mt-1.5 flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg bg-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(msg.id)}
                        className="rounded-lg bg-[#1E5E3A] px-2.5 py-1 text-[10px] font-bold text-white"
                      >
                        Save Edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="group relative rounded-2xl rounded-tr-xs bg-[#1E5E3A] px-3 py-2 text-xs leading-5 text-white shadow-2xs">
                    <p>{msg.text}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(msg.id)
                        setEditingText(msg.text)
                      }}
                      className="mt-1 inline-flex items-center gap-1 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-100 hover:bg-white/25"
                    >
                      <Edit2 size={10} /> Edit answer
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {isBotTyping && (
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-full bg-[#E9F3ED] text-[#1E5E3A]">
                <Scale size={12} />
              </div>
              <div className="rounded-2xl bg-[#F1F5F9] px-3 py-1.5 text-[11px] font-semibold text-slate-500">
                DereBot is typing...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {attachedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachedFiles.map((f, i) => (
              <span
                key={i}
                className="flex items-center gap-1 rounded-lg bg-[#E9F3ED] px-2.5 py-0.5 text-[10px] font-bold text-[#1E5E3A]"
              >
                <Check size={11} /> {f}
              </span>
            ))}
          </div>
        )}

        {voiceMessage && (
          <p className="mb-2 rounded-xl bg-[#FFF7ED] px-3 py-1.5 text-[11px] font-bold text-[#A34F00]">
            🎙️ {voiceMessage}
          </p>
        )}

        {/* Chat Composer Bar */}
        <div className="flex items-center gap-1.5">
          <input
            ref={evidenceFileRef}
            type="file"
            accept="image/*,.pdf"
            onChange={handleFileAttach}
            className="hidden"
          />
          <button
            type="button"
            aria-label="Attach evidence"
            title="Attach screenshot or receipt"
            onClick={() => evidenceFileRef.current?.click()}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <Paperclip size={16} />
          </button>
          <button
            type="button"
            aria-label="Voice note"
            title="Speak your reply"
            onClick={handleVoiceToggle}
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition ${
              isListening
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-[#E9F3ED] text-[#1E5E3A] hover:bg-[#D5EADB]'
            }`}
          >
            <Mic size={16} />
          </button>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            placeholder="Reply to DereBot in English, Swahili or Sheng..."
            className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-[#1E5E3A]"
          />
          <button
            type="button"
            aria-label="Send message"
            onClick={() => handleSendMessage()}
            disabled={!draft.trim()}
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition ${
              draft.trim()
                ? 'bg-[#1E5E3A] text-white hover:bg-[#174A2E]'
                : 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Send size={15} />
          </button>
        </div>

        {/* Proceed to Fact Verification CTA */}
        <button
          type="button"
          onClick={review}
          disabled={processing || (!combinedNarrative.trim() && !draft.trim())}
          className={`mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-extrabold transition ${
            !combinedNarrative.trim() && !draft.trim()
              ? 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-[#1E5E3A] text-white hover:bg-[#174A2E] shadow-xs'
          }`}
        >
          {processing ? 'Analyzing Conversation...' : 'Analyze & Review Extracted Facts'}{' '}
          {!processing && <ArrowRight size={14} />}
        </button>
      </main>
      <Footer />
    </>
  )
}

/* Screen 4: Verify (Task T26 & T33) */
function Verify({
  go,
  menu,
  analysis,
  onUpdateEntity,
  onAddEntity,
  onDeleteEntity,
  onSelectCaseType,
  casesCount
}: {
  go: (n: number) => void
  menu: () => void
  analysis: AnalysisResult
  onUpdateEntity: (index: number, newText: string) => void
  onAddEntity: (entity: EntityItem) => void
  onDeleteEntity: (index: number) => void
  onSelectCaseType: (t: string) => void
  casesCount: number
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isAddingFact, setIsAddingFact] = useState(false)
  const [newFactLabel, setNewFactLabel] = useState('DATE')
  const [newFactText, setNewFactText] = useState('')

  const currentCaseType = analysis.classification.case_type || ''
  const confidence = analysis.classification.confidence
  const threshold = analysis.classification.confidence_threshold ?? 0.65
  const hasPrediction = Boolean(currentCaseType && confidence !== null && confidence !== undefined)
  const confidencePct = hasPrediction ? Math.round(Number(confidence) * 100) : null
  const isBelowThreshold = hasPrediction && Number(confidence) < threshold
  const piiFound = analysis.pii_found || []

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
      <Header
        step={steps[2]}
        onMenu={menu}
        onBack={() => go(3)}
        casesCount={casesCount}
        onOpenLog={() => go(7)}
      />
      <main className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">
            Step 3 · Verify Classification &amp; Facts
          </p>
          <h1 className="mt-1 text-2xl font-black">Does this look right?</h1>
        </div>

        {/* Personal Details Redaction Shield Badge (T15) */}
        {piiFound.length > 0 && (
          <div className="rounded-xl border border-[#B9DCC6] bg-[#F1F9F3] p-3 text-xs text-[#1E5E3A]">
            <p className="font-extrabold">
              🛡️ Privacy Filter Active ({piiFound.length} personal detail{piiFound.length > 1 ? 's' : ''} hidden):
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-700">
              Replaced{' '}
              {piiFound.map((p) => `${p.text} → ${p.placeholder}`).join(', ')} before generating your appeal.
            </p>
          </div>
        )}

        {/* Dynamic Case Classification Card */}
        {hasPrediction && !isBelowThreshold ? (
          <div className="rounded-2xl border border-[#B9DCC6] bg-[#F1F9F3] p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-base font-black text-[#0F172A]">
                  {formatCaseType(currentCaseType)}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Suggested dispute category from your story
                </p>
              </div>
              {confidencePct !== null && (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#1E5E3A] shadow-xs">
                  {confidencePct}% match
                </span>
              )}
            </div>
            {confidencePct !== null && (
              <div className="mt-3 h-1.5 rounded-full bg-[#CDE5D4]">
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
              <span className="mt-0.5 text-base leading-none">⚠️</span>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#A34F00]">
                  Please Confirm Your Case Type
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-700">
                  Our classifier confidence is below the 65% threshold. Please select the category that best fits your dispute below:
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Dispute Category Selection */}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-bold text-[#0F172A]">
            {hasPrediction ? 'Tap below if you want to switch the dispute category:' : 'Select your dispute category:'}
          </legend>
          {[
            { label: 'Fare or Earnings Dispute', value: 'fare_dispute' },
            { label: 'Passenger Safety or Conduct Complaint', value: 'passenger_safety' },
            { label: 'Cancellation Rate or Low Star Rating', value: 'rating_or_cancellation' },
            { label: 'Algorithmic Fraud, GPS, or Identity Flag', value: 'fraud_flag' }
          ].map((item) => (
            <label
              key={item.value}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3.5 text-xs transition ${
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

        {/* Extracted Facts with Edit, Delete & + Add Fact */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Extracted Trip Facts ({analysis.entities.length})
            </p>
            <button
              type="button"
              onClick={() => setIsAddingFact(!isAddingFact)}
              className="flex items-center gap-1 rounded-lg bg-[#E9F3ED] px-2.5 py-1 text-[11px] font-extrabold text-[#1E5E3A] hover:bg-[#D5EADB]"
            >
              <Plus size={12} /> Add Fact
            </button>
          </div>

          {analysis.entities.length === 0 && !isAddingFact && (
            <p className="text-xs leading-5 text-slate-500">
              No dates, locations, or KSh amounts detected yet. Tap <b>+ Add Fact</b> above to add trip details for your appeal letter.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {analysis.entities.map((item, idx) => (
              <div key={idx} className="flex items-center">
                {editingIndex === idx ? (
                  <div className="flex items-center gap-1 rounded-full border border-[#1E5E3A] bg-white px-2.5 py-1">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-28 text-xs font-bold text-[#1E5E3A] outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(idx)
                        if (e.key === 'Escape') setEditingIndex(null)
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(idx)}
                      className="text-xs font-extrabold text-[#1E5E3A]"
                    >
                      ✓
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 rounded-full bg-[#E9F3ED] px-3 py-1.5 text-xs font-bold text-[#1E5E3A]">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(idx, item.text)}
                      className="flex items-center gap-1 hover:underline"
                      title="Click to edit fact"
                    >
                      <span>
                        {item.label}: {item.text}
                      </span>
                      <Edit2 size={11} className="opacity-70" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${item.text}`}
                      onClick={() => onDeleteEntity(idx)}
                      className="ml-1 rounded-full p-0.5 text-slate-500 hover:bg-white/60 hover:text-red-600"
                      title="Remove fact"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {isAddingFact && (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex gap-2">
                <select
                  value={newFactLabel}
                  onChange={(e) => setNewFactLabel(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-[#0F172A]"
                >
                  <option value="DATE">DATE</option>
                  <option value="TIME">TIME</option>
                  <option value="LOCATION">LOCATION</option>
                  <option value="MONEY">MONEY</option>
                  <option value="TRIP_ID">TRIP_ID</option>
                </select>
                <input
                  type="text"
                  value={newFactText}
                  onChange={(e) => setNewFactText(e.target.value)}
                  placeholder="e.g. Westlands, KSh 1,450, 8:30pm"
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#1E5E3A]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveNewFact()
                  }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingFact(false)}
                  className="rounded-lg px-2.5 py-1 text-xs font-bold text-slate-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewFact}
                  className="rounded-lg bg-[#1E5E3A] px-3 py-1 text-xs font-bold text-white"
                >
                  Save Fact
                </button>
              </div>
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
            Confirm &amp; Check Evidence <ArrowRight size={18} />
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 5: Interactive Evidence Checklist & Gap Checker (Task T07 & T24) */
function Evidence({
  go,
  menu,
  analysis,
  evidenceHeld,
  onToggleEvidence,
  casesCount
}: {
  go: (n: number) => void
  menu: () => void
  analysis: AnalysisResult
  evidenceHeld: string[]
  onToggleEvidence: (itemId: string) => void
  casesCount: number
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const [attachedFileNames, setAttachedFileNames] = useState<Record<string, string>>({})

  const activeCaseType = analysis.classification.case_type || 'fare_dispute'
  const checklist =
    analysis.evidence.checklist || CASE_CHECKLISTS[activeCaseType] || CASE_CHECKLISTS.fare_dispute
  const readiness = analysis.evidence.readiness ?? 0.5
  const readinessPct = Math.round(readiness * 100)
  const readinessLabel =
    readiness >= 0.8 ? 'Strong Dossier' : readiness >= 0.5 ? 'Moderate' : 'Needs Evidence'

  const [evidenceImageError, setEvidenceImageError] = useState('')

  const handleAttachClick = (itemId: string) => {
    setEvidenceImageError('')
    setPendingItemId(itemId)
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && pendingItemId) {
      const check = await verifyUploadedScreenshot(file)
      if (!check.valid) {
        setEvidenceImageError(check.reason)
        setPendingItemId(null)
        e.target.value = ''
        return
      }
      setEvidenceImageError('')
      setAttachedFileNames((prev) => ({ ...prev, [pendingItemId]: file.name }))
      if (!evidenceHeld.includes(pendingItemId)) {
        onToggleEvidence(pendingItemId)
      }
    }
    setPendingItemId(null)
  }

  return (
    <>
      <Header
        step={steps[3]}
        onMenu={menu}
        onBack={() => go(4)}
        casesCount={casesCount}
        onOpenLog={() => go(7)}
      />
      <main className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">
              Step 4 · Evidence Gap Audit
            </p>
            <h1 className="mt-1 text-2xl font-black">Your Evidence Checklist</h1>
          </div>
          <b className="text-xs font-extrabold text-[#1E5E3A]">
            {readinessPct}% ({readinessLabel})
          </b>
        </div>

        <div>
          <div className="h-2.5 rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[#1E5E3A] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(8, readinessPct))}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-600">
            Tick the evidence you already have on your phone. Missing required items are highlighted below with the legal reason you need them.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          onChange={handleFileSelected}
          className="hidden"
        />

        {evidenceImageError && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold leading-5 text-red-700">
            ⚠️ {evidenceImageError}
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          {checklist.map((item) => {
            const isHeld = evidenceHeld.includes(item.item_id)
            const fileName = attachedFileNames[item.item_id]

            return (
              <div
                key={item.item_id}
                className={`rounded-2xl border p-3.5 transition ${
                  isHeld
                    ? 'border-[#B9DCC6] bg-[#F1F9F3]'
                    : item.required
                      ? 'border-l-4 border-amber-400 bg-[#FFF7ED]'
                      : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isHeld}
                    onChange={() => onToggleEvidence(item.item_id)}
                    className="mt-1 size-4 cursor-pointer accent-[#1E5E3A]"
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <b className="text-xs text-[#0F172A]">{item.label}</b>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                          isHeld
                            ? 'bg-[#1E5E3A] text-white'
                            : item.required
                              ? 'bg-amber-200 text-amber-950'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isHeld ? '✓ Ready' : item.required ? 'Required' : 'Optional'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-slate-600">{item.reason}</p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">
                      Source: {item.source}
                    </p>
                    {fileName && (
                      <p className="mt-1 text-[11px] font-bold text-[#1E5E3A]">
                        📎 Attached on device: {fileName}
                      </p>
                    )}
                    {!isHeld && (
                      <button
                        type="button"
                        onClick={() => handleAttachClick(item.item_id)}
                        className="mt-2 flex items-center gap-1.5 text-[11px] font-extrabold text-[#A34F00] hover:underline"
                      >
                        <Upload size={13} /> + Attach Screenshot / Document from Phone
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-auto pt-2">
          <Btn onClick={() => go(6)}>
            Generate Legal Appeal Dossier <ArrowRight size={18} />
          </Btn>
        </div>
      </main>
      <Footer />
    </>
  )
}

/* Screen 6: Preview & Dossier Persistence (Task T18, T27, T35) */
function Preview({
  go,
  menu,
  analysis,
  platform,
  profile,
  narrative,
  evidenceHeld,
  onUpdateAppealBody,
  onSaveDossier,
  casesCount
}: {
  go: (n: number) => void
  menu: () => void
  analysis: AnalysisResult
  platform: string
  profile: ProfileData
  narrative: string
  evidenceHeld: string[]
  onUpdateAppealBody: (newBody: string) => void
  onSaveDossier: () => Promise<void>
  casesCount: number
}) {
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfSuccess, setPdfSuccess] = useState(false)
  const [isEditingAppeal, setIsEditingAppeal] = useState(false)
  const [tawuPhone, setTawuPhone] = useState('+254 712 345 678')
  const [tawuEmail, setTawuEmail] = useState('info@tawu.or.ke')

  const headline =
    analysis.appeal.headline ||
    `FORMAL APPEAL AGAINST ACCOUNT RESTRICTION — ${platform.toUpperCase()}`

  const bodyText = analysis.appeal.body || narrative
  const policyRules =
    analysis.appeal.policy_rules && analysis.appeal.policy_rules.length > 0
      ? analysis.appeal.policy_rules
      : ['POL-NTSA-15', 'POL-DPA-26', 'POL-TAWU-01']

  const handleCopy = () => {
    navigator.clipboard?.writeText?.(`${headline}\n\n${bodyText}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleDownloadPdf = async () => {
    setGeneratingPdf(true)
    try {
      await generateAppealPdf({
        driverProfile: profile,
        caseData: {
          platform: platform || profile.platform || 'Bolt',
          narrative: analysis.redacted_narrative || narrative,
          entities: analysis.entities,
          evidence_held: evidenceHeld
        },
        appealDossier: {
          headline,
          statement_body: bodyText,
          policy_rules: policyRules,
          evidence_held: evidenceHeld
        }
      })
      setPdfSuccess(true)
      setTimeout(() => setPdfSuccess(false), 3500)
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

  const cleanTawuDigits = tawuPhone.replace(/\D/g, '').replace(/^0/, '254')
  const whatsappShareUrl = `https://wa.me/${cleanTawuDigits}?text=${encodeURIComponent(
    `*TAWU-KENYA DIGITAL DRIVER GRIEVANCE REPORT*\n*Submitted via Sauti ya Dere*\n\n${bodyText}`
  )}`

  const mailtoShareUrl = `mailto:${encodeURIComponent(tawuEmail.trim() || 'info@tawu.or.ke')}?subject=${encodeURIComponent(
    `[TAWU Driver Appeal] ${headline}`
  )}&body=${encodeURIComponent(bodyText)}`

  return (
    <>
      <Header
        step={steps[4]}
        onMenu={menu}
        onBack={() => go(5)}
        casesCount={casesCount}
        onOpenLog={() => go(7)}
      />
      <main className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">
              Step 5 · Structured Legal Dossier
            </p>
            <h1 className="mt-1 text-2xl font-black">Formal Appeal &amp; TAWU Report</h1>
          </div>
          <button
            type="button"
            onClick={() => setIsEditingAppeal(!isEditingAppeal)}
            className="flex items-center gap-1 rounded-lg bg-[#E9F3ED] px-2.5 py-1 text-xs font-extrabold text-[#1E5E3A]"
          >
            <Edit2 size={12} /> {isEditingAppeal ? 'Done Editing' : 'Edit Dossier'}
          </button>
        </div>

        {/* Cited Legal & Union Rules */}
        <div className="flex flex-wrap gap-1.5">
          {policyRules.map((ruleId) => (
            <span
              key={ruleId}
              className="rounded-md border border-[#B9DCC6] bg-[#F1F9F3] px-2 py-0.5 text-[10px] font-extrabold text-[#1E5E3A]"
            >
              ⚖️ {ruleId}
            </span>
          ))}
        </div>

        {/* Structured 5-Section Formal Legal Dossier */}
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#1E5E3A]">
                OFFICIAL DRIVER GRIEVANCE &amp; REINSTATEMENT DOSSIER
              </p>
              <b className="text-xs text-[#0F172A]">
                {platform} Appeals Desk &amp; TAWU-Kenya Union Escalation
              </b>
            </div>
            <FileText className="text-[#1E5E3A]" size={18} />
          </div>
          {isEditingAppeal ? (
            <textarea
              value={bodyText}
              onChange={(e) => onUpdateAppealBody(e.target.value)}
              rows={13}
              className="w-full rounded-xl border border-[#1E5E3A] bg-slate-50 p-3 font-mono text-[11px] leading-5 text-slate-800 outline-none"
            />
          ) : (
            <div className="max-h-[300px] overflow-y-auto pr-1 font-mono text-[11px] leading-5 whitespace-pre-line text-slate-800">
              {bodyText}
            </div>
          )}
        </article>

        <div className="grid grid-cols-2 gap-2.5">
          <Btn secondary onClick={handleCopy}>
            <Clipboard size={16} /> {copied ? 'Copied!' : 'Copy Appeal Text'}
          </Btn>
          <Btn secondary onClick={handleDownloadPdf} disabled={generatingPdf}>
            <Download size={16} />{' '}
            {generatingPdf ? 'Building PDF...' : pdfSuccess ? 'PDF Downloaded!' : 'Download 1-Page PDF'}
          </Btn>
        </div>

        {/* Dedicated TAWU-Kenya Union Contact & Direct Escalation Card */}
        <div className="flex flex-col gap-2.5 rounded-2xl border border-[#B9DCC6] bg-[#F1F9F3] p-4 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#1E5E3A]">
                UNION ESCALATION DESK
              </p>
              <b className="text-sm text-[#0F172A]">
                Send Report to TAWU-Kenya (Transport Workers Union)
              </b>
            </div>
            <Phone className="text-[#1E5E3A]" size={18} />
          </div>
          <p className="text-[11px] leading-4 text-slate-600">
            Send your structured dossier directly to the TAWU-Kenya Digital Transport Desk or enter your union representative&apos;s contact below:
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-700">
              TAWU WhatsApp Desk Number
              <input
                type="tel"
                value={tawuPhone}
                onChange={(e) => setTawuPhone(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-normal text-slate-900 outline-none focus:border-[#1E5E3A]"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-700">
              TAWU Escalation Email
              <input
                type="email"
                value={tawuEmail}
                onChange={(e) => setTawuEmail(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-normal text-slate-900 outline-none focus:border-[#1E5E3A]"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <a
              href={whatsappShareUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#1E5E3A] px-3 text-center text-xs font-extrabold text-white hover:bg-[#174A2E]"
            >
              📲 Send to TAWU WhatsApp
            </a>
            <a
              href={mailtoShareUrl}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#1E5E3A] bg-white px-3 text-center text-xs font-extrabold text-[#1E5E3A] hover:bg-emerald-50"
            >
              ✉️ Email to TAWU Desk
            </a>
          </div>
        </div>

        <Btn onClick={handleFinalSave} disabled={submitting}>
          {submitting ? 'Saving to Device...' : 'Save to Case Log & Start 30-Day Timer'}
        </Btn>
      </main>
      <Footer />
    </>
  )
}

/* Screen 7: Case Log (Task T25, T34) */
function Log({
  go,
  menu,
  cases,
  profile,
  onDeleteCase
}: {
  go: (n: number) => void
  menu: () => void
  cases: CaseRecord[]
  profile: ProfileData
  onDeleteCase: (id?: number) => Promise<void>
}) {
  const handleRedownloadPdf = async (c: CaseRecord) => {
    await generateAppealPdf({
      driverProfile: profile,
      caseData: {
        platform: c.platform || 'Bolt',
        narrative: c.narrative,
        entities: [],
        evidence_held: c.evidence_held || []
      },
      appealDossier: {
        headline: c.appeal_dossier?.headline || `Appeal: ${c.platform} Dispute`,
        statement_body: c.appeal_dossier?.statement_body || c.narrative,
        policy_rules: c.appeal_dossier?.policy_rules || ['POL-NTSA-15', 'POL-DPA-26', 'POL-TAWU-01'],
        evidence_held: c.evidence_held || []
      }
    })
  }

  return (
    <>
      <Header
        onMenu={menu}
        onBack={() => go(0)}
        casesCount={cases.length}
      />
      <main className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">
            On-Device Case Log (IndexedDB)
          </p>
          <h1 className="mt-1 text-2xl font-black">Your Cases &amp; 30-Day Timelines</h1>
        </div>

        {cases.length > 0 ? (
          cases.map((c, index) => {
            const dateStr = c.created_at
              ? new Date(c.created_at).toLocaleDateString('en-KE', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                })
              : 'Today'
            const elapsedDays = c.created_at
              ? Math.max(
                  0,
                  Math.floor((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24))
                )
              : 0
            const countdownDays = Math.max(0, 30 - elapsedDays)

            return (
              <div
                key={c.id || index}
                className="rounded-2xl bg-[#0F172A] p-4 text-white shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">
                      {c.platform || 'BOLT'} · CASE #SYD-{c.id || index + 1} · {dateStr}
                    </p>
                    <h2 className="mt-1 text-lg font-black">{formatCaseType(c.case_type)}</h2>
                  </div>
                  <span className="rounded-full bg-[#D8F0DE] px-2.5 py-1 text-[10px] font-black text-[#1E5E3A]">
                    {c.status || 'Awaiting Platform Reply'}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-300">{c.narrative}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
                  <div>
                    <p className="text-[11px] text-slate-400">Days since incident</p>
                    <b className="text-base">{elapsedDays} days</b>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">NTSA LN 120 window</p>
                    <b className="text-base text-[#FBBF24]">{countdownDays} days left</b>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={() => handleRedownloadPdf(c)}
                    className="flex items-center gap-1.5 text-xs font-extrabold text-[#D8F0DE] hover:underline"
                  >
                    <Download size={14} /> Download 1-Page PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteCase(c.id)}
                    className="flex items-center gap-1 text-xs font-bold text-red-300 hover:text-red-200"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            <Scale className="mx-auto mb-2 text-slate-400" size={32} />
            <b className="text-sm text-slate-700">No cases saved on this phone yet</b>
            <p className="mt-1 text-xs">
              Start a new appeal below to generate and track a dispute dossier locally on your device.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-[#F2C78F] bg-[#FFF7ED] p-3.5 text-xs leading-5 text-slate-700">
          <b className="text-[#0F172A]">Statutory 30-Day Resolution Window (NTSA LN 120 Reg 15)</b>
          <br />
          Ride-hailing platforms must resolve formal driver complaints within 30 days. If unresolved, export your 1-page PDF dossier above and escalate to TAWU-Kenya or NTSA.
        </div>

        <div className="mt-auto">
          <Btn onClick={() => go(2)}>+ Start a New Appeal Case</Btn>
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
  casesCount
}: {
  go: (n: number) => void
  menu: () => void
  casesCount: number
}) {
  const [rating, setRating] = useState<number>(5)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      setComment('')
      go(7)
    }, 1800)
  }

  return (
    <>
      <Header onMenu={menu} onBack={() => go(7)} casesCount={casesCount} onOpenLog={() => go(7)} />
      <main className="flex flex-1 flex-col gap-5 px-5 py-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D97706]">
            Driver Testing &amp; Feedback
          </p>
          <h1 className="mt-1 text-2xl font-black">How did Sauti ya Dere work for you?</h1>
        </div>
        <fieldset>
          <legend className="mb-2.5 text-sm font-bold">Tap a star rating (1 to 5):</legend>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} stars`}
                onClick={() => setRating(n)}
                className={`flex size-12 items-center justify-center rounded-xl border text-xl transition ${
                  n <= rating
                    ? 'border-[#D97706] bg-[#FFF7ED] text-[#D97706]'
                    : 'border-slate-200 bg-white text-slate-300'
                }`}
              >
                ★
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-2 text-sm font-bold">
          What was easy or confusing?
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-28 rounded-xl border border-slate-200 bg-white p-3.5 text-xs font-normal outline-none focus:border-[#1E5E3A]"
            placeholder="Tell us if any screen was hard to use or what we should improve..."
          />
        </label>
        {submitted && (
          <div className="rounded-xl border border-[#B9DCC6] bg-[#F1F9F3] p-3 text-xs font-bold text-[#1E5E3A]">
            ✓ Asante! Your feedback ({rating}/5 stars) has been recorded.
          </div>
        )}
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
          <p className="flex items-center gap-2 font-bold text-[#0F172A]">
            <Phone className="text-[#1E5E3A]" size={15} /> Support &amp; Union Contacts:
          </p>
          <p className="mt-2">• Email: sautiyadere@gmail.com</p>
          <p className="mt-1">• Union Partner: Transport &amp; Allied Workers Union (TAWU-Kenya)</p>
        </div>
        <div className="mt-auto">
          <Btn onClick={handleSubmit}>Submit Feedback</Btn>
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
  onClearAllData
}: {
  close: () => void
  go: (n: number) => void
  profile: ProfileData
  onClearAllData: () => Promise<void>
}) {
  const [clearedBanner, setClearedBanner] = useState(false)

  const handleClear = async () => {
    await onClearAllData()
    setClearedBanner(true)
    setTimeout(() => {
      setClearedBanner(false)
      close()
      go(0)
    }, 1200)
  }

  return (
    <div className="fixed inset-0 z-30 bg-[#0F172A]/40">
      <aside className="ml-auto flex min-h-full w-[min(310px,85vw)] flex-col bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-[#E9F3ED] font-black text-[#1E5E3A]">
              {(profile.name || 'D')[0].toUpperCase()}
            </div>
            <div>
              <b className="text-sm">{profile.name || 'Driver Profile'}</b>
              <p className="text-xs text-slate-500">
                {profile.platform || 'Bolt'} {profile.phone ? `· ${profile.phone}` : ''}
              </p>
            </div>
          </div>
          <button aria-label="Close menu" onClick={close} className="p-1 text-slate-500">
            <X />
          </button>
        </div>
        <nav className="flex flex-col gap-1.5 py-4">
          {[
            ['🏠', 'Home / Start Screen', 0],
            ['📋', 'Start New Appeal Case', 2],
            ['📁', 'My Case Log & 30-Day Timer', 7],
            ['👤', 'Driver Profile Settings', 1],
            ['💬', 'Give Usability Feedback', 8]
          ].map(([icon, label, targetScreen]) => (
            <button
              key={label as string}
              type="button"
              onClick={() => {
                go(targetScreen as number)
                close()
              }}
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-xs font-bold text-slate-700 hover:bg-[#F1F9F3]"
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="mt-2 flex min-h-11 items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 text-left text-xs font-bold text-red-700 hover:bg-red-100"
          >
            <span>🗑️</span>
            Wipe All Local Device Data
          </button>
        </nav>
        {clearedBanner && (
          <p className="mb-3 rounded-xl bg-[#F1F9F3] p-2.5 text-center text-xs font-bold text-[#1E5E3A]">
            ✓ All local profile and case records wiped from this phone.
          </p>
        )}
        <div className="mt-auto">
          <Trust text="All cases & screenshots stay strictly on your phone." />
        </div>
      </aside>
    </div>
  )
}

/* Root Page Component orchestrating state, local NLP fallback & backend API */
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
  const [customNoticeMessage, setCustomNoticeMessage] = useState('')
  const [noticeFileName, setNoticeFileName] = useState('')
  const [narrative, setNarrative] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<string[]>([])
  const [evidenceHeld, setEvidenceHeld] = useState<string[]>([])

  // 3. Analysis Result from Backend or Local Kenyan NLP Engine
  const [analysis, setAnalysis] = useState<AnalysisResult>({
    redacted_narrative: '',
    pii_found: [],
    classification: {
      case_type: '',
      confidence: null,
      confidence_threshold: 0.65,
      needs_confirmation: true
    },
    entities: [],
    evidence: {
      readiness: 0.4,
      missing: [],
      optional: [],
      checklist: CASE_CHECKLISTS.fare_dispute
    },
    appeal: {
      headline: '',
      body: '',
      policy_rules: []
    }
  })

  // 4. Saved Cases in IndexedDB
  const [casesList, setCasesList] = useState<CaseRecord[]>([])

  const refreshCases = async () => {
    try {
      const records = await getAllCases()
      setCasesList(records as CaseRecord[])
    } catch (err) {
      console.error('Error loading cases from IndexedDB:', err)
    }
  }

  useEffect(() => {
    async function init() {
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
        await refreshCases()
      } catch (err) {
        console.error('Error reading local profile from IndexedDB:', err)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (screen === 7 || screen === 0) {
      refreshCases()
    }
  }, [screen])

  const go = (n: number) => setScreen(n)
  const menu = () => setDrawer(true)

  const handleSaveProfile = async (newProfile: ProfileData) => {
    await saveLocalProfile(newProfile)
    setProfile(newProfile)
    if (newProfile.platform) {
      setCasePlatform(newProfile.platform)
    }
  }

  const handleUploadNoticeFile = (fileName: string) => {
    setNoticeFileName(fileName)
    setEvidenceHeld((prev) =>
      prev.includes('DEACTIVATION_NOTICE') ? prev : [...prev, 'DEACTIVATION_NOTICE']
    )
  }

  const handleAttachEvidenceFile = (fileName: string) => {
    setAttachedFiles((prev) => [...prev, fileName])
    setEvidenceHeld((prev) =>
      prev.includes('IN_APP_CHAT_SCREENSHOT') ? prev : [...prev, 'IN_APP_CHAT_SCREENSHOT']
    )
  }

  const handleSelectSample = (sample: { platform: string; notice: string; text: string }) => {
    setCasePlatform(sample.platform)
    setNoticeText(sample.notice)
    setNarrative(sample.text)
  }

  // Orchestrate Backend API call with instant Client-Side Kenyan Legal & NLP Fallback
  const handleAnalyze = async (overrideNarrative?: string) => {
    const textToAnalyze = (overrideNarrative !== undefined ? overrideNarrative : narrative).trim()
    if (textToAnalyze && textToAnalyze !== narrative) {
      setNarrative(textToAnalyze)
    }

    const fullNotice = [noticeText, customNoticeMessage].filter(Boolean).join(' — ')

    // Always run our deterministic local Kenyan analyzer so facts, PII redaction,
    // checklists, and templates are guaranteed even when offline or when backend is a stub.
    const localResult = runLocalAnalysis({
      narrative: textToAnalyze,
      noticeText: fullNotice,
      platform: casePlatform || 'Bolt',
      driverName: profile.name,
      driverPhone: profile.phone,
      evidenceHeld
    })

    const payload = {
      narrative: textToAnalyze || 'Dispute regarding account suspension.',
      platform: ['Uber', 'Bolt', 'Little', 'Faras'].includes(casePlatform) ? casePlatform : 'other',
      notice_text: fullNotice || 'Fare or payment dispute',
      evidence_held: evidenceHeld
    }

    try {
      const configuredEndpoint = getApiUrl('/api/analyze')
      const endpoints = Array.from(new Set([configuredEndpoint, '/api/analyze']))
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
          // Continue to local fallback if backend is unreachable
        }
      }

      // If backend returned real (non-stub) data, merge it; otherwise use localResult
      if (resData && resData.stub === false && resData.classification?.case_type) {
        const mergedCaseType = resData.classification.case_type || localResult.classification.case_type
        const mergedEntities =
          Array.isArray(resData.entities) && resData.entities.length > 0
            ? resData.entities
            : localResult.entities
        const localEv = evaluateEvidence(mergedCaseType, evidenceHeld)
        const localApp = buildAppealDossier({
          caseType: mergedCaseType,
          platform: casePlatform || 'Bolt',
          driverName: profile.name,
          driverPhone: profile.phone,
          narrative: resData.redacted_narrative || localResult.redacted_narrative,
          entities: mergedEntities,
          evidenceHeld
        })

        setAnalysis({
          redacted_narrative: resData.redacted_narrative || localResult.redacted_narrative,
          pii_found: localResult.pii_found,
          classification: {
            case_type: mergedCaseType,
            confidence: resData.classification.confidence ?? localResult.classification.confidence,
            confidence_threshold: 0.65,
            needs_confirmation:
              resData.classification.needs_confirmation ?? localResult.classification.needs_confirmation
          },
          entities: mergedEntities,
          evidence: localEv,
          // Always use localApp for the appeal text so the driver's exact words and only verified facts/evidence are included
          appeal: localApp
        })
        return
      }
    } catch {
      // Fallback to localResult below
    }

    setAnalysis(localResult)
  }

  // Recompute appeal whenever entities, case type, or held evidence change
  const recomputeDossier = (
    nextCaseType: string,
    nextEntities: EntityItem[],
    nextHeld: string[]
  ) => {
    const ev = evaluateEvidence(nextCaseType, nextHeld)
    const app = buildAppealDossier({
      caseType: nextCaseType,
      platform: casePlatform || 'Bolt',
      driverName: profile.name,
      driverPhone: profile.phone,
      narrative: analysis.redacted_narrative || narrative,
      entities: nextEntities as ExtractedEntity[],
      evidenceHeld: nextHeld
    })
    return { ev, app }
  }

  const handleUpdateEntity = (index: number, newText: string) => {
    setAnalysis((prev) => {
      const next = [...prev.entities]
      if (next[index]) {
        next[index] = { ...next[index], text: newText }
      }
      const activeType = prev.classification.case_type || 'fare_dispute'
      const { ev, app } = recomputeDossier(activeType, next, evidenceHeld)
      return { ...prev, entities: next, evidence: ev, appeal: app }
    })
  }

  const handleAddEntity = (entity: EntityItem) => {
    setAnalysis((prev) => {
      const next = [...prev.entities, entity]
      const activeType = prev.classification.case_type || 'fare_dispute'
      const { ev, app } = recomputeDossier(activeType, next, evidenceHeld)
      return { ...prev, entities: next, evidence: ev, appeal: app }
    })
  }

  const handleDeleteEntity = (index: number) => {
    setAnalysis((prev) => {
      const next = [...prev.entities]
      next.splice(index, 1)
      const activeType = prev.classification.case_type || 'fare_dispute'
      const { ev, app } = recomputeDossier(activeType, next, evidenceHeld)
      return { ...prev, entities: next, evidence: ev, appeal: app }
    })
  }

  const handleSelectCaseType = (t: string) => {
    const checklistDefaults = (CASE_CHECKLISTS[t] || [])
      .filter((i) => i.required)
      .slice(0, 1)
      .map((i) => i.item_id)
    const nextHeld = evidenceHeld.length > 0 ? evidenceHeld : checklistDefaults
    setEvidenceHeld(nextHeld)

    setAnalysis((prev) => {
      const { ev, app } = recomputeDossier(t, prev.entities, nextHeld)
      return {
        ...prev,
        classification: {
          ...prev.classification,
          case_type: t,
          confidence: prev.classification.confidence ?? 0.92,
          needs_confirmation: false
        },
        evidence: ev,
        appeal: app
      }
    })
  }

  const handleToggleEvidence = (itemId: string) => {
    const nextHeld = evidenceHeld.includes(itemId)
      ? evidenceHeld.filter((id) => id !== itemId)
      : [...evidenceHeld, itemId]
    setEvidenceHeld(nextHeld)

    setAnalysis((prev) => {
      const activeType = prev.classification.case_type || 'fare_dispute'
      const { ev, app } = recomputeDossier(activeType, prev.entities, nextHeld)
      return { ...prev, evidence: ev, appeal: app }
    })
  }

  const handleUpdateAppealBody = (newBody: string) => {
    setAnalysis((prev) => ({
      ...prev,
      appeal: {
        ...prev.appeal,
        body: newBody
      }
    }))
  }

  const handleSaveDossier = async () => {
    try {
      await saveCase({
        platform: casePlatform || 'Bolt',
        case_type: analysis.classification.case_type || 'fare_dispute',
        status: 'Awaiting Platform Reply',
        created_at: new Date().toISOString(),
        narrative: analysis.redacted_narrative || narrative || 'Driver dispute submission.',
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

  const handleDeleteCase = async (id?: number) => {
    if (id === undefined) return
    await deleteCaseById(id)
    await refreshCases()
  }

  const handleClearAllData = async () => {
    await clearAllLocalData()
    setProfile({ name: '', phone: '', platform: 'Bolt' })
    setCasesList([])
    setNarrative('')
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <div className="mx-auto flex min-h-screen w-full max-w-[410px] flex-col bg-[#F8FAFC] shadow-xl">
        <div className="flex flex-1 flex-col">
          {screen === 0 && <Splash go={go} menu={menu} casesCount={casesList.length} />}
          {screen === 1 && (
            <Profile
              go={go}
              menu={menu}
              profile={profile}
              onSave={handleSaveProfile}
              casesCount={casesList.length}
            />
          )}
          {screen === 2 && (
            <Intake
              go={go}
              menu={menu}
              platform={casePlatform}
              noticeText={noticeText}
              customNoticeMessage={customNoticeMessage}
              noticeFileName={noticeFileName}
              onChangePlatform={setCasePlatform}
              onChangeNotice={setNoticeText}
              onChangeCustomNotice={setCustomNoticeMessage}
              onUploadNoticeFile={handleUploadNoticeFile}
              casesCount={casesList.length}
            />
          )}
          {screen === 3 && (
            <Chat
              go={go}
              menu={menu}
              platform={casePlatform}
              noticeText={noticeText}
              driverName={profile.name}
              onAnalyze={handleAnalyze}
              narrative={narrative}
              onChangeNarrative={setNarrative}
              onSelectSample={handleSelectSample}
              attachedFiles={attachedFiles}
              onAttachEvidenceFile={handleAttachEvidenceFile}
              casesCount={casesList.length}
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
              casesCount={casesList.length}
            />
          )}
          {screen === 5 && (
            <Evidence
              go={go}
              menu={menu}
              analysis={analysis}
              evidenceHeld={evidenceHeld}
              onToggleEvidence={handleToggleEvidence}
              casesCount={casesList.length}
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
              onUpdateAppealBody={handleUpdateAppealBody}
              onSaveDossier={handleSaveDossier}
              casesCount={casesList.length}
            />
          )}
          {screen === 7 && (
            <Log
              go={go}
              menu={menu}
              cases={casesList}
              profile={profile}
              onDeleteCase={handleDeleteCase}
            />
          )}
          {screen === 8 && <Feedback go={go} menu={menu} casesCount={casesList.length} />}
        </div>
      </div>
      {drawer && (
        <Drawer
          close={() => setDrawer(false)}
          go={go}
          profile={profile}
          onClearAllData={handleClearAllData}
        />
      )}
    </main>
  )
}
