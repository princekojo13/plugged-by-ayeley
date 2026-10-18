import { Link } from "react-router-dom";
import {
  ArrowRight,
  CreditCard,
  MapPin,
  PackageCheck,
  ShoppingBag,
  Smartphone,
  Truck,
} from "lucide-react";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { REGIONS } from "@/lib/siteConfig";
import { useStoreSettings, whatsappLink } from "@/lib/useStoreSettings";

const STEPS = [
  {
    icon: ShoppingBag,
    title: "Place your order",
    desc: "Add products to your cart and check out with your delivery details.",
  },
  {
    icon: CreditCard,
    title: "Pay securely",
    desc: "Pay online with Moolre Mobile Money, or pay on delivery within Greater Accra.",
  },
  {
    icon: Truck,
    title: "We dispatch",
    desc: "Your order is packed and sent out from Accra.",
  },
  {
    icon: PackageCheck,
    title: "Delivered to you",
    desc: "Track your order with the PBA order number from your confirmation.",
  },
];

export default function Delivery() {
  const { whatsapp } = useStoreSettings();

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="bg-carbon py-16 text-white sm:py-20">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-pink">
            Delivery
          </p>

          <h1 className="mb-4 font-heading text-4xl font-bold sm:text-5xl">
            Delivered Across Ghana
          </h1>

          <p className="mx-auto max-w-xl text-white/70">
            We deliver original UK-sourced products to all 16 regions of
            Ghana. Here's how it works and how long it takes.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-8 font-heading text-2xl font-bold text-carbon sm:text-3xl">
            How it works
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className="border border-border p-6"
              >
                <div className="mb-4 flex items-center justify-between">
                  <step.icon className="h-6 w-6 text-pink" />

                  <span className="font-heading text-2xl font-bold text-black/10">
                    0{index + 1}
                  </span>
                </div>

                <h3 className="mb-1 font-heading font-semibold text-carbon">
                  {step.title}
                </h3>

                <p className="text-sm text-muted-foreground">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Delivery times */}
      <section className="bg-london/50 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-2 font-heading text-2xl font-bold text-carbon sm:text-3xl">
            Estimated delivery times
          </h2>

          <p className="mb-8 text-sm text-muted-foreground">
            For in-stock items, from the day your order is confirmed. Your
            exact delivery fee is shown at checkout before you pay.
          </p>

          <div className="overflow-hidden border border-border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-carbon text-left text-xs uppercase tracking-wider text-white">
                <tr>
                  <th className="px-4 py-3 font-semibold">Region</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">
                    Main city
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Delivery time
                  </th>
                </tr>
              </thead>

              <tbody>
                {REGIONS.map((region) => (
                  <tr
                    key={region.name}
                    className="border-t border-border"
                  >
                    <td className="px-4 py-3 font-medium text-carbon">
                      <span className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-pink" />
                        {region.name}
                      </span>
                    </td>

                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {region.city}
                    </td>

                    <td className="px-4 py-3 text-right font-semibold text-carbon">
                      {region.delivery}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Payment options */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto grid max-w-4xl gap-6 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
          <div className="border border-border p-6">
            <CreditCard className="mb-4 h-6 w-6 text-pink" />

            <h3 className="mb-2 font-heading font-semibold text-carbon">
              Pay online
            </h3>

            <p className="text-sm text-muted-foreground">
              Pay securely through Moolre Mobile Money when you place your order.
              Available for delivery anywhere in Ghana.
            </p>
          </div>

          <div className="border border-border p-6">
            <Smartphone className="mb-4 h-6 w-6 text-pink" />

            <h3 className="mb-2 font-heading font-semibold text-carbon">
              Pay on delivery
            </h3>

            <p className="text-sm text-muted-foreground">
              Available for Greater Accra orders only. Pay with Mobile
              Money when your order arrives.
            </p>
          </div>
        </div>
      </section>

      {/* Help */}
      <section className="bg-carbon py-16 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="mb-4 font-heading text-3xl font-bold">
            Already ordered?
          </h2>

          <p className="mb-8 text-white/60">
            Track your order with your PBA order number, or message us on
            WhatsApp with any delivery questions.
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/track-order"
              className="inline-flex items-center justify-center gap-2 bg-pink px-8 py-4 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-white hover:text-carbon"
            >
              Track Your Order
              <ArrowRight className="h-4 w-4" />
            </Link>

            <a
              href={whatsappLink(
                whatsapp,
                "Hi Plugged by Ayeley, I have a question about delivery."
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 border border-white/30 px-8 py-4 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:border-pink hover:text-pink"
            >
              <WhatsAppIcon className="h-4 w-4" />
              WhatsApp Us
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
