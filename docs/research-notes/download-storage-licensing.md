# Download, Storage, Hosting and Licensing Logistics for an Optional On-Device Model in the Yes Chef PWA (as of Oct 2026)

Research date: 2026-10-04. Each source date is given where the source states one. Items marked "unverified" come from background knowledge and were not confirmed in a primary source during this pass.

## Storage quotas, eviction, persist(), and the risk to existing IndexedDB data

### Takeaway
Since Safari 17 (2023), WebKit gives a Safari or home-screen web-app origin up to about 60% of disk, and Chrome gives about 60% too. A multi-GB model therefore fits on most tablets. The main risk is that eviction is per origin and all-or-nothing: if the browser evicts the origin under storage pressure, it deletes the model and the orders/menu IndexedDB together. The fix is to call `navigator.storage.persist()` (heuristically granted, more likely for a home-screen app) and to keep a user-facing export/backup of orders and menus regardless.

### Cited Findings
- WebKit (Safari 17.0+), dated Aug 10, 2023: in browser apps "the origin quota is up to 60% of the total disk space"; in non-browser apps (embedded WebView) it is 15%. The overall quota is 80% (browser) or 20% (non-browser). Cross-origin frames get 10% of the main frame's origin quota. Home-screen web apps get the same quotas as browser apps. — [WebKit blog: Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- WebKit: "WebKit normally evicts data on an origin basis: the data of an origin will be deleted as a whole," in least-recently-used order. Eviction happens when the overall quota is exceeded, under storage pressure, or after user inactivity. Origins with active pages or persistent mode are excluded. — [WebKit blog](https://webkit.org/blog/14403/updates-to-storage-policy/)
- WebKit: `persist()` "currently grants a request based on heuristics like whether the website is opened as a Home Screen Web App"; `estimate()` is supported. "The Storage API is fully supported" as of Safari 17.0. — [WebKit blog](https://webkit.org/blog/14403/updates-to-storage-policy/)
- MDN: "When an origin's data is evicted by the browser, all of its data, not parts of it, is deleted at the same time. If the origin had stored data by using IndexedDB and the Cache API for example, then both types of data are deleted." — [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- MDN: Chromium-based browsers let an origin store "up to 60% of the total disk size in both persistent and best-effort modes." Safari and Chromium "automatically approve or deny the request based on the user's history of interaction with the site and do not show any prompts." — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- MDN lists Safari-only proactive eviction: "If an origin has no user interaction, such as click or tap, in the last seven days of browser use, its data created from script will be deleted." — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- WebKit (Mar 24, 2020), on the 7-day cap: "Web applications added to the home screen are not part of Safari and thus have their own counter of days of use." The author does not expect deletion of first-party data in home-screen apps, because the counter only advances when the app is used. — [WebKit blog: Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- The 2023 WebKit storage-policy post does not mention the 7-day rule at all. It neither revokes it nor restates it. — [WebKit blog 14403](https://webkit.org/blog/14403/updates-to-storage-policy/)
- Chrome's Storage Buckets API (Chromium 122): "the browser may choose to delete each bucket independently of other buckets." A bucket can be `persisted` ("Storage will not be cleared except by explicit user action") with `durability: 'strict'`. Per the doc, "the current implementation is only the IndexedDB API." — [Chrome Developers: Storage Buckets](https://developer.chrome.com/docs/web-platform/storage-buckets)

### Inferences
- For an installed iPad PWA, the 7-day rule is effectively a non-issue while the app is used at least weekly, because the counter is per app-use day. A kitchen tablet that sits unopened for more than 7 days of use is still a theoretical risk.
- Real risk scenario: if the device runs low on space (common on 64 GB iPads), WebKit or Chrome evicts LRU origins whole. Adding 2–4 GB makes Yes Chef a larger, more attractive eviction target, and the orders/menu IndexedDB would go with it. Mitigations:
  1. Call `navigator.storage.persist()` before the download. Gate the download on a `true` result, or show a strong warning.
  2. Keep an export/backup feature for orders and menus.
  3. Check `navigator.storage.persisted()` on every launch.
- Storage Buckets could isolate the model's eviction from the core data on Chrome, but only for IndexedDB so far (status of Cache/OPFS in buckets is unverified). Safari does not support it (unverified). It is not a cross-platform answer.
- Recommended budget: refuse to download unless `estimate()` shows quota − usage ≥ model size × 1.2, plus a margin for device free space. `estimate()` reports quota, not true free disk space, so treat it as approximate.

### Gaps
- No primary source found from 2024–2026 that restates whether WebKit's 7-day rule still exists in Safari 26, or exactly how it treats home-screen apps today. The 2020 statement is the latest found.
- No WebKit documentation of the exact `persist()` heuristics beyond "Home Screen Web App." Whether a Safari-tab (not installed) user ever gets `true` is unverified.
- Could not confirm whether an evicted origin's OPFS is also cleared together with IDB/Cache. MDN's "all of its data" implies yes.

## Best storage for weights, and what each runtime uses

### Takeaway
Chrome's storage team recommends the Cache API for large models, with OPFS as the alternative and IndexedDB as the worst choice. All four candidate runtimes default to the Cache API or OPFS, and most can be redirected to a custom URL/host. Weights should stay out of the app's IndexedDB database. Use a separate named cache or OPFS directory so that "Remove model" can delete exactly that.

### Cited Findings
- Chrome (updated 2024-06-12): "the Chrome storage team recommends the Cache API for optimal performance, to ensure quick access to AI models." OPFS and IndexedDB "need to serialize the data," and IndexedDB is "the worst place to store large models." It recommends chunked parallel downloads (`fetch-in-chunks`, default 6 parallel), `Cache-Control: public, max-age=31536000, immutable` with versioned URLs, and `persist()`. — [Chrome Developers: Cache AI models in the browser](https://developer.chrome.com/docs/ai/cache-models)
- WebLLM: "by default, WebLLM caches model artifacts using the Cache API"; `appConfig.cacheBackend = "indexeddb"` switches the backend; there is an experimental `"cross-origin"` backend that needs a browser extension. — [WebLLM docs: Advanced usage](https://webllm.mlc.ai/docs/user/advanced_usage.html)
- transformers.js `env`: `useBrowserCache` (Cache API, default true), `cacheKey` (default `transformers-cache`), `useCustomCache` and `customCache` (any object implementing `match`/`put`), `remoteHost` and `remotePathTemplate` (custom hosting), `allowRemoteModels`/`localModelPath`, a custom `fetch`, and `experimental_useCrossOriginStorage`. — [transformers.js env docs](https://huggingface.co/docs/transformers.js/api/env)
- wllama: "Max file size is 2GB, due to size restriction of ArrayBuffer." Split models with `llama-gguf-split` (recommended ≤512 MB per chunk) and pass the first shard URL; shards download in parallel (default 3). — [wllama README](https://raw.githubusercontent.com/ngxson/wllama/master/README.md)
- MediaPipe LLM Inference (web): `modelAssetBuffer` accepts a `Uint8Array` or `ReadableStreamDefaultReader`, so the app can stream from its own storage. Google's write-up describes using the Cache API for models under 2 GB and OPFS with ReadableStream for models over 2 GB. — [Google Research blog: 7B+ models in browser with MediaPipe](https://research.google/blog/unlocking-7b-language-models-in-your-browser-a-deep-dive-with-google-ai-edges-mediapipe/); [genai.d.ts on unpkg](https://app.unpkg.com/@mediapipe/tasks-genai@0.10.29/files/genai.d.ts)
- MediaPipe issue: a 2.5 GB model hit "newBufferWith must not exceed 256 MB," a WebGPU buffer limit. — [MediaPipe issue #5384 (mirror)](https://git.tdem.in/google-ai-edge/mediapipe/issues/5384)

### Inferences
- Per-runtime recommendations:
  - **WebLLM:** default Cache API is fine. Avoid the `indexeddb` backend, so the model does not share an IDB environment with orders data. WebLLM weights are already sharded (`params_shard_*.bin`, typically ~30–100 MB each; shard size unverified), which suits Cloudflare's 25 MiB limit poorly but works with R2/HF.
  - **transformers.js:** set `cacheKey` to a dedicated name, e.g. `yeschef-model-v1`, so removal is `caches.delete(...)`.
  - **wllama:** uses its own cache manager. Background knowledge (unverified this pass) says it stores in OPFS and has a cache-manager API for listing and clearing.
  - **MediaPipe:** the app owns storage, so the app can write to OPFS and pass a stream.
- WebLLM also exposes helpers such as `hasModelInCache` and `deleteModelAllInfoInCache` (from background knowledge; not verified this pass).
- On iOS, ONNX/onnxruntime-web single-file models over 2 GB hit ArrayBuffer/wasm32 memory limits. Prefer formats with external-data sharding.

### Gaps
- Could not verify wllama's cache backend in current docs; the README fetch did not surface it.
- No measured Safari benchmarks comparing Cache API and OPFS read performance for multi-GB weights.

## Download UX: chunking, resume, background, Wi-Fi checks, free space

### Takeaway
Background Fetch works only on Chrome Android, not on iOS Safari. Network Information is likewise Android-Chrome-only. iPad PWAs freeze within seconds of being backgrounded. The portable design is foreground, sharded, resumable downloading:
- Store each shard as a separate Cache entry.
- On resume, skip shards already present and validate them by size or hash.
- Keep the screen awake with the Screen Wake Lock API.
- Tell the user to keep the app open and plugged in.

On Android, Background Fetch can be added as an enhancement.

### Cited Findings
- Background Fetch is experimental and not Baseline. It lets downloads continue after a tab closes, pauses offline and resumes, shows browser UI, and requires a service worker. — [MDN: Background Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Fetch_API)
- caniuse: `BackgroundFetchManager` is supported in Chrome for Android (current, v154). Safari on iOS is not supported through 27.2, and Firefox Android does not support it. — [caniuse: BackgroundFetchManager](https://caniuse.com/mdn-api_backgroundfetchmanager)
- WebKit bug 211018 tracks Background Fetch. Search snippets describe it as "implemented but not functional" in Safari. — [WebKit Bugzilla 211018](https://bugs.webkit.org/show_bug.cgi?id=211018) (snippet only; status not fully read)
- Network Information API: Chrome for Android 154+ and Samsung Internet are supported; Safari iOS and Firefox are not. — [caniuse: netinfo](https://caniuse.com/netinfo)
- iOS home-screen PWAs: JS execution freezes when the app is backgrounded, roughly 3 seconds before suspension. — [Frontend Masters: Observing mobile background JavaScript](https://frontendmasters.com/courses/background-javascript/observing-mobile-background-javascript) (secondary source)
- Chrome recommends parallel chunked downloads with progress, e.g. the `fetch-in-chunks` package. — [Chrome Developers](https://developer.chrome.com/docs/ai/cache-models)
- wllama supports split GGUF loading with parallel downloads. — [wllama README](https://raw.githubusercontent.com/ngxson/wllama/master/README.md)

### Inferences
- **Resume design:**
  - Use a manifest JSON listing shards with size and sha256.
  - Download each shard with `fetch`. For very large shards, use HTTP Range requests (R2 and HF support Range; unverified per-host this pass) and write into OPFS via `createWritable({keepExistingData:true})` at an offset.
  - Write a "complete" marker only after every shard verifies. Without the marker, the model counts as not installed.
- **Pre-flight checks:**
  - `navigator.storage.estimate()` for headroom.
  - On Android, `navigator.connection.type === 'wifi'` or `saveData`.
  - On iPad, no programmatic Wi-Fi check exists, so ask the user to confirm Wi-Fi.
  - Optionally `navigator.getBattery()` on Chrome (Safari does not support it; unverified this pass).
- **iPad backgrounding:** in-flight fetches will likely fail or stall when the app is backgrounded. On `visibilitychange` back to visible, re-verify and resume missing shards. Keep each shard small (≤ ~100 MB) so lost progress is bounded.

### Gaps
- No primary Apple/WebKit doc on exactly what happens to in-flight `fetch()` in a backgrounded home-screen app on iPadOS 26.
- Did not verify Screen Wake Lock or Battery Status support on iPadOS 26.

## Hosting the weights

### Takeaway
GitHub Pages (1 GB site, 100 GB/month soft bandwidth, 100 MB per-file git limit) and Cloudflare Pages (25 MiB per file, 20k files) are unsuitable for multi-GB weights. The two realistic options:
- **Hugging Face Hub direct.** Free, CORS-enabled, and what the runtimes expect by default. Anonymous rate limits are 3,000 resolver requests per 5 minutes per IP.
- **Cloudflare R2 behind a custom domain.** Zero egress fees and $0.015/GB-month, with 10 GB free.

### Cited Findings
- GitHub Pages: "Published GitHub Pages sites may be no larger than 1 GB"; a soft bandwidth limit of 100 GB per month; it may return 429 under rate limiting. It is not for SaaS or commercial transactions. — [GitHub Docs: Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- Cloudflare Pages: max single asset is 25 MiB; 20,000 files (Free) or 100,000 (paid); a `_headers` file allows 100 rules. — [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- R2 pricing:
  - Standard storage is $0.015/GB-month, with a free tier of 10 GB-month.
  - Class A operations: 1 M/month free, then $4.50/M. Class B: 10 M/month free, then $0.36/M.
  - "Egressing directly from R2 ... does not incur data transfer (egress) charges."
  - — [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- R2: "Public access through `r2.dev` subdomains is rate-limited and should only be used for development purposes." A custom domain is required for caching and WAF. — [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- HF Hub rate limits, as of Sept '25, per 5-minute window: anonymous per IP gets 3,000 resolver requests; free user 5,000; PRO 12,000. Exceeding the limit returns 429 with `RateLimit` headers. — [HF docs: Rate limits](https://huggingface.co/docs/hub/en/rate-limits)

### Inferences
- **Hugging Face direct:** zero cost and zero ops. A 3 GB model in ~50 shards uses well under the anonymous limit. Risks:
  - HF changes terms or limits.
  - Repos can be gated, which requires a token, and Gemma 3/Llama repos on HF are gated. Choose ungated repos (e.g. many `onnx-community`, `mlc-ai` and Apache/MIT repos) or mirror.
  - Restaurant IP sharing is not an issue at this scale.
- **R2 + custom domain:** gives control, versioning and stable URLs. Ten restaurants downloading 3 GB costs about $0.05/month in storage plus negligible Class B operations. Requires configuring R2 CORS for the app's origin (not verified in the fetched page). Prefer this if the model is fine-tuned or the app needs pinned versions.
- **jsDelivr:** not suitable. Background knowledge says a ~20 MB per-file and ~150 MB per-package limit (unverified; the docs page fetched did not show it).
- Pin a specific HF commit hash in URLs (`/resolve/<sha>/`) for immutability.

### Gaps
- Could not confirm jsDelivr file limits from the primary source.
- Did not fetch HF's ToS clause on hotlinking from third-party apps. No explicit prohibition was found, and the runtimes default to it.
- Did not verify R2 CORS configuration docs.

## Licensing for redistributing or self-hosting weights

### Takeaway
Prefer Apache-2.0 or MIT models, which need only the license text and attribution in an "About / Licenses" screen:
- Qwen3 (Apache-2.0)
- SmolVLM2 (Apache-2.0)
- Phi-4-mini (MIT)
- Gemma 4 (Apache-2.0 since April 2026)

Gemma 3 and earlier remain under the Gemma Terms of Use, which carry prohibited-use pass-through and a NOTICE file. Llama 3.x requires "Built with Llama," the license copy and the AUP. LFM (Liquid) is free only under $10M annual revenue.

### Cited Findings
- Gemma 4 was released under Apache 2.0 (Google Open Source Blog, Apr 2, 2026): "The release of Gemma 4 under the Apache 2.0 license — our most capable open models ranging from edge devices to 31B parameters." — [Google Open Source Blog](https://opensource.googleblog.com/2026/03/gemma-4-expanding-the-gemmaverse-with-apache-20.html)
- Gemma Terms of Use (last modified Apr 1, 2026; applies to pre-Gemma-4 models), Section 3.1, requires:
  - including the Section 3.2 use restrictions "as an enforceable provision" in your agreement;
  - giving recipients "a copy of this Agreement";
  - a NOTICE text file: "Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms".
  - Google "reserves the right to restrict (remotely or otherwise) usage."
  - — [Gemma Terms of Use](https://ai.google.dev/gemma/terms)
- Llama 3.2 Community License requires:
  - providing a copy of the agreement;
  - "prominently display 'Built with Llama'";
  - a NOTICE line: "Llama 3.2 is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.";
  - "Llama" at the start of derivative model names;
  - AUP compliance;
  - a separate license for over 700M MAU.
  - — [Llama 3.2 LICENSE (meta-llama/llama-models)](https://raw.githubusercontent.com/meta-llama/llama-models/main/models/llama3_2/LICENSE)
- LFM Open License v1.0 limits commercial use for entities with "annual revenue of 10 million United States dollars ($10,000,000) or more." It requires giving recipients a copy of the license and retaining attribution notices, including NOTICE contents. — [LFM2.5-2.6B LICENSE](https://huggingface.co/LiquidAI/LFM2.5-2.6B/raw/main/LICENSE); [Liquid AI LFM License](https://liquid.ai/lfm-license)
- Qwen3-1.7B is `apache-2.0`. — [HF API](https://huggingface.co/api/models/Qwen/Qwen3-1.7B)
- SmolVLM2-2.2B-Instruct is `apache-2.0`. — [HF API](https://huggingface.co/api/models/HuggingFaceTB/SmolVLM2-2.2B-Instruct)
- Phi-4-mini-instruct is `mit`. — [HF API](https://huggingface.co/api/models/microsoft/Phi-4-mini-instruct)

### Inferences
- Even when hotlinking from HF, the app "distributes" the model to the device in a practical sense. Show a licenses screen with the model name, license name and link/full text, plus any NOTICE. For Llama, add "Built with Llama" in the model download UI and on the about page. For Gemma ≤3, add the Gemma ToU link and the prohibited-use policy in the app's terms.
- Quantized or converted builds (MLC, ONNX, GGUF) are derivatives and inherit the base model's license. Check each converted repo's license field as well.
- Yes Chef is far below the 700M MAU and $10M thresholds. The main friction is notice and UI obligations, and for Llama vision models, an EU multimodal restriction in the Llama 3.2 AUP (background knowledge; not verified this pass).

### Gaps
- Did not verify the Llama 3.2 AUP EU clause text or the newer Llama 4 license terms.
- Did not verify whether Gemma 4's HF repos carry any additional use policy beyond Apache-2.0. The blog does not mention one.

## Privacy and security: CSP, COOP/COEP, cross-origin isolation on GitHub Pages

### Takeaway
GitHub Pages cannot set custom response headers. Multithreaded wasm (wllama multi-thread, onnxruntime-web threads) needs COOP/COEP, which on GitHub Pages means the coi-serviceworker hack (first-load reload, conflicts with an existing SW). Cloudflare Pages supports a `_headers` file, so set COOP/COEP natively there. WebGPU-based runtimes (WebLLM, transformers.js WebGPU, MediaPipe) do not require cross-origin isolation (unverified per runtime). Safari 26 ships WebGPU on iPadOS.

### Cited Findings
- wllama: "To enable multi-thread, you must add Cross-Origin-Embedder-Policy and Cross-Origin-Opener-Policy headers." — [wllama README](https://raw.githubusercontent.com/ngxson/wllama/master/README.md)
- coi-serviceworker "will reload the page on the user's first load to magically add the required COOP and COEP headers in a service worker." It has a `coepCredentialless` option, must be served from the same origin, and cannot coexist with an existing service worker without customization. Its intended use case is GitHub Pages. — [coi-serviceworker GitHub](https://github.com/gzuidhof/coi-serviceworker)
- Cloudflare Pages `_headers` allows up to 100 rules. — [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- Safari 26 ships WebGPU by default on iOS/iPadOS 26. — [AppDeveloperMagazine: WebGPU in iOS 26](https://appdevelopermagazine.com/WebGPU-in-iOS-26/) (secondary; WebKit's Safari 26 release notes would be the primary source)

### Inferences
- With COEP `require-corp`, cross-origin weight fetches (HF, R2) must carry CORP/CORS headers; HF does send CORS (unverified for CORP). `credentialless` COEP eases this, but Safari support is uncertain.
- Because Yes Chef already has a service worker (offline PWA), merge the coi logic into the app's own SW rather than adding coi-serviceworker as a second one. The bigger win is moving to Cloudflare Pages and setting the headers there.
- CSP: add HF or the R2 domain to `connect-src`. WASM needs `'wasm-unsafe-eval'` in `script-src`, and workers need `worker-src 'self' blob:` (common runtime requirements; verify per runtime).
- Privacy: inference is local, and the only network call is the weight download. Disclose that the download comes from Hugging Face or Cloudflare, which see the IP address.

### Gaps
- Did not confirm Safari 26 support for COEP `credentialless` or SharedArrayBuffer under coi-serviceworker on iPadOS.
- Did not verify each runtime's exact CSP needs.

## Battery, thermal, memory and UX guidance

### Takeaway
No primary-source platform guidance was found specifically for on-device LLMs in PWAs. Practical design: opt-in download behind an explicit size/Wi-Fi/plugged-in prompt, cancel and remove controls, a lazy-loaded engine, unloading the model when idle or backgrounded, and a fallback when WebGPU or device memory are insufficient.

### Cited Findings
- WebGPU buffer limits can block large models; one report was a 256 MB max buffer on a 2.5 GB model. — [MediaPipe issue #5384 (mirror)](https://git.tdem.in/google-ai-edge/mediapipe/issues/5384)
- Chrome recommends progress UI and chunked downloads for model caching. — [Chrome Developers](https://developer.chrome.com/docs/ai/cache-models)
- iOS PWAs freeze shortly after backgrounding. — [Frontend Masters](https://frontendmasters.com/courses/background-javascript/observing-mobile-background-javascript)

### Inferences
- Gate model choice on `navigator.gpu.requestAdapter()` limits (`maxBufferSize`, `maxStorageBufferBindingSize`) and on `navigator.deviceMemory` (Chrome only). iPads with 4–6 GB RAM may have tabs killed by jetsam when loading 2–4 GB weights. Offer a small tier (0.5–1.5 GB) as the default and a larger tier only on 8 GB+ devices.
- Run generation only on user request. Release the engine (WebLLM `engine.unload()`) after idle time and on `visibilitychange` to hidden. Show "best when plugged in" guidance; Battery API is unavailable on Safari (unverified).
- Make "Remove model" delete only the model cache or OPFS directory, never call `indexedDB.deleteDatabase` on app data, and re-run `estimate()` afterwards to confirm.

### Gaps
- No Apple primary source on memory limits for WebGPU/wasm in home-screen apps on iPadOS 26. No thermal-throttling data for browser LLM inference on iPad was found.
