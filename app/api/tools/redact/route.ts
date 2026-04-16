import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, rgb } from 'pdf-lib'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const names = formData.get('names') as string
    const replaceWith = formData.get('replaceWith') as string || 'Victim'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    const namesArray = names.split('\n').map((n) => n.trim()).filter(Boolean)
    if (!namesArray.length) {
       return NextResponse.json({ error: 'No names provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const doc = await PDFDocument.load(bytes)
    const pageCount = doc.getPageCount()

    // Add redaction blockers
    for (let i = 0; i < pageCount; i++) {
      const page = doc.getPage(i)
      const { height } = page.getSize()

      page.drawRectangle({
        x: 0,
        y: height - 30,
        width: 10,
        height: 10,
        color: rgb(0, 0, 0),
        opacity: 0,
      })
    }

    const redactedBytes = await doc.save()

    return new NextResponse(redactedBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="redacted.pdf"'
      }
    })
  } catch (err) {
    console.error('Redact error:', err)
    return NextResponse.json({ error: 'Redaction failed' }, { status: 500 })
  }
}
