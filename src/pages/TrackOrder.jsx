import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search,
  Package,
  Truck,
  Check,
  Clock,
  X,
  ShoppingBag,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

const PBA_ORDER_NUMBER = /^PBA-(?:[A-F0-9]{5}-[A-F0-9]{5}|[A-F0-9]{8}-[A-F0-9]{8})$/;

const STATUS_STEPS = [
  { key: "pending", label: "Order Placed", icon: Clock },
  { key: "confirmed", label: "Confirmed", icon: Check },
  { key: "processing", label: "Processing", icon: Package },
  { key: "preparing", label: "Preparing", icon: Package },
  { key: "out_for_delivery", label: "Out for delivery", icon: Truck },
  { key: "delivered", label: "Delivered", icon: Truck },
];

const STATUS_STEP_INDEX = {
  pending: 0,
  confirmed: 1,
  processing: 2,
  preparing: 3,
  shipped: 4,
  out_for_delivery: 4,
  delivered: 5,
};
const PREORDER_STEPS = [
  { key: "pending", label: "Pre-order received", icon: Clock },
  { key: "confirmed", label: "Confirmed by store", icon: Check },
  { key: "sourcing", label: "Sourcing from the UK", icon: Package },
  { key: "shipped", label: "Shipped to Ghana", icon: Truck },
  { key: "received", label: "Arrived in Ghana", icon: Package },
  { key: "delivered", label: "Delivered", icon: Check },
];
const PREORDER_STEP_INDEX = Object.fromEntries(PREORDER_STEPS.map((step, index) => [step.key, index]));

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" });
}

export default function TrackOrder() {
  const [params] = useSearchParams();
  const orderParam = params.get("order") || "";
  const orderNumberFromLink = Boolean(orderParam);

  const [trackingValue, setTrackingValue] = useState(
    () => orderParam
  );
  const [order, setOrder] = useState(null);
  const [trackingView, setTrackingView] = useState("delivery");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setTrackingValue(orderParam);
    setOrder(null);
    setError("");
  }, [orderParam]);

  const runTrack = async (value) => {
    const query = value.trim().toUpperCase();

    if (!PBA_ORDER_NUMBER.test(query)) {
      setError("Enter the PBA order number shown in your confirmation.");
      return;
    }

    setLoading(true);
    setError("");
    setOrder(null);

    try {
      const { data, error: functionError } =
        await supabase.functions.invoke("track-order", {
          body: {
            order_number: query,
          },
        });

      if (functionError) {
        let serverMessage = "";
        const response = functionError.context;
        if (response && typeof response.json === "function") {
          try {
            const body = await response.clone().json();
            serverMessage = body?.error || "";
          } catch {
            // Use the SDK error message when the function response isn't JSON.
          }
        }
        throw new Error(serverMessage || functionError.message);
      }

      if (!data?.success || !data?.order) {
        throw new Error(data?.error || "Order not found");
      }

      setOrder({
        ...data.order,
        status: data.order.order_status || data.order.status,
      });
      setTrackingView(data.order.preorder_items?.length ? "preorder" : "delivery");
    } catch (err) {
      console.error("Order tracking error:", err);
      setError(err?.message || "We couldn't find an order with that PBA order number.");
    } finally {
      setLoading(false);
    }
  };

  const handleTrack = async (event) => {
    event.preventDefault();
    await runTrack(trackingValue);
  };

  const currentStepIndex = order
    ? STATUS_STEP_INDEX[order.status] ?? -1
    : -1;

  const isCancelled = order?.status === "cancelled";

  return (
    <div className="bg-white">
      <div className="bg-carbon text-white py-12">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-pink font-semibold mb-3">
            Order Tracking
          </p>

          <h1 className="font-heading text-3xl sm:text-4xl font-bold mb-3">
            Track Your Order
          </h1>

          <p className="text-white/60 text-sm">
            {orderNumberFromLink
              ? "Your PBA order number is ready. Press Enter or Track to view its latest status."
              : "Enter the PBA order number from your confirmation to view its latest status."}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <form onSubmit={handleTrack} className="mb-8 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative flex-1">
            <label htmlFor="tracking-order-number" className="sr-only">
              PBA order number
            </label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />

            <input
              id="tracking-order-number"
              name="order_number"
              type="text"
              maxLength={21}
              value={trackingValue}
              onChange={(event) => {
                setTrackingValue(event.target.value.toUpperCase());
                setOrder(null);
                setError("");
              }}
              placeholder="PBA-1A2B3-4C5D6"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              className="w-full pl-10 pr-4 py-3 bg-white border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pink"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-carbon text-white font-bold uppercase tracking-wider text-sm hover:bg-pink transition-colors disabled:opacity-50"
          >
            {loading ? "Checking…" : order ? "Refresh Status" : "Track"}
          </button>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-md text-center mb-6">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {order && (
          <div className="space-y-6">
            {order.preorder_items?.length > 0 && (
              <div className="grid grid-cols-2 rounded-lg border border-border bg-london/40 p-1" role="tablist" aria-label="Choose tracking type">
                <button type="button" role="tab" aria-selected={trackingView === "delivery"} onClick={() => setTrackingView("delivery")} className={cn("rounded-md px-3 py-2.5 text-sm font-semibold transition-colors", trackingView === "delivery" ? "bg-white text-carbon shadow-sm" : "text-muted-foreground hover:text-carbon")}>In-stock order</button>
                <button type="button" role="tab" aria-selected={trackingView === "preorder"} onClick={() => setTrackingView("preorder")} className={cn("rounded-md px-3 py-2.5 text-sm font-semibold transition-colors", trackingView === "preorder" ? "bg-white text-carbon shadow-sm" : "text-muted-foreground hover:text-carbon")}>Pre-order tracking <span className="ml-1 rounded-full bg-pink/10 px-1.5 py-0.5 text-xs text-pink">{order.preorder_items.length}</span></button>
              </div>
            )}
            <div className="bg-london/50 border border-border p-6">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Order Number
                  </p>

                  <p className="font-mono text-sm font-semibold text-carbon">
                    {order.order_number || order.id}
                  </p>
                </div>

              </div>

              {trackingView === "preorder" ? (
                <div className="space-y-6">
                  <p className="text-sm leading-6 text-muted-foreground">Pre-orders have their own progress updates. In-stock products from this checkout are tracked separately.</p>
                  {order.preorder_items.map((item) => {
                    const itemStatus = item.status || "pending";
                    const itemCancelled = itemStatus === "cancelled";
                    const itemStepIndex = PREORDER_STEP_INDEX[itemStatus] ?? -1;
                    return (
                      <section key={item.id} className="rounded-lg border border-border bg-white p-4 sm:p-5">
                        <div className="mb-5 flex items-start justify-between gap-3">
                          <div>
                            <h2 className="font-semibold text-carbon">{item.name}</h2>
                            <p className="mt-1 text-xs text-muted-foreground">Quantity: {item.quantity}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Pre-order</span>
                        </div>
                        {itemCancelled ? (
                          <div className="flex items-center gap-3 py-2 text-red-600"><X className="h-5 w-5" /><span className="font-semibold">This pre-order was cancelled.</span></div>
                        ) : (
                          <div>
                            {PREORDER_STEPS.map((step, index) => {
                              const isComplete = itemStepIndex >= 0 && index <= itemStepIndex;
                              const isCurrent = index === itemStepIndex;
                              const StepIcon = step.icon;
                              return (
                                <div key={step.key} className="flex items-start gap-3 pb-5 last:pb-0">
                                  <div className="flex flex-col items-center">
                                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-full border-2", isComplete ? "border-pink bg-pink text-white" : "border-border bg-white text-muted-foreground")}><StepIcon className="h-3.5 w-3.5" /></div>
                                    {index < PREORDER_STEPS.length - 1 && <div className={cn("mt-1 h-5 w-0.5", isComplete ? "bg-pink" : "bg-border")} />}
                                  </div>
                                  <div className="pt-1.5"><p className={cn("text-sm font-semibold", isComplete ? "text-carbon" : "text-muted-foreground")}>{step.label}</p>{isCurrent && <p className="mt-0.5 text-xs text-pink">Current status</p>}</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              ) : isCancelled ? (
                <div className="flex items-center gap-3 text-red-600 py-4">
                  <X className="w-5 h-5" />

                  <span className="font-semibold">
                    This order has been cancelled.
                  </span>
                </div>
              ) : (
                <div className="relative">
                  {STATUS_STEPS.map((step, index) => {
                    const isComplete =
                      currentStepIndex >= 0 && index <= currentStepIndex;

                    const isCurrent = index === currentStepIndex;

                    const StepIcon = step.icon;

                    return (
                      <div
                        key={step.key}
                        className="flex items-start gap-4 pb-8 last:pb-0"
                      >
                        <div className="flex flex-col items-center">
                          <div
                            className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center border-2",
                              isComplete
                                ? "bg-pink border-pink text-white"
                                : "bg-white border-border text-muted-foreground"
                            )}
                          >
                            <StepIcon className="w-4 h-4" />
                          </div>

                          {index < STATUS_STEPS.length - 1 && (
                            <div
                              className={cn(
                                "w-0.5 h-8 mt-1",
                                isComplete ? "bg-pink" : "bg-border"
                              )}
                            />
                          )}
                        </div>

                        <div className="pt-2">
                          <p
                            className={cn(
                              "font-semibold text-sm",
                              isComplete
                                ? "text-carbon"
                                : "text-muted-foreground"
                            )}
                          >
                            {step.label}
                          </p>

                          {isCurrent && (
                            <p className="text-xs text-pink mt-0.5">
                              Current status
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {trackingView === "delivery" && <div className="border border-border p-6">
              <h3 className="font-heading font-bold text-carbon mb-4">
                Delivery Information
              </h3>

              <div className="space-y-2 text-sm">
                {order.delivery_region && (
                  <p>
                    <span className="text-muted-foreground">
                      Region:
                    </span>{" "}
                    <span className="font-medium text-carbon">
                      {order.delivery_region}
                    </span>
                  </p>
                )}
              </div>
            </div>}

            <div className="text-center">
              <Link
                to="/shop"
                className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-pink hover:text-carbon transition-colors"
              >
                <ShoppingBag className="w-4 h-4" />
                Continue Shopping
              </Link>
            </div>
          </div>
        )}

        {!order && !error && !loading && (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />

            <p className="text-muted-foreground">
              {orderNumberFromLink
                ? "Press Enter to view the order connected to this link."
                : "Enter your PBA order number to track your shipment."}
            </p>

            <p className="text-xs text-muted-foreground/60 mt-2">
              Your PBA order number is shown in your order confirmation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
