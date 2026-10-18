import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CreditCard,
  Loader2,
  ShieldCheck,
  Smartphone,
  AlertCircle,
} from "lucide-react";

import { useCart } from "@/lib/cartContext";
import { supabase } from "@/lib/supabaseClient";
import { SITE_CONFIG } from "@/lib/siteConfig";
import LeafletPinPicker from "@/components/LeafletPinPicker";

const PAYMENT_METHODS = {
  moolre: "moolre",
  POD: "pay_on_delivery",
};

async function getCheckoutQuote(location, items) {
  const productIds = [...new Set(items.map((item) => item.product_id))];
  const [productsResult, settingsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id,price")
      .in("id", productIds)
      .eq("active", true),
    supabase
      .from("store_settings")
      .select("max_delivery_distance_km")
      .eq("id", true)
      .maybeSingle(),
  ]);

  if (productsResult.error) throw productsResult.error;
  if (settingsResult.error || !settingsResult.data) {
    throw settingsResult.error || new Error("Delivery settings could not be loaded.");
  }

  const products = productsResult.data || [];
  if (products.length !== productIds.length) {
    throw new Error("One or more items are no longer available. Refresh your cart and try again.");
  }

  const pricesById = new Map(products.map((product) => [product.id, Number(product.price)]));
  if ([...pricesById.values()].some((price) => !Number.isFinite(price) || price < 0)) {
    throw new Error("Current product prices could not be loaded. Refresh your cart and try again.");
  }

  const subtotalValue = items.reduce(
    (sum, item) => sum + (pricesById.get(item.product_id) || 0) * item.quantity,
    0,
  );
  const subtotal = Math.round((subtotalValue + Number.EPSILON) * 100) / 100;

  const { data: distance, error: distanceError } = await supabase.rpc("calculate_distance_km", {
    p_latitude: location.lat,
    p_longitude: location.lng,
  });
  if (distanceError || distance === null || distance === undefined || !Number.isFinite(Number(distance))) {
    throw distanceError || new Error("Delivery distance could not be calculated. Try placing the pin again.");
  }
  const distanceKm = Number(distance);

  const maxDistance = settingsResult.data.max_delivery_distance_km;
  if (maxDistance !== null && maxDistance !== undefined && distanceKm > Number(maxDistance)) {
    throw new Error("Sorry, this address is outside our delivery range.");
  }

  const { data: deliveryFee, error: feeError } = await supabase.rpc("calculate_delivery_fee", {
    distance_km: distanceKm,
  });
  if (feeError || deliveryFee === null || deliveryFee === undefined || !Number.isFinite(Number(deliveryFee)) || Number(deliveryFee) < 0) {
    throw feeError || new Error("Delivery fee could not be calculated. Try placing the pin again.");
  }

  const deliveryFeeValue = Number(deliveryFee);
  return {
    subtotal,
    delivery_fee: deliveryFeeValue,
    total: Math.round((subtotal + deliveryFeeValue + Number.EPSILON) * 100) / 100,
    distance_km: distanceKm,
    currency: "GHS",
    items: items.map((item) => {
      const unitPrice = pricesById.get(item.product_id) || 0;
      return {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: unitPrice,
        line_total: Math.round((unitPrice * item.quantity + Number.EPSILON) * 100) / 100,
      };
    }),
  };
}

export default function Checkout() {
  const navigate = useNavigate();
  const { items, subtotal, clearCart } = useCart();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [storeSettings, setStoreSettings] = useState(null);
  const [settingsError, setSettingsError] = useState("");
  const [placedOrder, setPlacedOrder] = useState(null);
  const [deliveryLocation, setDeliveryLocation] = useState(null);
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState("");

  const [paymentMethod, setPaymentMethod] = useState(
    PAYMENT_METHODS.moolre
  );
  const [moolreOtpRequired, setMoolreOtpRequired] = useState(false);
  const [moolrePaymentPhone, setMoolrePaymentPhone] = useState("");
  const [moolreOtp, setMoolreOtp] = useState("");

  useEffect(() => {
    let active = true;
    supabase
      .from("store_settings")
      .select("store_open,maintenance_mode,moolre_enabled,cod_enabled,cod_accra_only")
      .eq("id", true)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError || !data) {
          setSettingsError("Checkout settings could not be loaded. Please refresh and try again.");
          return;
        }
        setStoreSettings(data);
        if (!data.moolre_enabled && data.cod_enabled) {
          setPaymentMethod(PAYMENT_METHODS.POD);
        } else if (data.moolre_enabled) {
          setPaymentMethod(PAYMENT_METHODS.moolre);
        }
      });
    return () => { active = false; };
  }, []);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    delivery_region: "Greater Accra",
    delivery_address: "",
    digital_address: "",
    order_note: "",
    momo_number: "",
    momo_network: "MTN",
  });

  const isAccra =
    form.delivery_region === "Greater Accra";
  const codRegionAllowed = !storeSettings?.cod_accra_only || isAccra;
  const storeClosed = Boolean(storeSettings && (!storeSettings.store_open || storeSettings.maintenance_mode));

  const setField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setError("");
  };

  const handlePaymentChange = (method) => {
    if (method === PAYMENT_METHODS.moolre && !storeSettings?.moolre_enabled) return;
    if (method === PAYMENT_METHODS.POD && (!storeSettings?.cod_enabled || !codRegionAllowed)) return;

    setPaymentMethod(method);
    setError("");
  };

  const handleRegionChange = (value) => {
    setForm((current) => ({
      ...current,
      delivery_region: value,
    }));

    if (value !== "Greater Accra" && storeSettings?.cod_accra_only) {
      setPaymentMethod(PAYMENT_METHODS.moolre);
    }

    setError("");
  };

  const localSubtotal = useMemo(() => {
    return items.reduce(
      (sum, item) =>
        sum +
        Number(item.price || 0) *
          Number(item.quantity || 0),
      0
    );
  }, [items]);

  const quoteItems = useMemo(
    () => items.map((item) => ({
      product_id: item.product_id,
      quantity: Number(item.quantity),
    })),
    [items],
  );

  useEffect(() => {
    if (!deliveryLocation || quoteItems.length === 0) {
      setDeliveryQuote(null);
      setDeliveryQuoteLoading(false);
      setDeliveryQuoteError("");
      return undefined;
    }

    let active = true;
    setDeliveryQuote(null);
    setDeliveryQuoteError("");
    setDeliveryQuoteLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const quote = await getCheckoutQuote(deliveryLocation, quoteItems);
        if (active) setDeliveryQuote(quote);
      } catch (quoteError) {
        if (active) setDeliveryQuoteError(quoteError.message || "We couldn't calculate your order total.");
      } finally {
        if (active) setDeliveryQuoteLoading(false);
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [deliveryLocation, quoteItems]);

  const validateForm = () => {
    if (items.length === 0) {
      return "Your cart is empty.";
    }

    if (form.full_name.trim().length < 2) {
      return "Please enter your full name.";
    }

    if (form.full_name.trim().length > 100) {
      return "Your name is too long.";
    }

    const phoneDigits = form.phone.replace(/\D/g, "");

    if (phoneDigits.length < 9 || phoneDigits.length > 15) {
      return "Please enter a valid phone number.";
    }

    if (!form.email.trim()) {
      return "Please enter your email address.";
    }

    if (
      form.email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      return "Please enter a valid email address.";
    }

    if (
      form.delivery_address.trim().length < 5
    ) {
      return "Please enter your delivery address.";
    }

    const combinedAddressLength =
      form.delivery_address.trim().length +
      (form.digital_address.trim()
        ? 17 + form.digital_address.trim().length
        : 0);

    if (combinedAddressLength > 500) {
      return "Your delivery address is too long.";
    }

    if (
      form.digital_address.trim().length > 100
    ) {
      return "Your GhanaPost GPS address is too long.";
    }

    if (
      form.order_note.trim().length > 2000
    ) {
      return "Your order note is too long.";
    }

    if (
      paymentMethod ===
        PAYMENT_METHODS.POD &&
      !codRegionAllowed
    ) {
      return (
        "Pay on Delivery is only available within Greater Accra."
      );
    }

    if (paymentMethod === PAYMENT_METHODS.moolre && !storeSettings?.moolre_enabled) {
      return "Online payment is currently unavailable.";
    }
    if (paymentMethod === PAYMENT_METHODS.POD && !storeSettings?.cod_enabled) {
      return "Pay on Delivery is currently unavailable.";
    }

    if (paymentMethod === PAYMENT_METHODS.POD || paymentMethod === PAYMENT_METHODS.moolre) {
      const momoDigits = form.momo_number.replace(/\D/g, "");
      if (
        momoDigits.length < 9 ||
        momoDigits.length > 15 ||
        form.momo_number.trim().length > 30 ||
        !/^[+0-9()\s-]+$/.test(form.momo_number.trim())
      ) {
        return "Please enter a valid Mobile Money number.";
      }
    }

    if ((paymentMethod === PAYMENT_METHODS.POD || paymentMethod === PAYMENT_METHODS.moolre) && form.momo_network.trim().length < 2) {
      return "Please select your Mobile Money network.";
    }

    if (!deliveryLocation) {
      return "Select your delivery location on the map.";
    }

    if (!deliveryQuote) {
      return deliveryQuoteError || "Please wait while we calculate your delivery fee and total.";
    }

    return "";
  };

  const checkoutValidationError = validateForm();

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setError("");

    if (settingsError || !storeSettings) {
      setError(settingsError || "Checkout settings are still loading.");
      return;
    }
    if (storeClosed) {
      setError("The store is currently closed and cannot accept orders.");
      return;
    }

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      /*
       * IMPORTANT SECURITY RULE:
       *
       * We intentionally send ONLY:
       * - customer information
       * - delivery information
       * - payment method
       * - product IDs + quantities
       *
       * We do NOT send:
       * - trusted subtotal
       * - product prices
       * - trusted total
       * - trusted delivery fee
       *
       * The server must calculate those values.
       */
      const orderItems = items.map((item) => ({
        product_id: item.product_id,
        quantity: Number(item.quantity),
      }));

      const completeAddress = [
        form.delivery_address.trim(),
        form.digital_address.trim()
          ? `GhanaPost GPS: ${form.digital_address.trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const { data, error: functionError } =
        await supabase.functions.invoke(
          "create-order",
          {
            body: {
              full_name:
                form.full_name.trim(),

              email:
                form.email.trim() || null,

              phone:
                form.phone.trim(),

              delivery_address:
                completeAddress,

              city:
                form.delivery_region,

              delivery_region:
                form.delivery_region,

              order_note:
                form.order_note.trim() || null,

              payment_method:
                paymentMethod,

              delivery_lat: deliveryLocation.lat,
              delivery_lng: deliveryLocation.lng,

              momo_number:
                paymentMethod === PAYMENT_METHODS.POD || paymentMethod === PAYMENT_METHODS.moolre
                  ? form.momo_number.trim()
                  : null,

              momo_network:
                paymentMethod === PAYMENT_METHODS.POD || paymentMethod === PAYMENT_METHODS.moolre
                  ? form.momo_network
                  : null,

              items: orderItems,
            },
          }
        );

      if (functionError) {
        let message = functionError.message || "We could not place your order.";

        if (functionError.context instanceof Response) {
          try {
            const responseBody = await functionError.context.clone().json();
            if (responseBody?.error) message = responseBody.error;
          } catch {
            // Keep the Functions client error when there is no JSON response body.
          }
        }

        throw new Error(message);
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "We could not place your order."
        );
      }

      if (
        paymentMethod === PAYMENT_METHODS.moolre && data.payment_pending && data.order
      ) {
        localStorage.setItem("pba_last_order_number", data.order.order_number);
        if (form.email.trim()) localStorage.setItem("pba_myemail", form.email.trim());
        localStorage.setItem("pba_has_purchased", "true");
        clearCart();
        setPlacedOrder({ ...data.order, full_name: form.full_name.trim(), phone: form.phone.trim() });
        setMoolreOtpRequired(Boolean(data.otp_required));
        setMoolrePaymentPhone(form.momo_number.trim());
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      /*
       * PAY ON DELIVERY
       */
      if (!data.order) {
        throw new Error(
          "The order was created but no order details were returned."
        );
      }

      localStorage.setItem(
        "pba_last_order_number",
        data.order.order_number
      );

      if (form.email.trim()) {
        localStorage.setItem(
          "pba_myemail",
          form.email.trim()
        );
      }

      localStorage.setItem(
        "pba_has_purchased",
        "true"
      );

      clearCart();

      setPlacedOrder({
        ...data.order,
        full_name:
          form.full_name.trim(),
        phone:
          form.phone.trim(),
      });

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (err) {
      console.error(
        "Checkout failed:",
        err
      );

      setError(
        err?.message ||
          "Something went wrong while placing your order."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitMoolreOtp = async () => {
    const { data, error: invokeError } = await supabase.functions.invoke("moolre-payment", {
      body: { action: "otp", order_number: placedOrder.order_number, phone: moolrePaymentPhone, otpcode: moolreOtp.trim() },
    });
    if (invokeError || !data?.success) throw new Error(data?.error || invokeError?.message || "The Mobile Money verification could not be submitted.");
    setMoolreOtpRequired(Boolean(data.otp_required));
    setMoolreOtp("");
    return data;
  };

  const checkMoolrePayment = async () => {
    const { data, error: invokeError } = await supabase.functions.invoke("moolre-payment", {
      body: { action: "status", order_number: placedOrder.order_number, phone: moolrePaymentPhone },
    });
    if (invokeError || !data?.success) throw new Error(data?.error || invokeError?.message || "Payment status could not be checked.");
    if (data.payment_status) setPlacedOrder((current) => ({ ...current, payment_status: data.payment_status }));
    return data;
  };

  if (placedOrder) {
    const paymentLabel =
      placedOrder.payment_method ===
      PAYMENT_METHODS.POD
        ? "Pay on Delivery"
        : placedOrder.payment_method === PAYMENT_METHODS.moolre
          ? (placedOrder.payment_status === "paid" ? "Mobile Money paid" : "Mobile Money pending")
          : "Pay Online";

    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-green-600" />
          </div>

          <h1 className="font-heading text-3xl sm:text-4xl font-bold text-carbon">
            Order Placed Successfully
          </h1>

          <p className="mt-3 text-muted-foreground">
            Thank you, {placedOrder.full_name}.
          </p>

          {placedOrder.has_preorder && (
            <p className="mt-5 border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
              Your order includes an out-of-stock pre-order. We’ve saved it with your order and will contact you with delivery timing when it is available.
            </p>
          )}

          {placedOrder.payment_method === PAYMENT_METHODS.moolre && (
            <div className="mt-5 border border-pink/20 bg-pink/5 p-4 text-left text-sm text-carbon">
              {placedOrder.payment_status === "paid" ? "Moolre confirmed your payment." : "A Mobile Money request has been sent. Approve it on your phone, then check the payment status here."}
              {moolreOtpRequired && <div className="mt-3 flex gap-2"><input aria-label="Mobile Money verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={12} className="min-w-0 flex-1 rounded border border-blue-200 px-3 py-2" placeholder="SMS verification code" value={moolreOtp} onChange={(event) => setMoolreOtp(event.target.value)} /><button type="button" disabled={!moolreOtp.trim()} onClick={() => submitMoolreOtp().catch((error) => setError(error.message))} className="rounded bg-carbon px-4 py-2 font-bold text-white disabled:opacity-50">Verify</button></div>}
              {!moolreOtpRequired && placedOrder.payment_status !== "paid" && <button type="button" onClick={() => checkMoolrePayment().catch((error) => setError(error.message))} className="mt-3 rounded bg-carbon px-4 py-2 font-bold text-white">Check payment status</button>}
              {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
            </div>
          )}

          <div className="mt-8 border border-border bg-london/40 p-6 text-left space-y-4">
            <div className="flex justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                Order number
              </span>

              <span className="font-mono font-bold text-carbon">
                {placedOrder.order_number}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                Payment
              </span>

              <span className="font-semibold text-carbon">
                {paymentLabel}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                Total
              </span>

              <span className="font-heading text-2xl font-bold text-pink">
                ₵
                {Number(
                  placedOrder.total || 0
                ).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={`/track-order?order=${encodeURIComponent(
                placedOrder.order_number
              )}`}
              className="px-7 py-3 bg-pink text-white font-bold uppercase tracking-wider text-sm hover:bg-carbon transition-colors"
            >
              Track My Order
            </Link>

            <Link
              to="/shop"
              className="px-7 py-3 border border-carbon text-carbon font-bold uppercase tracking-wider text-sm hover:bg-carbon hover:text-white transition-colors"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="font-heading text-3xl font-bold text-carbon">
          Your cart is empty
        </h1>

        <p className="mt-3 text-muted-foreground">
          Add some products before checking out.
        </p>

        <Link
          to="/shop"
          className="inline-block mt-8 px-8 py-3.5 bg-carbon text-white font-bold uppercase tracking-wider text-sm hover:bg-pink transition-colors"
        >
          Shop Now
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link
        to="/cart"
        className="inline-flex items-center gap-2 text-sm font-semibold text-carbon hover:text-pink transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Cart
      </Link>

      <h1 className="font-heading text-3xl sm:text-4xl font-bold text-carbon mb-8">
        Checkout
      </h1>

      <form
        onSubmit={handleSubmit}
        className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-3"
      >
        <div className="min-w-0 space-y-8 lg:col-span-2">
          {/* CONTACT */}
          <section className="border border-border bg-white p-6">
            <SectionTitle
              number="1"
              title="Contact Information"
            />

            <div className="grid sm:grid-cols-2 gap-4">
              <Field
                label="Full Name"
                id="checkout-full-name"
                required
              >
                <input
                  id="checkout-full-name"
                  required
                  maxLength={100}
                  value={form.full_name}
                  onChange={(e) =>
                    setField(
                      "full_name",
                      e.target.value
                    )
                  }
                  className="ck-input"
                  placeholder="Your full name"
                  autoComplete="name"
                />
              </Field>

              <Field
                label="Phone Number"
                id="checkout-phone-number"
                required
              >
                <input
                  id="checkout-phone-number"
                  required
                  type="tel"
                  maxLength={30}
                  value={form.phone}
                  onChange={(e) =>
                    setField(
                      "phone",
                      e.target.value
                    )
                  }
                  className="ck-input"
                  placeholder="024 000 0000"
                  autoComplete="tel"
                />
              </Field>

              <Field
                label="Email"
                id="checkout-email"
                className="sm:col-span-2"
                required
              >
                <input
                  id="checkout-email"
                  required
                  type="email"
                  maxLength={254}
                  value={form.email}
                  onChange={(e) =>
                    setField(
                      "email",
                      e.target.value
                    )
                  }
                  className="ck-input"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </Field>
            </div>
          </section>

          {/* DELIVERY */}
          <section className="border border-border bg-white p-6">
            <SectionTitle
              number="2"
              title="Delivery Information"
            />

            <div className="space-y-4">
              <Field
                label="Delivery Region"
                id="checkout-delivery-region"
                required
              >
                <select
                  id="checkout-delivery-region"
                  required
                  value={
                    form.delivery_region
                  }
                  onChange={(e) =>
                    handleRegionChange(
                      e.target.value
                    )
                  }
                  className="ck-input"
                >
                  {SITE_CONFIG.ghanaRegions.map(
                    (region) => (
                      <option
                        key={region}
                        value={region}
                      >
                        {region}
                      </option>
                    )
                  )}
                </select>
              </Field>

              <Field
                label="Delivery Address"
                id="checkout-delivery-address"
                required
              >
                <textarea
                  id="checkout-delivery-address"
                  required
                  rows={4}
                  maxLength={500}
                  value={
                    form.delivery_address
                  }
                  onChange={(e) =>
                    setField(
                      "delivery_address",
                      e.target.value
                    )
                  }
                  className="ck-input"
                  placeholder="House number, street, area, landmark..."
                  autoComplete="street-address"
                />
              </Field>

              <Field
                label="Delivery Location"
                id="checkout-delivery-location"
                labelAsSpan
                required
              >
                <div
                  role="group"
                  aria-labelledby="checkout-delivery-location-label"
                  aria-describedby="checkout-delivery-location-help checkout-delivery-location-status"
                >
                  <p id="checkout-delivery-location-help" className="mb-2 text-sm text-muted-foreground">
                    Click or tap the map to place a pin, then drag it to your delivery point. The location is used to calculate delivery distance.
                  </p>
                  <div className="overflow-hidden border border-border">
                    <LeafletPinPicker
                      location={deliveryLocation}
                      onSelect={setDeliveryLocation}
                    />
                  </div>
                  <p id="checkout-delivery-location-status" className="mt-2 text-xs text-muted-foreground" aria-live="polite">
                    {deliveryLocation
                      ? `Location selected: ${deliveryLocation.lat.toFixed(5)}, ${deliveryLocation.lng.toFixed(5)}`
                      : "No location selected yet."}
                  </p>
              <p className="mt-2 text-sm font-medium text-carbon" role="status" aria-live="polite">
                {deliveryQuoteLoading
                  ? "Calculating delivery fee…"
                  : deliveryQuote
                    ? `Delivery fee: ₵${Number(deliveryQuote.delivery_fee).toFixed(2)} (${Number(deliveryQuote.distance_km).toFixed(2)} km)`
                    : deliveryQuoteError || "Choose a location pin to see your delivery fee."}
              </p>
                </div>
              </Field>

              <Field label="GhanaPost GPS Address" id="checkout-digital-address">
                <input
                  id="checkout-digital-address"
                  maxLength={100}
                  value={
                    form.digital_address
                  }
                  onChange={(e) =>
                    setField(
                      "digital_address",
                      e.target.value
                    )
                  }
                  className="ck-input"
                  placeholder="Example: GA-144-7392"
                />
              </Field>

              <Field label="Order Note" id="checkout-order-note">
                <textarea
                  id="checkout-order-note"
                  rows={3}
                  maxLength={2000}
                  value={form.order_note}
                  onChange={(e) =>
                    setField(
                      "order_note",
                      e.target.value
                    )
                  }
                  className="ck-input"
                  placeholder="Any delivery instructions?"
                />
              </Field>

              <div className="p-4 bg-pink/5 border border-pink/20">
                <p className="text-sm font-semibold text-carbon">
                  Delivery fee
                </p>

                <p className="text-sm text-muted-foreground mt-1">
                  Your delivery fee is calculated securely
                  from the delivery distance. The amount
                  cannot be changed by the customer.
                </p>
              </div>
            </div>
          </section>

          {/* PAYMENT */}
          <section className="border border-border bg-white p-6">
            <SectionTitle
              number="3"
              title="Payment Method"
            />

            {storeClosed && <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-4 text-sm text-red-700">The store is closed and cannot accept orders right now.</p>}
            {settingsError && <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-4 text-sm text-red-700">{settingsError}</p>}
            {!storeSettings && !settingsError && <p className="mb-4 text-sm text-muted-foreground">Loading checkout options…</p>}

            <div className="space-y-4">
              {storeSettings && <button
                type="button"
                onClick={() =>
                  handlePaymentChange(
                    PAYMENT_METHODS.moolre
                  )
                }
                disabled={submitting || !storeSettings.moolre_enabled}
                className={`w-full text-left border-2 p-5 transition-colors ${
                  paymentMethod ===
                  PAYMENT_METHODS.moolre
                    ? "border-pink bg-pink/5"
                    : storeSettings.moolre_enabled
                      ? "border-border hover:border-pink/50"
                      : "border-border bg-gray-50 opacity-70 cursor-not-allowed"
                } disabled:opacity-60`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                      paymentMethod ===
                      PAYMENT_METHODS.moolre
                        ? "border-pink"
                        : "border-gray-300"
                    }`}
                  >
                    {paymentMethod ===
                      PAYMENT_METHODS.moolre && (
                      <div className="w-2.5 h-2.5 rounded-full bg-pink" />
                    )}
                  </div>

                  <CreditCard className="w-5 h-5 text-pink" />

                  <div>
                    <p className="font-bold text-carbon">
                      Pay Online with Mobile Money
                    </p>

                    <p className="text-sm text-muted-foreground mt-1">
                      {storeSettings.moolre_enabled
                        ? "Pay securely through Moolre. Approve the payment prompt on your phone."
                        : "Moolre payments are not enabled for the store yet."}
                    </p>
                  </div>
                </div>
              </button>}

              {storeSettings?.cod_enabled && <button
                type="button"
                disabled={
                  submitting || !codRegionAllowed
                }
                onClick={() =>
                  handlePaymentChange(
                    PAYMENT_METHODS.POD
                  )
                }
                className={`w-full text-left border-2 p-5 transition-colors ${
                  !codRegionAllowed
                    ? "border-border bg-gray-50 opacity-60 cursor-not-allowed"
                    : paymentMethod ===
                        PAYMENT_METHODS.POD
                      ? "border-pink bg-pink/5"
                      : "border-border hover:border-pink/50"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                      paymentMethod ===
                      PAYMENT_METHODS.POD
                        ? "border-pink"
                        : "border-gray-300"
                    }`}
                  >
                    {paymentMethod ===
                      PAYMENT_METHODS.POD && (
                      <div className="w-2.5 h-2.5 rounded-full bg-pink" />
                    )}
                  </div>

                  <Smartphone className="w-5 h-5 text-pink" />

                  <div>
                    <p className="font-bold text-carbon">
                      Pay on Delivery
                    </p>

                    <p className="text-sm text-muted-foreground mt-1">
                      {storeSettings?.cod_accra_only ? "Available only within Greater Accra." : "Available for your delivery area."}
                    </p>

                    {!codRegionAllowed && (
                      <p className="text-xs text-red-600 mt-2">
                        Select Greater Accra to use Pay on
                        Delivery.
                      </p>
                    )}
                  </div>
                </div>
              </button>}
              {storeSettings && !storeSettings.moolre_enabled && !storeSettings.cod_enabled && (
                <p role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">Orders are temporarily unavailable because no payment methods are enabled.</p>
              )}
            </div>

            {(paymentMethod === PAYMENT_METHODS.moolre || paymentMethod === PAYMENT_METHODS.POD && codRegionAllowed) && (
                <div className="mt-5 grid sm:grid-cols-2 gap-4">
                  {paymentMethod === PAYMENT_METHODS.moolre && <p className="sm:col-span-2 text-sm text-muted-foreground">Enter the Mobile Money number to charge. Approve the payment request on your phone after placing the order.</p>}
                  <Field
                    label="MoMo Number"
                    id="checkout-momo-number"
                    required
                  >
                <input
                  id="checkout-momo-number"
                  required
                      type="tel"
                      maxLength={30}
                      value={
                        form.momo_number
                      }
                      onChange={(e) =>
                        setField(
                          "momo_number",
                          e.target.value
                        )
                      }
                      className="ck-input"
                      placeholder="024 000 0000"
                      autoComplete="tel"
                    />
                  </Field>

                  <Field
                    label="MoMo Network"
                    id="checkout-momo-network"
                    required
                  >
                    <select
                      id="checkout-momo-network"
                      required
                      value={
                        form.momo_network
                      }
                      onChange={(e) =>
                        setField(
                          "momo_network",
                          e.target.value
                        )
                      }
                      className="ck-input"
                    >
                      <option value="MTN">
                        MTN MoMo
                      </option>

                      <option value="Telecel">
                        Telecel Cash
                      </option>

                      <option value="AirtelTigo">
                        AirtelTigo Money
                      </option>
                    </select>
                  </Field>
                </div>
              )}
          </section>
        </div>

        {/* ORDER SUMMARY */}
        <aside className="min-w-0">
          <div className="sticky top-28 border border-border bg-london/30 p-6">
            <h2 className="font-heading text-xl font-bold text-carbon">
              Your Order
            </h2>

            <div className="mt-5 space-y-4 max-h-64 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.product_id}
                  className="flex gap-3"
                >
                  <div className="w-14 h-14 bg-white border border-border shrink-0 overflow-hidden">
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-carbon truncate">
                      {item.name}
                    </p>

                    <p className="text-xs text-muted-foreground mt-1">
                      Qty: {item.quantity}
                    </p>
                  </div>

                  <p className="font-semibold text-sm text-carbon">
                    ₵{Number(
                      deliveryQuote?.items?.find((quotedItem) => quotedItem.product_id === item.product_id)?.line_total ??
                        Number(item.price || 0) * Number(item.quantity || 0)
                    ).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-border mt-5 pt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Subtotal
                </span>

                <span className="font-semibold">
                  ₵
                  {Number(deliveryQuote?.subtotal ?? localSubtotal ?? subtotal ?? 0).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Delivery
                </span>

                <span className="font-semibold text-pink">
                  {deliveryQuoteLoading
                    ? "Calculating…"
                    : deliveryQuote
                      ? `₵${Number(deliveryQuote.delivery_fee).toFixed(2)}`
                      : "Choose a location"}
                </span>
              </div>
            </div>

            <div className="border-t border-carbon mt-5 pt-5">
              <div className="flex justify-between items-end">
                <span className="font-heading font-bold text-lg">
                  Total
                </span>

                <span className="font-heading font-bold text-xl text-pink">
                  {deliveryQuoteLoading
                    ? "Calculating…"
                    : deliveryQuote
                      ? `₵${Number(deliveryQuote.total).toFixed(2)}`
                      : "—"}
                </span>
              </div>

              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                The quote uses current product prices and your selected delivery distance. The final order is checked again when you place it.
              </p>
            </div>

            {deliveryQuoteError && (
              <p role="alert" className="mt-3 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {deliveryQuoteError}
              </p>
            )}

            {error && (
              <div className="mt-5 flex items-start gap-2 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || Boolean(checkoutValidationError) || deliveryQuoteLoading || !deliveryQuote || !storeSettings || Boolean(settingsError) || storeClosed || (!storeSettings?.moolre_enabled && !storeSettings?.cod_enabled)}
              className="w-full mt-6 py-4 bg-pink text-white font-bold uppercase tracking-wider text-sm hover:bg-carbon transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : paymentMethod ===
                PAYMENT_METHODS.moolre ? (
                <>
                  <CreditCard className="w-4 h-4" />
                  Request Mobile Money payment
                </>
              ) : (
                <>
                  <Smartphone className="w-4 h-4" />
                  Place Order
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-pink" />
              Secure checkout
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}

function SectionTitle({ number, title }) {
  return (
    <h2 className="font-heading text-xl font-bold text-carbon mb-5 flex items-center gap-3">
      <span className="w-8 h-8 bg-carbon text-white rounded-full flex items-center justify-center text-sm">
        {number}
      </span>

      {title}
    </h2>
  );
}

function Field({
  label,
  children,
  id,
  labelAsSpan = false,
  className = "",
  required = false,
}) {
  const Label = labelAsSpan ? "span" : "label";

  return (
    <div className={className}>
      <Label
        {...(labelAsSpan
          ? { id: `${id}-label` }
          : { htmlFor: id })}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-carbon"
      >
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </Label>

      {children}
    </div>
  );
}
