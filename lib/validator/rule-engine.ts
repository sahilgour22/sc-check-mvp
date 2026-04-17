/**
 * CourtCheck Rule Engine — Layer 1 deterministic validation
 * Covers ALL Supreme Court case types.
 * All rule text sourced from lib/knowledge-base.json
 */
import knowledgeBase from '../knowledge-base.json'

export type Severity = 'critical' | 'warning' | 'info' | 'passed'

export interface CheckResult {
  checkId: string
  passed: boolean
  severity: Severity
  category: string
  title: string
  description: string
  ruleRef: string
  fixInstruction: string
  detectedOnPages?: number[]
  evidence?: string
}

export interface ExtractedPDFData {
  page_count: number
  page_sizes: Array<{ w: number; h: number }>
  text_by_page: Array<{ page: number; text: string; char_count?: number; truncated?: boolean }>
  text_sample: string
  last_pages_text: string
  full_text_chunks: string[]
  has_images: boolean
  is_scanned: boolean
  scanned_page_count?: number  // pages with < 100 chars (blank or image-only)
  metadata: Record<string, string>
  total_text_chars: number
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────

type KBCaseType = {
  validation_checklist?: Array<{
    check_id: string; category: string; description: string; severity: string; rule: string
  }>
  court_fee?: { at_institution?: number; note?: string }
  sensitive_case_checks?: boolean
}

function getKBCheck(caseType: string, checkId: string) {
  const ct = (knowledgeBase.courts.supreme_court.case_types as Record<string, KBCaseType>)[caseType]
  return ct?.validation_checklist?.find((c) => c.check_id === checkId) ?? null
}

function textContains(text: string, ...terms: string[]): boolean {
  const lower = text.toLowerCase()
  return terms.some((t) => lower.includes(t.toLowerCase()))
}

function findPages(pages: Array<{ page: number; text: string }>, ...terms: string[]): number[] {
  return pages.filter((p) => textContains(p.text, ...terms)).map((p) => p.page)
}

function makeResult(
  checkId: string,
  caseType: string,
  passed: boolean,
  overrides: Partial<CheckResult> = {},
  detectedOnPages?: number[]
): CheckResult {
  const kb = getKBCheck(caseType, checkId)
  const result: CheckResult = {
    checkId,
    passed,
    severity: passed ? 'passed' : 'critical',
    category: kb?.category || overrides.category || 'General',
    title: overrides.title || kb?.category || checkId,
    description: overrides.description || kb?.description || '',
    ruleRef: overrides.ruleRef || kb?.rule || '',
    fixInstruction: overrides.fixInstruction || '',
    detectedOnPages,
    ...overrides,
  }
  result.passed = passed
  result.severity = overrides.severity ?? (passed ? 'passed' : 'critical')
  return result
}

// ─── Universal Checks (apply to all case types) ──────────────

function checkFormat(data: ExtractedPDFData, caseType: string, checkId = 'V010'): CheckResult {
  if (data.page_sizes.length === 0) {
    return makeResult(checkId, caseType, false, {
      title: 'Paper Format — A4 Size',
      description: 'Could not determine page dimensions.',
      ruleRef: 'Order VIII Rule 1',
      fixInstruction: 'Ensure the document is on A4 paper (29.7 cm × 21 cm), double-line spacing, printed on one side only.',
      severity: 'warning',
    })
  }

  const isA4 = (s: { w: number; h: number }) =>
    (Math.abs(s.w - 595) < 12 && Math.abs(s.h - 842) < 12) ||
    (Math.abs(s.w - 842) < 12 && Math.abs(s.h - 595) < 12)

  const isDemy = (s: { w: number; h: number }) =>
    Math.abs(s.w - 576) < 15 && Math.abs(s.h - 936) < 15

  const sample = data.page_sizes.slice(0, Math.min(10, data.page_sizes.length))
  const okCount = sample.filter((s) => isA4(s) || isDemy(s)).length
  const passed = okCount >= sample.length * 0.8

  const first = data.page_sizes[0]
  const isLetter = first && Math.abs(first.w - 612) < 5 && Math.abs(first.h - 792) < 5
  const sizeDesc = isLetter
    ? `US Letter (${first.w}×${first.h} pts) — NOT acceptable by SC Registry`
    : `${first?.w?.toFixed(0)}×${first?.h?.toFixed(0)} pts`

  return makeResult(checkId, caseType, passed, {
    title: 'Paper Format — A4 Size',
    description: passed
      ? `Document pages are A4 size (${okCount}/${sample.length} pages verified).`
      : `Document is NOT on A4 paper. Detected: ${sizeDesc}. Required: A4 (595×842 pts / 29.7×21cm). ${isLetter ? 'US Letter is NOT accepted by SC Registry.' : ''}`,
    ruleRef: 'Order VIII Rule 1',
    fixInstruction: 'Print the entire document on A4 paper (29.7 cm × 21 cm), double-line spacing, one side of paper only. Change page size setting to A4 before printing.',
    severity: passed ? 'passed' : 'critical',
  })
}

function checkAffidavit(data: ExtractedPDFData, caseType: string, checkId: string): CheckResult {
  const allText = data.full_text_chunks.join(' ')
  const found = textContains(allText,
    'solemnly affirm', 'solemnly declare', 'solemnly state',
    'deponent', 'before me', 'notary public', 'sworn before',
    'affirmed before', 'i the deponent', 'i, the deponent',
    'true to my knowledge', 'true to the best of my',
    'contents of the above', 'the facts stated above'
  )
  const pages = findPages(data.text_by_page, 'deponent', 'affirm', 'notary', 'sworn')
  return makeResult(checkId, caseType, found, {
    title: 'Affidavit in Support',
    description: found
      ? 'Affidavit in support detected in document.'
      : 'Affidavit in support is missing. A sworn affidavit from the petitioner/appellant verifying the facts is mandatory.',
    ruleRef: 'Order IX · Supreme Court Rules 2013',
    fixInstruction: 'File an affidavit in first person, numbered paragraphs, verifying the facts. Must be sworn before a Notary or Oath Commissioner. Pay Rs.20 court fee on affidavit.',
    severity: found ? 'passed' : 'critical',
  }, pages)
}

function checkVakalatnama(data: ExtractedPDFData, caseType: string, checkId: string): CheckResult {
  const allText = data.full_text_chunks.join(' ')
  const found = textContains(allText,
    'vakalatnama', 'vakalat', 'memo of appearance', 'advocate on record',
    'aor', 'appearing for', 'authorised to appear', 'memorandum of appearance'
  )
  const pages = findPages(data.text_by_page, 'vakalatnama', 'vakalat', 'advocate on record')
  return makeResult(checkId, caseType, found, {
    title: 'Vakalatnama / AOR Authorization',
    description: found
      ? 'Vakalatnama by Advocate-on-Record detected.'
      : 'Vakalatnama by a registered Advocate-on-Record (AOR) is missing. Only AORs can file matters before the Supreme Court.',
    ruleRef: 'Order IV Rule 7',
    fixInstruction: 'Obtain a properly executed Vakalatnama. Must include: Rs.10 court fee stamp, AOR\'s enrollment number, and certification of due execution by the AOR.',
    severity: found ? 'passed' : 'critical',
  }, pages)
}

function checkCertifiedCopy(data: ExtractedPDFData, caseType: string, checkId: string): CheckResult {
  const allText = data.full_text_chunks.join(' ')
  const found = textContains(allText,
    'certified to be true copy', 'certified copy', 'certified true copy',
    'true copy of the original', 'certified correct copy', 'true copy of order',
    'seal of the court', 'stamp of the court'
  )
  const pages = findPages(data.text_by_page, 'certified', 'true copy', 'seal of')
  return makeResult(checkId, caseType, found, {
    title: 'Certified Copy of Impugned Order',
    description: found
      ? 'Certified copy of impugned judgment/order detected.'
      : 'Certified copy of the impugned judgment/order is missing or appears to be an uncertified photocopy.',
    ruleRef: 'Order XXI Rule 4(i)',
    fixInstruction: 'Obtain a certified copy from the court below (High Court/Tribunal). The copy must bear the court\'s seal and certification stamp. If certified copy not yet drawn up, file an affidavit to that effect.',
    severity: found ? 'passed' : 'critical',
  }, pages)
}

function checkListOfDates(data: ExtractedPDFData, caseType: string, checkId: string): CheckResult {
  const first20 = data.text_by_page.slice(0, 20).map((p) => p.text).join(' ')
  const found = textContains(first20,
    'list of dates', 'dates and events', 'list of dates and events',
    'synopsis', 'chronological', 'brief facts and dates', 'material dates'
  )
  const pages = findPages(data.text_by_page.slice(0, 20), 'list of dates', 'synopsis', 'dates and events')
  return makeResult(checkId, caseType, found, {
    title: 'List of Dates and Events',
    description: found
      ? 'List of Dates found in the opening pages.'
      : 'List of Dates is missing from opening pages. Must be a chronological listing of all material dates.',
    ruleRef: 'Order XXI Rule 3(1)(b)',
    fixInstruction: 'Prepare a "List of Dates and Events" covering all key events chronologically — from origin of dispute to the impugned order. Must appear FIRST in the paper book.',
    severity: found ? 'passed' : 'critical',
  }, pages)
}

function checkPageNumbering(data: ExtractedPDFData, caseType: string, checkId = 'V_PAGENO'): CheckResult {
  const pages = data.text_by_page.slice(0, 10)
  const numberedCount = pages.filter((p) =>
    /\bpage\s+\d+\b/i.test(p.text) ||
    /^\s*\d+\s*$/m.test(p.text) ||
    /\b\d+\s*of\s*\d+\b/i.test(p.text)
  ).length
  const passed = numberedCount >= pages.length * 0.5 || data.page_count > 0

  return {
    checkId,
    passed,
    severity: passed ? 'passed' : 'warning',
    category: 'Format',
    title: 'Page Numbering',
    description: passed
      ? 'Pages appear to be numbered.'
      : 'Pages do not appear to be sequentially numbered. All pages must carry sequential page numbers.',
    ruleRef: 'SC Registry Practice Direction',
    fixInstruction: 'Add sequential page numbers to all pages, printed at the bottom center or bottom right.',
  }
}

// ─── SLP Civil Specific ───────────────────────────────────────

function runSLPCivilChecks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  // V001 Court Fee
  const hasFee = textContains(allText,
    'court fee', 'court-fee', '₹1500', '₹1,500', '₹5000', '₹5,000',
    'rs.1500', 'rs.5000', 'rs 1500', 'fee stamp', '1500', 'stamp duty'
  )
  results.push(makeResult('V001', 'slp_civil', hasFee, {
    title: 'Court Fee Stamp',
    description: hasFee
      ? 'Court fee evidence found in document.'
      : 'Court fee stamp of ₹1,500 (or ₹5,000 for tax/company/arbitration matters) is missing.',
    ruleRef: 'Order VIII Rule 8 · Third Schedule Part II',
    fixInstruction: 'Affix the correct denomination court fee stamp (sold in Delhi ONLY). Rs.1,500 for standard SLP; Rs.5,000 for tax, arbitration, company law, banking, IP matters.',
    severity: hasFee ? 'passed' : 'critical',
  }))

  // V003 Document Order
  const hasListFirst = textContains(
    data.text_by_page.slice(0, 5).map((p) => p.text).join(' '),
    'list of dates', 'synopsis', 'dates and events'
  )
  const hasCertified = textContains(allText, 'certified to be true copy', 'certified copy', 'true copy of')
  const hasAppendix = textContains(allText, 'appendix', 'relevant provisions', 'article 136')
  const orderPassed = hasListFirst && hasCertified && hasAppendix
  results.push(makeResult('V003', 'slp_civil', orderPassed, {
    title: 'Prescribed Document Order',
    description: orderPassed
      ? 'Document order appears correct.'
      : `Papers not in prescribed order. Required: (i) List of Dates → (ii) Certified Copy → (iii) SLP Form 28 → (iv) Appendix → (v) Annexures. ${!hasListFirst ? '[List of Dates must be first] ' : ''}${!hasCertified ? '[Certified copy not found] ' : ''}${!hasAppendix ? '[Appendix not found] ' : ''}`,
    ruleRef: 'Order XXI Rule 3(1)(f)',
    fixInstruction: 'Rearrange documents: List of Dates → Certified Judgment → SLP (Form 28) with Affidavit → Appendix → Annexures (individually indexed).',
    severity: orderPassed ? 'passed' : 'critical',
  }))

  // V004 Certified Copy
  results.push(checkCertifiedCopy(data, 'slp_civil', 'V004'))

  // V005 Affidavit
  results.push(checkAffidavit(data, 'slp_civil', 'V005'))

  // V006 Vakalatnama
  results.push(checkVakalatnama(data, 'slp_civil', 'V006'))

  // V007 List of Dates
  results.push(checkListOfDates(data, 'slp_civil', 'V007'))

  // V008 Prior Petition Statement
  const hasPriorStmt = textContains(allText,
    'earlier petition', 'previous slp', 'earlier slp', 'no earlier petition',
    'not filed any earlier', 'no other petition', 'first petition', 'prior petition',
    'no previous petition', 'no petition has been filed'
  )
  results.push(makeResult('V008', 'slp_civil', hasPriorStmt, {
    title: 'Prior Petition Statement',
    description: hasPriorStmt
      ? 'Statement regarding prior petitions is present.'
      : 'Mandatory statement regarding prior petitions against the same order is missing.',
    ruleRef: 'Order XXI Rule 3(2)',
    fixInstruction: 'Add a statement in the petition declaring whether any prior SLP was filed against this order and the result. Support with affidavit from petitioner or Pairokar.',
    severity: hasPriorStmt ? 'passed' : 'critical',
  }))

  // V009 Letters Patent Statement
  const hasLP = textContains(allText,
    'letters patent', 'letters patent appeal', 'writ appeal', 'intra-court appeal',
    'no letters patent', 'letters patent does not lie', 'no writ appeal'
  )
  results.push(makeResult('V009', 'slp_civil', hasLP, {
    title: 'Letters Patent / Writ Appeal Statement',
    description: hasLP
      ? 'Letters Patent / Writ Appeal statement is present.'
      : 'Statement on availability of Letters Patent Appeal or Writ Appeal is missing.',
    ruleRef: 'Order XXI Rule 3(5)',
    fixInstruction: 'Add a statement: (i) whether Letters Patent Appeal/Writ Appeal lay against the judgment; (ii) if yes, whether availed; (iii) if not, why not.',
    severity: hasLP ? 'passed' : 'warning',
  }))

  // V010 Format
  results.push(checkFormat(data, 'slp_civil', 'V010'))

  // V011 Appendix
  const hasAppendixDoc = textContains(allText, 'appendix', 'relevant provisions', 'relevant extract')
  results.push(makeResult('V011', 'slp_civil', hasAppendixDoc, {
    title: 'Appendix — Legal Provisions',
    description: hasAppendixDoc
      ? 'Appendix with relevant provisions detected.'
      : 'Appendix containing English text of relevant constitutional/statutory provisions is missing.',
    ruleRef: 'Order XXI Rule 3(1)(d)(iii) and 3(1)(f)(iv)',
    fixInstruction: 'Add Appendix after the petition with full English text of all Constitution provisions, statutory sections cited in the impugned judgment.',
    severity: hasAppendixDoc ? 'passed' : 'critical',
  }))

  // V_PAGENO
  results.push(checkPageNumbering(data, 'slp_civil', 'V_PAGENO'))

  // V015 Limitation
  const hasLimitation = textContains(allText, 'limitation', 'condonation', 'within 90 days', 'within 60 days', 'delay of', 'within time')
  results.push(makeResult('V015', 'slp_civil', hasLimitation, {
    title: 'Limitation / Timeliness',
    description: hasLimitation
      ? 'Limitation addressed in the document.'
      : 'Limitation period compliance not addressed. Verify filing is within 90 days from judgment (60 days from certificate refusal).',
    ruleRef: 'Order XXI Rule 1',
    fixInstruction: 'Add a statement confirming filing is within limitation. If delayed, file separate Application for Condonation of Delay with affidavit explaining the delay.',
    severity: hasLimitation ? 'passed' : 'warning',
  }))

  return results
}

// ─── SLP Criminal Specific ────────────────────────────────────

function runSLPCriminalChecks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  // VC001 Court Fee — no fee for criminal
  results.push(makeResult('VC001', 'slp_criminal', true, {
    title: 'Court Fee',
    description: 'Criminal proceedings: No court fee required. ✓',
    ruleRef: 'Order XX Rule 20',
    fixInstruction: 'No action needed.',
    severity: 'info',
  }))

  // VC002 Certified Copy
  results.push(checkCertifiedCopy(data, 'slp_criminal', 'VC002'))

  // VC003 Affidavit
  results.push(checkAffidavit(data, 'slp_criminal', 'VC003'))

  // VC004 Vakalatnama
  results.push(checkVakalatnama(data, 'slp_criminal', 'VC004'))

  // VC005 List of Dates
  results.push(checkListOfDates(data, 'slp_criminal', 'VC005'))

  // VC006 Jail Surrender Certificate (if accused in custody)
  const mentionsCustody = textContains(allText, 'custody', 'jail', 'prison', 'detention centre', 'remand', 'judicial custody')
  const hasSurrenderCert = textContains(allText, 'surrender certificate', 'jail certificate', 'superintendent', 'jail authorities')
  const jailCheckPassed = !mentionsCustody || hasSurrenderCert
  results.push(makeResult('VC006', 'slp_criminal', jailCheckPassed, {
    title: 'Jail Surrender Certificate',
    description: jailCheckPassed
      ? mentionsCustody
        ? 'Custody mentioned and surrender certificate appears present.'
        : 'Accused appears to be on bail — surrender certificate not required.'
      : 'Accused is in custody but surrender certificate from Superintendent of Jail is missing.',
    ruleRef: 'SC Registry Practice — Criminal Filings',
    fixInstruction: 'Obtain a surrender certificate from the Superintendent of the Jail/Prison where the accused is held. Vakalatnama should also be signed through jail authorities.',
    severity: jailCheckPassed ? 'passed' : 'warning',
  }))

  // VC007 Prior Petition
  const hasPrior = textContains(allText, 'earlier petition', 'previous slp', 'no prior petition', 'no previous', 'first petition', 'not filed any')
  results.push(makeResult('VC007', 'slp_criminal', hasPrior, {
    title: 'Prior Petition Statement',
    description: hasPrior ? 'Prior petition statement found.' : 'Statement regarding prior petitions is missing.',
    ruleRef: 'Order XXII Rule 2',
    fixInstruction: 'Add statement confirming whether any prior petition was filed against this judgment. Support with affidavit.',
    severity: hasPrior ? 'passed' : 'critical',
  }))

  // VC008 Format
  results.push(checkFormat(data, 'slp_criminal', 'VC008'))

  // VC009 Victim Identity (CRITICAL for sensitive cases)
  results.push(checkVictimRedaction(data, 'slp_criminal'))

  // VC010 Translation
  const hasHindi = /[\u0900-\u097F]{5,}/.test(allText)
  const hasTranslation = textContains(allText, 'certified translation', 'translated by', 'english translation', 'true translation')
  const transOk = !hasHindi || hasTranslation
  results.push(makeResult('VC010', 'slp_criminal', transOk, {
    title: 'Certified Translation',
    description: transOk
      ? hasHindi ? 'Non-English text found and translation appears present.' : 'No non-English text detected.'
      : 'Hindi/vernacular text found but certified English translation is missing.',
    ruleRef: 'Order VIII Rules 2-4',
    fixInstruction: 'Obtain certified English translation of all Hindi/vernacular documents (FIR, charge sheet, lower court orders). Translator must file an affidavit of accuracy.',
    severity: transOk ? 'passed' : 'critical',
  }))

  // VC011 Limitation
  const hasLim = textContains(allText, 'limitation', 'condonation', 'within 90 days', 'delay', 'within time')
  results.push(makeResult('VC011', 'slp_criminal', hasLim, {
    title: 'Limitation / Timeliness',
    description: hasLim ? 'Limitation addressed.' : 'Limitation compliance not explicitly addressed.',
    ruleRef: 'Order XXII Rule 1',
    fixInstruction: 'Verify filing is within 90 days from the impugned order. If delayed, file separate Condonation of Delay application.',
    severity: hasLim ? 'passed' : 'warning',
  }))

  // Page Numbering
  results.push(checkPageNumbering(data, 'slp_criminal', 'V_PAGENO'))

  return results
}

// ─── Writ Petition Article 32 ─────────────────────────────────

function runWritArticle32Checks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  // VW001 Court Fee
  const hasFee = textContains(allText, 'court fee', '₹500', 'rs.500', 'rs 500', '500', 'fee stamp')
  results.push(makeResult('VW001', 'writ_article32', hasFee, {
    title: 'Court Fee — ₹500',
    description: hasFee ? 'Court fee evidence found.' : 'Court fee stamp of ₹500 is missing for Writ Petition under Article 32.',
    ruleRef: 'Third Schedule Part I, S.No.5',
    fixInstruction: 'Affix Rs.500 court fee stamp (Delhi stamps only) to the petition.',
    severity: hasFee ? 'passed' : 'critical',
  }))

  // VW002 Fundamental Rights
  const hasFR = textContains(allText, 'fundamental right', 'article 14', 'article 19', 'article 21', 'article 22', 'article 25', 'article 32', 'part iii')
  results.push(makeResult('VW002', 'writ_article32', hasFR, {
    title: 'Fundamental Rights Invocation',
    description: hasFR ? 'Fundamental rights under Part III identified in petition.' : 'Specific fundamental rights under Part III of Constitution not identified in petition.',
    ruleRef: 'Article 32, Constitution of India',
    fixInstruction: 'Clearly identify which fundamental rights (Articles 14, 19, 21, etc.) are being violated and how. Article 32 jurisdiction only lies for enforcement of fundamental rights.',
    severity: hasFR ? 'passed' : 'critical',
  }))

  // VW003 Writ Type
  const hasWrit = textContains(allText, 'mandamus', 'certiorari', 'prohibition', 'quo warranto', 'habeas corpus', 'direction', 'writ of')
  results.push(makeResult('VW003', 'writ_article32', hasWrit, {
    title: 'Type of Writ Sought',
    description: hasWrit ? 'Type of writ/direction identified.' : 'Specific writ type (mandamus/certiorari/prohibition/habeas corpus/quo warranto) not identified in prayer.',
    ruleRef: 'Order XXXV Rule 1',
    fixInstruction: 'Specify in the prayer clause the exact writ sought (mandamus to compel action, certiorari to quash order, prohibition to prevent action, habeas corpus for release, etc.).',
    severity: hasWrit ? 'passed' : 'warning',
  }))

  // VW004 Affidavit
  results.push(checkAffidavit(data, 'writ_article32', 'VW004'))

  // VW005 Vakalatnama
  results.push(checkVakalatnama(data, 'writ_article32', 'VW005'))

  // VW006 Locus Standi
  const hasLocus = textContains(allText, 'petitioner', 'aggrieved', 'directly affected', 'public interest', 'locus standi')
  results.push(makeResult('VW006', 'writ_article32', hasLocus, {
    title: 'Locus Standi / Standing',
    description: hasLocus ? 'Petitioner identity and standing appears to be stated.' : 'Statement establishing petitioner\'s locus standi (standing) not clearly found.',
    ruleRef: 'Article 32, Constitution of India',
    fixInstruction: 'State clearly: (i) who the petitioner is; (ii) how their fundamental rights are personally violated; or (iii) if PIL, the public interest grounds for standing.',
    severity: hasLocus ? 'passed' : 'warning',
  }))

  // VW007 State Action
  const hasState = textContains(allText, 'union of india', 'state of', 'government of', 'ministry of', 'department of', 'public authority', 'instrumentality of state')
  results.push(makeResult('VW007', 'writ_article32', hasState, {
    title: 'State / Public Authority Respondent',
    description: hasState ? 'State/public authority identified as respondent.' : 'No State or public authority identified as respondent. Writ jurisdiction under Article 32 lies only against State under Article 12.',
    ruleRef: 'Article 12, Constitution of India',
    fixInstruction: 'The respondent must be the State (Union/State Govt), its instrumentalities, or other bodies under Article 12. Add Union of India/concerned State as party respondent.',
    severity: hasState ? 'passed' : 'critical',
  }))

  // VW008 Exhaustion of remedy
  const hasAltRemedy = textContains(allText, 'high court', 'alternative remedy', 'no alternative remedy', 'suppressed', 'writ jurisdiction', 'moved the high court')
  results.push(makeResult('VW008', 'writ_article32', hasAltRemedy, {
    title: 'Alternative Remedy Statement',
    description: hasAltRemedy ? 'Statement on alternative remedies found.' : 'No statement about whether alternative remedy (High Court writ) was availed.',
    ruleRef: 'SC Practice Direction on Direct Petitions',
    fixInstruction: 'Add a statement explaining: (i) whether a writ petition was filed in the High Court; (ii) if not, why direct approach to SC is warranted (e.g., fundamental importance, urgency, violation by SC itself).',
    severity: hasAltRemedy ? 'passed' : 'warning',
  }))

  // VW009 Format
  results.push(checkFormat(data, 'writ_article32', 'VW009'))

  // VW010 List of Dates
  results.push(checkListOfDates(data, 'writ_article32', 'VW010'))

  // Page Numbering
  results.push(checkPageNumbering(data, 'writ_article32', 'V_PAGENO'))

  return results
}

// ─── Habeas Corpus ────────────────────────────────────────────

function runHabeasCorpusChecks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  // VHC001 Court Fee — nil
  results.push(makeResult('VHC001', 'writ_habeas_corpus', true, {
    title: 'Court Fee — Nil',
    description: 'Habeas Corpus: No court fee required. ✓',
    ruleRef: 'Third Schedule Part I',
    fixInstruction: 'No court fee required.',
    severity: 'info',
  }))

  // VHC002 Detention details
  const hasDetention = textContains(allText, 'detained', 'arrested', 'custody', 'prison', 'jail', 'detention')
  const hasDate = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(allText)
  const hasPlace = textContains(allText, 'prison', 'jail', 'police station', 'detention centre', 'custody at')
  results.push(makeResult('VHC002', 'writ_habeas_corpus', hasDetention && hasDate && hasPlace, {
    title: 'Detention Details',
    description: hasDetention ? 'Detention details partially found.' : 'Name of detainee, date of arrest/detention, and place of detention are not clearly stated.',
    ruleRef: 'SC Practice — Habeas Corpus',
    fixInstruction: 'State clearly: (i) Full name of detainee; (ii) Date of arrest/detention; (iii) Place of detention (jail/police station name and address); (iv) Authority responsible for detention.',
    severity: (hasDetention && hasDate && hasPlace) ? 'passed' : 'critical',
  }))

  // VHC003 Legal authority
  const hasAuthority = textContains(allText, 'section', 'act', 'order', 'under the', 'detention order', 'remand order')
  results.push(makeResult('VHC003', 'writ_habeas_corpus', hasAuthority, {
    title: 'Legal Authority for Detention',
    description: hasAuthority ? 'Legal authority for detention appears to be stated.' : 'Specific law/order under which detained is not stated.',
    ruleRef: 'Article 22, Constitution of India',
    fixInstruction: 'State the specific law/order under which the detention is being effected (e.g., Section X of Act Y, or Remand Order dated Z). If no legal authority — state so.',
    severity: hasAuthority ? 'passed' : 'critical',
  }))

  // VHC004 Affidavit
  results.push(checkAffidavit(data, 'writ_habeas_corpus', 'VHC004'))

  // VHC005 Vakalatnama
  results.push(checkVakalatnama(data, 'writ_habeas_corpus', 'VHC005'))

  // VHC006 Grounds of illegality
  const hasGrounds = textContains(allText, 'illegal', 'unlawful', 'without authority', 'in violation', 'unconstitutional', 'no grounds', 'fundamental rights')
  results.push(makeResult('VHC006', 'writ_habeas_corpus', hasGrounds, {
    title: 'Grounds of Illegality of Detention',
    description: hasGrounds ? 'Grounds challenging detention identified.' : 'Specific legal grounds challenging the legality of detention are not stated.',
    ruleRef: 'Article 32, Constitution of India',
    fixInstruction: 'State specific legal grounds: (i) Detention without following procedure established by law; (ii) No grounds communicated to detainee; (iii) No review by Advisory Board; (iv) Violation of Article 22.',
    severity: hasGrounds ? 'passed' : 'critical',
  }))

  results.push(checkPageNumbering(data, 'writ_habeas_corpus', 'V_PAGENO'))
  results.push(checkFormat(data, 'writ_habeas_corpus', 'V_FORMAT'))
  return results
}

// ─── Civil Appeal ─────────────────────────────────────────────

function runCivilAppealChecks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  // VCA001 Court Fee
  const hasFee = textContains(allText, 'court fee', '₹1500', 'rs.1500', 'fee stamp')
  results.push(makeResult('VCA001', 'appeal_civil', hasFee, {
    title: 'Court Fee — ₹1,500',
    description: hasFee ? 'Court fee evidence found.' : 'Court fee stamp of ₹1,500 is missing for Civil Appeal.',
    ruleRef: 'Third Schedule',
    fixInstruction: 'Affix Rs.1,500 court fee stamp (Delhi stamps only).',
    severity: hasFee ? 'passed' : 'critical',
  }))

  // VCA002 Certificate of Leave
  const hasCert = textContains(allText,
    'certificate of leave', 'leave to appeal', 'article 133', 'article 134', '134a',
    'certificate under', 'grant of certificate', 'fit for appeal'
  )
  results.push(makeResult('VCA002', 'appeal_civil', hasCert, {
    title: 'Certificate of Leave from High Court',
    description: hasCert ? 'Certificate of leave / mention of Article 133/134 found.' : 'Certificate of leave from High Court (under Article 133/134A) is missing.',
    ruleRef: 'Article 133/134A, Constitution and Order XIX Rule 1',
    fixInstruction: 'Obtain certificate of leave from the High Court under Article 133 (substantial question of law of general importance) or Article 134A. If refused, SLP may be the appropriate route.',
    severity: hasCert ? 'passed' : 'critical',
  }))

  // VCA003 Certified Copy
  results.push(checkCertifiedCopy(data, 'appeal_civil', 'VCA003'))

  // VCA004 Affidavit
  results.push(checkAffidavit(data, 'appeal_civil', 'VCA004'))

  // VCA005 Vakalatnama
  results.push(checkVakalatnama(data, 'appeal_civil', 'VCA005'))

  // VCA006 List of Dates
  results.push(checkListOfDates(data, 'appeal_civil', 'VCA006'))

  // VCA007 Grounds of Appeal
  const hasGrounds = textContains(allText, 'grounds of appeal', 'question of law', 'error of law', 'grounds:', 'ground no.', 'ground i', 'ground 1')
  results.push(makeResult('VCA007', 'appeal_civil', hasGrounds, {
    title: 'Grounds of Appeal',
    description: hasGrounds ? 'Grounds of appeal identified.' : 'Specific grounds of appeal and questions of law are not clearly stated.',
    ruleRef: 'Order XIX Rule 2',
    fixInstruction: 'Set out specific grounds of appeal with numbered paragraphs. Each ground should identify: (i) the error in the HC judgment; (ii) the correct legal position; (iii) authority if any.',
    severity: hasGrounds ? 'passed' : 'critical',
  }))

  // VCA008 Format
  results.push(checkFormat(data, 'appeal_civil', 'VCA008'))

  // VCA009 Limitation
  const hasLim = textContains(allText, 'limitation', 'within 90 days', 'condonation', 'within time', 'delay')
  results.push(makeResult('VCA009', 'appeal_civil', hasLim, {
    title: 'Limitation / Timeliness',
    description: hasLim ? 'Limitation addressed.' : 'Limitation compliance not addressed.',
    ruleRef: 'Order XIX Rule 2 and Limitation Act',
    fixInstruction: 'Verify filing is within limitation. If delayed, file Condonation of Delay application with affidavit.',
    severity: hasLim ? 'passed' : 'warning',
  }))

  results.push(checkPageNumbering(data, 'appeal_civil', 'V_PAGENO'))
  return results
}

// ─── Criminal Appeal ──────────────────────────────────────────

function runCriminalAppealChecks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  results.push(makeResult('VCR001', 'appeal_criminal', true, {
    title: 'Court Fee — Nil',
    description: 'Criminal Appeal: No court fee required. ✓',
    ruleRef: 'Order XX Rule 20',
    fixInstruction: '',
    severity: 'info',
  }))

  results.push(checkCertifiedCopy(data, 'appeal_criminal', 'VCR002'))
  results.push(checkAffidavit(data, 'appeal_criminal', 'VCR003'))
  results.push(checkVakalatnama(data, 'appeal_criminal', 'VCR004'))

  const hasGrounds = textContains(allText, 'grounds', 'conviction', 'sentence', 'error', 'perverse', 'miscarriage of justice')
  results.push(makeResult('VCR005', 'appeal_criminal', hasGrounds, {
    title: 'Grounds of Appeal',
    description: hasGrounds ? 'Grounds challenging conviction/sentence identified.' : 'Specific grounds challenging conviction or sentence are not stated.',
    ruleRef: 'Order XXII',
    fixInstruction: 'State specific grounds: error in appreciation of evidence, wrong application of law, procedural illegality, perversity of findings, or improper sentence.',
    severity: hasGrounds ? 'passed' : 'critical',
  }))

  // VCR006 Victim Identity (for sexual offence appeals)
  results.push(checkVictimRedaction(data, 'appeal_criminal', 'VCR006'))

  // VCR007 Bail/Surrender Status
  const hasBailStatus = textContains(allText, 'bail', 'surrender', 'custody', 'on bail', 'in custody', 'bailable', 'bail granted')
  results.push(makeResult('VCR007', 'appeal_criminal', hasBailStatus, {
    title: 'Bail / Surrender Status',
    description: hasBailStatus ? 'Bail/custody status of accused mentioned.' : 'Current bail/custody status of the accused is not stated.',
    ruleRef: 'SC Registry Practice — Criminal Filings',
    fixInstruction: 'State whether accused is: (i) on bail (with bail order date); (ii) in custody (with jail name); (iii) surrendered before the SC. Surrender certificate required if in custody.',
    severity: hasBailStatus ? 'passed' : 'warning',
  }))

  results.push(checkFormat(data, 'appeal_criminal', 'VCR008'))
  results.push(checkPageNumbering(data, 'appeal_criminal', 'V_PAGENO'))
  return results
}

// ─── Transfer Petition ─────────────────────────────────────────

function runTransferCivilChecks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  const hasFee = textContains(allText, 'court fee', '₹500', 'rs.500', 'fee stamp')
  results.push(makeResult('VTP001', 'transfer_civil', hasFee, {
    title: 'Court Fee — ₹500',
    description: hasFee ? 'Court fee found.' : 'Court fee of ₹500 is missing for Transfer Petition (Civil).',
    ruleRef: 'Third Schedule',
    fixInstruction: 'Affix Rs.500 court fee stamp.',
    severity: hasFee ? 'passed' : 'critical',
  }))

  const hasGrounds = textContains(allText, 'transfer', 'section 25', 'balance of convenience', 'prejudice', 'fair trial', 'common question', 'convenience of parties')
  results.push(makeResult('VTP002', 'transfer_civil', hasGrounds, {
    title: 'Grounds for Transfer',
    description: hasGrounds ? 'Transfer grounds identified.' : 'Specific grounds for transfer (apprehension of prejudice, common question of law, convenience) not stated.',
    ruleRef: 'Section 25 CPC and Order XXXIX',
    fixInstruction: 'State specific grounds: (i) apprehension of denial of fair trial; (ii) convenience of parties/witnesses; (iii) common question of law in multiple cases; (iv) interest of justice.',
    severity: hasGrounds ? 'passed' : 'critical',
  }))

  const hasCaseDetails = textContains(allText, 'case no.', 'civil suit', 'pending', 'before the', 'court of', 'district court', 'high court')
  results.push(makeResult('VTP003', 'transfer_civil', hasCaseDetails, {
    title: 'Pending Case Details',
    description: hasCaseDetails ? 'Pending case details found.' : 'Details of case(s) sought to be transferred (court, case number, stage) not adequately stated.',
    ruleRef: 'Order XXXIX Rule 1',
    fixInstruction: 'Provide full details of each case sought to be transferred: court name, case number, parties, current stage, date of next hearing.',
    severity: hasCaseDetails ? 'passed' : 'critical',
  }))

  results.push(checkAffidavit(data, 'transfer_civil', 'VTP004'))
  results.push(checkVakalatnama(data, 'transfer_civil', 'VTP005'))
  results.push(checkFormat(data, 'transfer_civil', 'VTP007'))
  results.push(checkPageNumbering(data, 'transfer_civil', 'V_PAGENO'))
  return results
}

function runTransferCriminalChecks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  results.push(makeResult('VTPC001', 'transfer_criminal', true, {
    title: 'Court Fee — Nil',
    description: 'Criminal Transfer: No court fee. ✓',
    ruleRef: 'Order XX Rule 20',
    fixInstruction: '',
    severity: 'info',
  }))

  const hasGrounds = textContains(allText, 'transfer', 'section 406', 'section 447', 'fair trial', 'witness safety', 'prejudice', 'public disorder')
  results.push(makeResult('VTPC002', 'transfer_criminal', hasGrounds, {
    title: 'Grounds for Criminal Transfer',
    description: hasGrounds ? 'Transfer grounds identified.' : 'Specific grounds for criminal transfer not stated.',
    ruleRef: 'Section 406 CrPC / Section 447 BNSS and Order XXXIX',
    fixInstruction: 'State grounds: (i) fair trial apprehension; (ii) witness safety; (iii) communal/public disorder; (iv) convenience when accused/witnesses are at distant location.',
    severity: hasGrounds ? 'passed' : 'critical',
  }))

  const hasCaseDetails = textContains(allText, 'fir', 'case no.', 'sessions court', 'magistrate', 'pending', 'police station', 'crpc', 'bnss')
  results.push(makeResult('VTPC003', 'transfer_criminal', hasCaseDetails, {
    title: 'Pending Criminal Case Details',
    description: hasCaseDetails ? 'Pending case details found.' : 'Details of criminal case(s) to be transferred (FIR/case number, court, sections, stage) not adequately stated.',
    ruleRef: 'Order XXXIX Rule 1',
    fixInstruction: 'Provide: FIR number, police station, IPC/BNS sections, Sessions/Magistrate court name, case number, current stage.',
    severity: hasCaseDetails ? 'passed' : 'critical',
  }))

  results.push(checkAffidavit(data, 'transfer_criminal', 'VTPC004'))
  results.push(checkVakalatnama(data, 'transfer_criminal', 'VTPC005'))
  results.push(checkVictimRedaction(data, 'transfer_criminal', 'VTPC006'))
  results.push(checkFormat(data, 'transfer_criminal', 'VTPC007'))
  results.push(checkPageNumbering(data, 'transfer_criminal', 'V_PAGENO'))
  return results
}

// ─── Contempt Petition ───────────────────────────────────────

function runContemptCivilChecks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  const hasFee = textContains(allText, 'court fee', '₹500', 'rs.500', 'fee stamp')
  results.push(makeResult('VCP001', 'contempt_civil', hasFee, {
    title: 'Court Fee — ₹500',
    description: hasFee ? 'Court fee found.' : 'Court fee of ₹500 is missing for Contempt Petition.',
    ruleRef: 'Third Schedule',
    fixInstruction: 'Affix Rs.500 court fee stamp.',
    severity: hasFee ? 'passed' : 'critical',
  }))

  const hasSCOrder = textContains(allText, 'order of this hon\'ble court', 'order dated', 'supreme court order', 'direction of this court', 'judgment of this court')
  results.push(makeResult('VCP002', 'contempt_civil', hasSCOrder, {
    title: 'SC Order Allegedly Violated — Annexed',
    description: hasSCOrder ? 'Reference to SC order found.' : 'Certified copy of the SC order allegedly violated is missing.',
    ruleRef: 'Order XLVII Rule 1',
    fixInstruction: 'Annex certified copy of the specific SC order/direction whose violation is being alleged. Without this, contempt cannot be established.',
    severity: hasSCOrder ? 'passed' : 'critical',
  }))

  const hasParticulars = textContains(allText, 'contempt', 'wilful', 'disobedience', 'failed to comply', 'non-compliance', 'violation of')
  results.push(makeResult('VCP003', 'contempt_civil', hasParticulars, {
    title: 'Particulars of Contempt',
    description: hasParticulars ? 'Contempt particulars found.' : 'Specific acts/omissions constituting contempt not clearly described.',
    ruleRef: 'Contempt of Courts Act 1971 Section 2(b)',
    fixInstruction: 'Describe specifically: (i) What the SC order required; (ii) What the contemnor did or failed to do; (iii) Dates of non-compliance; (iv) Evidence of wilful disobedience.',
    severity: hasParticulars ? 'passed' : 'critical',
  }))

  results.push(checkAffidavit(data, 'contempt_civil', 'VCP004'))
  results.push(checkVakalatnama(data, 'contempt_civil', 'VCP005'))

  const hasContemnors = textContains(allText, 'respondent', 'contemnor', 'alleged contemnor', 'contemnors')
  results.push(makeResult('VCP006', 'contempt_civil', hasContemnors, {
    title: 'Contemnors Named',
    description: hasContemnors ? 'Contemnors identified.' : 'Full names and designations of alleged contemnors not clearly stated.',
    ruleRef: 'Order XLVII Rule 1',
    fixInstruction: 'Name each alleged contemnor with full name, designation, and address. Personal capacity or official capacity must be specified.',
    severity: hasContemnors ? 'passed' : 'critical',
  }))

  const hasLimitation = textContains(allText, 'one year', '1 year', 'within one year', 'limitation', 'date of contempt')
  results.push(makeResult('VCP007', 'contempt_civil', true, {
    title: 'Limitation — 1 Year',
    description: 'Verify contempt petition is filed within 1 year from the alleged contemptuous act (Section 20, Contempt of Courts Act 1971).',
    ruleRef: 'Section 20, Contempt of Courts Act 1971',
    fixInstruction: 'Ensure petition is filed within 1 year of the alleged violation. If beyond 1 year, application for condonation with special circumstances required.',
    severity: 'warning',
  }))

  results.push(checkFormat(data, 'contempt_civil', 'VCP008'))
  results.push(checkPageNumbering(data, 'contempt_civil', 'V_PAGENO'))
  return results
}

function runContemptCriminalChecks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  results.push(makeResult('VCCP001', 'contempt_criminal', true, {
    title: 'Court Fee — Nil',
    description: 'Criminal Contempt: No court fee. ✓',
    ruleRef: 'Order XX Rule 20',
    fixInstruction: '',
    severity: 'info',
  }))

  const hasGrounds = textContains(allText, 'scandalising', 'prejudice', 'obstruction', 'interference', 'publication', 'statement', 'criminal contempt')
  results.push(makeResult('VCCP002', 'contempt_criminal', hasGrounds, {
    title: 'Grounds of Criminal Contempt',
    description: hasGrounds ? 'Criminal contempt grounds identified.' : 'Acts of criminal contempt (scandalising court, prejudicing proceedings, obstruction of justice) not described.',
    ruleRef: 'Section 2(c), Contempt of Courts Act 1971',
    fixInstruction: 'Describe specifically: (i) The publication/statement that scandalises the court; (ii) How it prejudices ongoing judicial proceedings; or (iii) How it obstructs administration of justice.',
    severity: hasGrounds ? 'passed' : 'critical',
  }))

  const hasEvidence = textContains(allText, 'annexure', 'exhibit', 'copy of', 'screenshot', 'publication', 'newspaper', 'video')
  results.push(makeResult('VCCP003', 'contempt_criminal', hasEvidence, {
    title: 'Evidence of Contempt Annexed',
    description: hasEvidence ? 'Evidence of contempt appears annexed.' : 'Copies of publications/statements/videos constituting contempt not found as annexures.',
    ruleRef: 'Order XLVII Rule 1',
    fixInstruction: 'Annex copies of: newspaper articles, social media posts, video recordings, statements — whatever constitutes the alleged contempt.',
    severity: hasEvidence ? 'passed' : 'critical',
  }))

  results.push(checkAffidavit(data, 'contempt_criminal', 'VCCP004'))
  results.push(checkVakalatnama(data, 'contempt_criminal', 'VCCP005'))

  const hasAGConsent = textContains(allText, 'attorney general', 'attorney general of india', 'consent of', 'a.g. consent', 'solicitior general')
  results.push(makeResult('VCCP006', 'contempt_criminal', hasAGConsent, {
    title: 'Attorney General Consent',
    description: hasAGConsent ? 'Reference to AG consent found.' : 'Consent of the Attorney General of India to initiate criminal contempt proceedings is missing.',
    ruleRef: 'Section 15, Contempt of Courts Act 1971',
    fixInstruction: 'Obtain written consent of the Attorney General of India (or Solicitor General) before filing criminal contempt petition. Without this, petition is not maintainable.',
    severity: hasAGConsent ? 'passed' : 'critical',
  }))

  results.push(checkFormat(data, 'contempt_criminal', 'VCCP007'))
  results.push(checkPageNumbering(data, 'contempt_criminal', 'V_PAGENO'))
  return results
}

// ─── Review Petition ─────────────────────────────────────────

function runReviewPetitionChecks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  const hasFee = textContains(allText, 'court fee', '₹200', 'rs.200', 'fee stamp')
  results.push(makeResult('VRP001', 'review_petition', hasFee, {
    title: 'Court Fee — ₹200',
    description: hasFee ? 'Court fee found.' : 'Court fee of ₹200 is missing for Review Petition.',
    ruleRef: 'Third Schedule',
    fixInstruction: 'Affix Rs.200 court fee stamp.',
    severity: hasFee ? 'passed' : 'critical',
  }))

  const hasGrounds = textContains(allText, 'review', 'error apparent', 'apparent error', 'face of the record', 'discovery of new', 'sufficient reason', 'ground for review', 'order xlvii', 'article 137')
  results.push(makeResult('VRP002', 'review_petition', hasGrounds, {
    title: 'Grounds for Review',
    description: hasGrounds ? 'Review grounds identified.' : 'Specific grounds for review (error apparent on face of record, new matter, sufficient reason) not stated.',
    ruleRef: 'Order XLVII Rule 1 CPC and Article 137',
    fixInstruction: 'State specific ground: (i) Error apparent on the face of the record (must be obvious, not debatable); (ii) Discovery of new and important matter not known at time of judgment; (iii) Any other sufficient reason.',
    severity: hasGrounds ? 'passed' : 'critical',
  }))

  const hasSCJudgment = textContains(allText, 'judgment', 'order of this court', 'dated', 'writ petition', 'slp', 'review of')
  results.push(makeResult('VRP003', 'review_petition', hasSCJudgment, {
    title: 'SC Judgment to be Reviewed — Annexed',
    description: hasSCJudgment ? 'Reference to SC judgment found.' : 'Certified copy of SC judgment/order sought to be reviewed is missing.',
    ruleRef: 'Order XLVII Rule 1',
    fixInstruction: 'Annex certified copy of the SC judgment/order you seek review of.',
    severity: hasSCJudgment ? 'passed' : 'critical',
  }))

  results.push(checkAffidavit(data, 'review_petition', 'VRP004'))
  results.push(checkVakalatnama(data, 'review_petition', 'VRP005'))

  results.push(makeResult('VRP006', 'review_petition', true, {
    title: 'Limitation — 30 Days',
    description: 'Review petition must be filed within 30 days from the date of SC judgment. Verify this.',
    ruleRef: 'Order XLVII Rule 1',
    fixInstruction: 'If filing is beyond 30 days from SC judgment, file Application for Condonation of Delay explaining the delay.',
    severity: 'warning',
  }))

  results.push(makeResult('VRP007', 'review_petition', true, {
    title: 'Fresh Grounds Not Permissible',
    description: 'A review petition cannot raise new arguments not made in the original proceedings. Review is limited to errors on face of record.',
    ruleRef: 'Article 137, Constitution of India',
    fixInstruction: 'Ensure grounds are limited to: (i) errors apparent on face of the record; (ii) factual mistakes in the judgment; (iii) new matter not within petitioner\'s knowledge. Fresh legal arguments are not permissible.',
    severity: 'info',
  }))

  results.push(checkFormat(data, 'review_petition', 'VRP008'))
  results.push(checkPageNumbering(data, 'review_petition', 'V_PAGENO'))
  return results
}

// ─── Curative Petition ────────────────────────────────────────

function runCurativePetitionChecks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  const hasFee = textContains(allText, 'court fee', '₹200', 'rs.200', 'fee stamp')
  results.push(makeResult('VCU001', 'curative_petition', hasFee, {
    title: 'Court Fee — ₹200',
    description: hasFee ? 'Court fee found.' : 'Court fee required for Curative Petition.',
    ruleRef: 'Third Schedule',
    fixInstruction: 'Affix required court fee stamp.',
    severity: hasFee ? 'passed' : 'critical',
  }))

  const hasReviewDismissed = textContains(allText, 'review petition', 'review dismissed', 'review rejected', 'review was filed', 'after review')
  results.push(makeResult('VCU002', 'curative_petition', hasReviewDismissed, {
    title: 'Review Petition Previously Filed and Dismissed',
    description: hasReviewDismissed ? 'Reference to review petition dismissal found.' : 'No mention of prior review petition having been filed and dismissed. Curative only lies after review is exhausted.',
    ruleRef: 'Rupa Ashok Hurra v. Ashok Hurra (2002) 4 SCC 388',
    fixInstruction: 'State: (i) Date of original SC judgment; (ii) Date review petition was filed; (iii) Date review petition was dismissed. Annex the review dismissal order.',
    severity: hasReviewDismissed ? 'passed' : 'critical',
  }))

  const hasGrounds = textContains(allText, 'natural justice', 'bias', 'prejudice', 'judge', 'curative', 'miscarriage of justice', 'violation of')
  results.push(makeResult('VCU003', 'curative_petition', hasGrounds, {
    title: 'Curative Grounds — High Threshold',
    description: hasGrounds ? 'Curative grounds referenced.' : 'Curative petition grounds (natural justice violation or judicial bias) not clearly stated.',
    ruleRef: 'Rupa Ashok Hurra (2002) 4 SCC 388',
    fixInstruction: 'Curative jurisdiction is extremely narrow. Only permissible if: (i) Fundamental principle of natural justice violated; or (ii) A judge who heard the matter had bias/interest. Both must be established with specifics.',
    severity: hasGrounds ? 'passed' : 'critical',
  }))

  const hasSAcertification = textContains(allText, 'senior advocate', 'senior counsel', 'certified by', 'senior designated advocate')
  results.push(makeResult('VCU004', 'curative_petition', hasSAcertification, {
    title: 'Senior Advocate Certification',
    description: hasSAcertification ? 'Senior Advocate certification reference found.' : 'Certification by a Senior Advocate that grounds are made out for curative petition is missing.',
    ruleRef: 'Rupa Ashok Hurra (2002) 4 SCC 388',
    fixInstruction: 'Obtain a certification from a designated Senior Advocate certifying that the grounds for curative petition are genuine and make out a case.',
    severity: hasSAcertification ? 'passed' : 'critical',
  }))

  const hasBothOrders = textContains(allText, 'review', 'original judgment') && textContains(allText, 'dismissed', 'rejected')
  results.push(makeResult('VCU005', 'curative_petition', hasBothOrders, {
    title: 'Both Original Judgment + Review Order Annexed',
    description: hasBothOrders ? 'Both orders appear to be referenced.' : 'Both the original SC judgment AND the review dismissal order must be annexed.',
    ruleRef: 'Rupa Ashok Hurra practice',
    fixInstruction: 'Annex: (i) Certified copy of original SC judgment; (ii) Certified copy of review petition dismissal order.',
    severity: hasBothOrders ? 'passed' : 'critical',
  }))

  results.push(checkAffidavit(data, 'curative_petition', 'VCU006'))
  results.push(checkVakalatnama(data, 'curative_petition', 'VCU007'))
  results.push(checkFormat(data, 'curative_petition', 'VCU008'))
  results.push(checkPageNumbering(data, 'curative_petition', 'V_PAGENO'))
  return results
}

// ─── PIL ─────────────────────────────────────────────────────

function runPILChecks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  const hasFee = textContains(allText, 'court fee', '₹500', 'rs.500', 'fee stamp', 'fee waiver')
  results.push(makeResult('VPIL001', 'pil', hasFee, {
    title: 'Court Fee — ₹500',
    description: hasFee ? 'Court fee or fee waiver reference found.' : 'Court fee of ₹500 is missing (unless fee waiver specifically sought).',
    ruleRef: 'Third Schedule Part I',
    fixInstruction: 'Affix Rs.500 court fee stamp. Alternatively, file an application for fee waiver if the PIL is genuinely for public interest without financial capacity.',
    severity: hasFee ? 'passed' : 'critical',
  }))

  const hasPublicInterest = textContains(allText, 'public interest', 'public at large', 'millions of', 'citizens', 'environment', 'constitutional obligation', 'public health', 'fundamental right')
  results.push(makeResult('VPIL002', 'pil', hasPublicInterest, {
    title: 'Genuine Public Interest Established',
    description: hasPublicInterest ? 'Public interest grounds identified.' : 'Genuine public interest ground not clearly established in petition.',
    ruleRef: 'PIL Guidelines — SC',
    fixInstruction: 'Clearly articulate the public interest: (i) Who is affected and how many; (ii) What fundamental rights are being denied; (iii) Why the matter cannot be addressed through individual litigation.',
    severity: hasPublicInterest ? 'passed' : 'critical',
  }))

  const hasFR = textContains(allText, 'article 14', 'article 19', 'article 21', 'fundamental right', 'right to life', 'right to equality', 'right to liberty')
  results.push(makeResult('VPIL003', 'pil', hasFR, {
    title: 'Fundamental Rights Identified',
    description: hasFR ? 'Fundamental rights violations identified.' : 'Specific fundamental rights being violated not identified.',
    ruleRef: 'Article 32, Constitution of India',
    fixInstruction: 'Identify specific fundamental rights: Article 14 (equality), Article 19 (freedoms), Article 21 (life and liberty), etc. and how they are being violated.',
    severity: hasFR ? 'passed' : 'critical',
  }))

  const hasState = textContains(allText, 'union of india', 'state of', 'government of', 'ministry of', 'department of', 'public authority')
  results.push(makeResult('VPIL005', 'pil', hasState, {
    title: 'State Respondents Named',
    description: hasState ? 'State/Government respondents identified.' : 'Union of India and/or relevant State/Ministry not named as respondent.',
    ruleRef: 'Order XXXV Rule 1',
    fixInstruction: 'Add as respondents: (i) Union of India through Secretary of concerned Ministry; (ii) Relevant State Government(s); (iii) Concerned regulatory authority.',
    severity: hasState ? 'passed' : 'critical',
  }))

  results.push(checkAffidavit(data, 'pil', 'VPIL006'))
  results.push(checkVakalatnama(data, 'pil', 'VPIL007'))

  const hasPrayer = textContains(allText, 'prayer', 'it is prayed', 'direction', 'writ of', 'direct the', 'issue appropriate')
  results.push(makeResult('VPIL008', 'pil', hasPrayer, {
    title: 'Specific and Enforceable Prayer',
    description: hasPrayer ? 'Prayer clause found.' : 'No specific, enforceable prayer in the petition.',
    ruleRef: 'SC PIL Guidelines',
    fixInstruction: 'State specific, enforceable prayers: (i) Direction to Government to do X by date Y; (ii) Declaration that policy Z is unconstitutional; (iii) Constitution of committee to enquire into specific matters.',
    severity: hasPrayer ? 'passed' : 'critical',
  }))

  results.push(checkFormat(data, 'pil', 'VPIL010'))
  results.push(checkListOfDates(data, 'pil', 'VPIL004_DATES'))
  results.push(checkPageNumbering(data, 'pil', 'V_PAGENO'))
  return results
}

// ─── Election Petition ───────────────────────────────────────

function runElectionPetitionChecks(data: ExtractedPDFData): CheckResult[] {
  const allText = data.full_text_chunks.join(' ')
  const results: CheckResult[] = []

  const hasFee = textContains(allText, 'court fee', '₹500', 'rs.500', 'fee stamp')
  results.push(makeResult('VEP001', 'election_petition', hasFee, {
    title: 'Court Fee — ₹500',
    description: hasFee ? 'Court fee reference found.' : 'Court fee of ₹500 not found. Election petitions require a court fee stamp.',
    ruleRef: 'Section 117, Representation of the People Act 1951',
    fixInstruction: 'Affix Rs.500 court fee stamp as required under Section 117 of the Representation of the People Act, 1951.',
    severity: hasFee ? 'passed' : 'critical',
  }))

  const hasPetitioner = textContains(allText, 'petitioner', 'election petitioner', 'elector', 'candidate')
  results.push(makeResult('VEP002', 'election_petition', hasPetitioner, {
    title: 'Petitioner Standing — Elector or Candidate',
    description: hasPetitioner ? 'Petitioner identified as elector/candidate.' : 'Petitioner\'s locus standi as elector or candidate not established.',
    ruleRef: 'Section 81, Representation of the People Act 1951',
    fixInstruction: 'Establish petitioner\'s standing: state that petitioner is (i) a candidate at the election, or (ii) an elector entitled to vote at the election, with voter ID/roll number.',
    severity: hasPetitioner ? 'passed' : 'critical',
  }))

  const hasElectionDate = /election.*held.*\d{4}|polling.*\d{1,2}.*\d{4}|\d{1,2}[./]\d{1,2}[./]\d{4}.*election/i.test(allText)
  results.push(makeResult('VEP003', 'election_petition', hasElectionDate, {
    title: 'Election Date and Constituency Stated',
    description: hasElectionDate ? 'Election date and details found.' : 'Date of election and/or constituency details not clearly stated.',
    ruleRef: 'Section 81(3), Representation of the People Act 1951',
    fixInstruction: 'Clearly state: (i) Date(s) on which election was held; (ii) Name of constituency; (iii) Returned candidate\'s name and party.',
    severity: hasElectionDate ? 'passed' : 'critical',
  }))

  const hasGrounds = textContains(allText, 'corrupt practice', 'bribery', 'undue influence', 'improper rejection', 'improper acceptance', 'non-compliance', 'section 100', 'section 101')
  results.push(makeResult('VEP004', 'election_petition', hasGrounds, {
    title: 'Grounds Under Section 100/101 RPA Stated',
    description: hasGrounds ? 'Grounds for challenging election found.' : 'Specific grounds under Section 100 or 101 of the Representation of the People Act 1951 not stated.',
    ruleRef: 'Sections 100-101, Representation of the People Act 1951',
    fixInstruction: 'Specify exact ground(s) under Section 100 RPA 1951: (a) candidate not qualified; (b) corrupt practice; (c) improper acceptance/rejection of votes; (d) non-compliance with Constitution or RPA. Each ground must be particularised.',
    severity: hasGrounds ? 'passed' : 'warning',
  }))

  const hasLimitation = textContains(allText, '45 days', 'within 45', 'date of election', 'result declared', 'result published')
  results.push(makeResult('VEP005', 'election_petition', hasLimitation, {
    title: 'Limitation — 45 Days from Result Publication',
    description: hasLimitation ? 'Limitation reference found.' : 'Limitation period compliance (45 days from date of publication of result) not addressed.',
    ruleRef: 'Section 81(1), Representation of the People Act 1951',
    fixInstruction: 'State: (i) Date of declaration / publication of election result in Official Gazette; (ii) Date of filing petition; (iii) Number of days elapsed. If beyond 45 days, file separate application for condonation of delay.',
    severity: hasLimitation ? 'passed' : 'warning',
  }))

  results.push(checkAffidavit(data, 'election_petition', 'VEP006'))
  results.push(checkVakalatnama(data, 'election_petition', 'VEP007'))
  results.push(checkFormat(data, 'election_petition', 'VEP010'))
  results.push(checkListOfDates(data, 'election_petition', 'VEP_DATES'))
  results.push(checkPageNumbering(data, 'election_petition', 'V_PAGENO'))

  return results
}

// ─── Victim Redaction Check ──────────────────────────────────

function checkVictimRedaction(data: ExtractedPDFData, caseType: string, checkId = 'V017'): CheckResult {
  const allText = data.full_text_chunks.join(' ')

  const isSensitiveCase = textContains(allText,
    'rape', 'pocso', 'sexual assault', 'sexual offence', 'molestation', 'outraging modesty',
    'section 376', 'section 354', 'indecent assault', 'minor victim', 'child victim',
    'protection of children', 'sexual harassment', 'section 63', 'section 64', 'section 65',
    'section 66', 'section 67', 'section 68', 'section 70', 'section 71', 'section 72',
    'bns 2023 sexual', 'victim of sexual'
  )

  if (!isSensitiveCase) {
    return {
      checkId,
      passed: true,
      severity: 'passed',
      category: 'Sensitive Information',
      title: 'Victim Identity Redaction',
      description: 'No indicators of POCSO/sexual offence detected. Redaction check not triggered.',
      ruleRef: 'Section 228A IPC / Section 72 BNS 2023',
      fixInstruction: '',
    }
  }

  const suspiciousPatterns = [
    /daughter\s+of\s+[A-Z][a-z]+/,
    /d\/o\s+[A-Z][a-z]+/,
    /wife\s+of\s+[A-Z][a-z]+/,
    /w\/o\s+[A-Z][a-z]+/,
    /aged\s+\d+\s+years.*girl/i,
    /minor\s+girl.*named\s+[A-Z]/i,
    /victim\s+named\s+[A-Z]/i,
    /complainant\s+[A-Z][a-z]{3,}\s+[A-Z][a-z]/,
    /prosecutrix\s+[A-Z][a-z]{3,}/,
    /survivor\s+named\s+[A-Z]/i,
  ]

  const hasSuspiciousPattern = suspiciousPatterns.some((re) => re.test(allText))

  return {
    checkId,
    passed: !hasSuspiciousPattern,
    severity: hasSuspiciousPattern ? 'critical' : 'warning',
    category: 'SENSITIVE — Victim Identity Redaction',
    title: 'Victim Name / Identity Redaction — POCSO/Rape Case',
    description: hasSuspiciousPattern
      ? 'CRITICAL: Victim identity appears to be exposed. This is a POCSO/sexual offence case — the victim\'s name and all identifying information MUST be redacted under Section 228A IPC / Section 72 BNS 2023.'
      : 'POCSO/sexual offence case detected. No obvious victim name pattern found, but perform a MANUAL visual review of all pages — especially FIR, charge sheet, and lower court order copies.',
    ruleRef: 'Section 228A IPC / Section 72 BNS 2023 · SC Guidelines 2018 · POCSO Act 2012 Section 33(7)',
    fixInstruction: hasSuspiciousPattern
      ? 'URGENT: Use the Redact Tool to replace ALL occurrences of victim\'s name, father\'s name, address, school/workplace with "Victim" or "Prosecutrix". Check FIR, charge sheet, trial court order, High Court judgment copies. Violation is punishable with imprisonment up to 2 years.'
      : 'Perform a visual review of all pages. Replace any identifying information with "Victim" or "Prosecutrix". Pay special attention to: cause title, FIR first page, charge sheet, and any annexures.',
    detectedOnPages: findPages(data.text_by_page, 'rape', 'pocso', 'prosecutrix', 'section 376', 'sexual assault'),
  }
}

// ─── Scanned PDF Warning ─────────────────────────────────────

function scannedWarning(): CheckResult {
  return {
    checkId: 'V_SCAN',
    passed: false,
    severity: 'warning',
    category: 'Document Quality',
    title: 'Scanned PDF Detected — Limited OCR',
    description: 'This appears to be a scanned image PDF. Text extraction is limited, which means some checks may be inaccurate or may miss issues.',
    ruleRef: 'SC Registry Digital Filing Guidelines',
    fixInstruction: 'Run OCR (Optical Character Recognition) on the PDF before uploading for best accuracy. Recommended tools: Adobe Acrobat Pro, ABBYY FineReader, or free tools like Tesseract OCR.',
  }
}

// ─── Main Dispatcher ─────────────────────────────────────────

export async function runRuleEngine(
  data: ExtractedPDFData,
  caseType: string
): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  if (data.is_scanned) {
    results.push(scannedWarning())
  }

  switch (caseType) {
    case 'slp_civil':
      results.push(...runSLPCivilChecks(data))
      break
    case 'slp_criminal':
      results.push(...runSLPCriminalChecks(data))
      break
    case 'writ_article32':
      results.push(...runWritArticle32Checks(data))
      break
    case 'writ_habeas_corpus':
      results.push(...runHabeasCorpusChecks(data))
      break
    case 'appeal_civil':
      results.push(...runCivilAppealChecks(data))
      break
    case 'appeal_criminal':
      results.push(...runCriminalAppealChecks(data))
      break
    case 'transfer_civil':
      results.push(...runTransferCivilChecks(data))
      break
    case 'transfer_criminal':
      results.push(...runTransferCriminalChecks(data))
      break
    case 'contempt_civil':
      results.push(...runContemptCivilChecks(data))
      break
    case 'contempt_criminal':
      results.push(...runContemptCriminalChecks(data))
      break
    case 'review_petition':
      results.push(...runReviewPetitionChecks(data))
      break
    case 'curative_petition':
      results.push(...runCurativePetitionChecks(data))
      break
    case 'pil':
      results.push(...runPILChecks(data))
      break
    case 'election_petition':
      results.push(...runElectionPetitionChecks(data))
      break
    default:
      // Fallback: run SLP Civil checks as baseline
      results.push(...runSLPCivilChecks(data))
  }

  return results
}
