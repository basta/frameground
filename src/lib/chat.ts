import type {
  PermissionOption,
  SessionUpdate,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk'

export type { PermissionOption, SessionUpdate, ToolCallUpdate }

export type ChatEvent =
  | { type: 'user_message'; text: string; ts: number }
  | { type: 'session_update'; update: SessionUpdate; ts: number }
  | {
      type: 'permission_request'
      requestId: string
      toolCall: ToolCallUpdate
      options: PermissionOption[]
      ts: number
    }
  | { type: 'permission_resolved'; requestId: string; ts: number }
  | { type: 'turn_ended'; stopReason: string; ts: number }
  | { type: 'agent_error'; message: string; ts: number }
  | { type: 'agent_exited'; code: number | null; ts: number }

export type PermissionResponse =
  | { cancelled: true }
  | { optionId: string }

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json() as Promise<T>
}

export function sendChat(projectId: string, text: string): Promise<{ ok: true }> {
  return req(`/api/projects/${projectId}/chat/prompt`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function cancelChat(projectId: string): Promise<{ ok: true }> {
  return req(`/api/projects/${projectId}/chat/cancel`, { method: 'POST' })
}

export function respondPermission(
  projectId: string,
  requestId: string,
  response: PermissionResponse,
): Promise<{ ok: true }> {
  return req(`/api/projects/${projectId}/chat/permission`, {
    method: 'POST',
    body: JSON.stringify({ requestId, ...response }),
  })
}
