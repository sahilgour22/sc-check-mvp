/**
 * CourtCheck AI Validator — Layer 2 semantic validation via Claude API
 */
import Anthropic from '@anthropic-ai/sdk'
import type { CheckResult } from './rule-engine'

export interface AIValidationResult {
  semantic_issues: Array<{
    severity: 'critical' | 'warning' | 'info'
    category: string
    title: string
    description: string
    ruleRef: string
    fixInstruction: string
  }>
  overall_assessment: string
  filing_ready: boolean
  tokens_used?: number
  ai_available: boolean
  ai_error?: string
}

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || key === 'your_anthropic_api_key_here' || key.trim() === '') {
    return null
  }
  return new Anthropic({ apiKey: key })
}

export async function runAIValidation(
  extractedText: string,
  caseType: string,
  layer1Results: CheckResult[],
  pageCount: number
): Promise<AIValidationResult> {

  const client = getClient()

  if (!client) {
    return {
      semantic_issues: [],
      overall_assessment: '',
      filing_ready: false,
      ai_available: false,
      ai_error: 'ANTHROPIC_API_KEY not configured. Set it in .env.local to enable AI semantic analysis. Layer 1 deterministic checks are still fully valid.',
    }
  }

  const systemPrompt = `You are a Senior Advocate and Supreme Court of India filing expert with 20+ years of practice experience.

You know the Supreme Court Rules, 2013 (GSR 368(E)) in complete detail — every Order, Rule, and proviso. You have reviewed thousands of SLPs, Civil Appeals, Writ Petitions, Transfer Petitions, Contempt Petitions, and Review Petitions.

Your job: Review the filing text and identify EVERY defect, no matter how small. Lawyers depend on your analysis to avoid having their file returned by the Registry. Be strict, precise, and actionable.

Always cite the exact Order and Rule number (e.g., "Order XXI Rule 3(1)(f)"). Never use vague citations.

When you find no issue with a particular check, do NOT include it in the semantic_issues array.`

  const textToAnalyse = extractedText.length > 70000
    ? extractedText.slice(0, 60000) + '\n\n[... middle pages truncated ...]\n\n' + extractedText.slice(-10000)
    : extractedText

  const caseTypeNames: Record<string, string> = {
    slp_civil: 'Special Leave Petition (Civil) under Article 136',
    slp_criminal: 'Special Leave Petition (Criminal) under Article 136',
    writ_article32: 'Writ Petition under Article 32',
    writ_habeas_corpus: 'Writ Petition (Habeas Corpus)',
    appeal_civil: 'Civil Appeal',
    appeal_criminal: 'Criminal Appeal',
    transfer_civil: 'Transfer Petition (Civil)',
    transfer_criminal: 'Transfer Petition (Criminal)',
    contempt_civil: 'Contempt Petition (Civil)',
    contempt_criminal: 'Contempt Petition (Criminal)',
    review_petition: 'Review Petition',
    curative_petition: 'Curative Petition',
    pil: 'Public Interest Litigation (Writ Petition)',
    election_petition: 'Election Petition',
  }

  const prompt = `Validate this ${caseTypeNames[caseType] || caseType} filing for Supreme Court of India compliance.

DOCUMENT STATS: ${pageCount} pages | Case: ${caseTypeNames[caseType] || caseType}

LAYER 1 RESULTS (already done — only add NEW semantic issues):
${JSON.stringify(layer1Results.map(r => ({ id: r.checkId, passed: r.passed, title: r.title })), null, 2)}

FILING TEXT:
${textToAnalyse}

CHECK ALL OF THESE:
1. Cause title format — "PETITIONER vs RESPONDENT" with correct party designations?
2. Party name consistency — identical across all sections?
3. Prayer clause — present, specific, citing exact order challenged?
4. Synopsis/List of Dates — chronological, factually consistent?
5. Annexure cross-references — every annexure referenced in body with page number (e.g., "Annexure P-1/pg.50")?
6. Grounds of challenge — clearly articulated legal grounds?
7. Article 136/32/226 invocation — jurisdiction explicitly stated?
8. Affidavit verification — correctly verifies petition paragraph by paragraph?
9. Limitation — filing within time or condonation addressed?
10. Cause of action / jurisdiction — any obvious issues?
11. For criminal/POCSO/rape cases — victim identity suppressed?
12. Any other substantive defects you identify.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "semantic_issues": [
    {
      "severity": "critical" | "warning" | "info",
      "category": "string",
      "title": "string",
      "description": "string",
      "ruleRef": "exact Order and Rule",
      "fixInstruction": "exact steps to fix"
    }
  ],
  "overall_assessment": "One paragraph professional assessment",
  "filing_ready": boolean
}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const parsed: Omit<AIValidationResult, 'ai_available'> = JSON.parse(cleaned)

    return {
      ...parsed,
      ai_available: true,
      tokens_used: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('AI Validation error:', msg)
    return {
      semantic_issues: [],
      overall_assessment: '',
      filing_ready: false,
      ai_available: false,
      ai_error: msg,
    }
  }
}
