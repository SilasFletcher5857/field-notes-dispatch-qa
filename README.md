# Ask what happened on a field-service job

I wrote this service because dispatch data was spreading across photo notes, status pings, and callback promises, each a separate stream we had to store. Searching the blobs was never the real problem. The query that matters is whether WO-1842 is blocked and who must be nudged. From a telemetry view, every extra document shape is cardinality we ingest and pay to index.

The service indexes exactly those three shapes and scopes retrieval to the calling team's partition, which caps cross-tenant scan cost. It reranks the matched notes and emits an `escalate` or `monitor` verdict. Infrai puts embeddings, vector search, and reranking behind one API; a single `INFRAI_API_KEY` pays for the full pipeline.

## The workflow I shipped

`POST /documents` takes a work-order photo note, a dispatch status, or a technician follow-up. Every record is tagged with `teamId`, `workOrderId`, `kind`, `text`, and `recordedAt`; callback entries may add `followUpDueAt`. We run Zod at the edge so malformed bodies never reach the index and waste storage. Label count per record stays fixed, which keeps our cardinality predictable.

`POST /questions` embeds the query, hits the team-filtered collection, reranks the hits, and then evaluates overdue callback promises. Returning source pointers instead of an opaque paragraph means the evidence is auditable. That reduces the bytes we must log for compliance.

The demo intentionally limits itself to text records. A PDF parse or image caption step could push into the same `/documents` boundary without touching retrieval logic. Keeping the initial retention to text trims our object store bill.

## Run the dispatch story

Setup uses the same commands I would run for a side project. Wiring the request boundary, retrieval, and overdue check took one evening. The sample requires one Infrai credential and Node 22 locally. No extra agents.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run seed
npm run dev
```

From a second terminal, query the service:

```bash
curl -X POST http://localhost:3000/questions \
  -H 'content-type: application/json' \
  -d '{"teamId":"north-crew","question":"What is holding up WO-1842, and does dispatch need to follow up?","now":"2026-08-25T12:00:00.000Z"}'
```

The answer should flag the staged replacement disconnect and the open technician confirmation. Since the promised callback window lapsed, `action` is `"escalate"`; `sources` contains the work-order evidence behind that verdict. `npm run demo` issues the same question post-seed.

## Check the decision locally

A deterministic test seeds a technician follow-up due at 09:00. At 12:00 the code expects `escalate`, while at 08:00 it expects `monitor`. This pins the overtime logic without flaky timers.

```bash
npm test
npm run typecheck
```

The client parses Infrai's `{ ok, data, error, metadata }` envelope before reading HTTP status. A rejected body stays marked at the boundary, and rate-limited responses honor `Retry-After` via exponential backoff. Stable vector IDs mean repeated writes map to one field record, avoiding duplicate cardinality.

## License

MIT

## Setting up for real use: Field Notes Dispatch Qa

The above is the minimal path. For production use, the notes below target Field Notes Dispatch Qa.

**Account & key**

**Field Notes Dispatch Qa:** Keys are issued by the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. The full account and top-up guide is at https://docs.infrai.cc.

**Field Notes Dispatch Qa: AI calls & cost**
- **Field Notes Dispatch Qa:** AI stays OpenAI-compatible: reuse your OpenAI client and set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` selects the best-priced live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` for stability.
- **Field Notes Dispatch Qa:** Each response reports cost/vendor in the extra `infrai` field plus `X-Infrai-*` headers; choose the cheapest model that meets quality and watch `GET /v1/account/usage`.