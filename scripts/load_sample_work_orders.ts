import { createCollection, embed } from "../src/infrai_client.js";
import { indexDocument, type WorkOrderDocument } from "../src/work_order_answer.js";

const collection = process.env.INFRAI_COLLECTION ?? "field-service-documents";
const sample: WorkOrderDocument[] = [
  {
    teamId: "north-crew",
    workOrderId: "WO-1842",
    kind: "photo_note",
    text: "Photo shows corrosion around the condenser disconnect and a cracked weather seal.",
    recordedAt: "2026-08-24T08:35:00.000Z",
  },
  {
    teamId: "north-crew",
    workOrderId: "WO-1842",
    kind: "dispatch_status",
    text: "Replacement disconnect is staged; return visit is waiting for the technician confirmation.",
    recordedAt: "2026-08-24T09:10:00.000Z",
  },
  {
    teamId: "north-crew",
    workOrderId: "WO-1842",
    kind: "technician_follow_up",
    text: "Maya will confirm the return window with dispatch by Tuesday morning.",
    recordedAt: "2026-08-24T09:22:00.000Z",
    followUpDueAt: "2026-08-25T09:00:00.000Z",
  },
];

const dimension = (await embed("field service collection setup")).length;
await createCollection(collection, dimension);
for (const document of sample) await indexDocument(collection, document);
console.log(`Indexed ${sample.length} documents into ${collection}`);
