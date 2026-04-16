import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import os from 'os'

const UPLOAD_DIR = path.join(os.tmpdir(), 'uploads')
const MAX_SIZE_BYTES = 200 * 1024 * 1024 // 200MB

export const config = {
  api: { bodyParser: false },
}

export async function POST(req: NextRequest) {
  try {
    // Ensure uploads directory exists
    await fs.mkdir(UPLOAD_DIR, { recursive: true })

    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Must be multipart/form-data' }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum 200MB.` },
        { status: 413 }
      )
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
    }

    // Create session
    const sessionId = uuidv4()
    const sessionDir = path.join(UPLOAD_DIR, sessionId)
    await fs.mkdir(sessionDir, { recursive: true })

    const filePath = path.join(sessionDir, 'original.pdf')

    // Write file
    const bytes = await file.arrayBuffer()
    await fs.writeFile(filePath, Buffer.from(bytes))

    // Save metadata
    const meta = {
      sessionId,
      originalName: file.name,
      fileSizeMB: +(file.size / 1024 / 1024).toFixed(2),
      uploadedAt: new Date().toISOString(),
    }
    await fs.writeFile(path.join(sessionDir, 'meta.json'), JSON.stringify(meta, null, 2))

    // Schedule cleanup after 2 hours
    scheduleCleanup(sessionDir, 2 * 60 * 60 * 1000)

    return NextResponse.json({
      sessionId,
      fileName: file.name,
      fileSizeMB: meta.fileSizeMB,
    })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

function scheduleCleanup(dir: string, delayMs: number) {
  setTimeout(async () => {
    try {
      if (existsSync(dir)) {
        await fs.rm(dir, { recursive: true, force: true })
      }
    } catch (e) {
      console.error('Cleanup error:', e)
    }
  }, delayMs)
}
