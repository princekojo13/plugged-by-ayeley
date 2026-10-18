import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { toast } from "@/components/ui/use-toast";

const STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "preparing", label: "Preparing" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];
const PREORDER_STATUSES = [
  { value: "pending", label: "Received" },
  { value: "confirmed", label: "Confirmed" },
  { value: "sourcing", label: "Sourcing from UK" },
  { value: "shipped", label: "Shipped to Ghana" },
  { value: "received", label: "Arrived in Ghana" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

function formatGhs(value) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
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
  return STATUSES.find((item) => item.value === status)?.label || "Pending";
}

function paymentClass(status) {
  switch (status) {
    case "paid":
      return "text-emerald-700";
    case "failed":
    case "cancelled":
      return "text-red-700";
    default:
      return "text-amber-700";
  }
}

function getItemSubtotal(order) {
  return (order.order_items || []).reduce(
    (sum, item) =>
      sum +
      Number(item.unit_price || 0) *
        Number(item.quantity || 0),
    0
  );
}

function getCalculatedTotal(order) {
  return (
    getItemSubtotal(order) +
    Number(order.delivery_fee || 0)
  );
}

function totalsMatch(order) {
  const storedTotal = Number(order.total || 0);
  const calculatedTotal = getCalculatedTotal({
    ...order,
    order_items: order.all_order_items || order.order_items,
  });

  return Math.abs(storedTotal - calculatedTotal) < 0.01;
}

function isMissingPreorderColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("is_preorder") && (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
}

export default function AdminOrders({ preordersOnly = false }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [error, setError] = useState("");
  const [dataLoadError, setDataLoadError] = useState("");

  const loadOrders = useCallback(async (manual = false) => {
    if (manual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");
    setDataLoadError("");

    try {
      const orderSelection = `
          id,
          order_number,
          full_name:customer_name,
          email:customer_email,
          phone:customer_phone,
          delivery_address,
          city:delivery_region,
          delivery_region,
          delivery_fee,
          subtotal,
          total,
          payment_method,
          momo_number,
          momo_network,
          payment_status,
          paid_at,
          moolre_reference,
          status:order_status,
          order_note:delivery_instructions,
          whatsapp_number,
          created_at,
          updated_at,
          order_items (
            id,
            product_id,
            product_name:product_name_snapshot,
            unit_price:product_price_snapshot,
            quantity,
            line_total,
            is_preorder,
            preorder_status,
            created_at
          )
        `;

      let { data, error: queryError } = await supabase
        .from("orders")
        .select(orderSelection)
        .order("created_at", { ascending: false });

      if (queryError && isMissingPreorderColumn(queryError)) {
        if (preordersOnly) {
          throw new Error("Pre-orders are not enabled in the live database yet. Apply supabase/sql/support_preorder_orders.sql in the Supabase SQL Editor.");
        }
        const fallback = await supabase
          .from("orders")
          .select(orderSelection.replace(/is_preorder,\s*preorder_status,\s*/, ""))
          .order("created_at", { ascending: false });
        data = fallback.data;
        queryError = fallback.error;
      }

      if (queryError) {
        throw queryError;
      }

      const normalized = (data || []).map((order) => {
        const allItems = (order.order_items || []).map((item) => ({
          ...item,
          is_preorder: Boolean(item.is_preorder),
        }));
        const visibleItems = allItems.filter((item) => item.is_preorder === preordersOnly);
        return {
          ...order,
          all_order_items: allItems,
          order_items: visibleItems,
        };
      }).filter((order) => order.order_items.length > 0);

      setOrders(normalized);
    } catch (err) {
      console.error("Failed to load orders:", err);

      const message = err?.message || "Could not load orders.";
      if (!manual) setOrders([]);
      setDataLoadError(message);
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [preordersOnly]);

  useEffect(() => {
    void loadOrders();
    const refreshTimer = window.setInterval(() => {
      void loadOrders(true);
    }, 15000);
    return () => window.clearInterval(refreshTimer);
  }, [loadOrders]);

  useEffect(() => {
    const refreshForNewOrder = () => void loadOrders(true);
    window.addEventListener("admin:order-inserted", refreshForNewOrder);
    return () => window.removeEventListener("admin:order-inserted", refreshForNewOrder);
  }, [loadOrders]);

  const updateOrderStatus = async (order, status) => {
    if (updating === order.id || status === order.status) {
      return;
    }

    setUpdating(order.id);
    setError("");

    try {
      const { data: statusResult, error: updateError } = await supabase.rpc(
        "update_staff_order_status",
        { p_order_id: order.id, p_status: status }
      );
      if (updateError) throw updateError;
      if (!statusResult?.ok) {
        throw new Error(statusResult?.error || "The order status was not updated.");
      }
      const data = {
        id: order.id,
        status: statusResult.status || status,
        updated_at: statusResult.updated_at || new Date().toISOString(),
      };

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? {
                ...item,
                status: data.status,
                updated_at: data.updated_at,
              }
            : item
        )
      );

      setSelectedOrder((current) =>
        current?.id === order.id
          ? {
              ...current,
              status: data.status,
              updated_at: data.updated_at,
            }
          : current
      );

      toast({
        variant: "success",
        title: "Order status updated",
        description: `Order #${order.order_number} is now ${statusLabel(data.status).toLowerCase()}.`,
      });
    } catch (err) {
      console.error(
        "Failed to update order status:",
        err
      );

      setError(
        err?.message ||
          "Could not update the order status."
      );
    } finally {
      setUpdating(null);
    }
  };

  const updatePreorderStatus = async (order, item, status) => {
    if (updating === item.id || status === item.preorder_status) return;
    setUpdating(item.id);
    setError("");
    try {
      const { data, error: updateError } = await supabase.rpc(
        "update_staff_preorder_status",
        { p_order_item_id: item.id, p_status: status }
      );
      if (updateError) throw updateError;
      if (!data?.ok) throw new Error(data?.error || "The pre-order status was not updated.");
      const applyUpdate = (current) => current.map((entry) => entry.id === order.id
        ? { ...entry, order_items: entry.order_items.map((line) => line.id === item.id ? { ...line, preorder_status: data.status || status } : line) }
        : entry);
      setOrders(applyUpdate);
      setSelectedOrder((current) => current?.id === order.id
        ? { ...current, order_items: current.order_items.map((line) => line.id === item.id ? { ...line, preorder_status: data.status || status } : line) }
        : current);
      toast({
        variant: "success",
        title: "Pre-order status updated",
        description: `${item.product_name} is now ${PREORDER_STATUSES.find((entry) => entry.value === (data.status || status))?.label.toLowerCase()}.`,
      });
    } catch (err) {
      console.error("Failed to update pre-order status:", err);
      setError(err?.message || "Could not update pre-order status.");
    } finally {
      setUpdating(null);
    }
  };

  const markCodPaymentReceived = async (order) => {
    if (
      updating === order.id ||
      order.payment_method !== "cash_on_delivery" ||
      !["pending", "failed"].includes(order.payment_status) ||
      order.status === "cancelled"
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Confirm you received the full payment for ${order.order_number}. Only mark it paid after collecting the cash or Mobile Money.`
    );
    if (!confirmed) return;

    setUpdating(order.id);
    setError("");

    try {
      const { data, error: paymentError } = await supabase.rpc(
        "admin_mark_cod_paid",
        { p_order_id: order.id }
      );
      if (paymentError) throw paymentError;
      if (!data?.ok) throw new Error("Payment could not be recorded.");

      const paymentUpdate = {
        payment_status: data.payment_status || "paid",
        paid_at: data.paid_at || new Date().toISOString(),
        amount_paid: data.amount_paid ?? order.total,
      };

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id ? { ...item, ...paymentUpdate } : item
        )
      );
      setSelectedOrder((current) =>
        current?.id === order.id
          ? { ...current, ...paymentUpdate }
          : current
      );
      toast({
        variant: "success",
        title: "Payment recorded",
        description: `Payment for order #${order.order_number} was marked as received.`,
      });
    } catch (err) {
      console.error("Could not record COD payment:", err);
      setError(err?.message || "Could not record the received payment.");
    } finally {
      setUpdating(null);
    }
  };

  const verifyMoolrePayment = async (order) => {
    if (updating === order.id || order.payment_method !== "moolre" || order.payment_status === "paid") return;
    setUpdating(order.id);
    setError("");
    try {
      const { data, error: verifyError } = await supabase.functions.invoke("moolre-payment", {
        body: { action: "status", order_number: order.order_number, phone: order.momo_number },
      });
      if (verifyError || !data?.success) throw verifyError || new Error(data?.error || "Moolre status could not be checked.");
      await loadOrders(true);
      if (data.payment_status === "paid") toast({ variant: "success", title: "Payment verified", description: `Moolre confirmed payment for order #${order.order_number}.` });
      else setError(`Moolre has not confirmed payment for order #${order.order_number} yet.`);
    } catch (err) {
      console.error("Could not verify Moolre payment:", err);
      setError(err?.message || "Could not verify the payment with Moolre.");
    } finally {
      setUpdating(null);
    }
  };

  const filteredOrders = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return orders;
    }

    return orders.filter((order) =>
      [
        order.order_number,
        order.full_name,
        order.email,
        order.phone,
        order.city,
        order.delivery_region,
      ]
        .filter(Boolean)
        .some((field) =>
          String(field)
            .toLowerCase()
            .includes(value)
        )
    );
  }, [orders, search]);

  const stats = useMemo(() => {
    const total = orders.length;

    const pending = orders.filter(
      (order) => order.status === "pending"
    ).length;

    const processing = orders.filter(
      (order) =>
        order.status === "confirmed" ||
        order.status === "processing" ||
        order.status === "preparing" ||
        order.status === "out_for_delivery"
    ).length;

    const delivered = orders.filter(
      (order) => order.status === "delivered"
    ).length;

    const orderValue = orders
      .filter((order) => order.status !== "cancelled")
      .reduce(
        (sum, order) => {
          const totalFromDatabase =
            Number(order.total || 0);

          return sum + totalFromDatabase;
        },
        0
      );

    const paidValue = orders
      .filter(
        (order) =>
          order.payment_status === "paid"
      )
      .reduce(
        (sum, order) =>
          sum + Number(order.total || 0),
        0
      );

    const mismatchedOrders = orders.filter(
      (order) => !totalsMatch(order)
    ).length;
    const paidCancelledOrders = orders.filter(
      (order) => order.status === "cancelled" && order.payment_status === "paid"
    ).length;

    return {
      total,
      pending,
      processing,
      delivered,
      orderValue,
      paidValue,
      mismatchedOrders,
      paidCancelledOrders,
    };
  }, [orders]);

  const showStat = (value) => {
    if (loading) return "…";
    if (dataLoadError) return "—";
    return value;
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#111111]">
      <AdminPageHeader
        title={preordersOnly ? "Pre-orders" : "Orders"}
        description={preordersOnly
          ? "Track out-of-stock items customers have reserved to ship from the UK."
          : "Review in-stock products, payments, and delivery progress."}
        actions={<button type="button" onClick={() => loadOrders(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold transition hover:border-[#c20f4d]/40 hover:bg-[#fff7fa] hover:text-[#b10b46] disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>}
      />

      <main className="mx-auto max-w-7xl px-5 py-7 sm:px-8 sm:py-9">
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !dataLoadError && stats.paidCancelledOrders > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Cancelled order payment needs review</p>
              <p className="mt-1 leading-6">
                {stats.paidCancelledOrders} cancelled {stats.paidCancelledOrders === 1 ? "order is" : "orders are"} still marked paid. Confirm each payment was refunded before treating the paid value as cash retained.
              </p>
            </div>
          </div>
        )}

        {stats.mismatchedOrders > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />

            <div>
              <p className="font-semibold">
                Order total discrepancy detected
              </p>

              <p className="mt-1 leading-6">
                {stats.mismatchedOrders === 1
                  ? "1 order"
                  : `${stats.mismatchedOrders} orders`}{" "}
                have a stored total that does not
                match the sum of their items plus
                delivery fee. Review those orders
                before treating the totals as reliable.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <Stat
            label="Total Orders"
            value={showStat(stats.total)}
            pink
          />

          <Stat
            label="Pending"
            value={showStat(stats.pending)}
          />

          <Stat
            label="In Progress"
            value={showStat(stats.processing)}
          />

          <Stat
            label="Delivered"
            value={showStat(stats.delivered)}
          />

          <Stat
            label="Order Value"
            value={dataLoadError ? "—" : loading ? "Loading…" : formatGhs(stats.orderValue)}
          />
          <Stat
            label="Paid Value"
            value={dataLoadError ? "—" : loading ? "Loading…" : formatGhs(stats.paidValue)}
            valueClassName="text-emerald-700"
          />
          <Stat
            label="Data Check"
            value={dataLoadError ? "Unavailable" : loading ? "Loading…" : stats.mismatchedOrders > 0
              ? `${stats.mismatchedOrders} issue${stats.mismatchedOrders === 1 ? "" : "s"}`
              : "All clear"}
            valueClassName={dataLoadError || loading ? "text-black/45" : stats.mismatchedOrders > 0 ? "text-amber-700" : "text-emerald-700"}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-black/[0.07] bg-white p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/30" />

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search order number, customer, email, phone or city..."
              className="w-full rounded-xl border border-black/10 bg-[#fafafa] py-3 pl-11 pr-4 text-sm outline-none transition focus:border-[#ff1f8f] focus:bg-white"
            />
          </div>

          <div className="mt-4 border-t border-black/[0.06] pt-4 text-sm text-black/40">
            Showing{" "}
            <span className="font-semibold text-black">
              {loading ? "…" : dataLoadError ? "—" : filteredOrders.length}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-black">
              {loading ? "…" : dataLoadError ? "—" : orders.length}
            </span>{" "}
            orders
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-sm">
          {loading ? (
            <div className="flex min-h-[350px] items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-[#ff1f8f]" />
            </div>
          ) : dataLoadError ? (
            <div className="flex min-h-[350px] flex-col items-center justify-center px-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
              <h2 className="mt-4 font-heading text-xl font-bold">Orders could not be loaded</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-black/45">Use Refresh to try again. Counts stay blank until order data loads successfully.</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex min-h-[350px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0f7] text-[#ff1f8f]">
                <Package className="h-6 w-6" />
              </div>

              <h2 className="mt-5 font-heading text-xl font-bold">
                {preordersOnly ? "No pre-orders found" : "No in-stock orders found"}
              </h2>

              <p className="mt-2 max-w-sm text-sm leading-6 text-black/40">
                {preordersOnly
                  ? "Customer pre-orders will appear here after the preorder database setup is applied."
                  : "Orders containing in-stock products will appear here."}
              </p>
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
                const expanded =
                  selectedOrder?.id === order.id;

                const itemSubtotal =
                  getItemSubtotal({
                    ...order,
                    order_items: order.all_order_items || order.order_items,
                  });

                const calculatedTotal =
                  getCalculatedTotal({
                    ...order,
                    order_items: order.all_order_items || order.order_items,
                  });

                const storedTotal =
                  Number(order.total || 0);

                const hasMismatch =
                  !totalsMatch(order);

                return (
                  <Fragment key={order.id}>
                    <tr className="align-middle transition hover:bg-[#fffdfd]">
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="font-mono text-sm font-bold">#{order.order_number}</span>
                        {hasMismatch && (
                          <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" /> Total mismatch
                          </span>
                        )}
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        <p className="truncate text-sm font-semibold">{order.full_name || "—"}</p>
                        <p className="truncate text-xs text-black/45">{order.email || order.phone || "No contact details"}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-black/55">{formatDate(order.created_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold">{formatGhs(storedTotal)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`text-sm font-semibold capitalize ${paymentClass(order.payment_status)}`}>{order.payment_status || "—"}</span>
                        <p className="mt-0.5 text-xs text-black/40">{order.payment_method === "cash_on_delivery" ? "Pay on Delivery" : order.payment_method === "moolre" ? "Moolre Mobile Money" : "Legacy online payment"}</p>
                        {order.payment_method === "cash_on_delivery" &&
                          ["pending", "failed"].includes(order.payment_status) &&
                          order.status !== "cancelled" && (
                            <button type="button" onClick={() => markCodPaymentReceived(order)} disabled={updating === order.id} className="mt-2 rounded-lg bg-[#ff1f8f] px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#e60078] disabled:cursor-not-allowed disabled:opacity-60">
                              {updating === order.id ? "Saving…" : "Mark received"}
                            </button>
                          )}
                        {order.payment_method === "moolre" && ["pending", "failed"].includes(order.payment_status) && (
                          <button type="button" onClick={() => verifyMoolrePayment(order)} disabled={updating === order.id} className="mt-2 rounded-lg border border-black/15 px-2.5 py-1.5 text-[11px] font-bold text-black/70 transition hover:border-[#ff1f8f] hover:text-[#e60078] disabled:cursor-not-allowed disabled:opacity-60">
                            {updating === order.id ? "Checking…" : "Check Moolre"}
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.status)}`}>{statusLabel(order.status)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(expanded ? null : order)}
                          aria-expanded={expanded}
                          aria-controls={`order-details-${order.id}`}
                          aria-label={`${expanded ? "Hide" : "View"} details for order ${order.order_number}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 text-black/55 transition hover:border-[#ff1f8f] hover:text-[#ff1f8f]"
                        >
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>

                    {expanded && (
                      <tr id={`order-details-${order.id}`}>
                        <td colSpan={7} className="border-t border-black/[0.06] bg-[#fffdfd] px-5 py-6 sm:px-6">
                        <div>
                        <div className="grid gap-5 lg:grid-cols-3">
                          <InfoCard title="Customer">
                            <p className="font-semibold">
                              {order.full_name || "—"}
                            </p>

                            <p className="mt-1 text-sm text-black/50">
                              {order.phone || "—"}
                            </p>

                            <p className="mt-1 break-all text-sm text-black/50">
                              {order.email || "—"}
                            </p>
                          </InfoCard>

                          <InfoCard title="Delivery">
                            <p className="font-semibold">
                              {order.city || "—"}
                            </p>

                            {order.delivery_region && (
                              <p className="mt-1 text-sm text-black/50">
                                {order.delivery_region}
                              </p>
                            )}

                            <p className="mt-2 text-sm leading-6 text-black/50">
                              {order.delivery_address ||
                                "No address provided"}
                            </p>

                            {order.order_note && (
                              <p className="mt-2 text-sm text-black/50">
                                <strong className="text-black">
                                  Note:
                                </strong>{" "}
                                {order.order_note}
                              </p>
                            )}

                            {order.tracking_token && (
                              <p className="mt-3 break-all text-xs text-black/35">
                                Tracking token:{" "}
                                {order.tracking_token}
                              </p>
                            )}
                          </InfoCard>

                          <InfoCard title="Payment">
                            <p className="text-sm text-black/55">
                              Method:{" "}
                              <strong className="text-black">
                                {order.payment_method ===
                                  "cash_on_delivery"
                                  ? "Pay on Delivery"
                                  : "Pay Online"}
                              </strong>
                            </p>

                            <p className="mt-2 text-sm text-black/55">
                              Status:{" "}
                              <strong
                                className={paymentClass(
                                  order.payment_status
                                )}
                              >
                                {order.payment_status}
                              </strong>
                            </p>

                            {order.payment_status === "paid" && order.paid_at && (
                              <p className="mt-2 text-sm text-emerald-700">
                                Payment received: {formatDate(order.paid_at)}
                              </p>
                            )}

                            {order.momo_number && (
                              <p className="mt-2 text-sm text-black/50">
                                MoMo:{" "}
                                <strong className="text-black">
                                  {order.momo_number}
                                </strong>
                                {order.momo_network
                                  ? ` (${order.momo_network})`
                                  : ""}
                              </p>
                            )}

                            {order.moolre_reference && (
                              <p className="mt-2 break-all text-sm text-black/45">
                                Reference:{" "}
                                {order.moolre_reference}
                              </p>
                            )}

                            <p className="mt-3 text-xs text-black/35">
                              Online payments are marked paid after gateway
                              verification. For Pay on Delivery, record payment
                              only after you collect the cash or Mobile Money.
                            </p>
                          </InfoCard>
                        </div>

                        <div className="mt-6">
                          <h3 className="text-sm font-bold">
                            {preordersOnly ? "Pre-order Items" : "In-stock Items"}
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-black/45">
                            {preordersOnly
                              ? "Only the out-of-stock items from this checkout are listed here. The order total below covers the complete checkout."
                              : "Only in-stock items are listed here. Any pre-order items from this checkout appear in Pre-orders."}
                          </p>

                          <div className="mt-3 overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
                            {(order.order_items || []).length ===
                            0 ? (
                              <div className="px-4 py-6 text-sm text-black/45">
                                No order items found.
                              </div>
                            ) : (
                              (order.order_items || []).map(
                                (item) => {
                                  const calculatedLineTotal =
                                    Number(
                                      item.unit_price || 0
                                    ) *
                                    Number(
                                      item.quantity || 0
                                    );

                                  return (
                                    <div
                                      key={item.id}
                                      className="flex items-center justify-between gap-4 border-b border-black/[0.06] px-4 py-4 last:border-b-0"
                                    >
                                      <div className="min-w-0">
                                        <p className="font-semibold">
                                          {item.product_name}
                                        </p>
                                        {item.is_preorder && (
                                          <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                                            Pre-order
                                          </span>
                                        )}
                                        {preordersOnly && (
                                          <label className="mt-2 flex max-w-xs items-center gap-2 text-xs font-medium text-black/55">
                                            <span className="shrink-0">Pre-order progress</span>
                                            <select
                                              value={item.preorder_status || "pending"}
                                              onChange={(event) => updatePreorderStatus(order, item, event.target.value)}
                                              disabled={updating === item.id}
                                              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs font-semibold text-black outline-none focus:border-[#ff1f8f] disabled:opacity-60"
                                            >
                                              {PREORDER_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                                            </select>
                                          </label>
                                        )}

                                        <p className="mt-1 text-xs text-black/40">
                                          {formatGhs(
                                            item.unit_price
                                          )}{" "}
                                          ×{" "}
                                          {item.quantity}
                                        </p>
                                      </div>

                                      <p className="shrink-0 font-semibold">
                                        {formatGhs(
                                          calculatedLineTotal
                                        )}
                                      </p>
                                    </div>
                                  );
                                }
                              )
                            )}

                            <div className="space-y-2 border-t border-black/[0.06] bg-[#fffdfd] px-4 py-4">
                              <div className="flex justify-between text-sm text-black/55">
                                <span>
                                  Items subtotal
                                </span>

                                <span>
                                  {formatGhs(
                                    itemSubtotal
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between text-sm text-black/55">
                                <span>
                                  Delivery fee
                                </span>

                                <span>
                                  {formatGhs(
                                    order.delivery_fee
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between border-t border-black/[0.06] pt-3">
                                <span className="font-semibold">
                                  Calculated total
                                </span>

                                <span className="font-bold text-[#e60078]">
                                  {formatGhs(
                                    calculatedTotal
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span className="font-semibold">
                                  Stored order total
                                </span>

                                <span
                                  className={`font-bold ${
                                    hasMismatch
                                      ? "text-amber-700"
                                      : "text-[#e60078]"
                                  }`}
                                >
                                  {formatGhs(
                                    storedTotal
                                  )}
                                </span>
                              </div>

                              {hasMismatch && (
                                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                  <span>
                                    The stored order total does
                                    not match the item subtotal
                                    plus delivery fee. This order
                                    should not be used as a trusted
                                    financial record until the
                                    underlying order data is checked.
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                          {!preordersOnly && (
                          <ControlCard label="Order Status">
                            <select
                              value={order.status}
                              onChange={(event) =>
                                updateOrderStatus(
                                  order,
                                  event.target.value
                                )
                              }
                              disabled={
                                updating === order.id
                              }
                              className="w-full appearance-auto rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-[#ff1f8f] focus:ring-2 focus:ring-[#ff1f8f]/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {STATUSES.map(
                                (status) => (
                                  <option
                                    key={status.value}
                                    value={status.value}
                                  >
                                    {status.label}
                                  </option>
                                )
                              )}
                            </select>
                          </ControlCard>
                          )}

                          <ControlCard label="Payment Status">
                            <div className="flex min-h-[48px] flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-[#fafafa] px-4 py-3">
                              <div>
                                <span
                                  className={`font-semibold capitalize ${paymentClass(
                                    order.payment_status
                                  )}`}
                                >
                                  {order.payment_status}
                                </span>
                                {order.payment_status === "paid" && order.paid_at && (
                                  <p className="mt-1 text-xs text-emerald-700">
                                    Received {formatDate(order.paid_at)}
                                  </p>
                                )}
                              </div>

                              {order.payment_method === "cash_on_delivery" &&
                                ["pending", "failed"].includes(order.payment_status) &&
                                order.status !== "cancelled" && (
                                  <button
                                    type="button"
                                    onClick={() => markCodPaymentReceived(order)}
                                    disabled={updating === order.id}
                                    className="rounded-lg bg-[#ff1f8f] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#e60078] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {updating === order.id
                                      ? "Saving…"
                                      : "Mark payment received"}
                                  </button>
                                )}
                            </div>
                          </ControlCard>
                        </div>

                        {updating === order.id && (
                          <div className="mt-4 flex items-center gap-2 text-sm font-medium text-[#e60078]">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving changes...
                          </div>
                        )}
                        </div>
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
        </div>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  pink = false,
  valueClassName = "text-[#111111]",
}) {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-white p-3 shadow-sm sm:p-4">
      <div
        className={`h-1.5 w-10 rounded-full ${
          pink
            ? "bg-[#ff1f8f]"
            : "bg-black/10"
        }`}
      />

      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
        {label}
      </p>

      <p className={`mt-1 text-lg font-bold sm:text-xl ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}

function InfoCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-black/35">
        {title}
      </p>

      <div className="mt-3 text-sm leading-6 text-black/60">
        {children}
      </div>
    </div>
  );
}

function ControlCard({ label, children }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-5">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.15em] text-black/35">
        {label}
      </label>

      {children}
    </div>
  );
}
