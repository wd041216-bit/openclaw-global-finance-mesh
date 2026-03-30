import crypto from "node:crypto";

import type { ControlResult, EvidenceGraphSnapshot, MatchedRule } from "./types.ts";

export function hashContent(value: unknown): string {
  return `sha256:${crypto.createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

export function buildEvidenceGraphSnapshot(input: {
  decisionPacketId: string;
  event: Record<string, unknown>;
  matchedRules: MatchedRule[];
  controlResults: ControlResult[];
}): EvidenceGraphSnapshot {
  const sourceEventHash = hashContent(input.event);
  const graphRef = `graph://finance-mesh/audit/${input.decisionPacketId}`;
  const createdAt = new Date().toISOString();

  const nodes: Array<Record<string, unknown>> = [
    baseNode({
      node_id: sourceEventHash,
      node_type: "EconomicEvent",
      created_at: createdAt,
      source_ref: String(input.event.event_id ?? "unknown-event"),
      hash_or_checksum: sourceEventHash,
    }),
    baseNode({
      node_id: input.decisionPacketId,
      node_type: "DecisionPacket",
      created_at: createdAt,
      source_ref: graphRef,
      hash_or_checksum: hashContent({
        decisionPacketId: input.decisionPacketId,
        matchedRules: input.matchedRules.map((item) => item.rule.rule_id),
      }),
    }),
  ];

  const edges: Array<Record<string, unknown>> = [
    {
      from: input.decisionPacketId,
      to: sourceEventHash,
      relation: "triggered_by",
    },
  ];

  for (const matchedRule of input.matchedRules) {
    const ruleNodeId = `${matchedRule.pack.pack_id}:${matchedRule.rule.rule_id}@${matchedRule.pack.version}`;
    nodes.push(
      baseNode({
        node_id: ruleNodeId,
        node_type: "Rule",
        created_at: createdAt,
        source_ref: matchedRule.pack.pack_id,
        hash_or_checksum: hashContent({
          pack_id: matchedRule.pack.pack_id,
          rule_id: matchedRule.rule.rule_id,
          version: matchedRule.pack.version,
        }),
      }),
    );
    edges.push({
      from: input.decisionPacketId,
      to: ruleNodeId,
      relation: "matched_rule",
    });
  }

  for (const control of input.controlResults) {
    const controlNodeId = `${input.decisionPacketId}:${control.control_id}`;
    nodes.push(
      baseNode({
        node_id: controlNodeId,
        node_type: "ControlCheck",
        created_at: createdAt,
        source_ref: control.control_id,
        hash_or_checksum: hashContent(control),
      }),
    );
    edges.push({
      from: input.decisionPacketId,
      to: controlNodeId,
      relation: "checked_by",
    });
  }

  return {
    graph_ref: graphRef,
    nodes,
    edges,
  };
}

function baseNode(input: {
  node_id: string;
  node_type: string;
  created_at: string;
  source_ref: string;
  hash_or_checksum: string;
}): Record<string, unknown> {
  return {
    ...input,
    created_by: "openclaw-global-finance-mesh",
    version: "1.0",
    retention_policy: "finance-default",
    sensitivity_level: "restricted",
  };
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

