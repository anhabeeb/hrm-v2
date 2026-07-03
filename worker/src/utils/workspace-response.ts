export function workspaceRetryKey(workspace: string, section: string) {
  return `${workspace}.${section}.retry`;
}

export function workspaceDeferredMessage(label: string) {
  return `${label} is taking longer than expected. The main workspace is available while this section refreshes.`;
}
