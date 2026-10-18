import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";

const NOTIFICATIONS_STORAGE_KEY = "admin-notifications-enabled";

export default function NotificationsToggle({ alertScope = "order, stock, and review" }) {
  const [enabled, setEnabled] = useState(true);
  const [permission, setPermission] = useState("default");

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) !== "false");
    } catch {
      setEnabled(true);
    }
    if ("Notification" in window) setPermission(window.Notification.permission);

    const syncToggle = (event) => {
      if (event.key === NOTIFICATIONS_STORAGE_KEY) setEnabled(event.newValue !== "false");
    };
    window.addEventListener("storage", syncToggle);
    return () => window.removeEventListener("storage", syncToggle);
  }, []);

  const toggleNotifications = async () => {
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    try {
      window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(nextEnabled));
    } catch {
      // Keep the current-session toggle working if browser storage is unavailable.
    }

    if (nextEnabled && "Notification" in window && window.Notification.permission === "default") {
      try {
        setPermission(await window.Notification.requestPermission());
      } catch {
        setPermission(window.Notification.permission);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggleNotifications()}
      aria-pressed={enabled}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
        enabled
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300"
          : "border-black/10 bg-white text-black/60 hover:border-[#ff1f8f] hover:text-[#ff1f8f]"
      }`}
      title={enabled
        ? `Turn off ${alertScope} alerts`
        : permission === "denied"
          ? "Turn on in-app alerts; browser alerts are blocked in your browser settings"
          : `Turn on ${alertScope} alerts`}
    >
      {enabled ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
      Notifications {enabled ? "on" : "off"}
    </button>
  );
}
