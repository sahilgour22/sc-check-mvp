import fs from 'fs/promises'
const pdfParse = require('pdf-parse')
import { PDFDocument } from 'pdf-lib'
import type { ExtractedPDFData } from '../validator/rule-engine'

export async function extractPDF(filePath: string): Promise<ExtractedPDFData> {
  try {
    const dataBuffer = await fs.readFile(filePath)
    const textByPage: { page: number; text: string }[] = []
    
    // Custom pagerender to capture text per page sequentially
    const render_page = async (pageData: any) => {
      const render_options = { normalizeWhitespace: true, disableCombineTextItems: false }
      const textContent = await pageData.getTextContent(render_options)
      let lastY, text = ''
      for (const item of textContent.items) {
          if (lastY == item.transform[5] || !lastY) { text += item.str }  
          else { text += '\n' + item.str }    
          lastY = item.transform[5]
      }
      textByPage.push({ page: pageData.pageIndex + 1, text })
      return text
    }

    const options = { pagerender: render_page, max: 200 } // extract up to 200 pages to save lambda time

    const parsed = await pdfParse(dataBuffer, options)
    
    // Sort textByPage because pages might be processed async natively
    textByPage.sort((a,b) => a.page - b.page)

    // Parse metadata with pdf-lib
    const doc = await PDFDocument.load(dataBuffer, { ignoreEncryption: true })
    const totalPages = doc.getPageCount()
    const pageSizes = []
    for (let i = 0; i < Math.min(50, totalPages); i++) {
        const p = doc.getPage(i)
        const size = p.getSize()
        pageSizes.push({ w: Math.round(size.width), h: Math.round(size.height) })
    }

    const first10 = textByPage.slice(0, 10)
    let scanned = false
    if (first10.length > 0) {
        const textCount = first10.reduce((acc, p) => acc + p.text.trim().length, 0)
        if ((textCount / first10.length) < 100) scanned = true
    }

    const text_sample = textByPage.slice(0, 5).map(p => `\n\n--- PAGE ${p.page} ---\n${p.text}`).join('')
    
    const last10 = textByPage.slice(Math.max(0, textByPage.length - 10))
    const last_pages_text = last10.map(p => `\n\n--- PAGE ${p.page} ---\n${p.text}`).join('')

    const full_text = textByPage.slice(0, 50).map(p => p.text).join('\n')
    const total_text_chars = textByPage.reduce((acc, p) => acc + p.text.length, 0)
    
    const chunk_size = 10000
    const full_text_chunks = []
    for(let i=0; i < full_text.length; i += chunk_size) {
        full_text_chunks.push(full_text.slice(i, i + chunk_size))
    }

    return {
        page_count: totalPages,
        page_sizes: pageSizes,
        text_by_page: textByPage.slice(0, 50),
        text_sample,
        last_pages_text,
        full_text_chunks,
        has_images: false,
        is_scanned: scanned,
        metadata: { title: parsed.info?.Title, author: parsed.info?.Author },
        total_text_chars,
        error: undefined
    }

  } catch (err: unknown) {
      console.error('JS extraction failed:', err)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return {
          page_count: 0,
          page_sizes: [],
          text_by_page: [],
          text_sample: '',
          last_pages_text: '',
          full_text_chunks: [],
          has_images: false,
          is_scanned: false,
          metadata: {},
          total_text_chars: 0,
          error: `JS Extraction failed: ${msg}. Try a different PDF format.`,
      }
  }
}
