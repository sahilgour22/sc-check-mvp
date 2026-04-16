/**
 * CourtCheck Validation Orchestrator
 * Combines Layer 1 (deterministic rule engine) + Layer 2 (Claude AI)
 */
import { runRuleEngine, type CheckResult, type ExtractedPDFData } from './rule-engine'
import { runAIValidation, type AIValidationResult } from './ai-validator'

export interface ValidationReport {
  sessionId: string
  caseType: string
  pageCount: number
  isScanned: boolean
  layer1Results: CheckResult[]
  aiResults: AIValidationResult | null
  allDefects: DefectItem[]
  summary: {
    totalChecks: number
    criticalCount: number
    warningCount: number
    passedCount: number
    infoCount: number
    filingReady: boolean
    aiAvailable: boolean
  }
  generatedAt: string
}

export interface DefectItem {
  id: string
  source: 'rule-engine' | 'ai'
  severity: 'critical' | 'warning' | 'info' | 'passed'
  category: string
  title: string
  description: string
  ruleRef: string
  fixInstruction: string
  detectedOnPages?: number[]
}

export type ProgressCallback = (step: string, progress: number, message: string, partial?: Partial<ValidationReport>) => void

export async function runValidation(
  data: ExtractedPDFData,
  caseType: string,
  sessionId: string,
  onProgress?: ProgressCallback
): Promise<ValidationReport> {

  const emit = (step: string, progress: number, message: string, partial?: Partial<ValidationReport>) => {
    onProgress?.(step, progress, message, partial)
  }

  emit('extract', 10, 'PDF structure analyzed successfully')

  // ── Layer 1: Deterministic Rule Engine ──────────────────────
  emit('rules', 20, 'Running Supreme Court Rules checklist...')
  const layer1Results = await runRuleEngine(data, caseType)
  emit('rules', 55, `Completed ${layer1Results.length} deterministic checks`, { layer1Results })

  // ── Layer 2: AI Semantic Validation ─────────────────────────
  emit('ai', 60, 'Running AI semantic analysis via Claude...')

  const fullText = [
    data.text_sample,
    ...data.full_text_chunks,
    data.last_pages_text,
  ].join('\n\n')

  let aiResults: AIValidationResult | null = null
  try {
    aiResults = await runAIValidation(fullText, caseType, layer1Results, data.page_count)

    if (aiResults.ai_available) {
      emit('ai', 85, 'AI semantic analysis complete', { aiResults })
    } else {
      emit('ai', 85, `AI analysis skipped: ${aiResults.ai_error || 'API key not configured'}`)
    }
  } catch (e) {
    console.error('AI validation failed:', e)
    emit('ai', 85, 'AI analysis unavailable — using deterministic results only')
  }

  // ── Compile final defect list ────────────────────────────────
  emit('report', 92, 'Cross-referencing SC Rules 2013...')

  const allDefects: DefectItem[] = []

  // Layer 1 defects (non-passed)
  for (const r of layer1Results) {
    if (r.severity !== 'passed') {
      allDefects.push({
        id: r.checkId,
        source: 'rule-engine',
        severity: r.severity,
        category: r.category,
        title: r.title,
        description: r.description,
        ruleRef: r.ruleRef,
        fixInstruction: r.fixInstruction,
        detectedOnPages: r.detectedOnPages,
      })
    }
  }

  // Layer 2 AI defects — only if AI was available and returned issues
  if (aiResults?.ai_available && aiResults.semantic_issues?.length) {
    for (const issue of aiResults.semantic_issues) {
      const isDuplicate = allDefects.some(
        (d) => d.category.toLowerCase() === issue.category.toLowerCase()
          && d.title.toLowerCase() === issue.title.toLowerCase()
      )
      if (!isDuplicate) {
        allDefects.push({
          id: `AI_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          source: 'ai',
          severity: issue.severity,
          category: issue.category,
          title: issue.title,
          description: issue.description,
          ruleRef: issue.ruleRef || '',
          fixInstruction: issue.fixInstruction || '',
        })
      }
    }
  }

  // Sort: critical first, warning, info
  const severityOrder = { critical: 0, warning: 1, info: 2, passed: 3 }
  allDefects.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  // Summary
  const passedLayer1 = layer1Results.filter((r) => r.passed).length
  const criticalCount = allDefects.filter((d) => d.severity === 'critical').length
  const warningCount = allDefects.filter((d) => d.severity === 'warning').length
  const infoCount = allDefects.filter((d) => d.severity === 'info').length
  const aiAvailable = aiResults?.ai_available ?? false
  const filingReady = criticalCount === 0 && (aiResults?.filing_ready !== false || !aiAvailable)

  const report: ValidationReport = {
    sessionId,
    caseType,
    pageCount: data.page_count,
    isScanned: data.is_scanned,
    layer1Results,
    aiResults,
    allDefects,
    summary: {
      totalChecks: layer1Results.length + (aiResults?.semantic_issues?.length || 0),
      criticalCount,
      warningCount,
      passedCount: passedLayer1,
      infoCount,
      filingReady,
      aiAvailable,
    },
    generatedAt: new Date().toISOString(),
  }

  emit('done', 100, 'Validation complete', report)
  return report
}
