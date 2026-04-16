import { NextRequest } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { extractPDF } from '@/lib/pdf/extractor'
import { runValidation } from '@/lib/validator/orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for large files

function encode(obj: object): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

export async function POST(req: NextRequest) {
  let sessionDir = ''
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const caseType = formData.get('caseType') as string || 'slp_civil'
    const sessionId = formData.get('sessionId') as string || crypto.randomUUID()

    if (!file) {
      return new Response('No file provided', { status: 400 })
    }

    sessionDir = path.join(os.tmpdir(), 'uploads', sessionId)
    await fs.mkdir(sessionDir, { recursive: true })
    const filePath = path.join(sessionDir, 'original.pdf')

    const bytes = await file.arrayBuffer()
    await fs.writeFile(filePath, Buffer.from(bytes))

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
            send({
              step: 'extract',
              progress: 22,
              message: '⚠ Scanned PDF detected — text extraction limited. Some checks may be inaccurate.',
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
          // Cleanup tmp file
          await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {})
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
  } catch (err) {
    console.error(err)
    if (sessionDir) await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {})
    return new Response('Invalid request payload', { status: 400 })
  }
}
