/**
 * PDF Extractor — calls Python/PyMuPDF for text extraction
 */
import { spawn } from 'child_process'
import path from 'path'
import type { ExtractedPDFData } from '../validator/rule-engine'

const PYTHON_SCRIPT = path.join(process.cwd(), 'python', 'extract.py')

function getPythonCommand(): string {
  // Try different Python commands for cross-platform compatibility
  return process.env.PYTHON_PATH || 'python'
}

export async function extractPDF(filePath: string): Promise<ExtractedPDFData> {
  return new Promise((resolve, reject) => {
    const python = getPythonCommand()
    let stdout = ''
    let stderr = ''

    const proc = spawn(python, [PYTHON_SCRIPT, filePath], {
      timeout: 120000, // 2 minute timeout for large files
    })

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        // If Python fails, try to return a minimal fallback
        console.error('Python extraction failed:', stderr)
        resolve({
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
          error: `Python extraction failed (code ${code}): ${stderr.slice(0, 200)}`,
        })
        return
      }

      try {
        const data = JSON.parse(stdout) as ExtractedPDFData
        resolve(data)
      } catch {
        reject(new Error(`JSON parse error from Python extractor. Output: ${stdout.slice(0, 200)}`))
      }
    })

    proc.on('error', (err) => {
      console.error('Failed to spawn Python process:', err)
      // Fallback: return empty data with error
      resolve({
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
        error: `Python not available: ${err.message}. Install Python and PyMuPDF to enable full validation.`,
      })
    })
  })
}
