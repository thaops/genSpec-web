/**
 * Agent Registry — single source of truth for all AI agents.
 *
 * Adding a new agent:
 *   1. Add to AGENT_REGISTRY array
 *   2. Implement handler in lib/actions/AgentActions.ts (buildAction)
 *   3. Add backend route in agent-dispatcher.service.ts
 *
 * Nothing else needs to change — UI reads this registry dynamically.
 */

import type { AgentDefinition, AgentActionType } from "@/lib/types";

export const AGENT_REGISTRY: AgentDefinition[] = [
  {
    id: "review_workbook",
    name: "Review Workbook",
    description: "Kiểm tra workbook: số lượng, đơn giá, BOQ, tiêu chuẩn kỹ thuật",
    icon: "🔍",
    permissions: ["read_workbook", "write_notification"],
    model: "openrouter/google/gemma-3-27b-it",
    inputSchema: "review_workbook_input",
    outputSchema: "review_findings",
    streaming: true,
    maxTokens: 4096,
    visibleInToolbar: true,
    shortcut: "Ctrl+Shift+R",
    category: "analysis",
  },
  {
    id: "review_drawing",
    name: "Review Bản vẽ",
    description: "Phân tích bản vẽ: phát hiện đối tượng, kiểm tra thiếu sót, so với BOQ",
    icon: "📐",
    permissions: ["read_drawing", "read_workbook", "write_notification"],
    model: "openrouter/google/gemma-3-27b-it",
    inputSchema: "review_drawing_input",
    outputSchema: "review_findings",
    streaming: true,
    maxTokens: 4096,
    visibleInToolbar: true,
    shortcut: "Ctrl+Shift+D",
    category: "analysis",
  },
  {
    id: "generate_takeoff",
    name: "Generate Takeoff",
    description: "Bóc tách khối lượng từ đối tượng bản vẽ đã chọn",
    icon: "📏",
    permissions: ["read_drawing", "write_workbook"],
    model: "openrouter/google/gemma-3-27b-it",
    inputSchema: "generate_takeoff_input",
    outputSchema: "takeoff_proposal",
    streaming: true,
    maxTokens: 2048,
    visibleInToolbar: true,
    category: "generation",
  },
  {
    id: "generate_boq",
    name: "Generate BOQ",
    description: "Lập bảng BOQ từ bóc tách khối lượng + phân tích đơn giá",
    icon: "📋",
    permissions: ["read_workbook", "write_workbook"],
    model: "openrouter/google/gemma-3-27b-it",
    inputSchema: "generate_boq_input",
    outputSchema: "boq_proposal",
    streaming: true,
    maxTokens: 4096,
    visibleInToolbar: true,
    category: "generation",
  },
  {
    id: "find_missing",
    name: "Tìm thiếu sót",
    description: "So sánh bản vẽ với workbook — tìm hạng mục chưa được dự toán",
    icon: "🔎",
    permissions: ["read_drawing", "read_workbook"],
    model: "openrouter/google/gemma-3-27b-it",
    inputSchema: "find_missing_input",
    outputSchema: "missing_items",
    streaming: true,
    maxTokens: 2048,
    visibleInToolbar: true,
    category: "analysis",
  },
  {
    id: "compare_revision",
    name: "So sánh Revision",
    description: "Diff hai revision bản vẽ — phát hiện thay đổi → đề xuất cập nhật BOQ",
    icon: "⟺",
    permissions: ["read_drawing", "write_workbook", "write_notification"],
    model: "openrouter/google/gemma-3-27b-it",
    inputSchema: "compare_revision_input",
    outputSchema: "revision_diff_proposal",
    streaming: true,
    maxTokens: 4096,
    visibleInToolbar: false,
    category: "comparison",
  },
  {
    id: "explain_code",
    name: "Giải thích mã hiệu",
    description: "Giải thích mã hiệu công tác theo định mức, quy phạm hiện hành",
    icon: "💬",
    permissions: ["read_workbook", "read_price"],
    model: "openrouter/google/gemma-3-27b-it",
    inputSchema: "explain_code_input",
    outputSchema: "explanation",
    streaming: true,
    maxTokens: 1024,
    visibleInToolbar: false,
    shortcut: "Ctrl+E",
    category: "explanation",
  },
  {
    id: "update_price",
    name: "Cập nhật giá",
    description: "Tra cứu và cập nhật đơn giá vật liệu / nhân công theo thị trường hiện tại",
    icon: "💰",
    permissions: ["read_workbook", "write_workbook", "read_price"],
    model: "openrouter/google/gemma-3-27b-it",
    inputSchema: "update_price_input",
    outputSchema: "price_proposal",
    streaming: true,
    maxTokens: 2048,
    visibleInToolbar: true,
    category: "optimization",
  },
  {
    id: "optimize_cost",
    name: "Tối ưu chi phí",
    description: "Phân tích chi phí, đề xuất giải pháp thay thế tiết kiệm hơn",
    icon: "⚡",
    permissions: ["read_workbook", "read_price"],
    model: "openrouter/google/gemma-3-27b-it",
    inputSchema: "optimize_cost_input",
    outputSchema: "optimization_proposal",
    streaming: true,
    maxTokens: 4096,
    visibleInToolbar: true,
    category: "optimization",
  },
];

// Lookup by id
const _byId = new Map(AGENT_REGISTRY.map((a) => [a.id, a]));

export function getAgent(id: AgentActionType | string): AgentDefinition | undefined {
  return _byId.get(id);
}

export function getToolbarAgents(): AgentDefinition[] {
  return AGENT_REGISTRY.filter((a) => a.visibleInToolbar);
}

export function getAgentsByCategory(
  category: AgentDefinition["category"]
): AgentDefinition[] {
  return AGENT_REGISTRY.filter((a) => a.category === category);
}
