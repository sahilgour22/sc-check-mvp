'use client'
import { useState, useEffect, use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type { ValidationReport, DefectItem } from '@/lib/validator/orchestrator'

const CASE_LABELS: Record<string, string> = {
  slp_civil: 'SLP Civil',
  slp_criminal: 'SLP Criminal',
  writ_article32: 'Writ Petition (Art. 32)',
  writ_habeas_corpus: 'Habeas Corpus',
  appeal_civil: 'Civil Appeal',
  appeal_criminal: 'Criminal Appeal',
  transfer_civil: 'Transfer Petition (Civil)',
  transfer_criminal: 'Transfer Petition (Criminal)',
  contempt_civil: 'Contempt Petition (Civil)',
  contempt_criminal: 'Contempt Petition (Criminal)',
  review_petition: 'Review Petition',
  curative_petition: 'Curative Petition',
  pil: 'PIL',
  election_petition: 'Election Petition',
}

function ResultsPageInner({ sessionId }: { sessionId: string }) {
  const searchParams = useSearchParams()
  const caseType = searchParams.get('caseType') || 'slp_civil'
  const [report, setReport] = useState<ValidationReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<string>('all')

  useEffect(() => {
    async function loadReport() {
      try {
        const res = await fetch('/api/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        if (!res.ok) throw new Error('Report not found')
        const data: ValidationReport = await res.json()
        setReport(data)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load report')
      } finally {
        setLoading(false)
      }
    }
    loadReport()
  }, [sessionId])

  if (loading) return <LoadingScreen />
  if (error || !report) return <ErrorScreen message={error || 'Report not found'} sessionId={sessionId} />

  const { summary, allDefects } = report
  const filingReady = summary.filingReady

  const filtered = activeFilter === 'all'
    ? allDefects
    : allDefects.filter((d) => d.severity === activeFilter)

  return (
    <div className="relative min-h-screen flex flex-col" style={{ zIndex: 1 }}>

      {/* Nav */}
      <nav className="border-b px-6 py-4 flex items-center justify-between"
        style={{ borderColor: 'rgba(201,162,39,0.2)', background: 'rgba(4,17,31,0.65)', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <a href="/" className="flex items-center gap-3">
          <ScalesIcon />
          <span className="font-display text-xl font-semibold" style={{ color: '#c9a227' }}>CourtCheck</span>
        </a>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono opacity-40">{sessionId.slice(0, 8)}…</span>
          <a href={`/validate?caseType=${caseType}`}
            className="btn-outline text-xs rounded-lg px-4 py-2">Re-validate</a>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto w-full px-6 py-10">

        {/* Verdict Banner */}
        <div className="fade-up fade-up-0 mb-8">
          <VerdictBanner filingReady={filingReady} summary={summary} caseType={caseType} />
        </div>

        {/* Summary pills */}
        <div className="fade-up fade-up-1 flex flex-wrap gap-3 mb-8">
          <SummaryPill label="Critical" count={summary.criticalCount} color="#c0392b" bg="rgba(192,57,43,0.12)"
            active={activeFilter === 'critical'} onClick={() => setActiveFilter(activeFilter === 'critical' ? 'all' : 'critical')} />
          <SummaryPill label="Warnings" count={summary.warningCount} color="#d97706" bg="rgba(217,119,6,0.1)"
            active={activeFilter === 'warning'} onClick={() => setActiveFilter(activeFilter === 'warning' ? 'all' : 'warning')} />
          <SummaryPill label="Passed" count={summary.passedCount} color="#16a34a" bg="rgba(22,163,74,0.1)"
            active={activeFilter === 'passed'} onClick={() => setActiveFilter(activeFilter === 'passed' ? 'all' : 'passed')} />
          <SummaryPill label="Info" count={summary.infoCount} color="#2563eb" bg="rgba(37,99,235,0.1)"
            active={activeFilter === 'info'} onClick={() => setActiveFilter(activeFilter === 'info' ? 'all' : 'info')} />
          <div className="ml-auto flex items-center gap-2 text-xs opacity-40">
            <span>{report.pageCount} pages</span>
            <span>·</span>
            <span>{CASE_LABELS[caseType]}</span>
            {report.isScanned && <><span>·</span><span className="text-yellow-500">Scanned PDF</span></>}
          </div>
        </div>

        {/* AI Overall Assessment */}
        {report.aiResults?.ai_available && report.aiResults?.overall_assessment && (
          <div className="fade-up fade-up-2 glass-card rounded-xl p-5 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <AiIcon />
              <span className="text-xs font-mono tracking-widest uppercase opacity-50">AI Assessment — Claude Sonnet</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(245,240,232,0.75)' }}>
              {report.aiResults.overall_assessment}
            </p>
          </div>
        )}

        {/* AI unavailable — soft info banner, NOT a defect */}
        {report.summary.aiAvailable === false && (
          <div className="fade-up fade-up-2 rounded-xl px-5 py-4 mb-8 flex items-start gap-3"
            style={{ background: 'rgba(201,162,39,0.04)', border: '1px solid rgba(201,162,39,0.12)' }}>
            <div className="w-5 h-5 rounded shrink-0 mt-0.5 flex items-center justify-center"
              style={{ background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.25)' }}>
              <svg className="w-3 h-3" style={{ color: '#c9a227' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-semibold mb-0.5" style={{ color: '#c9a227' }}>AI Semantic Analysis not available</div>
              <div className="text-xs opacity-50 leading-relaxed">
                Set <code className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: 'rgba(201,162,39,0.08)' }}>ANTHROPIC_API_KEY</code> in{' '}
                <code className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: 'rgba(201,162,39,0.08)' }}>.env.local</code> to enable Layer 2 semantic checks.
                Layer 1 deterministic results above are fully valid.
              </div>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-5 text-sm">
          {['all', 'critical', 'warning', 'info'].map((f) => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className="px-4 py-1.5 rounded-full text-xs font-mono tracking-wider uppercase transition-all"
              style={{
                background: activeFilter === f ? 'rgba(201,162,39,0.15)' : 'transparent',
                border: activeFilter === f ? '1px solid rgba(201,162,39,0.4)' : '1px solid rgba(201,162,39,0.12)',
                color: activeFilter === f ? '#ddb94a' : 'rgba(245,240,232,0.4)',
              }}>
              {f === 'all' ? `All (${allDefects.length})` : f}
            </button>
          ))}
        </div>

        {/* Defect Cards */}
        <div className="space-y-3 mb-10">
          {filtered.length === 0 ? (
            <div className="text-center py-16 opacity-40">
              <div className="text-4xl mb-3">✓</div>
              <div>No {activeFilter} issues found</div>
            </div>
          ) : (
            filtered.map((defect, i) => (
              <DefectCard
                key={defect.id}
                defect={defect}
                index={i}
                expanded={expandedId === defect.id}
                onToggle={() => setExpandedId(expandedId === defect.id ? null : defect.id)}
              />
            ))
          )}
        </div>

        {/* Tools section */}
        {!filingReady && (
          <div className="fade-up fade-up-4 glass-card rounded-2xl p-6 mb-8">
            <h2 className="font-display text-xl mb-4" style={{ color: '#f5f0e8' }}>Fix Your Filing</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {summary.criticalCount > 0 && allDefects.some(d => d.category?.toLowerCase().includes('order')) && (
                <ToolButton href="/tools#reorder" icon="⇅" label="Reorder Documents"
                  desc="Fix prescribed document sequence" />
              )}
              {allDefects.some(d => d.category?.toLowerCase().includes('victim')) && (
                <ToolButton href="/tools#redact" icon="█" label="Redact Victim Name"
                  desc="Replace with Victim / Prosecutrix" />
              )}
              <ToolButton href="/tools#merge" icon="⊞" label="Merge PDFs"
                desc="Combine multiple PDF files" />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="fade-up fade-up-5 flex flex-wrap gap-3 justify-between items-center">
          <div className="flex gap-3">
            <a href={`/validate?caseType=${caseType}`} className="btn-gold rounded-xl px-6 py-3 text-sm">
              Re-validate →
            </a>
            <a href="/" className="btn-outline rounded-xl px-6 py-3 text-sm">
              New Filing
            </a>
          </div>
          <div className="text-xs font-mono opacity-30">
            Generated: {new Date(report.generatedAt).toLocaleString('en-IN')}
          </div>
        </div>
      </main>
    </div>
  )
}

function VerdictBanner({ filingReady, summary, caseType }: {
  filingReady: boolean
  summary: ValidationReport['summary']
  caseType: string
}) {
  const accent = filingReady ? '#22c55e' : '#e55a4e'
  const accentDim = filingReady ? 'rgba(34,197,94,0.14)' : 'rgba(229,90,78,0.12)'
  const accentBorder = filingReady ? 'rgba(34,197,94,0.28)' : 'rgba(229,90,78,0.28)'

  return (
    <div className="relative rounded-2xl overflow-hidden"
      style={{ background: accentDim, border: `1px solid ${accentBorder}` }}>

      {/* Subtle top accent line */}
      <div className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.6 }} />

      {/* Corner glow */}
      <div className="absolute top-0 right-0 w-64 h-64 pointer-events-none"
        style={{ background: `radial-gradient(circle at top right, ${accent}12 0%, transparent 65%)` }} />

      <div className="relative p-7 sm:p-9 flex flex-col sm:flex-row items-start sm:items-center gap-7">

        {/* Stamp seal */}
        <div className="stamp-in flex-shrink-0">
          <div className="relative w-20 h-20">
            {/* Outer ring */}
            <div className="absolute inset-0 rounded-full"
              style={{ border: `2px solid ${accent}`, opacity: 0.35 }} />
            {/* Inner circle */}
            <div className="absolute inset-2 rounded-full flex flex-col items-center justify-center"
              style={{
                border: `2px solid ${accent}`,
                background: filingReady ? 'rgba(34,197,94,0.08)' : 'rgba(229,90,78,0.08)',
                transform: 'rotate(-4deg)',
              }}>
              <div className="text-2xl leading-none mb-0.5" style={{ color: accent }}>
                {filingReady ? '✓' : '✕'}
              </div>
              <div className="font-mono text-center leading-none"
                style={{ color: accent, fontSize: '6px', letterSpacing: '0.08em', opacity: 0.8 }}>
                {filingReady ? 'REGISTRY\nREADY' : 'DEFECTIVE\nFILING'}
              </div>
            </div>
          </div>
        </div>

        {/* Verdict text */}
        <div className="flex-1">
          {/* Status label */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono tracking-widest uppercase px-2 py-0.5 rounded"
              style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}>
              {filingReady ? 'SC Registry — Clearance' : 'SC Registry — Return'}
            </span>
            <span className="text-xs font-mono opacity-30">{CASE_LABELS[caseType] || caseType}</span>
          </div>

          {/* Main heading */}
          <div className="font-display font-semibold mb-2"
            style={{ fontSize: 'clamp(22px, 4vw, 36px)', color: '#f5f0e8', lineHeight: 1.1 }}>
            {filingReady
              ? 'Filing Ready to Submit'
              : <>
                  {summary.criticalCount} Critical Defect{summary.criticalCount !== 1 ? 's' : ''}{' '}
                  <span style={{ color: accent }}>Found</span>
                </>
            }
          </div>

          <div className="text-sm mb-4" style={{ color: 'rgba(245,240,232,0.5)' }}>
            {filingReady
              ? 'All mandatory checks passed. This filing meets SC Rules 2013 requirements.'
              : `Resolve all ${summary.criticalCount} critical defect${summary.criticalCount !== 1 ? 's' : ''} below before submitting to the SC Registry. Registry will return incomplete files.`}
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-2.5">
            <StatChip value={summary.criticalCount} label="Critical" color="#e55a4e" bg="rgba(229,90,78,0.12)" />
            <StatChip value={summary.warningCount} label={summary.warningCount === 1 ? 'Warning' : 'Warnings'} color="#f59e0b" bg="rgba(217,119,6,0.1)" />
            <StatChip value={summary.passedCount} label="Passed" color="#22c55e" bg="rgba(34,197,94,0.1)" />
            {summary.infoCount > 0 && (
              <StatChip value={summary.infoCount} label="Info" color="#60a5fa" bg="rgba(96,165,250,0.1)" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatChip({ value, label, color, bg }: { value: number; label: string; color: string; bg: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
      style={{ background: bg, border: `1px solid ${color}25` }}>
      <span className="font-display font-semibold text-lg leading-none" style={{ color }}>{value}</span>
      <span className="text-xs opacity-60">{label}</span>
    </div>
  )
}

function DefectCard({ defect, index, expanded, onToggle }: {
  defect: DefectItem
  index: number
  expanded: boolean
  onToggle: () => void
}) {
  const colors: Record<string, { border: string; bg: string; badge: string; badgeBg: string; dot: string }> = {
    critical: { border: '#c0392b', bg: 'rgba(192,57,43,0.06)', badge: '#e74c3c', badgeBg: 'rgba(192,57,43,0.15)', dot: '#e74c3c' },
    warning: { border: '#d97706', bg: 'rgba(217,119,6,0.05)', badge: '#f59e0b', badgeBg: 'rgba(217,119,6,0.12)', dot: '#f59e0b' },
    info: { border: '#2563eb', bg: 'rgba(37,99,235,0.05)', badge: '#60a5fa', badgeBg: 'rgba(37,99,235,0.12)', dot: '#60a5fa' },
    passed: { border: '#16a34a', bg: 'rgba(22,163,74,0.04)', badge: '#22c55e', badgeBg: 'rgba(22,163,74,0.12)', dot: '#22c55e' },
  }
  const c = colors[defect.severity] || colors.info

  return (
    <div className={`fade-up fade-up-${Math.min(index, 5)} rounded-xl overflow-hidden transition-all duration-200`}
      style={{ border: `1px solid ${c.border}30`, borderLeft: `3px solid ${c.border}`, background: c.bg }}>

      <button className="w-full text-left p-5 flex items-start gap-4" onClick={onToggle}>
        <div className="flex-shrink-0 mt-1">
          <div className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-xs px-2 py-0.5 rounded font-semibold"
              style={{ background: c.badgeBg, color: c.badge }}>
              {defect.severity.toUpperCase()}
            </span>
            <span className="text-xs opacity-50">{defect.category}</span>
            {defect.source === 'ai' && (
              <span className="text-xs px-2 py-0.5 rounded font-mono"
                style={{ background: 'rgba(201,162,39,0.08)', color: '#ddb94a', border: '1px solid rgba(201,162,39,0.2)' }}>
                AI
              </span>
            )}
            {defect.ruleRef
              ? <span className="rule-badge ml-auto">{defect.ruleRef}</span>
              : <span className="rule-badge ml-auto opacity-30">{defect.id}</span>
            }
          </div>
          <div className="font-semibold text-sm mb-1" style={{ color: '#f5f0e8' }}>{defect.title}</div>
          <div className="text-sm leading-relaxed opacity-65">{defect.description}</div>
        </div>

        <div className="flex-shrink-0 opacity-40 mt-1" style={{ color: '#c9a227' }}>
          {expanded ? '▲' : '▼'}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-0 ml-6 border-t" style={{ borderColor: `${c.border}25` }}>
          <div className="pt-4 space-y-4">
            {/* Fix instruction */}
            <div>
              <div className="text-xs font-mono tracking-widest uppercase mb-2 opacity-50">How to Fix</div>
              <div className="text-sm leading-relaxed p-3 rounded-lg"
                style={{ background: 'rgba(201,162,39,0.05)', border: '1px solid rgba(201,162,39,0.12)', color: 'rgba(245,240,232,0.8)' }}>
                {defect.fixInstruction}
              </div>
            </div>

            {/* Rule ref */}
            {defect.ruleRef && (
              <div className="flex items-center gap-2">
                <div className="text-xs opacity-40">Rule Reference:</div>
                <span className="rule-badge">{defect.ruleRef}</span>
              </div>
            )}

            {/* Pages */}
            {defect.detectedOnPages && defect.detectedOnPages.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-xs opacity-40">Detected on pages:</div>
                {defect.detectedOnPages.slice(0, 10).map((p) => (
                  <span key={p} className="text-xs px-2 py-0.5 rounded font-mono"
                    style={{ background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.15)', color: '#ddb94a' }}>
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryPill({ label, count, color, bg, active, onClick }: {
  label: string; count: number; color: string; bg: string; active: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
      style={{
        background: active ? bg : 'rgba(255,255,255,0.03)',
        border: active ? `1px solid ${color}60` : '1px solid rgba(255,255,255,0.06)',
        color: active ? color : 'rgba(245,240,232,0.5)',
      }}>
      <span style={{ color }} className="text-lg font-display">{count}</span>
      <span className="ml-2 text-xs opacity-70">{label}</span>
    </button>
  )
}

function BadgePill({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span className="px-3 py-1 rounded-full text-xs font-semibold"
      style={{ color, background: bg, border: `1px solid ${color}30` }}>
      {children}
    </span>
  )
}

function ToolButton({ href, icon, label, desc }: { href: string; icon: string; label: string; desc: string }) {
  return (
    <a href={href} className="rounded-xl p-4 transition-all hover:border-opacity-50 block"
      style={{ border: '1px solid rgba(201,162,39,0.2)', background: 'rgba(201,162,39,0.04)' }}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-semibold text-sm mb-1" style={{ color: '#ddb94a' }}>{label}</div>
      <div className="text-xs opacity-50">{desc}</div>
    </a>
  )
}

function AiIcon() {
  return (
    <div className="w-5 h-5 rounded flex items-center justify-center"
      style={{ background: 'rgba(201,162,39,0.15)', border: '1px solid rgba(201,162,39,0.3)' }}>
      <svg className="w-3 h-3" style={{ color: '#c9a227' }} fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-11h2v6h-2zm0-4h2v2h-2z" />
      </svg>
    </div>
  )
}

function ScalesIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: '#c9a227' }}>
      <path d="M12 3v18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 9H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 9l-2 6h4L5 9zM19 9l-2 6h4L19 9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 21h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full border-2 border-t-transparent spin-slow mx-auto mb-4"
          style={{ borderColor: 'rgba(201,162,39,0.2)', borderTopColor: '#c9a227' }} />
        <div className="font-mono text-sm opacity-50">Loading report...</div>
      </div>
    </div>
  )
}

function ErrorScreen({ message, sessionId }: { message: string; sessionId: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-card rounded-2xl p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">⚠</div>
        <h2 className="font-display text-2xl mb-3" style={{ color: '#f5f0e8' }}>Report Not Found</h2>
        <p className="text-sm opacity-60 mb-6">{message}</p>
        <a href="/validate" className="btn-gold rounded-xl px-8 py-3 text-sm inline-block">
          Run New Validation
        </a>
      </div>
    </div>
  )
}

export default function ResultsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ResultsPageInner sessionId={sessionId} />
    </Suspense>
  )
}
