import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

export function AutomaticOrderSync() {
  const fetcher = useFetcher<{ message?: string; error?: string }>();
  const state = useRef(fetcher.state);
  state.current = fetcher.state;
  const { submit } = fetcher;
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || state.current !== "idle") return;
      state.current = "submitting";
      submit({ intent: "sync" }, { method: "post", action: "/app/attendance" });
    };
    refresh();
    const timer = window.setInterval(refresh, 5 * 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [submit]);
  return null;
}
