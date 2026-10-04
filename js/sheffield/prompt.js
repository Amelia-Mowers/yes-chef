// Prompt and reply contract for the local model. Kept short: small models have
// little room, and every line of persona competes with the JSON contract.

export const SYSTEM_PROMPT = `You are Sheffield, a polite little butler who edits a restaurant's order menu.
Do exactly what the user asks and nothing more. Reply with ONE JSON object:
{"say": "<one short sentence>", "ops": [<edits>], "questions": [{"text": "<question>", "choices": ["<answer>", "<answer>"]}]}
Edit shapes (replace <...> with names from the user's request):
{"op":"addCategory","name":"<category>"}
{"op":"addModifierGroup","name":"<group>","select":"single|multi","required":true|false,"options":["<option>"]}
{"op":"addItem","category":"<category>","name":"<dish>","modifierGroups":["<group>"]}
{"op":"renameItem","item":"<dish>","name":"<new name>"}
{"op":"removeItem","item":"<dish>"}
{"op":"moveItem","item":"<dish>","to":"<category>"}
{"op":"addOption","group":"<group>","name":"<option>"}
{"op":"attachGroup","item":"<dish>","group":"<group>"}
Only use modifier groups the user mentioned or that already exist. If the request is unclear (for example which category a dish belongs in), make no edits and ask a question instead.`

// Photos are read in a separate, narrow step: transcription only. The rule-based
// parser and code-driven questions turn the text into a menu.
export const TRANSCRIBE_PROMPT = 'Copy all the text on this menu exactly, line by line, top to bottom. Keep section headings on their own lines. Output only the text.'

export function buildTranscription() {
  return [{role: 'user', content: [{type: 'image'}, {type: 'text', text: TRANSCRIBE_PROMPT}]}]
}

// Compact menu description so the model knows what already exists.
export function describeMenu(menu) {
  if (!menu?.categories?.length) return 'The menu is empty.'
  const groups = new Map(menu.modifierGroups.map(g => [g.id, g]))
  const lines = menu.categories.map(c => `${c.name}: ${c.items.map(i => (i.modifierGroups.length ? `${i.name} [${i.modifierGroups.map(id => groups.get(id)?.name).filter(Boolean).join(', ')}]` : i.name)).join('; ') || '(no items)'}`)
  const gl = menu.modifierGroups.map(g => `${g.name} (${g.select}, ${g.required ? 'required' : 'optional'}): ${g.options.map(o => o.name).join(', ')}`)
  return `Current menu:\n${lines.join('\n')}${gl.length ? `\nModifier groups:\n${gl.join('\n')}` : ''}`
}

// Builds the chat for the processor. `history` holds earlier {role, text}
// turns (kept short by the caller); `turn` is {text, hasImage}.
export function buildConversation(menu, history, turn) {
  const msgs = [{role: 'system', content: [{type: 'text', text: SYSTEM_PROMPT}]}]
  for (const h of history) msgs.push({role: h.role, content: [{type: 'text', text: h.text}]})
  const content = []
  if (turn.hasImage) content.push({type: 'image'})
  const ask = turn.text?.trim() || (turn.hasImage ? 'Read this menu and add its dishes.' : '')
  content.push({type: 'text', text: `${describeMenu(menu)}\n\n${ask}`})
  msgs.push({role: 'user', content})
  return msgs
}

// Pulls the first balanced JSON object out of the model's text and checks its shape.
export function parseReply(text) {
  const start = text.indexOf('{')
  if (start < 0) return {error: 'no JSON object in reply'}
  let depth = 0
  let inStr = false
  let esc = false
  let end = -1
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) {
      end = i
      break
    }
  }
  let obj
  try {
    obj = JSON.parse(end < 0 ? closeTruncated(text.slice(start)) : text.slice(start, end + 1))
  } catch (err) {
    return {error: end < 0 ? 'reply was cut off before the JSON closed' : `invalid JSON: ${err.message}`}
  }
  const ops = Array.isArray(obj.ops) ? obj.ops.filter(o => o && typeof o.op === 'string') : []
  const questions = (Array.isArray(obj.questions) ? obj.questions : [])
    .map(q => (typeof q === 'string' ? {text: q, choices: []} : q))
    .filter(q => q && typeof q.text === 'string' && q.text.trim())
    .map(q => ({text: q.text.trim(), choices: (Array.isArray(q.choices) ? q.choices : []).map(String).filter(Boolean).slice(0, 5)}))
  return {say: typeof obj.say === 'string' ? obj.say.trim() : '', ops, questions}
}

// Small models sometimes stop before the final brackets. Close what is open
// (outside strings) so a nearly complete reply is still usable.
function closeTruncated(fragment) {
  const stack = []
  let inStr = false
  let esc = false
  for (const ch of fragment.replace(/```\s*$/, '').trimEnd()) {
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']')
    else if (ch === '}' || ch === ']') stack.pop()
  }
  if (inStr) throw new Error('cut off inside a string')
  return fragment.replace(/```\s*$/, '').trimEnd().replace(/,\s*$/, '') + stack.reverse().join('')
}

// Text sent back to the model when its reply could not be used.
export function repairPrompt(problem) {
  return `That reply could not be used (${problem}). Reply again with only the JSON object.`
}

// Generation settings: greedy decoding keeps structured output steady.
export const GENERATION = {max_new_tokens: 1024, do_sample: false, repetition_penalty: 1.05}
