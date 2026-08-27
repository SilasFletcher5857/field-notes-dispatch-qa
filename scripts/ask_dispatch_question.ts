import { answerQuestion } from "../src/work_order_answer.js";

const collection = process.env.INFRAI_COLLECTION ?? "field-service-documents";
const result = await answerQuestion(collection, {
  teamId: "north-crew",
  question: "What is holding up WO-1842, and does dispatch need to follow up?",
  now: "2026-08-25T12:00:00.000Z",
});
console.log(JSON.stringify(result, null, 2));
