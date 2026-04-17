import { NextRequest } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import { extractPDF } from '@/lib/pdf/extractor'
import { runValidation } from '@/lib/validator/orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for large files

function encode(obj: object): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')
  const caseType = searchParams.get('caseType') || 'slp_civil'

  if (!sessionId) {
    return new Response('Missing sessionId', { status: 400 })
  }

  // Validate sessionId format (UUID)
  if (!/^[0-9a-f-]{36}$/.test(sessionId)) {
    return new Response('Invalid sessionId', { status: 400 })
  }

  const sessionDir = path.join(process.cwd(), 'uploads', sessionId)
  const filePath = path.join(sessionDir, 'original.pdf')

  try {
    await fs.access(filePath)
  } catch {
    return new Response('Session not found', { status: 404 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(encode(obj)))
      }

      try {
        // Step 1 — Extract
        send({ step: 'extract', progress: 5, message: 'Reading PDF structure and extracting text...' })

        const pdfData = await extractPDF(filePath)

        if (pdfData.error && !pdfData.page_count) {
          send({
            step: 'error',
            progress: 0,
            message: `Extraction failed: ${pdfData.error}`,
            error: pdfData.error,
          })
          controller.close()
          return
        }

        send({
          step: 'extract',
          progress: 20,
          message: `Extracted ${pdfData.page_count} pages (${pdfData.total_text_chars.toLocaleString()} characters)`,
          pageCount: pdfData.page_count,
          isScanned: pdfData.is_scanned,
        })

        if (pdfData.is_scanned) {
          const scannedPages = pdfData.scanned_page_count ?? 0
          const totalPages = pdfData.page_count
          send({
            step: 'extract',
            progress: 22,
            message: `⚠ Scanned PDF detected — ${scannedPages} of ${totalPages} pages are image-only (no selectable text). Deterministic checks will be limited and AI analysis may be inaccurate. Ask your typist to provide a digitally-typed PDF, or use a PDF with selectable text exported from MS Word / DTP software.`,
          })
        }

        // Steps 2-6: run validation with progress callbacks
        const report = await runValidation(
          pdfData,
          caseType,
          sessionId,
          (step, progress, message, partial) => {
            send({ step, progress, message, partial })
          }
        )

        // Save report to session dir
        await fs.writeFile(
          path.join(sessionDir, 'report.json'),
          JSON.stringify(report, null, 2)
        )

        send({
          step: 'done',
          progress: 100,
          message: 'Validation complete',
          done: true,
          report,
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('Validation error:', err)
        send({ step: 'error', progress: 0, message: `Validation failed: ${msg}`, error: msg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

// GET report for already-validated session
export async function POST(req: NextRequest) {
  const { sessionId } = await req.json()

  if (!sessionId || !/^[0-9a-f-]{36}$/.test(sessionId)) {
    return new Response('Invalid sessionId', { status: 400 })
  }

  const reportPath = path.join(process.cwd(), 'uploads', sessionId, 'report.json')

  try {
    const data = await fs.readFile(reportPath, 'utf-8')
    return new Response(data, {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response('Report not found', { status: 404 })
  }
}
