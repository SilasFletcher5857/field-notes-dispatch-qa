import { z } from "zod";
import { embed, queryVectors, rerank, upsertVectors } from "./infrai_client.js";

export const workOrderDocumentSchema = z.object({
  teamId: z.string().min(1),
  workOrderId: z.string().min(1),
  kind: z.enum(["photo_note", "dispatch_status", "technician_follow_up"]),
  text: z.string().min(10),
  recordedAt: z.string().datetime(),
  followUpDueAt: z.string().datetime().optional(),
});

export const questionSchema = z.object({
  teamId: z.string().min(1),
  question: z.string().min(5),
  now: z.string().datetime().optional(),
});

export type WorkOrderDocument = z.infer<typeof workOrderDocumentSchema>;
export type RetrievedDocument = WorkOrderDocument & { id: string };

function vectorId(document: WorkOrderDocument): string {
  return `${document.teamId}:${document.workOrderId}:${document.kind}:${document.recordedAt}`;
}

function searchableText(document: WorkOrderDocument): string {
  return `${document.kind} for work order ${document.workOrderId}, recorded ${document.recordedAt}: ${document.text}`;
}

export async function indexDocument(collection: string, document: WorkOrderDocument): Promise<string> {
  const values = await embed(searchableText(document));
  const id = vectorId(document);
  await upsertVectors(collection, [{
    id,
    values,
    metadata: {
      team_id: document.teamId,
      work_order_id: document.workOrderId,
      kind: document.kind,
      text: document.text,
      recorded_at: document.recordedAt,
      follow_up_due_at: document.followUpDueAt ?? "",
    },
  }]);
  return id;
}

export function decideFollowUp(documents: RetrievedDocument[], now: Date): "escalate" | "monitor" {
  return documents.some((document) =>
    document.kind === "technician_follow_up" &&
    document.followUpDueAt !== undefined &&
    new Date(document.followUpDueAt).getTime() < now.getTime()
  ) ? "escalate" : "monitor";
}

export async function answerQuestion(
  collection: string,
  input: z.infer<typeof questionSchema>,
): Promise<{ answer: string; action: "escalate" | "monitor"; sources: RetrievedDocument[] }> {
  const matches = await queryVectors(collection, await embed(input.question), input.teamId);
  const eligibleMatches = matches.filter((match) => match.metadata?.text);
  const candidates = eligibleMatches.map((match) => `${match.metadata!.kind}: ${match.metadata!.text}`);
  const order = candidates.length > 1 ? await rerank(input.question, candidates) : candidates.map((_, index) => index);
  const sources = order.map((index) => {
    const match = eligibleMatches[index];
    const metadata = match.metadata!;
    return {
      id: match.id,
      teamId: metadata.team_id,
      workOrderId: metadata.work_order_id,
      kind: metadata.kind as RetrievedDocument["kind"],
      text: metadata.text,
      recordedAt: metadata.recorded_at,
      followUpDueAt: metadata.follow_up_due_at || undefined,
    };
  });
  const action = decideFollowUp(sources, new Date(input.now ?? Date.now()));
  const evidence = sources.map((source) => `${source.workOrderId} ${source.kind}: ${source.text}`).join(" ");
  return {
    answer: evidence || "No matching team documents were found.",
    action,
    sources,
  };
}
