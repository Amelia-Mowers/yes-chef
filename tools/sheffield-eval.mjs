// Runs Sheffield's prompt against the real Qwen3.5 model on this machine (CPU)
// and reports whether replies parse, which ops apply, and what questions come back.
//   node tools/sheffield-eval.mjs [0.8b|2b]
import {AutoProcessor, Qwen3_5ForConditionalGeneration, RawImage, env} from '@huggingface/transformers'
import {buildConversation, buildTranscription, parseReply, GENERATION} from '../js/sheffield/prompt.js'
import {parseText, compilePlan, nextQuestion, planCounts} from '../js/sheffield/parse.js'
import {SAMPLE_MENU} from '../js/sample-menu.js'
import {applyOps, validateMenu} from '../js/sheffield/ops.js'
import {MODELS} from '../js/sheffield/models.js'

env.cacheDir = new URL('../node_modules/.cache/sheffield', import.meta.url).pathname

const tier = MODELS[process.argv[2] || '0.8b']
const t0 = Date.now()
const processor = await AutoProcessor.from_pretrained(tier.repo, {revision: tier.revision})
const model = await Qwen3_5ForConditionalGeneration.from_pretrained(tier.repo, {revision: tier.revision, dtype: tier.dtypes.cpu, device: 'cpu'})
console.log(`loaded ${tier.label} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

const empty = {version: 0, categories: [], modifierGroups: []}

async function generate(conversation, image) {
  const prompt = processor.apply_chat_template(conversation, {add_generation_prompt: true, enable_thinking: false})
  const inputs = await processor(prompt, image)
  const start = Date.now()
  const out = await model.generate({...inputs, ...GENERATION})
  const text = processor.batch_decode(out.slice(null, [inputs.input_ids.dims.at(-1), null]), {skip_special_tokens: true})[0]
  return {text, secs: (Date.now() - start) / 1000, promptTokens: inputs.input_ids.dims.at(-1)}
}

function show(menu) {
  for (const cat of menu.categories) console.log(`  ${cat.name}: ${cat.items.map(i => i.name + (i.modifierGroups.length ? ` (${i.modifierGroups.join(',')})` : '')).join('; ')}`)
  for (const g of menu.modifierGroups) console.log(`  [${g.name}] ${g.select}/${g.required ? 'req' : 'opt'}: ${g.options.map(o => o.name).join(', ')}`)
}

// 1. Photo: transcribe, then the rule-based parser.
{
  const image = await prepare(await RawImage.read('test/fixtures/chalkboard-menu.jpg'))
  const r = await generate(buildTranscription(), image)
  console.log(`\n=== photo → transcription (${r.secs.toFixed(1)}s, ${r.promptTokens} prompt tokens)\n${r.text}`)
  const plan = parseText(r.text)
  console.log('parsed:', planCounts(plan), '| first question:', nextQuestion(plan)?.text || 'none')
  show(applyOps(empty, compilePlan(plan)).menu)
}

// 2. Typed requests against an existing menu.
const cases = [
  'Add a Desserts category with Brownie and Apple Pie. Both can come with ice cream.',
  'Add fries.',
  'Rename Cola to Coke and add Root Beer to Drinks.',
  'Take the veggie burger off the menu.'
]
for (const text of cases) {
  const r = await generate(buildConversation(SAMPLE_MENU, [], {text, hasImage: false}), null)
  const reply = parseReply(r.text)
  console.log(`\n=== "${text}" (${r.secs.toFixed(1)}s)`)
  if (reply.error) {
    console.log('PARSE ERROR:', reply.error, '\n', r.text.slice(0, 600))
    continue
  }
  const {menu, errors} = applyOps(SAMPLE_MENU, reply.ops)
  console.log('say:', reply.say)
  console.log('ops:', JSON.stringify(reply.ops))
  console.log('errors:', errors.map(e => e.error), '| questions:', reply.questions.map(q => q.text + (q.choices.length ? ` [${q.choices.join(' | ')}]` : '')))
}

async function prepare(img) {
  const scale = Math.min(1, tier.imageMax / Math.max(img.width, img.height))
  return scale < 1 ? img.resize(Math.round(img.width * scale), Math.round(img.height * scale)) : img
}
