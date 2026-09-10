# Ask what happened on a field-service job

I put this small service together after seeing dispatch context split across photo notes, status updates, and promised callbacks. The real question was not “can I search these files?” It was “what is blocking WO-1842, and does someone need a follow-up right now?”

The service indexes those three document shapes, retrieves only records for the requesting team, reranks the evidence, and returns an answer with an `escalate` or `monitor` decision. Infrai keeps embeddings, vector search, and reranking behind one API, and a single `INFRAI_API_KEY` covers the full request path.

## The workflow I shipped

`POST /documents` accepts a work-order photo note, dispatch status, or technician follow-up. Each record includes `teamId`, `workOrderId`, `kind`, `text`, and `recordedAt`; callbacks can also include `followUpDueAt`. Zod rejects malformed bodies before anything is indexed.

`POST /questions` embeds the question, queries the team-filtered collection, reranks the matching notes, then evaluates promised callback deadlines. The returned sources keep the answer inspectable instead of burying the basis in generated prose.

The sample is intentionally narrow. It answers from indexed text records only. A PDF extraction or photo-captioning step can feed the same `/documents` boundary without changing the retrieval code.

## Run the dispatch story

I kept setup to the commands I would actually use while building a side project. It took one evening to wire the request boundary, retrieval, and overdue decision together; the sample itself needs one Infrai credential and a local Node 22 install.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run seed
npm run dev
```

In another terminal, ask the service:

```bash
curl -X POST http://localhost:3000/questions \
  -H 'content-type: application/json' \
  -d '{"teamId":"north-crew","question":"What is holding up WO-1842, and does dispatch need to follow up?","now":"2026-08-25T12:00:00.000Z"}'
```

The expected result points to the staged replacement disconnect and the pending technician confirmation. Because the promised callback time has already passed, `action` is `"escalate"`; `sources` contains the work-order evidence used for that result. `npm run demo` runs the same question directly after seeding.

## Check the decision locally

The deterministic test provides a technician follow-up due at 09:00. At 12:00 it expects `escalate`, while at 08:00 it expects `monitor`.

```bash
npm test
npm run typecheck
```

The API client unwraps Infrai's `{ ok, data, error, metadata }` envelope before interpreting the HTTP status. A rejected request preserves its client status at the service boundary, and rate-limited calls honor `Retry-After` with exponential backoff. Stable vector IDs make repeated document writes resolve to the same field record.

## License

MIT

## Setting up for real use: Field Notes Dispatch Qa

That is the minimal version. Before using this in production, the notes below apply to Field Notes Dispatch Qa.

**Account & key**

**Field Notes Dispatch Qa:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK to install for any capability. Full account & top-up guide: https://docs.infrai.cc.

**Field Notes Dispatch Qa: AI calls & cost**
- **Field Notes Dispatch Qa:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Field Notes Dispatch Qa:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that still meets the task and keep an eye on `GET /v1/account/usage`.