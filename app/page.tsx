'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import knowledgeBase from '@/lib/knowledge-base.json'

const CASE_TYPE_GROUPS = [
  {
    group: 'Special Leave Petitions',
    abbr: 'SLP',
    types: [
      { id: 'slp_civil', label: 'SLP Civil', sublabel: 'Art. 136 — Civil', order: 'Order XXI' },
      { id: 'slp_criminal', label: 'SLP Criminal', sublabel: 'Art. 136 — Criminal', order: 'Order XXII' },
    ],
  },
  {
    group: 'Writ Petitions',
    abbr: 'WP',
    types: [
      { id: 'writ_article32', label: 'Writ — Art. 32', sublabel: 'Fundamental Rights', order: 'Order XXXV' },
      { id: 'writ_habeas_corpus', label: 'Habeas Corpus', sublabel: 'Liberty of Person', order: 'Order XXXV' },
      { id: 'pil', label: 'PIL', sublabel: 'Public Interest Litigation', order: 'Order XXXV' },
    ],
  },
  {
    group: 'Appeals',
    abbr: 'CA',
    types: [
      { id: 'appeal_civil', label: 'Civil Appeal', sublabel: 'With Certificate / Leave', order: 'Order XIX' },
      { id: 'appeal_criminal', label: 'Criminal Appeal', sublabel: 'From HC Judgment', order: 'Order XX' },
    ],
  },
  {
    group: 'Transfer Petitions',
    abbr: 'TP',
    types: [
      { id: 'transfer_civil', label: 'Transfer Civil', sublabel: 'Transfer of Civil Cases', order: 'Order XXXIX' },
      { id: 'transfer_criminal', label: 'Transfer Criminal', sublabel: 'Transfer of Criminal Cases', order: 'Order XXXIX' },
    ],
  },
  {
    group: 'Contempt',
    abbr: 'CP',
    types: [
      { id: 'contempt_civil', label: 'Contempt Civil', sublabel: 'Disobedience of Order', order: 'Order XL' },
      { id: 'contempt_criminal', label: 'Contempt Criminal', sublabel: 'Scandalising the Court', order: 'Order XL' },
    ],
  },
  {
    group: 'Review & Curative',
    abbr: 'RP',
    types: [
      { id: 'review_petition', label: 'Review Petition', sublabel: 'Review of SC Order', order: 'Order XLVII' },
      { id: 'curative_petition', label: 'Curative Petition', sublabel: 'Post-Review Remedy', order: 'Rupa Ashok Hurra' },
      { id: 'election_petition', label: 'Election Petition', sublabel: 'Election Disputes', order: 'Order L' },
    ],
  },
]

const ALL_CASE_TYPES = CASE_TYPE_GROUPS.flatMap((g) => g.types)

const scData = knowledgeBase.courts.supreme_court

type CaseTypeData = {
  name?: string
  limitation?: { from_judgment_order?: string; from_refusal_of_certificate?: string; general?: string }
  court_fee?: { at_institution?: number; note?: string }
  validation_checklist?: Array<{ check_id: string; category: string; description: string; severity: string; rule: string }>
  sensitive_case_checks?: boolean
}

export default function HomePage() {
  const router = useRouter()
  const [selectedCase, setSelectedCase] = useState<string>('slp_civil')

  const caseData = (scData.case_types as Record<string, CaseTypeData>)[selectedCase]
  const checklist = caseData?.validation_checklist || []
  const limitation = caseData?.limitation
  const courtFee = caseData?.court_fee
  const isSensitive = caseData?.sensitive_case_checks

  function handleStart() {
    router.push(`/validate?caseType=${selectedCase}`)
  }

  const selectedMeta = ALL_CASE_TYPES.find((ct) => ct.id === selectedCase)

  return (
    <div className="relative min-h-screen flex flex-col" style={{ zIndex: 1 }}>

      {/* Nav */}
      <nav className="relative border-b px-6 sm:px-10 py-4 flex items-center justify-between"
        style={{ borderColor: 'rgba(201,162,39,0.2)', background: 'rgba(4,17,31,0.65)', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="flex items-center gap-3">
          <ScalesIcon />
          <div>
            <span className="font-display text-xl font-semibold" style={{ color: '#c9a227', letterSpacing: '0.02em' }}>CourtCheck</span>
            <span className="hidden sm:inline text-xs ml-3 font-mono opacity-35 tracking-widest uppercase">SC Rules 2013</span>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm" style={{ color: 'rgba(245,240,232,0.5)' }}>
          <a href="/tools" className="hover:opacity-100 transition-opacity">PDF Tools</a>
          <a href="https://sci.gov.in" target="_blank" rel="noopener" className="hover:opacity-100 transition-opacity hidden sm:inline">SC Registry</a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 sm:py-20">

        {/* Background glow rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" aria-hidden>
          <div className="w-[min(600px,90vw)] aspect-square rounded-full opacity-[0.035]"
            style={{ border: '1px solid #c9a227', boxShadow: 'inset 0 0 80px rgba(201,162,39,0.15)' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(350px,50vw)] aspect-square rounded-full opacity-[0.025]"
            style={{ border: '1px solid #c9a227' }} />
        </div>

        <div className="relative max-w-5xl w-full">

          {/* Headline block */}
          <div className="text-center mb-10">
            <div className="fade-up fade-up-0 inline-flex items-center gap-2 mb-7 px-4 py-2 rounded-full text-xs font-mono tracking-widest uppercase"
              style={{ border: '1px solid rgba(201,162,39,0.3)', color: '#ddb94a', background: 'rgba(201,162,39,0.05)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Supreme Court of India · 14 Petition Types · Two-Layer Validation
            </div>

            <h1 className="fade-up fade-up-1 font-display font-semibold mb-4"
              style={{ fontSize: 'clamp(40px, 6.5vw, 78px)', lineHeight: 1.05, letterSpacing: '-0.02em', color: '#f5f0e8' }}>
              File{' '}
              <span className="gold-shimmer">right.</span>
              {' '}First time.
            </h1>

            <p className="fade-up fade-up-2 text-base sm:text-lg mb-0 max-w-xl mx-auto leading-relaxed"
              style={{ color: 'rgba(245,240,232,0.5)' }}>
              Select your petition type. Upload PDF. Every defect flagged with the exact Rule —
              before the SC Registry returns your file.
            </p>
          </div>

          {/* Main layout — two columns on desktop */}
          <div className="fade-up fade-up-3 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 mb-6">

            {/* Left: Case type selector */}
            <div className="glass-card rounded-2xl p-5 sm:p-6">
              <label className="block text-xs font-mono tracking-widest uppercase mb-4"
                style={{ color: 'rgba(201,162,39,0.65)' }}>Select Case Type</label>

              <div className="space-y-4">
                {CASE_TYPE_GROUPS.map((group) => (
                  <div key={group.group}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono opacity-30 tracking-widest uppercase">{group.group}</span>
                      <div className="flex-1 h-px opacity-10" style={{ background: '#c9a227' }} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {group.types.map((ct) => {
                        const active = selectedCase === ct.id
                        return (
                          <button key={ct.id} onClick={() => setSelectedCase(ct.id)}
                            className="text-left p-3 rounded-xl transition-all duration-150"
                            style={{
                              border: active ? '1px solid rgba(201,162,39,0.55)' : '1px solid rgba(201,162,39,0.1)',
                              background: active ? 'rgba(201,162,39,0.09)' : 'rgba(15,32,64,0.35)',
                            }}>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{
                                  background: active ? '#c9a227' : 'rgba(201,162,39,0.2)',
                                  boxShadow: active ? '0 0 0 3px rgba(201,162,39,0.12)' : 'none',
                                }} />
                              <span className="font-semibold text-xs leading-snug"
                                style={{ color: active ? '#ddb94a' : '#f5f0e8' }}>{ct.label}</span>
                            </div>
                            <div className="text-xs opacity-40 leading-snug pl-4">{ct.sublabel}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Start button */}
              <div className="mt-6 flex gap-3">
                <button onClick={handleStart}
                  className="btn-gold rounded-xl px-8 py-3.5 text-sm flex-1 flex items-center justify-center gap-2.5">
                  Validate {selectedMeta?.label || 'Filing'}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
                <a href="/tools" className="btn-outline rounded-xl px-5 py-3.5 text-sm flex items-center gap-2 hidden sm:flex">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  PDF Tools
                </a>
              </div>
            </div>

            {/* Right: Info panel for selected case */}
            <div className="space-y-4">

              {/* Info pills */}
              <div className="glass-card rounded-2xl p-5">
                <div className="text-xs font-mono tracking-widest uppercase mb-3 opacity-40">
                  {selectedMeta?.label} — {selectedMeta?.order}
                </div>

                <div className="space-y-3">
                  {courtFee?.at_institution ? (
                    <InfoRow label="Court Fee" value={`₹${courtFee.at_institution.toLocaleString()}`}
                      note={courtFee.note} />
                  ) : (
                    <InfoRow label="Court Fee" value="NIL" note="Criminal / PIL proceedings" />
                  )}
                  {limitation?.from_judgment_order && (
                    <InfoRow label="Limitation" value={limitation.from_judgment_order} />
                  )}
                  {limitation?.from_refusal_of_certificate && (
                    <InfoRow label="Certificate Refusal" value={limitation.from_refusal_of_certificate} />
                  )}
                  {(limitation as { general?: string })?.general && (
                    <InfoRow label="Limitation" value={(limitation as { general?: string }).general!} />
                  )}
                  {isSensitive && (
                    <div className="flex items-start gap-2 pt-1">
                      <span className="text-xs px-2 py-1 rounded font-mono"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                        ⚠ Sensitive Case
                      </span>
                      <span className="text-xs opacity-40 pt-1">Victim identity must be suppressed</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Validation checklist */}
              {checklist.length > 0 && (
                <div className="glass-card rounded-2xl p-5">
                  <div className="text-xs font-mono tracking-widest uppercase mb-3 opacity-40">
                    Checks · {checklist.length} rules
                  </div>
                  <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(201,162,39,0.2) transparent' }}>
                    {checklist.map((c) => (
                      <div key={c.check_id} className="flex items-center gap-2.5">
                        <span style={{ color: '#c9a227', fontSize: '9px' }}>◆</span>
                        <span className="text-xs opacity-60 flex-1 leading-snug">{c.category}</span>
                        <span className="rule-badge flex-shrink-0">{c.check_id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Layers badge */}
              <div className="glass-card rounded-2xl p-5">
                <div className="text-xs font-mono tracking-widest uppercase mb-3 opacity-40">Validation Engine</div>
                <div className="space-y-2">
                  <LayerBadge num="1" label="Rule Engine" desc="Deterministic — SC Rules 2013" color="#c9a227" />
                  <LayerBadge num="2" label="Claude AI" desc="Semantic analysis — legal meaning" color="#818cf8" />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom CTA for mobile */}
          <div className="lg:hidden fade-up fade-up-4 flex gap-3">
            <button onClick={handleStart}
              className="btn-gold rounded-xl px-8 py-4 text-sm flex-1 flex items-center justify-center gap-2">
              Start Validation →
            </button>
            <a href="/tools" className="btn-outline rounded-xl px-6 py-4 text-sm inline-flex items-center">
              Tools
            </a>
          </div>
        </div>
      </section>

      {/* Stats footer bar */}
      <footer className="border-t px-6 sm:px-8 py-4 flex flex-col sm:flex-row flex-wrap gap-4 items-center justify-between text-xs"
        style={{ borderColor: 'rgba(201,162,39,0.1)', color: 'rgba(245,240,232,0.35)', background: 'rgba(4,17,31,0.4)' }}>
        <div className="flex flex-wrap justify-center sm:justify-start gap-3 sm:gap-5">
          {[
            ['Case Types', '14'],
            ['Checks', '20+'],
            ['AI Layer', 'Claude Sonnet'],
            ['File Size', '200MB max'],
            ['Format', 'A4 Only'],
          ].map(([k, v]) => (
            <span key={k}>{k}: <span style={{ color: '#ddb94a' }}>{v}</span></span>
          ))}
        </div>
        <span className="font-mono opacity-60 text-center sm:text-right mt-1 sm:mt-0">For Advocates-on-Record only</span>
      </footer>
    </div>
  )
}

function ScalesIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ color: '#c9a227' }}>
      <path d="M12 3v18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 9H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 15h4M17 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 9l-2 6h4L5 9zM19 9l-2 6h4L19 9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 21h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function InfoRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs font-mono opacity-40 shrink-0 mt-0.5">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold" style={{ color: '#ddb94a' }}>{value}</span>
        {note && <div className="text-xs opacity-35 mt-0.5 max-w-[200px] leading-snug text-right">{note}</div>}
      </div>
    </div>
  )
}

function LayerBadge({ num, label, desc, color }: { num: string; label: string; desc: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold font-mono shrink-0"
        style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
        {num}
      </div>
      <div>
        <div className="text-xs font-semibold" style={{ color }}>{label}</div>
        <div className="text-xs opacity-35">{desc}</div>
      </div>
    </div>
  )
}
