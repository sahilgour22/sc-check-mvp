#!/usr/bin/env ts-node
/**
 * CourtCheck — CLI test script
 * Usage: npx ts-node scripts/test-validate.ts "path/to/petition.pdf" slp_civil
 */
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { runRuleEngine } from '../lib/validator/rule-engine'
import { runAIValidation } from '../lib/validator/ai-validator'
import type { ExtractedPDFData } from '../lib/validator/rule-engine'

// Load env
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
    const [key, ...vals] = line.split('=')
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim()
  })
}

const filePath = process.argv[2]
const caseType = process.argv[3] || 'slp_civil'

if (!filePath) {
  console.error('Usage: npx ts-node scripts/test-validate.ts <pdf_path> <case_type>')
  process.exit(1)
}

const absPath = path.resolve(filePath)
if (!fs.existsSync(absPath)) {
  console.error(`File not found: ${absPath}`)
  process.exit(1)
}

const SCRIPT = path.join(__dirname, '..', 'python', 'extract.py')
const PYTHON = process.env.PYTHON_PATH || 'python'

const SEVERITY_COLORS: Record<string, string> = {
  critical: '\x1b[31m',  // red
  warning: '\x1b[33m',   // yellow
  info: '\x1b[34m',      // blue
  passed: '\x1b[32m',    // green
}
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'

function colorize(text: string, severity: string): string {
  return (SEVERITY_COLORS[severity] || '') + text + RESET
}

async function extractPDF(): Promise<ExtractedPDFData> {
  return new Promise((resolve, reject) => {
    console.log(`\n${DIM}Extracting text from ${path.basename(absPath)}...${RESET}`)
    let stdout = ''
    const proc = spawn(PYTHON, [SCRIPT, absPath])
    proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    proc.stderr.on('data', (d: Buffer) => process.stderr.write(d))
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`Python exited with code ${code}`))
      else {
        try { resolve(JSON.parse(stdout)) }
        catch (e) { reject(e) }
      }
    })
    proc.on('error', reject)
  })
}

async function main() {
  console.log(`\n${BOLD}CourtCheck — Validation Test${RESET}`)
  console.log(`${DIM}File: ${absPath}${RESET}`)
  console.log(`${DIM}Case Type: ${caseType}${RESET}\n`)
  console.log('─'.repeat(70))

  // Extract
  let pdfData: ExtractedPDFData
  try {
    pdfData = await extractPDF()
    console.log(`\n${BOLD}PDF Info:${RESET}`)
    console.log(`  Pages: ${pdfData.page_count}`)
    console.log(`  Text chars: ${pdfData.total_text_chars?.toLocaleString() || 'N/A'}`)
    console.log(`  Scanned: ${pdfData.is_scanned ? 'YES ⚠' : 'No'}`)
    if (pdfData.error) console.warn(`  Warning: ${pdfData.error}`)
  } catch (e) {
    console.error('Extraction failed:', e)
    console.log('Creating minimal test data...')
    pdfData = {
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
      error: 'Python extraction unavailable',
    }
  }

  // Layer 1
  console.log(`\n${'─'.repeat(70)}`)
  console.log(`${BOLD}Layer 1 — Deterministic Rule Engine${RESET}`)
  console.log('─'.repeat(70))

  const layer1Results = await runRuleEngine(pdfData, caseType)

  let passed = 0, failed = 0, warnings = 0

  for (const result of layer1Results) {
    const icon = result.passed ? '✓' : result.severity === 'warning' ? '⚠' : '✗'
    const color = result.passed ? SEVERITY_COLORS.passed : SEVERITY_COLORS[result.severity]
    console.log(`\n${color}${icon} [${result.checkId}] ${result.title}${RESET}`)
    console.log(`  ${DIM}${result.description}${RESET}`)
    if (!result.passed) {
      console.log(`  ${DIM}Rule: ${result.ruleRef}${RESET}`)
      if (result.detectedOnPages?.length) {
        console.log(`  ${DIM}Pages: ${result.detectedOnPages.join(', ')}${RESET}`)
      }
    }
    if (result.passed) passed++
    else if (result.severity === 'warning') warnings++
    else failed++
  }

  // Layer 2
  console.log(`\n${'─'.repeat(70)}`)
  console.log(`${BOLD}Layer 2 — AI Semantic Analysis (Claude Sonnet)${RESET}`)
  console.log('─'.repeat(70))

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
    console.log(`${SEVERITY_COLORS.warning}⚠ ANTHROPIC_API_KEY not set — skipping AI validation${RESET}`)
    console.log(`  Set ANTHROPIC_API_KEY in .env.local to enable Layer 2`)
  } else {
    try {
      const fullText = [pdfData.text_sample, ...pdfData.full_text_chunks, pdfData.last_pages_text].join('\n')
      const aiResult = await runAIValidation(fullText, caseType, layer1Results, pdfData.page_count)

      if (aiResult.semantic_issues?.length > 0) {
        for (const issue of aiResult.semantic_issues) {
          const color = SEVERITY_COLORS[issue.severity] || ''
          console.log(`\n${color}▸ [AI] ${issue.title}${RESET}`)
          console.log(`  ${DIM}${issue.description}${RESET}`)
          console.log(`  ${DIM}Rule: ${issue.ruleRef}${RESET}`)
          if (issue.severity === 'critical') failed++
          else if (issue.severity === 'warning') warnings++
        }
      } else {
        console.log(`${SEVERITY_COLORS.passed}✓ No additional semantic issues detected by AI${RESET}`)
      }

      if (aiResult.overall_assessment) {
        console.log(`\n${DIM}AI Assessment: ${aiResult.overall_assessment}${RESET}`)
      }
    } catch (e) {
      console.error(`${SEVERITY_COLORS.warning}⚠ AI validation error:${RESET}`, e)
    }
  }

  // Final summary
  const total = layer1Results.length
  const accuracy = total > 0 ? ((passed / total) * 100).toFixed(0) : '0'

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`${BOLD}VALIDATION SUMMARY${RESET}`)
  console.log('═'.repeat(70))
  console.log(`  ${colorize('✗ Critical Defects:', 'critical')} ${failed}`)
  console.log(`  ${colorize('⚠ Warnings:', 'warning')} ${warnings}`)
  console.log(`  ${colorize('✓ Passed:', 'passed')} ${passed}`)
  console.log(`  ${DIM}Total checks: ${total}${RESET}`)
  console.log(`  ${DIM}Layer 1 accuracy proxy: ${accuracy}% checks passed${RESET}`)
  console.log('')

  if (failed === 0) {
    console.log(`${BOLD}${SEVERITY_COLORS.passed}  ✓ FILING READY — No critical defects found${RESET}`)
  } else {
    console.log(`${BOLD}${SEVERITY_COLORS.critical}  ✗ DEFECTIVE FILING — ${failed} critical issue(s) must be fixed${RESET}`)
  }
  console.log('═'.repeat(70) + '\n')
}

main().catch(console.error)
