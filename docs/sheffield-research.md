# Hire Sheffield, an opt-in on-device menu butler

**Yes. As of October 2026 an optional, fully on-device menu-creator agent (named **Sheffield**, a small butler persona) is feasible for Yes Chef, with one condition: the model has to be sized for iPad Safari's memory budget rather than for its disk quota.** Every piece now exists. Safari 26 and Android Chrome both ship WebGPU. transformers.js v4.3 officially enables WebGPU on Safari 26+ and adds tool calling and structured output. And Qwen3.5, an Apache-2.0 vision-language family released in March 2026, has ready-made browser builds at 0.65 GB (0.8B) and 1.6 GB (2B), with the best published OCR scores at that size. The recommended stack is three layers:

1. **A deterministic baseline that ships to everyone**, no model needed: CSV/text column mapping, pdf.js text extraction, and PaddleOCR plus a rule-based line parser.
2. **An opt-in Qwen3.5 download**: 0.8B by default on iPads and 2B on devices that pass a memory probe. It runs through transformers.js in a Worker and is hosted on Hugging Face at a pinned commit, or later mirrored on Cloudflare R2.
3. **Sheffield's agent loop, where code does most of the work.** The model emits small patch operations and a required `questions` array. Code assigns ids and colors, validates the result and triggers clarifying questions.

The biggest unknowns are untested on real hardware: how much memory an iPad's Safari tab or home-screen PWA can actually use (one 2026 study measured under 500 MB on iPhones), and how well a 1–2B model reads chalkboard or handwritten menus. So the first phase is a device spike, not a feature build. There is also a data-safety risk that is easy to miss. Browsers evict an origin's storage all at once, so a 2 GB model makes Yes Chef's orders and menus a bigger eviction target unless the app requests persistent storage and offers backups.

## Both tablet browsers now run WebGPU, but iPad memory is the binding limit

The platform barrier that blocked this idea in 2024 is gone. **Safari 26 enables WebGPU by default on iOS and iPadOS 26** ([AppDeveloperMagazine](https://appdevelopermagazine.com/WebGPU-in-iOS-26/)). Chrome has shipped it on Android 12+ devices with Qualcomm and ARM GPUs since Chrome 121 ([Chrome for Developers](https://developer.chrome.com/blog/new-in-webgpu-121)). transformers.js v4.3.0 (16 September 2026) explicitly lists "WebGPU enabled for Safari 26+". The same release added structured output, and v4.2 added tool calling ([transformers.js releases](https://github.com/huggingface/transformers.js/releases)).

The constraint now is memory. WebGPU only guarantees 256 MB per buffer, and anything above that has to be requested and depends on the device ([webgpufundamentals](https://webgpufundamentals.org/webgpu/lessons/webgpu-limits-and-features.html)). Secondary reports put Safari's per-buffer ceiling at about 256 MB on iPhones and about 993 MB on iPad Pro ([tianpan.co](https://tianpan.co/blog/2026/04/17/browser-native-llm-inference-webgpu)). Runtimes already shard weights to work around per-buffer caps, so the cap that matters is the whole process budget. That budget is not documented anywhere. The LlamaWeb paper (May 2026) found **"Safari tab memory is limited to <500 MB"** on the iPhone 15 and iPhone 17 Pro Max it tested, and only the four smallest models ran ([arXiv 2605.20706](https://arxiv.org/html/2605.20706)). It tested no iPad. The same paper classed the Galaxy S24 as a mid-tier GPU alongside Apple's M2, which suggests flagship Android tablets have real headroom.

Stability is the other concern. A blocker-level WebKit bug leaked GPU-process memory until iPadOS killed it. It affected the iPad A16, and it was fixed upstream only in December 2025 ([WebKit 303203](https://bugs.webkit.org/show_bug.cgi?id=303203)). GPU buffers are not garbage-collected and have to be destroyed explicitly, otherwise leaked weights eventually crash the tab ([SitePoint](https://www.sitepoint.com/profiling-webgpu-memory-local-ai/)). Mali and PowerVR GPUs crashed at a KV-cache depth of 2048 ([arXiv 2605.20706](https://www.alphaxiv.org/abs/2605.20706.md)).

These facts point to an architecture rather than ruling the idea out:

- Run inference in a dedicated Worker.
- Handle `GPUDevice.lost`.
- Destroy the device when the chat closes.
- Cap context near 2K tokens on mobile.
- Save chat and draft-menu state to IndexedDB after every turn, so a killed tab resumes cleanly.

No source gives in-browser tokens per second, time to first token or image-encode latency for any iPad or Android tablet. Treat every speed expectation in this report as an extrapolation until Phase 0 measures it.

The routes that look convenient are closed. **Chrome's Prompt API (Gemini Nano) has image input and JSON-schema output, but "Chrome for Android, iOS… are not yet supported"** and it needs 22 GB of free storage ([Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)). Apple's Foundation Models framework is Swift-only. WebNN is still an origin trial in Chrome and absent from Safari ([Phoronix](https://www.phoronix.com/news/Chrome-146-Beta)). That leaves a model Yes Chef downloads and runs itself.

## Qwen3.5 small models lead on OCR quality per gigabyte

Three model families released in 2025–2026 have browser-ready vision builds and permissive or near-permissive licenses. Sizes below come from the Hugging Face repo file listings.

| Model | Download (web build) | Vision | Languages | License | Role for Yes Chef |
|---|---|---|---|---|---|
| Qwen3.5-0.8B | 0.65 GB q4f16 ONNX | Native | 201 | Apache-2.0 | **Default "lite" tier, iPad-safe candidate** |
| Qwen3.5-2B | 1.58 GB q4f16 ONNX | Native | 201 | Apache-2.0 | **Primary tier on capable devices** |
| Qwen3-VL-2B | 1.37 GB q4f16 ONNX | Yes, OCR in 32 languages | — | Apache-2.0 | Alternate if Qwen3.5 ops misbehave on Safari |
| LFM2.5-VL-1.6B | 1.49 GB q4 ONNX | 512px tiles, multi-image | 8 | LFM Open (<$10M revenue) | Benchmark challenger |
| LFM2.5-VL-1.6B-Extract | ~1.3 GB GGUF only | Image→JSON, single turn | 8 | LFM Open | Possible extraction step via wllama |
| Gemma 4 E2B | 3.38 GB q4f16 (2.57 GB qat-mobile) | Image + audio | 35+ | Apache-2.0 | High-end Android and M-series iPads only |
| Gemma 4 E4B / Qwen3.5-4B | 5.18 GB / 3.00 GB | Yes | — | Apache-2.0 | Too heavy for tablets |

Sources: [Qwen3.5-2B-ONNX](https://huggingface.co/onnx-community/Qwen3.5-2B-ONNX), [Qwen3.5-0.8B-ONNX](https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX), [Qwen3-VL-2B-ONNX](https://huggingface.co/onnx-community/Qwen3-VL-2B-Instruct-ONNX), [LFM2.5-VL-1.6B-ONNX](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-ONNX), [LFM2.5-VL-1.6B-Extract-GGUF](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-Extract-GGUF), [gemma-4-E2B-it-ONNX](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX), [gemma-4-E4B-it-ONNX](https://huggingface.co/onnx-community/gemma-4-E4B-it-ONNX).

The choice of Qwen3.5 rests on benchmarks and licensing. **Qwen3.5-2B reports OCRBench 84.5–85.4 and OmniDocBench about 80**, and the 0.8B still reaches OCRBench 74.5–79.1. Both have a 262K native context, support tool use, and run in non-thinking mode by default ([Qwen/Qwen3.5-2B](https://huggingface.co/Qwen/Qwen3.5-2B)). Those OCR numbers matter more than general reasoning when the input is a photo of a menu board.

LFM2.5-VL-1.6B is weaker on text reading: it scores 41.4 on OCRBench v2, a harder scale that is not directly comparable ([LiquidAI](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B)). Its Extract variant reports **99.6% JSON validity**, but Liquid says it is meant for single-turn use and is "not expected to transfer to … multi-image reasoning or free-form VQA" ([LFM2.5-VL-1.6B-Extract](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-Extract)). That rules it out as the conversational agent. Gemma 4 E2B is a good Apache-2.0 model, but most of its 3.38 GB download is a 1.59 GB per-layer embedding table. Google's own LiteRT-LM web path is a text-only "early preview" ([LiteRT-LM Web](https://developers.google.com/edge/litert-lm/js)). Both make it a poor first choice for iPads.

The runtime choice follows from the model choice. **transformers.js v4 is the only runtime with browser builds for all of these VLMs.** ONNX Runtime added the WebGPU kernels for Qwen3.5's hybrid-attention layers, and a webml-community demo runs Qwen3.5 0.8B/2B/4B multimodally in the browser ([RuntimeWire](https://runtimewire.com/article/alibaba-qwen3-5-small-browser-demo-local-ai)). The alternatives are weaker for this job:

- **WebLLM** has the strongest grammar-constrained JSON mode, through XGrammar ([MLC blog](https://blog.mlc.ai/2024/11/22/achieving-efficient-flexible-portable-structured-generation-with-xgrammar)). But its prebuilt list treats Qwen3.5 as text-only, and its only vision model is the 2024-era Phi-3.5-vision at about 4 GB ([web-llm config.ts](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)).
- **wllama** runs multimodal GGUF models with tool calling. However, it caps each file at 2 GB, and on Safari it falls back to a WebGPU compat mode whose README warns "performance will be significantly degraded" ([wllama](https://app.unpkg.com/@wllama/wllama@3.6.1/files/README.md)).

The honest caveat: **no source confirms that the Qwen3.5 ONNX builds run stably on iPad Safari 26 or inside an installed home-screen PWA.** Phase 0 exists to settle that.

## A pipeline with code-driven clarification beats an end-to-end chatbot

The research supports a hybrid design over a pure "VLM reads the photo and emits the menu" approach. The practitioner evidence comes from invoices and receipts, not menus, but it all points the same way. An OCR-then-structure pipeline reportedly reached **99.1% accuracy against 95.2% for Gemini 2.5 Flash end-to-end** on real invoices ([LinkedIn](https://cy.linkedin.com/in/christoph-schillmeier)). Small local models running receipt extraction produced malformed JSON, broken arrays and hallucinated fields, and **deterministic validation was "the single most important improvement"** ([iunera](https://www.iunera.com/kraken/enterprise-ai/processing-100-receipts-locally-with-ocr-and-llms-on-cpu/)). Qwen3.5-2B's OCR scores make the VLM path more credible than the older SmolVLM and Florence-2 models those studies covered. The right reading is to use both: OCR output with line boxes as the structural backbone, and the VLM for low-confidence regions such as chalkboards and stylised fonts, and for the conversation itself.

For OCR, **PaddleOCR PP-OCRv5 mobile now has an official browser SDK, `@paddleocr/paddleocr-js`**, with WASM and WebGPU backends and Worker mode. It returns detection boxes, which make a deterministic line and column parser possible ([PaddleOCR browser docs](https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/cross_platform/browser.html)). One community port self-reports 99.22% character accuracy on printed receipts ([Medium](https://medium.com/@awalariansyah7/deterministic-ocr-in-javascript-paddleocr-for-node-bun-deno-and-the-browser-4c5c3c3e7512)). Tesseract.js is a poor fit. Its maintainers state that it "does not modify the Tesseract recognition model to improve accuracy" and "does not support PDF files" ([tesseract.js](https://github.com/naptha/tesseract.js)).

Inputs need some handling before they reach OCR or the model:

- **iPad photos:** setting `accept="image/jpeg,image/png,…"` makes Safari transcode HEIC photos to JPEG ([WebKit 303803](https://bugs.webkit.org/show_bug.cgi?id=303803)). That matters because Chrome cannot decode HEIC ([heic-normalize](https://libraries.io/npm/heic-normalize)).
- **Large photos:** downscale to about 2,000–2,500 px on the long edge before OCR, and handle orientation explicitly.
- **PDFs:** use pdf.js text extraction for digital PDFs, and render image-only pages to a canvas and send them through the photo path.
- **CSV and plain text:** parse in code, not with the model.

The Yes Chef schema stores no prices, but prices are still the most reliable signal for telling item lines from category headers. The parser should detect them and then discard them.

Clarifying questions are the requirement the model is least likely to meet on its own. Recent work shows LLMs **recognise ambiguity when asked directly but "overwhelmingly default to direct answers"** in normal use ([arXiv 2605.25284](https://arxiv.org/abs/2605.25284)). ClarifyMT-Bench documents a consistent under-clarification bias that gets worse as conversations get longer ([arXiv 2512.21120](https://arxiv.org/html/2512.21120v1)).

Sheffield should therefore make asking structural. Every turn emits `{ops: [...], questions: [{id, text, options?}]}`, and `questions` is required even when it is empty. Code also generates questions for gaps it can detect itself:

- items with no category
- a modifier group whose `select` (single or multi) or `required` flag is unclear
- an option list that looks like a modifier group but is not attached to any item

The patch vocabulary maps directly onto the Yes Chef JSON: `addCategory{name}`, `addItem{category, name}`, `addModifierGroup{name, select, required, options[]}`, `attachGroup{item, group}`, `rename` and `delete`.

Code then does everything the model is likely to get wrong. It generates the `id` fields, assigns `color` from a palette, deduplicates names, bumps `version`, and checks that every `modifierGroups` reference exists. Invalid ops go back to the model once or twice with only the error attached, and after that Sheffield asks the user.

The schema is shallow and non-recursive, which is the easy end of JSONSchemaBench, where all frameworks exceed 86% on simple schemas ([Beancount summary of arXiv 2501.10868](https://beancount.io/bean-labs/research-logs/2026/07/08/jsonschemabench-structured-outputs-language-models)). Constraints guarantee valid syntax, not correct content, and can degrade small models. So validate-and-retry is the default even if transformers.js's new structured-output package proves to work for VLM pipelines on WebGPU. That compatibility is still unconfirmed.

## Hosting off GitHub Pages and protecting orders from eviction

GitHub Pages cannot host the weights. It caps sites at 1 GB and bandwidth at a soft 100 GB per month ([GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)), and Cloudflare Pages caps files at 25 MiB ([Cloudflare](https://developers.cloudflare.com/pages/platform/limits/)). Two hosting options fit:

- **Hugging Face Hub, ungated `onnx-community` repos, pinned to a commit hash.** This costs nothing, sends CORS headers, and is what transformers.js expects by default. Anonymous users get 3,000 resolver requests per five minutes per IP ([HF rate limits](https://huggingface.co/docs/hub/en/rate-limits)).
- **Cloudflare R2 behind a custom domain.** Egress is free and storage is $0.015/GB-month with 10 GB free ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)), so mirroring both Qwen tiers costs effectively nothing. transformers.js supports this through `env.remoteHost` and `remotePathTemplate` ([transformers.js env](https://huggingface.co/docs/transformers.js/api/env)).

Start on Hugging Face and move to R2 once the app needs pinned, self-controlled URLs or a fine-tuned model.

The licensing is straightforward. Qwen3.5 and Gemma 4 are **Apache-2.0** ([Google Open Source Blog](https://opensource.googleblog.com/2026/03/gemma-4-expanding-the-gemmaverse-with-apache-20.html)), so the only obligation is a licenses screen with attribution. LFM models are redistributable but restricted to entities with **under $10 million in annual revenue** ([LFM license](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B/blob/main/LICENSE)). That is fine for Yes Chef today but a trap if the product grows. Llama 3.2 requires "Built with Llama" branding ([Llama 3.2 license](https://raw.githubusercontent.com/meta-llama/llama-models/main/models/llama3_2/LICENSE)). Treat Qwen2.5-VL-3B as uncleared until its license is checked.

Storage capacity is not the problem. **WebKit allows an origin up to 60% of disk, and home-screen apps get the same quota as Safari** ([WebKit blog](https://webkit.org/blog/14403/updates-to-storage-policy/)). Chromium allows about 60% as well. The danger is that **eviction deletes "all of its data, not parts of it"** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). On a full 64 GB iPad, a 2 GB model makes Yes Chef a larger least-recently-used eviction target, and the orders and menu IndexedDB would be deleted along with the weights.

The mitigations:

- Call `navigator.storage.persist()` before downloading. WebKit grants it based on heuristics such as being a home-screen app.
- Check `navigator.storage.persisted()` on every launch.
- Refuse to download unless `estimate()` shows about 1.2× the model size free.
- Ship a menu and orders export.
- Keep the weights in a dedicated Cache API entry, e.g. `cacheKey: "yeschef-model-v1"`, so "Remove model" deletes only that. The Chrome storage team recommends the Cache API over OPFS and calls IndexedDB "the worst place to store large models" ([Chrome Developers](https://developer.chrome.com/docs/ai/cache-models)).

The download itself has to run in the foreground on iPad. **Background Fetch is unsupported in iOS Safari through 27.2** ([caniuse](https://caniuse.com/mdn-api_backgroundfetchmanager)), and home-screen apps freeze within seconds of being backgrounded ([Frontend Masters](https://frontendmasters.com/courses/background-javascript/observing-mobile-background-javascript)). The download should therefore be sharded and resumable: a manifest with per-shard sizes and hashes, shards of at most about 100 MB, re-verification on `visibilitychange`, and a "complete" marker written only after every shard checks out. It should also hold a screen wake lock and tell the user to stay on Wi-Fi and keep the tablet plugged in. On Android, Background Fetch can be added as an enhancement.

One hosting-header issue reaches back to the baseline. **PaddleOCR's browser SDK requires COOP/COEP headers for threaded WASM and WebGPU.** GitHub Pages cannot set headers, so the choice is between merging coi-serviceworker logic into Yes Chef's existing `sw.js` ([coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)) and moving the site to Cloudflare Pages, which sets the headers through `_headers`. The CSP also needs `connect-src` for the weight host and `'wasm-unsafe-eval'`.

## Sheffield the butler fits the design if the persona lives in code

The user asked for the menu agent to be **Sheffield**, a cute little butler. The persona fits the design as long as it stays out of the model's way.

**Voice.** Sheffield is polite and warm, but brief, because the people reading it are working a busy kitchen. A typical line is "Very good. Shall 'Fries' be a side, or an add-on to burgers?" The tone comes from a few lines of system prompt and from fixed UI copy. Long generated text is not where the personality lives.

**Small-model budget.** Persona instructions should be a sentence or two. A 1–2B model with a context of about 2K tokens has no room for an elaborate character brief, and extra stylistic instructions compete with the `{ops, questions}` JSON contract that the reliability of the whole pipeline depends on. Code can template the recurring phrasings in Sheffield's voice: confirmations ("Very good, 12 items added to Mains"), the wrappers around clarifying questions, retry notices and error messages. The model then only supplies the substance, such as the question text and its options.

**UI.** A small butler avatar sits in the chat sheet and on the opt-in card in Settings, for example "Hire Sheffield — 0.65 GB, works offline." The download, removal and offline copy all speak in the persona:

- progress: "Sheffield is on the way…"
- removal: "Sheffield has packed up and left — 0.65 GB freed"
- unsupported device: "Sheffield can't fit on this tablet, but the importer still works"

**Consistent before any download.** The model-free importer from Phase 1 also appears as Sheffield, with deterministic, templated responses ("I found 3 categories and 24 items. Shall I add them?"). Users meet the same character whether or not they download the model, and hiring Sheffield reads as an upgrade to someone they already know, not a new feature. Copy should refer to Sheffield by name and avoid gendered pronouns.

## A phased plan that de-risks iPad memory first

| Phase | Deliverable | Exit criterion |
|---|---|---|
| **0. Device spike** | Throwaway page running transformers.js v4.3 with Qwen3.5-0.8B and 2B, PaddleOCR, and a WebGPU limits probe, tested on the actual iPads (A-series and M-series, in Safari and as a home-screen PWA) and Android tablets | Measured peak memory, time to first token, tokens/s, image-encode time, crash rate over 10 consecutive menus; go/no-go per tier per device class |
| **1. Model-free importer** | CSV/text column mapper, pdf.js text extraction, PaddleOCR + line/price/header parser, editable review UI, menu export/backup, COOP/COEP solution | Imports a 30–50 menu in-house eval set into valid Yes Chef JSON with manual review; ships to all users |
| **2. Opt-in model download ("Hire Sheffield")** | Settings toggle, capability gate (`requestAdapter` limits, `deviceMemory` on Chrome, Phase 0 results), `persist()` + `estimate()` checks, sharded resumable download from pinned HF commit, licenses screen, "Remove model" | Interrupted download resumes on iPad; removal leaves orders and menus intact |
| **3. Sheffield agent loop** | Chat UI with photo/PDF/CSV attachments; Worker-hosted Qwen3.5 emitting `{ops, questions}`; code-side ids, colors, validation, retry, deterministic ambiguity questions; per-turn state saved to IndexedDB | On the eval set, accuracy beats the Phase 1 parser with fewer manual edits, and at least one useful question is asked per ambiguous menu |
| **4. Harden and extend** | Mirror weights to R2, VLM crops for low-confidence OCR regions, optional Gemma 4 E2B or Qwen3.5-2B "quality" tier for high-RAM devices, device-lost recovery, idle unload | Stable across iPadOS point releases and a month of real use |

Phase 0 is the decision point. If iPad Safari holds Qwen3.5-2B, Sheffield is a single model and the design stays simple. If only the 0.8B fits, iPads get a capable but weaker Sheffield that leans harder on the Phase 1 parser, and Android flagships get the 2B. If neither runs reliably in an iPad home-screen PWA, the model-backed Sheffield becomes Android-only and iPads keep the deterministic importer (still fronted by Sheffield), which is still a real feature because Phase 1 ships before any model does. The 30–50 menu eval set is not optional. **No published benchmark covers menus, chalkboards or handwriting for any of these small models**, and the OCR advantage of Qwen3.5-2B over the 0.8B on generic benchmarks may not hold on a laminated café board photographed under kitchen lights.

## Conclusion

The question has changed from whether a tablet browser can run a vision model to how much model a specific iPad will tolerate. That puts the engineering effort into memory probing, crash recovery and storage safety rather than into model selection. The most valuable part of Sheffield is also not the model. The patch vocabulary, the code-owned ids and validation, and the app-driven clarifying questions do most of the work, and they are what let a sub-2 GB model produce trustworthy menu JSON. Because those parts are model-agnostic, Yes Chef can swap Qwen3.5 for whatever 2027 brings without touching Sheffield's contract or persona.

The decision also carries a second-order benefit. Building the opt-in model path forces the app to add persistent-storage requests, export and backup, and resumable state. Those protect restaurant orders whether or not anyone ever downloads the model, so they belong in the plan even if Phase 0 says no.
