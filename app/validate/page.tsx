'use client'
import { useState, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const STEPS = [
  { id: 'upload', label: 'Uploading PDF' },
  { id: 'extract', label: 'Extracting text from all pages' },
  { id: 'rules', label: 'Running SC Rules checklist' },
  { id: 'ai', label: 'Running AI semantic analysis' },
  { id: 'report', label: 'Cross-referencing SC Rules 2013' },
  { id: 'done', label: 'Generating defect report' },
]

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

function ValidatePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const caseType = searchParams.get('caseType') || 'slp_civil'

  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState('')
  const [currentMsg, setCurrentMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [isScanned, setIsScanned] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted.')
      return
    }
    if (f.size > 4.5 * 1024 * 1024) {
      setError('File exceeds 4.5MB Vercel limit. Please compress PDF for this MVP mode.')
      return
    }
    setError(null)
    setFile(f)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

  async function startValidation() {
    if (!file) return
    setError(null)

    // Step 1: Upload
    setUploading(true)
    setCurrentStep('upload')
    setCurrentMsg('Uploading PDF to secure session...')
    setProgress(5)

    const formData = new FormData()
    formData.append('file', file)

    let sid: string
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        if (res.status === 413) throw new Error('File too large (Vercel limit 4.5MB).')
        const text = await res.text()
        try {
          const err = JSON.parse(text)
          throw new Error(err.error || 'Upload failed')
        } catch {
          throw new Error(`Upload failed (${res.status}): ${text.slice(0, 40)}`)
        }
      }
      const data = await res.json()
      sid = data.sessionId
      setSessionId(sid)
      setProgress(18)
      setCurrentMsg(`Uploaded ${data.fileSizeMB} MB — starting validation...`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setUploading(false)
      return
    }

    setUploading(false)
    setValidating(true)

    // Step 2+: SSE streaming validation
    const url = `/api/validate?sessionId=${sid}&caseType=${caseType}`
    const evtSource = new EventSource(url)

    evtSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)

        if (data.progress !== undefined) setProgress(data.progress)
        if (data.step) setCurrentStep(data.step)
        if (data.message) setCurrentMsg(data.message)
        if (data.pageCount) setPageCount(data.pageCount)
        if (data.isScanned !== undefined) setIsScanned(data.isScanned)

        if (data.error) {
          setError(data.error)
          evtSource.close()
          setValidating(false)
          return
        }

        if (data.done) {
          evtSource.close()
          setValidating(false)
          setProgress(100)
          setCurrentMsg('Validation complete — redirecting to report...')
          setTimeout(() => {
            router.push(`/results/${sid}?caseType=${caseType}`)
          }, 800)
        }
      } catch { /* ignore parse errors */ }
    }

    evtSource.onerror = () => {
      evtSource.close()
      setValidating(false)
      if (progress < 95) {
        setError('Connection lost during validation. Please try again.')
      }
    }
  }

  const isRunning = uploading || validating
  const stepIdx = STEPS.findIndex((s) => s.id === currentStep)

  return (
    <div className="relative min-h-screen flex flex-col" style={{ zIndex: 1 }}>

      {/* Nav */}
      <nav className="border-b px-6 py-4 flex items-center justify-between"
        style={{ borderColor: 'rgba(201,162,39,0.2)', background: 'rgba(4,17,31,0.65)', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <a href="/" className="flex items-center gap-3">
          <ScalesIcon />
          <span className="font-display text-xl font-semibold" style={{ color: '#c9a227' }}>CourtCheck</span>
        </a>
        <div className="text-sm font-mono px-3 py-1 rounded truncate max-w-[140px] sm:max-w-none"
          style={{ color: '#ddb94a', background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.2)' }}>
          {CASE_LABELS[caseType] || caseType}
        </div>
      </nav>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12">

        <div className="fade-up fade-up-0 mb-10">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold mb-2" style={{ color: '#f5f0e8' }}>
            Upload Filing
          </h1>
          <p className="text-sm opacity-50">Drop your petition PDF (up to 4.5MB Vercel Limit)</p>
        </div>

        {/* Drop zone */}
        {!isRunning && (
          <div className="fade-up fade-up-1 mb-6">
            <div
              onClick={() => inputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className="rounded-2xl p-12 text-center cursor-pointer transition-all duration-200"
              style={{
                border: isDragging ? '2px solid #c9a227' : '2px dashed rgba(201,162,39,0.25)',
                background: isDragging ? 'rgba(201,162,39,0.05)' : 'rgba(10,22,40,0.5)',
                boxShadow: isDragging ? '0 0 30px rgba(201,162,39,0.1)' : 'none',
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />

              {file ? (
                <div>
                  <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)' }}>
                    <svg className="w-7 h-7" style={{ color: '#22c55e' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="font-semibold mb-1" style={{ color: '#f5f0e8' }}>{file.name}</div>
                  <div className="text-sm opacity-50">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                  <button className="mt-3 text-xs opacity-40 hover:opacity-70 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); setFile(null) }}>
                    Remove file
                  </button>
                </div>
              ) : (
                <div>
                  <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                    style={{ background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.2)' }}>
                    <svg className="w-8 h-8" style={{ color: '#c9a227' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div className="font-semibold mb-1.5" style={{ color: '#f5f0e8' }}>
                    {isDragging ? 'Drop your PDF here' : 'Drag & drop your petition PDF'}
                  </div>
                  <div className="text-sm opacity-40 mb-4">or click to browse</div>
                  <div className="text-xs font-mono opacity-30">PDF only · Max 4.5MB · Hosted on Vercel</div>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-3 px-4 py-3 rounded-lg text-sm"
                style={{ background: 'rgba(192,57,43,0.12)', border: '1px solid rgba(192,57,43,0.3)', color: '#e74c3c' }}>
                {error}
              </div>
            )}

            <button
              onClick={startValidation}
              disabled={!file}
              className="btn-gold w-full rounded-xl py-4 mt-5 text-sm disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none"
            >
              Run Validation →
            </button>
          </div>
        )}

        {/* Progress UI */}
        {isRunning && (
          <div className="fade-up fade-up-0 glass-card rounded-2xl p-8">

            {/* Animated rings */}
            <div className="flex items-center justify-center mb-8">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-2 border-t-transparent spin-slow"
                  style={{ borderColor: 'rgba(201,162,39,0.2)', borderTopColor: '#c9a227' }} />
                <div className="absolute inset-2 rounded-full border-2 border-b-transparent"
                  style={{ borderColor: 'rgba(201,162,39,0.1)', borderBottomColor: '#ddb94a', animation: 'spin 2s linear infinite reverse' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-xs font-medium" style={{ color: '#c9a227' }}>{progress}%</span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="relative h-1.5 rounded-full mb-6 overflow-hidden" style={{ background: 'rgba(201,162,39,0.1)' }}>
              <div className="h-full rounded-full transition-all duration-500 progress-glow"
                style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #a07d1a, #c9a227, #ddb94a)' }} />
            </div>

            <div className="text-center mb-8">
              <div className="font-semibold mb-1" style={{ color: '#f5f0e8' }}>
                {currentMsg || 'Processing...'}
              </div>
              {pageCount && (
                <div className="text-sm opacity-45 font-mono">
                  {pageCount} pages · {CASE_LABELS[caseType]}
                  {isScanned && ' · ⚠ Scanned PDF'}
                </div>
              )}
            </div>

            {/* Step indicators */}
            <div className="space-y-2">
              {STEPS.map((step, i) => {
                const done = i < stepIdx
                const active = i === stepIdx
                const pending = i > stepIdx
                return (
                  <div key={step.id} className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
                    style={{ background: active ? 'rgba(201,162,39,0.06)' : 'transparent' }}>
                    <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs"
                      style={{
                        background: done ? 'rgba(22,163,74,0.2)' : active ? 'rgba(201,162,39,0.15)' : 'rgba(255,255,255,0.04)',
                        border: done ? '1px solid rgba(22,163,74,0.4)' : active ? '1px solid rgba(201,162,39,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      }}>
                      {done
                        ? <span style={{ color: '#22c55e' }}>✓</span>
                        : active
                          ? <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#c9a227' }} />
                          : <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />}
                    </div>
                    <span className="text-sm"
                      style={{ color: done ? 'rgba(245,240,232,0.5)' : active ? '#f5f0e8' : 'rgba(245,240,232,0.25)' }}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {error && !isRunning && (
          <div className="mt-4 px-4 py-3 rounded-lg text-sm"
            style={{ background: 'rgba(192,57,43,0.12)', border: '1px solid rgba(192,57,43,0.3)', color: '#e74c3c' }}>
            {error}
          </div>
        )}
      </main>
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

export default function ValidatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ color: '#c9a227' }}>Loading...</div>}>
      <ValidatePageInner />
    </Suspense>
  )
}
