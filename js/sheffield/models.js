// Downloadable model tiers. Revisions are pinned so a re-published repo can't
// change what a tablet downloads.

// transformers.js is bundled into vendor/ (npm run vendor); fetched only when
// Sheffield is hired. Its WASM files come from a version-pinned CDN path.
export const TRANSFORMERS_URL = new URL('../../vendor/transformers.js', import.meta.url).href

export const MODELS = {
  '0.8b': {
    id: '0.8b',
    label: 'Sheffield (compact)',
    repo: 'onnx-community/Qwen3.5-0.8B-ONNX',
    revision: 'c0d619322dad7c4441a8841a53fc59772ddddcc0',
    // Download sizes in MB from the pinned revision, per path:
    //   f16  = WebGPU with shader-f16 (iPad Safari 26, most Android tablets)
    //   f32  = WebGPU without shader-f16
    //   wasm = no WebGPU. The CPU backend lacks GatherBlockQuantized, which every
    //          quantized embedding/vision file uses, so those two run full precision.
    sizeMB: {f16: 789, f32: 717, wasm: 1905},
    dtypes: {
      f16: {embed_tokens: 'q4f16', vision_encoder: 'fp16', decoder_model_merged: 'q4f16'},
      f32: {embed_tokens: 'q4', vision_encoder: 'q4', decoder_model_merged: 'q4'},
      wasm: {embed_tokens: 'fp32', vision_encoder: 'fp32', decoder_model_merged: 'q4'},
      cpu: {embed_tokens: 'q4', vision_encoder: 'q4', decoder_model_merged: 'q4'}
    },
    imageMax: 768,
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen3.5-0.8B/blob/main/LICENSE'
  },
  '2b': {
    id: '2b',
    label: 'Sheffield (sharp-eyed)',
    repo: 'onnx-community/Qwen3.5-2B-ONNX',
    revision: 'b1fc7ca3afafcb8e4b13d29715a6b9ea5af1d1cb',
    // Not offered without WebGPU: full-precision embedding + vision would be ~4.6 GB.
    sizeMB: {f16: 2052, f32: 1753, wasm: null},
    dtypes: {
      f16: {embed_tokens: 'q4f16', vision_encoder: 'fp16', decoder_model_merged: 'q4f16'},
      f32: {embed_tokens: 'q4', vision_encoder: 'q4', decoder_model_merged: 'q4'},
      cpu: {embed_tokens: 'q4', vision_encoder: 'q4', decoder_model_merged: 'q4'}
    },
    imageMax: 1024,
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen3.5-2B/blob/main/LICENSE'
  }
}

// Which file set this device should use.
export async function detectPath(gpu = globalThis.navigator?.gpu) {
  if (!gpu) return 'wasm'
  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) return 'wasm'
    return adapter.features.has('shader-f16') ? 'f16' : 'f32'
  } catch {
    return 'wasm'
  }
}
