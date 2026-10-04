// Runs the local model off the main thread. Weights come from Hugging Face at a
// pinned revision and are kept in the browser's Cache API ("transformers-cache"),
// separate from the app's IndexedDB so removing Sheffield never touches orders.

import {TRANSFORMERS_URL, MODELS, detectPath} from './models.js'

let lib = null
let processor = null
let model = null
let loaded = null // {tier, device, precision}

const post = (type, data = {}) => self.postMessage({type, ...data})

async function load(tierId) {
  const tier = MODELS[tierId]
  if (loaded?.tier === tierId) return post('ready', loaded)
  await unload()
  lib ||= await import(TRANSFORMERS_URL)
  lib.env.allowLocalModels = false
  lib.env.useBrowserCache = true
  const precision = await detectPath()
  if (!tier.dtypes[precision]) throw new Error(`${tier.label} needs a GPU this device doesn't offer`)
  const device = precision === 'wasm' ? 'wasm' : 'webgpu'
  const progress = p => {
    if (p.status === 'progress') post('progress', {file: p.file, loaded: p.loaded, total: p.total})
    else if (p.status === 'done') post('file-done', {file: p.file})
  }
  processor = await lib.AutoProcessor.from_pretrained(tier.repo, {revision: tier.revision, progress_callback: progress})
  model = await lib.Qwen3_5ForConditionalGeneration.from_pretrained(tier.repo, {
    revision: tier.revision,
    dtype: tier.dtypes[precision],
    device,
    progress_callback: progress
  })
  loaded = {tier: tierId, device, precision}
  post('ready', loaded)
}

async function unload() {
  try {
    await model?.dispose()
  } catch {}
  model = null
  processor = null
  loaded = null
}

let busy = false

async function generate({id, conversation, image, generation, imageMax}) {
  if (!model) throw new Error('Sheffield is not loaded')
  if (busy) throw new Error('Sheffield is still thinking')
  busy = true
  try {
    let raw = null
    if (image) {
      raw = await lib.RawImage.fromBlob(image)
      const scale = Math.min(1, imageMax / Math.max(raw.width, raw.height))
      if (scale < 1) raw = await raw.resize(Math.round(raw.width * scale), Math.round(raw.height * scale))
    }
    const prompt = processor.apply_chat_template(conversation, {add_generation_prompt: true, enable_thinking: false})
    const inputs = await processor(prompt, raw)
    const promptTokens = inputs.input_ids.dims.at(-1)
    const started = performance.now()
    let first = null
    let count = 0
    const streamer = new lib.TextStreamer(processor.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: text => {
        first ??= performance.now()
        post('token', {id, text})
      },
      token_callback_function: () => count++
    })
    const out = await model.generate({...inputs, ...generation, streamer})
    const text = processor.batch_decode(out.slice(null, [promptTokens, null]), {skip_special_tokens: true})[0]
    const ended = performance.now()
    post('done', {
      id,
      text,
      stats: {
        promptTokens,
        newTokens: count,
        firstTokenMs: Math.round((first ?? ended) - started),
        tokensPerSec: count > 1 && first ? +(((count - 1) * 1000) / (ended - first)).toFixed(1) : null
      }
    })
  } finally {
    busy = false
  }
}

self.onmessage = async ({data}) => {
  try {
    if (data.type === 'load') await load(data.tier)
    else if (data.type === 'generate') await generate(data)
    else if (data.type === 'unload') {
      await unload()
      post('unloaded')
    }
  } catch (err) {
    post('error', {id: data.id, message: String(err?.message || err)})
  }
}
