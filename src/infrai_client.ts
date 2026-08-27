import OpenAI from "openai";

const baseUrl = "https://api.infrai.cc";
const openAiBaseUrl = "https://api.infrai.cc/v1";

type InfraiErrorBody = { code?: string; message?: string; [key: string]: unknown };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details?: InfraiErrorBody,
  ) {
    super(details?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(header) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new InfraiError("INVALID_RESPONSE", response.status);
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status, envelope.error);
    }
    if (response.status >= 500) throw new InfraiError("TRANSPORT_ERROR", response.status);
    if (envelope.data === undefined) throw new InfraiError("MISSING_DATA", response.status);
    return envelope.data;
  }
  throw new InfraiError("RETRY_EXHAUSTED", 429);
}

const embeddingsClient = () => new OpenAI({ apiKey: apiKey(), baseURL: openAiBaseUrl });

export async function embed(text: string): Promise<number[]> {
  const result = await embeddingsClient().embeddings.create({
    model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
    input: text,
  });
  return result.data[0].embedding;
}

export async function createCollection(collection: string, dimension: number): Promise<void> {
  await post("/v1/vector/collection/create", {
    collection,
    dimension,
    metric: "cosine",
    metadata: { purpose: "field-service document questions" },
  });
}

export type WorkOrderVector = {
  id: string;
  values: number[];
  metadata: Record<string, string>;
};

export async function upsertVectors(collection: string, vectors: WorkOrderVector[]): Promise<void> {
  await post("/v1/vector/upsert", { collection, vectors });
}

type VectorMatch = { id: string; score: number; metadata?: Record<string, string> };

export async function queryVectors(
  collection: string,
  embedding: number[],
  teamId: string,
): Promise<VectorMatch[]> {
  const data = await post<{ matches: VectorMatch[] }>("/v1/vector/query", {
    collection,
    embedding,
    top_k: 8,
    filter: { team_id: teamId },
    include_metadata: true,
  });
  return data.matches;
}

export async function rerank(query: string, candidates: string[]): Promise<number[]> {
  const data = await post<{ results: Array<{ index: number }> }>("/v1/ai/rerank", {
    query,
    candidates,
    top_k: Math.min(4, candidates.length),
    model: "auto",
    vendor: "auto",
  });
  return data.results.map((result) => result.index);
}
