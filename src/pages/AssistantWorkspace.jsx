import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  LogOut,
  Mail,
  MapPin,
  Package,
  RefreshCw,
  Search,
  ShoppingBag,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import NotificationsToggle from "@/components/admin/NotificationsToggle";
import { whatsappLink } from "@/lib/useStoreSettings";

const ORDER_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "preparing", label: "Preparing" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
];

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function money(value) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function statusClass(status) {
  switch (status) {
    case "delivered":
      return "bg-emerald-50 text-emerald-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
    case "out_for_delivery":
      return "bg-purple-50 text-purple-700";
    case "processing":
    case "preparing":
      return "bg-cyan-50 text-cyan-700";
    case "confirmed":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-[#fff0f7] text-[#e60078]";
  }
}

function statusLabel(status) {
  return ORDER_STATUSES.find((item) => item.value === status)?.label
    || (status ? status.replaceAll("_", " ") : "Pending");
}

function paymentClass(status) {
  if (status === "paid") return "text-emerald-700";
  if (status === "failed" || status === "cancelled") return "text-red-700";
  return "text-amber-700";
}

export default function AssistantWorkspace() {
  const { user, logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const [itemsByOrder, setItemsByOrder] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadOrders = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const { data, error: ordersError } = await supabase
        .from("orders")
        .select("id,order_number,customer_name,customer_email,customer_phone,delivery_address,delivery_instructions,delivery_region,total,payment_method,payment_status,order_status,created_at")
        .order("created_at", { ascending: false })
        .limit(100);

      if (ordersError) throw ordersError;
      const nextOrders = data || [];
      setOrders(nextOrders);

      if (!nextOrders.length) {
        setItemsByOrder({});
        return;
      }

      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("id,order_id,product_name_snapshot,quantity")
        .in("order_id", nextOrders.map((order) => order.id));
      if (itemsError) throw itemsError;

      const grouped = {};
      for (const item of orderItems || []) (grouped[item.order_id] ||= []).push(item);
      setItemsByOrder(grouped);
    } catch (loadError) {
      setError(loadError?.message || "Could not load orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  async function updateStatus(order, status) {
    if (updating || status === order.order_status || order.order_status === "cancelled") return;
    setUpdating(order.id);
    setError("");
    setSuccess("");
    try {
      const { data, error: updateError } = await supabase.rpc("update_staff_order_status", {
        p_order_id: order.id,
        p_status: status,
      });
      if (updateError) throw updateError;
      if (!data?.ok) throw new Error(data?.error || "The order status was not updated.");

      const updatedStatus = data.status || status;
      setOrders((current) => current.map((item) => item.id === order.id
        ? { ...item, order_status: updatedStatus }
        : item));
      setSuccess(`Order ${order.order_number} updated to ${statusLabel(updatedStatus).toLowerCase()}.`);
    } catch (updateError) {
      setError(updateError?.message || "Could not update the order status.");
    } finally {
      setUpdating(null);
    }
  }

  const filteredOrders = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return orders;
    return orders.filter((order) => [
      order.order_number,
      order.customer_name,
      order.customer_email,
      order.customer_phone,
      order.delivery_region,
    ].filter(Boolean).some((field) => String(field).toLowerCase().includes(value)));
  }, [orders, search]);

  const stats = useMemo(() => ({
    total: orders.length,
    pending: orders.filter((order) => order.order_status === "pending").length,
    inProgress: orders.filter((order) => ["confirmed", "processing", "preparing", "out_for_delivery"].includes(order.order_status)).length,
    delivered: orders.filter((order) => order.order_status === "delivered").length,
  }), [orders]);

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#111111]">
      <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff1f8f]">Assistant workspace</p>
              <h1 className="mt-1 font-heading text-2xl font-bold">Orders</h1>
              <p className="mt-1 text-sm text-black/45">Signed in as {user?.email || "assistant"} · View orders and update delivery status.</p>
            </div>
            <div className="flex items-center gap-2">
              <NotificationsToggle alertScope="new order" />
              <button type="button" onClick={() => void loadOrders(true)} disabled={loading || refreshing} className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold transition hover:border-[#ff1f8f] hover:text-[#ff1f8f] disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Refresh
              </button>
              <button type="button" onClick={() => void logout()} className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold transition hover:border-[#ff1f8f] hover:text-[#ff1f8f]">
                <LogOut className="h-4 w-4" />Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        {error && <div role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}
        {success && <div role="status" className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">{success}</div>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total Orders" value={stats.total} pink />
          <Stat label="Pending" value={stats.pending} />
          <Stat label="In Progress" value={stats.inProgress} />
          <Stat label="Delivered" value={stats.delivered} valueClassName="text-emerald-700" />
        </div>

        <div className="mt-6 rounded-2xl border border-black/[0.07] bg-white p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/30" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order number, customer, email, phone or region..."
              className="w-full rounded-xl border border-black/10 bg-[#fafafa] py-3 pl-11 pr-4 text-sm outline-none transition focus:border-[#ff1f8f] focus:bg-white"
            />
          </div>
          <div className="mt-4 border-t border-black/[0.06] pt-4 text-sm text-black/40">
            Showing <span className="font-semibold text-black">{filteredOrders.length}</span> of <span className="font-semibold text-black">{orders.length}</span> orders
          </div>
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-sm">
          {loading ? (
            <div className="flex min-h-[350px] items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-[#ff1f8f]" /></div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex min-h-[350px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0f7] text-[#ff1f8f]"><Package className="h-6 w-6" /></div>
              <h2 className="mt-5 font-heading text-xl font-bold">No orders found</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-black/40">Orders will appear here when customers place them.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left">
                <thead className="bg-[#fff8fc] text-[11px] font-semibold uppercase tracking-[0.12em] text-black/45">
                  <tr>
                    <th scope="col" className="px-4 py-3">Order</th>
                    <th scope="col" className="px-4 py-3">Customer</th>
                    <th scope="col" className="px-4 py-3">Placed</th>
                    <th scope="col" className="px-4 py-3 text-right">Total</th>
                    <th scope="col" className="px-4 py-3">Payment</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {filteredOrders.map((order) => {
                    const expanded = expandedOrderId === order.id;
                    const orderItems = itemsByOrder[order.id] || [];
                    return (
                      <Fragment key={order.id}>
                        <tr className="align-middle transition hover:bg-[#fffdfd]">
                          <td className="whitespace-nowrap px-4 py-3"><span className="font-mono text-sm font-bold">#{order.order_number}</span></td>
                          <td className="max-w-[240px] px-4 py-3">
                            <p className="truncate text-sm font-semibold">{order.customer_name || "—"}</p>
                            <p className="truncate text-xs text-black/45">{order.customer_email || order.customer_phone || "No contact details"}</p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-black/55">{dateLabel(order.created_at)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold">{money(order.total)}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={`text-sm font-semibold capitalize ${paymentClass(order.payment_status)}`}>{order.payment_status || "—"}</span>
                            <p className="mt-0.5 text-xs text-black/40">{order.payment_method === "cash_on_delivery" ? "Pay on Delivery" : "Pay Online"}</p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.order_status)}`}>{statusLabel(order.order_status)}</span></td>
                          <td className="px-4 py-3 text-right">
                            <button type="button" onClick={() => setExpandedOrderId(expanded ? null : order.id)} aria-expanded={expanded} aria-controls={`assistant-order-details-${order.id}`} aria-label={`${expanded ? "Hide" : "View"} details for order ${order.order_number}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 text-black/55 transition hover:border-[#ff1f8f] hover:text-[#ff1f8f]">
                              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </td>
                        </tr>

                        {expanded && (
                          <tr id={`assistant-order-details-${order.id}`}>
                            <td colSpan={7} className="border-t border-black/[0.06] bg-[#fffdfd] px-5 py-6 sm:px-6">
                              <div className="grid gap-5 lg:grid-cols-3">
                                <InfoCard title="Customer">
                                  <p className="font-semibold">{order.customer_name || "—"}</p>
                                  {order.customer_phone && <a className="mt-2 flex items-center gap-2 text-sm text-black/55 hover:text-[#e60078]" target="_blank" rel="noopener noreferrer" href={whatsappLink(order.customer_phone, `Hi ${order.customer_name}, I'm contacting you about order ${order.order_number}.`)}><WhatsAppIcon className="h-4 w-4 shrink-0" />WhatsApp {order.customer_phone}</a>}
                                  {order.customer_email && <a className="mt-2 flex items-center gap-2 break-all text-sm text-black/55 hover:text-[#e60078]" href={`mailto:${order.customer_email}`}><Mail className="h-4 w-4 shrink-0" />{order.customer_email}</a>}
                                </InfoCard>

                                <InfoCard title="Delivery">
                                  <p className="flex items-start gap-2 font-semibold"><MapPin className="mt-1 h-4 w-4 shrink-0 text-[#ff1f8f]" /><span>{order.delivery_address || "No address provided"}</span></p>
                                  {order.delivery_instructions && <p className="mt-2 text-sm text-black/50">Instructions: {order.delivery_instructions}</p>}
                                  {order.delivery_region && <p className="mt-2 text-sm text-black/50">{order.delivery_region}</p>}
                                </InfoCard>

                                <InfoCard title="Payment">
                                  <p className="text-sm text-black/55">Method: <strong className="text-black">{order.payment_method === "cash_on_delivery" ? "Pay on Delivery" : "Pay Online"}</strong></p>
                                  <p className="mt-2 text-sm text-black/55">Status: <strong className={`capitalize ${paymentClass(order.payment_status)}`}>{order.payment_status || "pending"}</strong></p>
                                  <p className="mt-2 text-sm text-black/55">Order total: <strong className="text-black">{money(order.total)}</strong></p>
                                </InfoCard>
                              </div>

                              <div className="mt-6">
                                <h3 className="text-sm font-bold">Order items</h3>
                                <div className="mt-3 overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
                                  {orderItems.length ? orderItems.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between gap-4 border-b border-black/[0.06] px-4 py-4 last:border-b-0">
                                      <p className="font-semibold">{item.product_name_snapshot || "Item"}</p>
                                      <p className="shrink-0 text-sm text-black/55">× {item.quantity}</p>
                                    </div>
                                  )) : <p className="px-4 py-6 text-sm text-black/45">No order items found.</p>}
                                </div>
                              </div>

                              <div className="mt-6 grid gap-4 md:grid-cols-2">
                                <ControlCard label="Order status">
                                  <select
                                    value={order.order_status || "pending"}
                                    onChange={(event) => void updateStatus(order, event.target.value)}
                                    disabled={Boolean(updating) || order.order_status === "cancelled"}
                                    className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#ff1f8f] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {order.order_status === "cancelled" && <option value="cancelled">Cancelled</option>}
                                    {ORDER_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                                  </select>
                                </ControlCard>
                                <ControlCard label="Assigned permissions">
                                  <div className="flex min-h-12 items-center gap-2 rounded-xl border border-black/10 bg-[#fafafa] px-4 py-3 text-sm text-black/60"><ShoppingBag className="h-4 w-4 text-[#ff1f8f]" />View orders and update delivery status</div>
                                </ControlCard>
                              </div>
                              {updating === order.id && <div className="mt-4 flex items-center gap-2 text-sm font-medium text-[#e60078]"><RefreshCw className="h-4 w-4 animate-spin" />Saving status…</div>}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, pink = false, valueClassName = "text-[#111111]" }) {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-white p-3 shadow-sm sm:p-4">
      <div className={`h-1.5 w-10 rounded-full ${pink ? "bg-[#ff1f8f]" : "bg-black/10"}`} />
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">{label}</p>
      <p className={`mt-1 text-lg font-bold sm:text-xl ${valueClassName}`}>{value}</p>
    </div>
  );
}

function InfoCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-black/35">{title}</p>
      <div className="mt-3 text-sm leading-6 text-black/60">{children}</div>
    </div>
  );
}

function ControlCard({ label, children }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-5">
      <p className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.15em] text-black/35">{label}</p>
      {children}
    </div>
  );
}
