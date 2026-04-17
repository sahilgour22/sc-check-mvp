import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import { reorderPages } from '@/lib/pdf/manipulator'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId, newOrder } = body

    if (!sessionId || !/^[0-9a-f-]{36}$/.test(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 })
    }

    if (!newOrder || !Array.isArray(newOrder)) {
      return NextResponse.json({ error: 'newOrder array required' }, { status: 400 })
    }

    const filePath = path.join(process.cwd(), 'uploads', sessionId, 'original.pdf')

    try {
      await fs.access(filePath)
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const reordered = await reorderPages(filePath, newOrder)
    const outPath = path.join(process.cwd(), 'uploads', sessionId, 'reordered.pdf')
    await fs.writeFile(outPath, reordered)

    return NextResponse.json({
      downloadUrl: `/api/download?sessionId=${sessionId}&file=reordered.pdf`,
      sessionId,
      pageCount: newOrder.length,
    })
  } catch (err) {
    console.error('Reorder error:', err)
    return NextResponse.json({ error: 'Reorder failed' }, { status: 500 })
  }
}
