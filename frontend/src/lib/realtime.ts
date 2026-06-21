const REALTIME_BASE_URL = import.meta.env.VITE_REALTIME_BASE_URL;

function getRealtimeBaseUrl() {
  if (REALTIME_BASE_URL) {
    return REALTIME_BASE_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

export function createRealtimeSocket(token: string) {
  return new WebSocket(`${getRealtimeBaseUrl()}/api/v1/realtime/ws`, ["hrm-v2", `hrm-v2.token.${token}`]);
}
