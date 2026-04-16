import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')
  const file = searchParams.get('file')

  if (!sessionId || !/^[0-9a-f-]{36}$/.test(sessionId)) {
    return new NextResponse('Invalid session', { status: 400 })
  }

  // Only allow specific files
  const allowedFiles = ['merged.pdf', 'redacted.pdf', 'reordered.pdf', 'original.pdf']
  if (!file || !allowedFiles.includes(file)) {
    return new NextResponse('Invalid file', { status: 400 })
  }

  const filePath = path.join(process.cwd(), 'uploads', sessionId, file)

  try {
    const bytes = await fs.readFile(filePath)
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${file}"`,
      },
    })
  } catch {
    return new NextResponse('File not found', { status: 404 })
  }
}
