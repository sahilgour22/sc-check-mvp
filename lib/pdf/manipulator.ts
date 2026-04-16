/**
 * PDF Manipulator — merge, reorder, redact using pdf-lib
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs/promises'

export async function mergePDFs(filePaths: string[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create()

  for (const filePath of filePaths) {
    const bytes = await fs.readFile(filePath)
    const doc = await PDFDocument.load(bytes)
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach((page) => merged.addPage(page))
  }

  // Add sequential page numbers
  const font = await merged.embedFont(StandardFonts.Helvetica)
  const pageCount = merged.getPageCount()

  for (let i = 0; i < pageCount; i++) {
    const page = merged.getPage(i)
    const { width } = page.getSize()
    page.drawText(`${i + 1}`, {
      x: width / 2 - 10,
      y: 20,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
    })
  }

  return merged.save()
}

export async function reorderPages(
  filePath: string,
  newOrder: number[]
): Promise<Uint8Array> {
  const bytes = await fs.readFile(filePath)
  const original = await PDFDocument.load(bytes)
  const reordered = await PDFDocument.create()

  const pages = await reordered.copyPages(original, newOrder)
  pages.forEach((page) => reordered.addPage(page))

  return reordered.save()
}

export interface RedactionRect {
  page: number   // 0-indexed
  x: number
  y: number
  width: number
  height: number
}

export async function redactPDF(
  filePath: string,
  rects: RedactionRect[]
): Promise<Uint8Array> {
  const bytes = await fs.readFile(filePath)
  const doc = await PDFDocument.load(bytes)

  for (const rect of rects) {
    if (rect.page < 0 || rect.page >= doc.getPageCount()) continue
    const page = doc.getPage(rect.page)

    page.drawRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      color: rgb(0, 0, 0),
      borderColor: rgb(0, 0, 0),
      borderWidth: 0,
    })
  }

  return doc.save()
}

export async function addPageNumbers(filePath: string): Promise<Uint8Array> {
  const bytes = await fs.readFile(filePath)
  const doc = await PDFDocument.load(bytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pageCount = doc.getPageCount()

  for (let i = 0; i < pageCount; i++) {
    const page = doc.getPage(i)
    const { width } = page.getSize()

    page.drawText(`Page ${i + 1} of ${pageCount}`, {
      x: width / 2 - 30,
      y: 20,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    })
  }

  return doc.save()
}
