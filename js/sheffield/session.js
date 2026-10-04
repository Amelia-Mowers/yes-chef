// One Sheffield conversation: routes each message to the parser, the command
// grammar or the local model, keeps a working copy of the menu, and saves
// itself after every turn so a killed tab resumes where it left off.

import {kv} from '../db.js'
import {applyOps, summarize, validateMenu} from './ops.js'
import {parseAny, nextQuestion, answerQuestion, compilePlan, planCounts, looksLikeCsv} from './parse.js'
import {parseCommand} from './commands.js'
import {agent, ask, transcribe, isInstalled} from './agent.js'
import {say, summarizeChange} from './voice.js'

const KEY = 'sheffieldChat'
const MAX_MESSAGES = 60
const empty = () => ({version: 0, categories: [], modifierGroups: []})
const uid = () => Math.random().toString(36).slice(2, 10)

export function createSession(draft, onChange) {
  const s = {
    messages: [],
    working: structuredClone(draft || empty()),
    undo: [],
    plan: null, // parser plan awaiting answers
    question: null, // current parser question
    merge: null, // 'merge' | 'replace' once asked
    modelQuestions: [], // last questions from the model
    busy: false,
    streaming: ''
  }

  const changed = () => onChange?.(s)
  const save = () => kv.set(KEY, {messages: s.messages.slice(-MAX_MESSAGES), working: s.working, undo: s.undo.slice(-10), plan: s.plan, question: s.question, merge: s.merge}).catch(() => {})

  function sheffield(text, extra = {}) {
    s.messages.push({id: uid(), from: 'sheffield', text, ...extra})
  }

  function commit(ops, lead) {
    const before = s.working
    const {menu, errors} = applyOps(before, ops)
    if (!ops.length) {
      sheffield(lead || say.nothingFound)
      return
    }
    if (JSON.stringify(menu) === JSON.stringify(before) && !errors.length) {
      sheffield(say.alreadyThere)
      return
    }
    s.undo.push(before)
    s.working = menu
    const skipped = errors.length ? ` (${errors.length} edit${errors.length === 1 ? '' : 's'} didn’t fit and ${errors.length === 1 ? 'was' : 'were'} skipped.)` : ''
    const problems = validateMenu(menu)
    sheffield(`${lead ? lead + ' ' : ''}${summarizeChange(summarize(before, menu))}${skipped}`, {
      proposal: true,
      problems: problems.slice(0, 3)
    })
  }

  // Continue the parser's question loop, or finish and apply the plan.
  function advancePlan() {
    const q = nextQuestion(s.plan, {
      existingCategories: s.working.categories.map(c => c.name),
      draftHasItems: s.working.categories.some(c => c.items.length),
      mergeDecided: Boolean(s.merge)
    })
    if (q) {
      s.question = q
      sheffield(q.text, {choices: q.choices.map(c => c.label), allowText: q.allowText})
      return
    }
    const ops = compilePlan(s.plan)
    const counts = planCounts(s.plan)
    s.plan = null
    s.question = null
    if (s.merge === 'replace') {
      s.undo.push(s.working)
      s.working = empty()
    }
    s.merge = null
    commit(ops, counts.items ? 'Very good.' : say.nothingFound)
  }

  function startPlan(plan) {
    if (!planCounts(plan).items) {
      sheffield(say.nothingFound)
      return
    }
    s.plan = plan
    s.merge = null
    const {categories, items} = planCounts(plan)
    sheffield(`I found ${items} dish${items === 1 ? '' : 'es'}${categories ? ` in ${categories} section${categories === 1 ? '' : 's'}` : ''}.`)
    advancePlan()
  }

  function answerPlan(text) {
    const q = s.question
    const choice = q.choices.find(c => c.label.toLowerCase() === text.trim().toLowerCase())
    const value = choice ? choice.value : text
    if (q.id === 'merge') {
      s.merge = /replace/i.test(value) ? 'replace' : 'merge'
    } else {
      s.plan = answerQuestion(s.plan, q, value)
    }
    s.question = null
    advancePlan()
  }

  // Short history for the model: last few exchanges, text only.
  function history() {
    return s.messages
      .filter(m => m.text && !m.local)
      .slice(-6)
      .map(m => ({role: m.from === 'user' ? 'user' : 'assistant', text: m.text}))
      .slice(0, -1)
  }

  async function viaModel(text, image) {
    s.streaming = ''
    const reply = await ask({
      menu: s.working,
      history: history(),
      text,
      image,
      onToken: t => {
        s.streaming = t == null ? '' : s.streaming + t
        changed()
      }
    })
    s.streaming = ''
    s.modelQuestions = reply.questions
    if (reply.ops.length) commit(reply.ops, reply.say)
    else sheffield(reply.say || (reply.questions.length ? '' : say.notUnderstood))
    for (const q of reply.questions.slice(0, 2)) sheffield(q.text, {choices: q.choices, allowText: true, fromModel: true})
    const last = s.messages.at(-1)
    if (reply.stats) last.stats = reply.stats
  }

  async function handleText(text) {
    const trimmed = text.trim()
    const lines = trimmed.split(/\n/).filter(l => l.trim()).length

    if (s.question && lines <= 2) return answerPlan(trimmed)

    if (/^undo$/i.test(trimmed)) {
      if (!s.undo.length) return sheffield(say.nothingToUndo)
      s.working = s.undo.pop()
      return sheffield(say.undone, {proposal: true})
    }

    if (trimmed.startsWith('{') || looksLikeCsv(trimmed) || lines >= 3) return startPlan(parseAny(trimmed))

    const cmd = parseCommand(trimmed, s.working)
    if (cmd) return commit(cmd.ops, cmd.say)

    if (isInstalled()) return viaModel(trimmed, null)
    sheffield(say.notUnderstood)
  }

  async function handleFile(file) {
    const type = file.type || ''
    const name = file.name || 'file'
    if (type.startsWith('image/')) {
      if (!isInstalled()) return sheffield(say.needModel, {hire: true})
      sheffield(say.reading, {local: true})
      changed()
      const image = await prepareImage(file, 1024)
      const {text} = await transcribe(image, t => {
        s.streaming = t == null ? '' : s.streaming + t
        changed()
      })
      s.streaming = ''
      sheffield(`Here is what I read:\n${text}`, {transcript: true})
      return startPlan(parseAny(text))
    }
    if (type === 'application/pdf' || /\.pdf$/i.test(name)) return sheffield(say.noPdf)
    const text = await file.text()
    if (!text.trim()) return sheffield(say.nothingFound)
    return startPlan(parseAny(text))
  }

  return {
    state: s,

    async send({text = '', files = []}) {
      if (s.busy) return
      const thumbs = await Promise.all(files.filter(f => f.type?.startsWith('image/')).map(f => thumbnail(f)))
      s.messages.push({id: uid(), from: 'user', text: text.trim(), files: files.map(f => f.name), thumbs})
      s.busy = true
      changed()
      try {
        for (const f of files) await handleFile(f)
        if (text.trim()) await handleText(text)
      } catch (err) {
        console.error(err)
        s.streaming = ''
        if (err.message === 'stopped') sheffield(say.stopped)
        else sheffield(/garbled|JSON|cut off/i.test(err.message) ? say.confused : `Something went wrong: ${err.message}`)
      } finally {
        s.busy = false
        await save()
        changed()
      }
    },

    async restore() {
      const saved = await kv.get(KEY)
      if (saved?.messages?.length) Object.assign(s, saved)
      if (!s.messages.length) sheffield(isInstalled() ? say.hello : say.helloNoModel)
      changed()
    },

    note(text, extra) {
      sheffield(text, extra)
      save()
      changed()
    },

    // After applying, the working menu becomes the new baseline.
    applied() {
      s.undo = []
      sheffield(say.applied)
      save()
      changed()
    },

    async reset(draft) {
      Object.assign(s, {messages: [], working: structuredClone(draft || empty()), undo: [], plan: null, question: null, merge: null, modelQuestions: [], streaming: ''})
      sheffield(isInstalled() ? say.hello : say.helloNoModel)
      await save()
      changed()
    }
  }
}

// Downscale and fix orientation (iPad photos carry EXIF rotation) before the
// model sees the image; also keeps memory down.
export async function prepareImage(file, maxSide) {
  const bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'})
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = new OffscreenCanvas(w, h)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.convertToBlob({type: 'image/jpeg', quality: 0.9})
}

async function thumbnail(file) {
  try {
    const blob = await prepareImage(file, 240)
    return await new Promise(resolve => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export {agent}
