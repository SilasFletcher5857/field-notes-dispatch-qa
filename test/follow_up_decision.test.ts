import assert from "node:assert/strict";
import test from "node:test";
import { decideFollowUp, type RetrievedDocument } from "../src/work_order_answer.js";

const promisedCallback: RetrievedDocument = {
  id: "north-crew:WO-1842:technician_follow_up:2026-08-24T09:22:00.000Z",
  teamId: "north-crew",
  workOrderId: "WO-1842",
  kind: "technician_follow_up",
  text: "Maya will confirm the return window with dispatch by Tuesday morning.",
  recordedAt: "2026-08-24T09:22:00.000Z",
  followUpDueAt: "2026-08-25T09:00:00.000Z",
};

test("escalates a technician callback after its promised time", () => {
  assert.equal(decideFollowUp([promisedCallback], new Date("2026-08-25T12:00:00.000Z")), "escalate");
});

test("monitors a callback while its promised time is still ahead", () => {
  assert.equal(decideFollowUp([promisedCallback], new Date("2026-08-25T08:00:00.000Z")), "monitor");
});
