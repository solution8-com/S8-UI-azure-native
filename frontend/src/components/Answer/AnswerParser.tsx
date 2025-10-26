import { cloneDeep } from 'lodash'

import { AskResponse, Citation } from '../../api'

export type ParsedAnswer = {
  citations: Citation[]
  markdownFormatText: string,
  generated_chart: string | null
} | null

export const enumerateCitations = (citations: Citation[]) => {
  const filepathMap = new Map()
  for (const citation of citations) {
    const { filepath } = citation
    let part_i = 1
    if (filepathMap.has(filepath)) {
      part_i = filepathMap.get(filepath) + 1
    }
    filepathMap.set(filepath, part_i)
    citation.part_index = part_i
  }
  return citations
}

/**
 * Minimal, isolated support for Azure AI Foundry Prompt Flow "tool" role messages.
 * Non-invasive: only used if no inline [docN] citations are found.
 * Maps Prompt Flow fields to existing Citation shape without mutating input.
 */
const extractPromptFlowCitations = (answer: AskResponse): Citation[] => {
  console.log('[PromptFlow Citation Parser] Starting extraction from PromptFlow response')
  console.log('[PromptFlow Citation Parser] Input answer object:', JSON.stringify(answer, null, 2))
  
  const anyAnswer = answer as any
  const choices = anyAnswer?.choices
  
  console.log('[PromptFlow Citation Parser] Checking for choices array in response')
  if (!Array.isArray(choices)) {
    console.log('[PromptFlow Citation Parser] ❌ No choices array found in response - returning empty citations')
    return []
  }
  console.log(`[PromptFlow Citation Parser] ✓ Found choices array with ${choices.length} choice(s)`)

  const out: Citation[] = []

  for (const choice of choices) {
    console.log('[PromptFlow Citation Parser] Processing choice:', JSON.stringify(choice, null, 2))
    const messages = choice?.messages
    
    if (!Array.isArray(messages)) {
      console.log('[PromptFlow Citation Parser] ⚠ Choice does not contain messages array - skipping')
      continue
    }
    console.log(`[PromptFlow Citation Parser] ✓ Found messages array with ${messages.length} message(s)`)

    for (const msg of messages) {
      console.log('[PromptFlow Citation Parser] Examining message:', JSON.stringify(msg, null, 2))
      
      if (msg?.role !== 'tool') {
        console.log(`[PromptFlow Citation Parser] ⚠ Message role is "${msg?.role}", not "tool" - skipping`)
        continue
      }
      console.log('[PromptFlow Citation Parser] ✓ Found message with role="tool"')
      
      if (msg?.content == null) {
        console.log('[PromptFlow Citation Parser] ⚠ Tool message has null/undefined content - skipping')
        continue
      }
      console.log('[PromptFlow Citation Parser] ✓ Tool message has content')

      let contentObj: any = msg.content
      if (typeof msg.content === 'string') {
        console.log('[PromptFlow Citation Parser] Content is a string, attempting to parse as JSON')
        console.log('[PromptFlow Citation Parser] Raw content string:', msg.content)
        try {
          contentObj = JSON.parse(msg.content)
          console.log('[PromptFlow Citation Parser] ✓ Successfully parsed JSON content:', JSON.stringify(contentObj, null, 2))
        } catch (err) {
          console.log('[PromptFlow Citation Parser] ❌ Failed to parse JSON content:', err)
          continue
        }
      } else {
        console.log('[PromptFlow Citation Parser] Content is already an object (not a string)')
      }

      const cits = contentObj?.citations
      console.log('[PromptFlow Citation Parser] Checking for citations array in parsed content')
      if (!Array.isArray(cits)) {
        console.log('[PromptFlow Citation Parser] ⚠ No citations array found in content object - skipping')
        console.log('[PromptFlow Citation Parser] Content object keys:', Object.keys(contentObj || {}))
        continue
      }
      console.log(`[PromptFlow Citation Parser] ✓ Found citations array with ${cits.length} citation(s)`)

      for (let i = 0; i < cits.length; i++) {
        const pf = cits[i]
        console.log(`[PromptFlow Citation Parser] Processing citation ${i + 1}/${cits.length}:`, JSON.stringify(pf, null, 2))
        
        const citation: Citation = {
          id: pf?.docId ?? String(i + 1),
          content: pf?.content ?? '',
          title: pf?.title ?? null,
          filepath: pf?.source ?? pf?.filepath ?? null,
          url: pf?.url ?? null,
          metadata: pf?.page != null ? JSON.stringify({ page: pf.page }) : (pf?.metadata ?? null),
          chunk_id: pf?.chunk_id ?? null,
          reindex_id: null,
          part_index: pf?.page ?? undefined
        }
        
        console.log(`[PromptFlow Citation Parser] ✓ Created Citation object:`, JSON.stringify(citation, null, 2))
        console.log(`[PromptFlow Citation Parser]   - docId: ${pf?.docId} → id: ${citation.id}`)
        console.log(`[PromptFlow Citation Parser]   - source: ${pf?.source} → filepath: ${citation.filepath}`)
        console.log(`[PromptFlow Citation Parser]   - page: ${pf?.page} → part_index: ${citation.part_index}`)
        
        out.push(citation)
      }
    }
  }

  console.log(`[PromptFlow Citation Parser] ✅ Extraction complete - found ${out.length} total citation(s)`)
  console.log('[PromptFlow Citation Parser] Final citations array:', JSON.stringify(out, null, 2))
  return out
}

export function parseAnswer(answer: AskResponse): ParsedAnswer {
  console.log('[Answer Parser] ========== Starting parseAnswer ==========')
  console.log('[Answer Parser] Received answer object:', JSON.stringify(answer, null, 2))
  
  if (typeof answer.answer !== "string") {
    console.log('[Answer Parser] ❌ answer.answer is not a string (type:', typeof answer.answer, ') - returning null')
    return null
  }
  console.log('[Answer Parser] ✓ answer.answer is a valid string')
  
  let answerText = answer.answer
  console.log('[Answer Parser] Answer text:', answerText)
  
  const citationLinks = answerText.match(/\[(doc\d\d?\d?)]/g)
  console.log('[Answer Parser] Searching for inline [docN] citation patterns')
  console.log('[Answer Parser] Found citation links:', citationLinks)

  const lengthDocN = '[doc'.length

  let filteredCitations = [] as Citation[]
  let citationReindex = 0

  // Existing behavior for inline [docN] citations (unchanged)
  console.log('[Answer Parser] Processing inline [docN] citations (if any)')
  citationLinks?.forEach(link => {
    console.log(`[Answer Parser] Processing inline citation link: ${link}`)
    // Replacing the links/citations with number
    const citationIndex = link.slice(lengthDocN, link.length - 1)
    console.log(`[Answer Parser]   - Citation index: ${citationIndex}`)
    
    const citation = cloneDeep(answer.citations[Number(citationIndex) - 1]) as Citation
    console.log(`[Answer Parser]   - Citation from answer.citations array:`, JSON.stringify(citation, null, 2))
    
    if (!filteredCitations.find(c => c.id === citationIndex) && citation) {
      answerText = answerText.replaceAll(link, ` ^${++citationReindex}^ `)
      citation.id = citationIndex // original doc index to de-dupe
      citation.reindex_id = citationReindex.toString() // reindex from 1 for display
      filteredCitations.push(citation)
      console.log(`[Answer Parser]   - ✓ Added citation with reindex_id: ${citation.reindex_id}`)
    } else {
      console.log(`[Answer Parser]   - ⚠ Skipped citation (duplicate or invalid)`)
    }
  })
  
  console.log(`[Answer Parser] Inline citations processed: ${filteredCitations.length} citation(s)`)

  // Fallback: Prompt Flow tool citations (only if no inline citations were parsed)
  console.log('[Answer Parser] Checking if PromptFlow fallback is needed')
  if (filteredCitations.length === 0) {
    console.log('[Answer Parser] ✓ No inline citations found - activating PromptFlow citation fallback')
    const pfCitations = extractPromptFlowCitations(answer)
    console.log(`[Answer Parser] PromptFlow extraction returned ${pfCitations.length} citation(s)`)
    
    if (pfCitations.length > 0) {
      console.log('[Answer Parser] ✓ Re-indexing PromptFlow citations for display')
      pfCitations.forEach((c, idx) => {
        console.log(`[Answer Parser]   - Citation ${idx}: reindex_id = ${idx + 1}`)
        c.reindex_id = (idx + 1).toString()
      })
      filteredCitations = pfCitations
      console.log('[Answer Parser] ✅ PromptFlow citations successfully loaded as fallback')
    } else {
      console.log('[Answer Parser] ⚠ PromptFlow extraction found no citations')
    }
  } else {
    console.log(`[Answer Parser] ⚠ Skipping PromptFlow fallback - already have ${filteredCitations.length} inline citation(s)`)
  }

  console.log('[Answer Parser] Enumerating citations (assigning part_index)')
  filteredCitations = enumerateCitations(filteredCitations)
  console.log('[Answer Parser] Final enumerated citations:', JSON.stringify(filteredCitations, null, 2))

  const result = {
    citations: filteredCitations,
    markdownFormatText: answerText,
    generated_chart: answer.generated_chart
  }
  
  console.log('[Answer Parser] ========== parseAnswer complete ==========')
  console.log(`[Answer Parser] Returning ${result.citations.length} citation(s)`)
  console.log('[Answer Parser] Result:', JSON.stringify(result, null, 2))
  
  return result
}
