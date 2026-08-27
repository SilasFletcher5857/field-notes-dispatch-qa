import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiError } from "./infrai_client.js";
import { answerQuestion, indexDocument, questionSchema, workOrderDocumentSchema } from "./work_order_answer.js";

const collection = process.env.INFRAI_COLLECTION ?? "field-service-documents";
const port = Number(process.env.PORT ?? 3000);

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/documents") {
      const document = workOrderDocumentSchema.parse(await readJson(request));
      send(response, 201, { id: await indexDocument(collection, document), indexed: true });
      return;
    }
    if (request.method === "POST" && request.url === "/questions") {
      const question = questionSchema.parse(await readJson(request));
      send(response, 200, await answerQuestion(collection, question));
      return;
    }
    send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError) {
      send(response, 400, { error: "Invalid request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      send(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.message,
        code: error.code,
      });
      return;
    }
    send(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
}).listen(port, () => console.log(`Dispatch QA listening on http://localhost:${port}`));
