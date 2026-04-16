import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { mergePDFs } from '@/lib/pdf/manipulator'

export async function POST(req: NextRequest) {
  let tmpDir = ''
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length < 2) {
      return NextResponse.json({ error: 'At least 2 PDF files required' }, { status: 400 })
    }

    const sessionId = uuidv4()
    tmpDir = path.join(os.tmpdir(), 'uploads', sessionId)
    await fs.mkdir(tmpDir, { recursive: true })

    const filePaths: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const filePath = path.join(tmpDir, `part_${i}.pdf`)
      const bytes = await file.arrayBuffer()
      await fs.writeFile(filePath, Buffer.from(bytes))
      filePaths.push(filePath)
    }

    const merged = await mergePDFs(filePaths)
    
    return new NextResponse(merged, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="merged.pdf"'
      }
    })
  } catch (err) {
    console.error('Merge error:', err)
    return NextResponse.json({ error: 'Merge failed' }, { status: 500 })
  } finally {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
