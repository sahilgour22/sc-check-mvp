import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { reorderPages } from '@/lib/pdf/manipulator'

export async function POST(req: NextRequest) {
  let tmpDir = ''
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const newOrderStr = formData.get('newOrder') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    let newOrder: number[] = []
    try {
      newOrder = JSON.parse(newOrderStr)
    } catch {
      return NextResponse.json({ error: 'Invalid newOrder array' }, { status: 400 })
    }

    if (!newOrder || !Array.isArray(newOrder)) {
      return NextResponse.json({ error: 'newOrder array required' }, { status: 400 })
    }

    const sessionId = uuidv4()
    tmpDir = path.join(os.tmpdir(), 'uploads', sessionId)
    await fs.mkdir(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, 'original.pdf')
    
    const bytes = await file.arrayBuffer()
    await fs.writeFile(filePath, Buffer.from(bytes))

    const reordered = await reorderPages(filePath, newOrder)

    return new NextResponse(Buffer.from(reordered), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="reordered.pdf"'
      }
    })
  } catch (err) {
    console.error('Reorder error:', err)
    return NextResponse.json({ error: 'Reorder failed' }, { status: 500 })
  } finally {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
