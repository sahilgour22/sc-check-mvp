'use client'
import { useState, useRef, useCallback } from 'react'

export default function ToolsPage() {
  const [activeTab, setActiveTab] = useState<'merge' | 'reorder' | 'redact'>('merge')

  return (
    <div className="relative min-h-screen flex flex-col" style={{ zIndex: 1 }}>
      <nav className="border-b px-6 py-4 flex items-center justify-between"
        style={{ borderColor: 'rgba(201,162,39,0.2)', background: 'rgba(4,17,31,0.65)', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <a href="/" className="flex items-center gap-3">
          <ScalesIcon />
          <span className="font-display text-xl font-semibold" style={{ color: '#c9a227' }}>CourtCheck</span>
        </a>
        <span className="text-sm opacity-40">PDF Tools</span>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
        <div className="fade-up fade-up-0 mb-8">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold mb-2" style={{ color: '#f5f0e8' }}>PDF Tools</h1>
          <p className="text-sm opacity-50">Merge, reorder, and redact your filing documents</p>
        </div>

        {/* Tab bar */}
        <div className="fade-up fade-up-1 flex flex-wrap gap-2 mb-8">
          {([
            { id: 'merge', label: 'Merge PDFs', icon: '⊞' },
            { id: 'reorder', label: 'Reorder', icon: '⇅' },
            { id: 'redact', label: 'Redact Names', icon: '█' },
          ] as const).map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className="px-5 py-2.5 rounded-xl text-sm transition-all"
              style={{
                background: activeTab === t.id ? 'rgba(201,162,39,0.12)' : 'rgba(15,32,64,0.4)',
                border: activeTab === t.id ? '1px solid rgba(201,162,39,0.4)' : '1px solid rgba(201,162,39,0.12)',
                color: activeTab === t.id ? '#ddb94a' : 'rgba(245,240,232,0.45)',
              }}>
              <span className="mr-2">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        <div className="fade-up fade-up-2">
          {activeTab === 'merge' && <MergeTool />}
          {activeTab === 'reorder' && <ReorderTool />}
          {activeTab === 'redact' && <RedactTool />}
        </div>
      </main>
    </div>
  )
}

function MergeTool() {
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(newFiles: FileList) {
    const arr = Array.from(newFiles)
    const pdfs = arr.filter((f) => f.name.endsWith('.pdf') && f.size <= 4.5 * 1024 * 1024)
    if (pdfs.length < arr.length) setError('Some files exceeded the 4.5MB Vercel limit and were skipped.')
    setFiles((prev) => [...prev, ...pdfs])
    setDownloadUrl(null)
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i))
    setDownloadUrl(null)
  }

  function moveFile(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= files.length) return
    const arr = [...files]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setFiles(arr)
  }

  async function merge() {
    if (files.length < 2) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      files.forEach((f) => fd.append('files', f))
      const res = await fetch('/api/tools/merge', { method: 'POST', body: fd })
      if (!res.ok) {
        if (res.status === 413) throw new Error('Files too large (Vercel limit 4.5MB).')
        const text = await res.text()
        try { throw new Error(JSON.parse(text).error || 'Merge failed') }
        catch { throw new Error(`Merge failed (${res.status}): ${text.slice(0, 40)}`) }
      }
      const data = await res.json()
      setDownloadUrl(data.downloadUrl)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Merge failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      <h2 className="font-display text-2xl mb-1" style={{ color: '#f5f0e8' }}>Merge PDF Files</h2>
      <p className="text-sm opacity-50 mb-6">Combine multiple PDFs in order. Page numbers are added automatically.</p>

      <input ref={inputRef} type="file" accept=".pdf" multiple className="hidden"
        onChange={(e) => e.target.files && addFiles(e.target.files)} />

      <button onClick={() => inputRef.current?.click()}
        className="w-full rounded-xl p-8 mb-5 transition-all text-center cursor-pointer"
        style={{ border: '2px dashed rgba(201,162,39,0.25)', background: 'rgba(10,22,40,0.5)' }}>
        <div className="text-3xl mb-2 opacity-50">+</div>
        <div className="text-sm opacity-50">Click to add PDF files</div>
      </button>

      {files.length > 0 && (
        <div className="space-y-2 mb-5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: 'rgba(201,162,39,0.05)', border: '1px solid rgba(201,162,39,0.12)' }}>
              <span className="font-mono text-xs w-6 text-center opacity-40">{i + 1}</span>
              <span className="flex-1 text-sm truncate">{f.name}</span>
              <span className="text-xs opacity-30">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <div className="flex gap-1">
                <button onClick={() => moveFile(i, -1)} disabled={i === 0}
                  className="w-6 h-6 rounded text-xs transition-opacity disabled:opacity-20"
                  style={{ color: '#c9a227', background: 'rgba(201,162,39,0.1)' }}>↑</button>
                <button onClick={() => moveFile(i, 1)} disabled={i === files.length - 1}
                  className="w-6 h-6 rounded text-xs transition-opacity disabled:opacity-20"
                  style={{ color: '#c9a227', background: 'rgba(201,162,39,0.1)' }}>↓</button>
                <button onClick={() => removeFile(i)}
                  className="w-6 h-6 rounded text-xs text-red-400"
                  style={{ background: 'rgba(192,57,43,0.1)' }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="text-sm text-red-400 mb-4 px-3 py-2 rounded" style={{ background: 'rgba(192,57,43,0.1)' }}>{error}</div>}

      {downloadUrl ? (
        <a href={downloadUrl} download="merged.pdf" className="btn-gold rounded-xl px-8 py-3 text-sm inline-block text-center w-full">
          Download Merged PDF ↓
        </a>
      ) : (
        <button onClick={merge} disabled={files.length < 2 || loading}
          className="btn-gold rounded-xl px-8 py-3 text-sm w-full disabled:opacity-30 disabled:cursor-not-allowed">
          {loading ? 'Merging...' : `Merge ${files.length} Files`}
        </button>
      )}
    </div>
  )
}

function ReorderTool() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [order, setOrder] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    if (file.size > 4.5 * 1024 * 1024) { alert('File exceeds 4.5MB Vercel limit.'); return; }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        if (res.status === 413) throw new Error('File too large (Vercel limit 4.5MB).')
        const text = await res.text()
        try { throw new Error(JSON.parse(text).error || 'Upload failed') }
        catch { throw new Error(`Upload failed (${res.status})`) }
      }
      const data = await res.json()
      setSessionId(data.sessionId)
      // Create a default order of 50 pages max
      const count = Math.min(data.pageCount || 50, 200)
      setPageCount(count)
      setOrder(Array.from({ length: count }, (_, i) => i))
    } catch { /* ignore */ }
    setUploading(false)
  }

  function moveSection(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const arr = [...order]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setOrder(arr)
  }

  async function save() {
    if (!sessionId) return
    setLoading(true)
    try {
      const res = await fetch('/api/tools/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, newOrder: order }),
      })
      const data = await res.json()
      setDownloadUrl(data.downloadUrl)
    } catch { /* ignore */ }
    setLoading(false)
  }

  if (!sessionId) {
    return (
      <div className="glass-card rounded-2xl p-6">
        <h2 className="font-display text-2xl mb-1" style={{ color: '#f5f0e8' }}>Reorder Document Sections</h2>
        <p className="text-sm opacity-50 mb-6">Upload your PDF and rearrange pages to match the prescribed filing order.</p>
        <input ref={inputRef} type="file" accept=".pdf" className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
        <button onClick={() => inputRef.current?.click()}
          className="w-full rounded-xl p-8 text-center cursor-pointer transition-all"
          style={{ border: '2px dashed rgba(201,162,39,0.25)', background: 'rgba(10,22,40,0.5)' }}>
          <div className="text-3xl mb-2 opacity-50">⇅</div>
          <div className="text-sm opacity-50">{uploading ? 'Uploading...' : 'Click to upload PDF'}</div>
        </button>
        <div className="mt-5 p-4 rounded-xl text-sm opacity-50"
          style={{ background: 'rgba(201,162,39,0.04)', border: '1px solid rgba(201,162,39,0.1)' }}>
          Correct SC filing order:
          <ol className="mt-2 space-y-1 list-decimal list-inside opacity-80">
            <li>List of Dates and Events</li>
            <li>Certified Copy of Impugned Judgment</li>
            <li>SLP Form No. 28 + Affidavit in Support</li>
            <li>Appendix — Relevant Provisions</li>
            <li>Annexures (chronologically arranged)</li>
          </ol>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      <h2 className="font-display text-2xl mb-1" style={{ color: '#f5f0e8' }}>Reorder Pages</h2>
      <p className="text-sm opacity-50 mb-6">Drag pages to reorder. Showing page indices for {pageCount} pages.</p>

      <div className="max-h-96 overflow-y-auto space-y-1.5 mb-5 pr-1">
        {order.slice(0, 50).map((pageIdx, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg"
            style={{ background: 'rgba(201,162,39,0.04)', border: '1px solid rgba(201,162,39,0.1)' }}>
            <span className="font-mono text-xs w-6 opacity-40">{i + 1}</span>
            <span className="flex-1 text-sm opacity-70">Original page {pageIdx + 1}</span>
            <div className="flex gap-1">
              <button onClick={() => moveSection(i, -1)} disabled={i === 0}
                className="w-6 h-6 rounded text-xs disabled:opacity-20"
                style={{ color: '#c9a227', background: 'rgba(201,162,39,0.1)' }}>↑</button>
              <button onClick={() => moveSection(i, 1)} disabled={i === order.length - 1}
                className="w-6 h-6 rounded text-xs disabled:opacity-20"
                style={{ color: '#c9a227', background: 'rgba(201,162,39,0.1)' }}>↓</button>
            </div>
          </div>
        ))}
      </div>

      {downloadUrl ? (
        <a href={downloadUrl} download="reordered.pdf" className="btn-gold rounded-xl py-3 text-sm w-full block text-center">
          Download Reordered PDF ↓
        </a>
      ) : (
        <button onClick={save} disabled={loading}
          className="btn-gold rounded-xl py-3 text-sm w-full disabled:opacity-30">
          {loading ? 'Saving...' : 'Save Reordered PDF'}
        </button>
      )}
    </div>
  )
}

function RedactTool() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [names, setNames] = useState<string>('')
  const [replaceWith, setReplaceWith] = useState('Victim')
  const [loading, setLoading] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    if (file.size > 4.5 * 1024 * 1024) { alert('File exceeds 4.5MB Vercel limit.'); return; }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        if (res.status === 413) throw new Error('File too large.')
        const text = await res.text()
        try { throw new Error(JSON.parse(text).error || 'Upload failed') }
        catch { throw new Error(`Upload failed (${res.status})`) }
      }
      const data = await res.json()
      setSessionId(data.sessionId)
    } catch { /* ignore */ }
    setUploading(false)
  }

  async function redact() {
    if (!sessionId || !names.trim()) return
    setLoading(true)
    setError(null)
    try {
      const namesToRedact = names.split('\n').map((n) => n.trim()).filter(Boolean)
      const res = await fetch('/api/tools/redact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, namesToRedact, replaceWith }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      setDownloadUrl(data.downloadUrl)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Redaction failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      <h2 className="font-display text-2xl mb-1" style={{ color: '#f5f0e8' }}>Redact Victim Names</h2>
      <p className="text-sm opacity-50 mb-2">Required for POCSO / rape / sexual offence cases under Section 228A IPC.</p>

      <div className="p-3 rounded-lg mb-6 text-xs"
        style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)', color: '#f59e0b' }}>
        ⚠ Under Section 228A IPC, the victim&apos;s name and identity must not be disclosed in any document filed before a court.
        Violation is punishable with imprisonment up to 2 years.
      </div>

      {!sessionId ? (
        <div>
          <input ref={inputRef} type="file" accept=".pdf" className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
          <button onClick={() => inputRef.current?.click()}
            className="w-full rounded-xl p-8 text-center cursor-pointer mb-5 transition-all"
            style={{ border: '2px dashed rgba(201,162,39,0.25)', background: 'rgba(10,22,40,0.5)' }}>
            <div className="text-3xl mb-2 opacity-50">█</div>
            <div className="text-sm opacity-50">{uploading ? 'Uploading...' : 'Upload PDF to redact'}</div>
          </button>
        </div>
      ) : (
        <div className="mb-4 text-xs p-2 rounded" style={{ background: 'rgba(22,163,74,0.1)', color: '#22c55e', border: '1px solid rgba(22,163,74,0.2)' }}>
          ✓ PDF uploaded — Session: {sessionId.slice(0, 8)}…
        </div>
      )}

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs font-mono tracking-widest uppercase mb-2 opacity-50">
            Names to Redact (one per line)
          </label>
          <textarea
            rows={5}
            value={names}
            onChange={(e) => setNames(e.target.value)}
            placeholder="Enter victim's name&#10;Enter father's name&#10;Enter any other identifying name"
            className="w-full rounded-xl p-3 text-sm resize-none outline-none"
            style={{
              background: 'rgba(10,22,40,0.7)',
              border: '1px solid rgba(201,162,39,0.2)',
              color: '#f5f0e8',
            }}
          />
        </div>

        <div>
          <label className="block text-xs font-mono tracking-widest uppercase mb-2 opacity-50">
            Replace With
          </label>
          <div className="flex gap-2">
            {['Victim', 'Prosecutrix', 'Minor Victim', 'Custom'].map((opt) => (
              <button key={opt}
                onClick={() => setReplaceWith(opt === 'Custom' ? '' : opt)}
                className="px-3 py-2 rounded-lg text-xs transition-all"
                style={{
                  background: replaceWith === opt || (opt === 'Custom' && !['Victim', 'Prosecutrix', 'Minor Victim'].includes(replaceWith))
                    ? 'rgba(201,162,39,0.15)'
                    : 'rgba(15,32,64,0.4)',
                  border: replaceWith === opt ? '1px solid rgba(201,162,39,0.4)' : '1px solid rgba(201,162,39,0.12)',
                  color: '#ddb94a',
                }}>
                {opt}
              </button>
            ))}
          </div>
          {!['Victim', 'Prosecutrix', 'Minor Victim'].includes(replaceWith) && (
            <input
              value={replaceWith}
              onChange={(e) => setReplaceWith(e.target.value)}
              placeholder="Enter custom replacement text"
              className="mt-2 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'rgba(10,22,40,0.7)', border: '1px solid rgba(201,162,39,0.2)', color: '#f5f0e8' }}
            />
          )}
        </div>
      </div>

      {error && <div className="text-sm text-red-400 mb-4 px-3 py-2 rounded" style={{ background: 'rgba(192,57,43,0.1)' }}>{error}</div>}

      {downloadUrl ? (
        <a href={downloadUrl} download="redacted.pdf" className="btn-gold rounded-xl py-3 text-sm w-full block text-center">
          Download Redacted PDF ↓
        </a>
      ) : (
        <button onClick={redact} disabled={!sessionId || !names.trim() || loading}
          className="btn-gold rounded-xl py-3 text-sm w-full disabled:opacity-30 disabled:cursor-not-allowed">
          {loading ? 'Redacting...' : 'Apply Redactions'}
        </button>
      )}
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
