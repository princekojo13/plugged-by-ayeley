import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Check,
  Image as ImageIcon,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { CATEGORIES } from "@/lib/siteConfig";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { toast } from "@/components/ui/use-toast";

const FALLBACK_CATEGORY = "UK Snacks";
const PRODUCT_IMAGE_BUCKET = "product-images";
const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
const PRODUCT_IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const EMPTY_FORM = {
  name: "",
  description: "",
  category: FALLBACK_CATEGORY,
  price: "",
  compare_at_price: "",
  sku: "",
  stock: "0",
  low_stock_threshold: "5",
  image: "",
  additional_images: "",
  uk_origin: "",
  featured: false,
  best_seller: false,
  new_arrival: false,
  special_offer: false,
  active: true,
};

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCategoryValue(category) {
  if (typeof category === "string") {
    return category;
  }

  return category?.name || category?.slug || "";
}

export default function AdminProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();

  const editing = Boolean(id);

  const categories = useMemo(() => {
    const list = CATEGORIES
      .map(getCategoryValue)
      .filter(Boolean);

    return list.length > 0
      ? list
      : [FALLBACK_CATEGORY];
  }, []);

  const [form, setForm] = useState({
    ...EMPTY_FORM,
    category: categories[0] || FALLBACK_CATEGORY,
  });

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [imageMode, setImageMode] = useState("url");
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState("");

  useEffect(() => {
    if (!selectedImagePreview) return undefined;
    return () => URL.revokeObjectURL(selectedImagePreview);
  }, [selectedImagePreview]);

  useEffect(() => {
    if (!editing) {
      let active = true;
      supabase
        .from("store_settings")
        .select("low_stock_default")
        .eq("id", true)
        .maybeSingle()
        .then(({ data }) => {
          if (active && data?.low_stock_default !== undefined) {
            setForm((current) => ({ ...current, low_stock_threshold: String(data.low_stock_default) }));
          }
        });
      setLoading(false);
      return () => { active = false; };
    }

    const loadProduct = async () => {
      setLoading(true);
      setError("");

      try {
        const { data, error: queryError } =
          await supabase
            .from("products")
            .select("*")
            .eq("id", id)
            .single();

        if (queryError) {
          throw queryError;
        }

        if (!data) {
          throw new Error("Product not found.");
        }

        setForm({
          name: data.name || "",
          description: data.description || "",
          category:
            data.category ||
            categories[0] ||
            FALLBACK_CATEGORY,
          price: data.price ?? "",
          compare_at_price: data.compare_at_price ?? "",
          sku: data.sku || "",
          stock: data.stock_quantity ?? 0,
          low_stock_threshold: data.low_stock_threshold ?? 5,
          image: data.image_url || "",
          additional_images: Array.isArray(data.additional_images)
            ? data.additional_images.join("\n")
            : "",
          uk_origin: data.uk_origin || "",
          featured: Boolean(data.featured),
          best_seller: Boolean(data.best_seller),
          new_arrival: Boolean(data.new_arrival),
          special_offer: Boolean(data.special_offer),
          active: data.active !== false,
        });
      } catch (err) {
        console.error(
          "Failed to load product:",
          err
        );

        setError(
          err?.message ||
            "Could not load product."
        );
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  }, [editing, id, categories]);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const chooseImageMode = (mode) => {
    setImageMode(mode);
    if (mode === "url") {
      setSelectedImageFile(null);
      setSelectedImagePreview("");
    }
  };

  const handleImageFileChange = (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    if (!PRODUCT_IMAGE_EXTENSIONS[file.type]) {
      setError("Choose a JPEG, PNG, WebP, or AVIF image.");
      return;
    }
    if (file.size === 0) {
      setError("That photo is empty. Choose another image.");
      return;
    }
    if (file.size > MAX_PRODUCT_IMAGE_SIZE) {
      setError("Product photos must be 5 MB or smaller.");
      return;
    }

    setError("");
    setImageMode("gallery");
    setSelectedImageFile(file);
    setSelectedImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setSaving(true);
    setError("");
    const uploadedImagePaths = [];

    try {
      const name = form.name.trim();
      const price = Number(form.price);
      const stock = Math.max(
        0,
        Number(form.stock) || 0
      );
      const compareAtPrice = form.compare_at_price === ""
        ? null
        : Number(form.compare_at_price);
      const additionalImages = form.additional_images
        .split(/[\n,]+/)
        .map((url) => url.trim())
        .filter(Boolean);
      const lowStockThreshold = Number(form.low_stock_threshold);

      if (!name) {
        throw new Error(
          "Please enter the product name."
        );
      }

      if (!Number.isFinite(price) || price < 0) {
        throw new Error(
          "Please enter a valid price."
        );
      }
      if (!Number.isSafeInteger(stock) || !Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0) {
        throw new Error("Stock and low-stock threshold must be whole numbers.");
      }
      if (compareAtPrice !== null && (!Number.isFinite(compareAtPrice) || compareAtPrice < price)) {
        throw new Error("Compare-at price must be blank or at least the product price.");
      }
      if (additionalImages.some((url) => !/^https?:\/\//i.test(url))) {
        throw new Error("Additional image URLs must start with http:// or https://.");
      }

      const category =
        form.category ||
        categories[0] ||
        FALLBACK_CATEGORY;

      const slug = slugify(name);

      let image = form.image.trim();
      if (!selectedImageFile && image && !/^https?:\/\//i.test(image)) {
        throw new Error("Product image URL must start with http:// or https://.");
      }

      if (selectedImageFile) {
        const imagePath = `products/${crypto.randomUUID()}.${PRODUCT_IMAGE_EXTENSIONS[selectedImageFile.type]}`;
        setUploadingImage(true);
        let uploadResult;
        try {
          uploadResult = await supabase.storage
            .from(PRODUCT_IMAGE_BUCKET)
            .upload(imagePath, selectedImageFile, {
              cacheControl: "3600",
              contentType: selectedImageFile.type,
              upsert: false,
            });
        } finally {
          setUploadingImage(false);
        }
        if (uploadResult.error) {
          throw new Error(uploadResult.error.message || "The product photo could not be uploaded.");
        }

        const uploadedImagePath = uploadResult.data.path || imagePath;
        uploadedImagePaths.push(uploadedImagePath);
        const publicUrl = supabase.storage
          .from(PRODUCT_IMAGE_BUCKET)
          .getPublicUrl(uploadedImagePath)
          .data.publicUrl;
        if (!publicUrl) {
          throw new Error("The uploaded photo URL could not be created.");
        }
        image = publicUrl;
      }

      const payload = {
        name,
        slug,
        description:
          form.description.trim() || null,
        category,
        price,
        compare_at_price: compareAtPrice,
        sku: form.sku.trim() || null,
        stock_quantity: stock,
        low_stock_threshold: lowStockThreshold,
        image_url: image || null,
        additional_images: additionalImages,
        uk_origin: form.uk_origin.trim() || null,
        featured: Boolean(form.featured),
        best_seller: Boolean(form.best_seller),
        new_arrival: Boolean(form.new_arrival),
        special_offer: Boolean(form.special_offer),
        active: Boolean(form.active),
        updated_at: new Date().toISOString(),
      };

      if (editing) {
        const { error: updateError } =
          await supabase
            .from("products")
            .update(payload)
            .eq("id", id);

        if (updateError) {
          throw updateError;
        }
      } else {
        const { error: insertError } =
          await supabase
            .from("products")
            .insert(payload);

        if (insertError) {
          throw insertError;
        }
      }

      toast({
        variant: "success",
        title: editing ? "Product updated" : "Product created",
        description: `${name} is saved to your product catalogue.`,
      });

      navigate("/admin/products", {
        replace: true,
      });
    } catch (err) {
      if (uploadedImagePaths.length) {
        try {
          const { error: cleanupError } = await supabase.storage
            .from(PRODUCT_IMAGE_BUCKET)
            .remove(uploadedImagePaths);
          if (cleanupError) {
            console.error("Could not clean up unused product photos:", cleanupError);
          }
        } catch (cleanupError) {
          console.error("Could not clean up unused product photos:", cleanupError);
        }
      }
      console.error(
        "Failed to save product:",
        err
      );

      setError(
        err?.message ||
          "Could not save product."
      );
    } finally {
      setSaving(false);
      setUploadingImage(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;

    const confirmed = window.confirm(
      `Delete "${form.name || "this product"}" permanently?`
    );

    if (!confirmed) return;

    setDeleting(true);
    setError("");

    try {
      const { error: deleteError } =
        await supabase
          .from("products")
          .delete()
          .eq("id", id);

      if (deleteError) {
        throw deleteError;
      }

      toast({
        variant: "success",
        title: "Product deleted",
        description: `${form.name || "The product"} has been removed from the catalogue.`,
      });

      navigate("/admin/products", {
        replace: true,
      });
    } catch (err) {
      console.error(
        "Failed to delete product:",
        err
      );

      setError(
        err?.message ||
          "Could not delete product."
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa]">
        <Loader2 className="h-8 w-8 animate-spin text-[#ff1f8f]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#111111]">
      <AdminPageHeader
        backTo="/admin/products"
        backLabel="Back to products"
        title={editing ? "Edit product" : "Add product"}
        description={editing ? "Update the product details, images, and visibility." : "Create a polished product listing for your shop."}
        width="max-w-5xl"
        actions={editing && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleting}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Delete product</span>
            <span className="sm:hidden">Delete</span>
          </button>
        )}
      />

      <main className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-9">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            <p className="font-semibold">
              Please check the form
            </p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Basic information */}
          <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm sm:p-7">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ff1f8f]">
                Step 1
              </p>

              <h2 className="mt-1 text-xl font-bold">
                Product details
              </h2>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field label="Product name">
                <input
                  value={form.name}
                  onChange={(event) =>
                    updateField(
                      "name",
                      event.target.value
                    )
                  }
                  className="admin-input"
                  placeholder="e.g. Cadbury Oreo Snack Box"
                  required
                />
              </Field>

              <Field label="Category">
                <select
                  value={form.category}
                  onChange={(event) =>
                    updateField(
                      "category",
                      event.target.value
                    )
                  }
                  className="admin-input"
                >
                  {categories.map((category) => (
                    <option
                      key={category}
                      value={category}
                    >
                      {category}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Description"
                hint="Tell customers what they are getting."
                className="md:col-span-2"
              >
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    updateField(
                      "description",
                      event.target.value
                    )
                  }
                  className="admin-input min-h-32 resize-y"
                  placeholder="Write a simple product description..."
                />
              </Field>
            </div>
          </section>

          {/* Pricing */}
          <section className="mt-5 rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm sm:p-7">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ff1f8f]">
                Step 2
              </p>

              <h2 className="mt-1 text-xl font-bold">
                Price & stock
              </h2>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Price (GHS)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) =>
                    updateField(
                      "price",
                      event.target.value
                    )
                  }
                  className="admin-input"
                  placeholder="0.00"
                  required
                />
              </Field>

              <Field label="Stock quantity">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(event) =>
                    updateField(
                      "stock",
                      event.target.value
                    )
                  }
                  className="admin-input"
                  placeholder="0"
                  required
                />
              </Field>

              <Field label="Compare-at price (GHS)" hint="Optional original price shown beside the current price.">
                <input type="number" min="0" step="0.01" value={form.compare_at_price} onChange={(event) => updateField("compare_at_price", event.target.value)} className="admin-input" placeholder="Leave blank if not on sale" />
              </Field>

              <Field label="SKU">
                <input value={form.sku} onChange={(event) => updateField("sku", event.target.value)} className="admin-input" maxLength={100} placeholder="Optional stock code" />
              </Field>

              <Field label="Low stock alert threshold">
                <input type="number" min="0" step="1" value={form.low_stock_threshold} onChange={(event) => updateField("low_stock_threshold", event.target.value)} className="admin-input" required />
              </Field>
            </div>
          </section>

          {/* Image */}
          <section className="mt-5 rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm sm:p-7">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ff1f8f]">
                Step 3
              </p>

              <h2 className="mt-1 text-xl font-bold">
                Product image
              </h2>

              <p className="mt-1 text-sm text-black/40">
                Choose a photo from your gallery or use an image URL.
              </p>
            </div>

            <div className="mt-6">
              <div
                role="group"
                aria-label="Product image source"
                className="inline-flex rounded-xl bg-black/[0.04] p-1"
              >
                <button
                  type="button"
                  aria-pressed={imageMode === "gallery"}
                  onClick={() => chooseImageMode("gallery")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${imageMode === "gallery" ? "bg-[#ff1f8f] text-white shadow-sm" : "text-black/55 hover:text-black"}`}
                >
                  Choose from gallery
                </button>
                <button
                  type="button"
                  aria-pressed={imageMode === "url"}
                  onClick={() => chooseImageMode("url")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${imageMode === "url" ? "bg-[#ff1f8f] text-white shadow-sm" : "text-black/55 hover:text-black"}`}
                >
                  Use image URL
                </button>
              </div>

              {imageMode === "gallery" ? (
                <div className="mt-5">
                  <label
                    htmlFor="product-image-file"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-black/75 shadow-sm transition hover:border-[#ff1f8f]/40 hover:text-[#ff1f8f]"
                  >
                    <ImageIcon className="h-4 w-4" />
                    {selectedImageFile ? "Choose a different photo" : "Choose photo"}
                  </label>
                  <input
                    id="product-image-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="sr-only"
                    onChange={handleImageFileChange}
                  />
                  <p className="mt-2 text-xs text-black/40">
                    JPEG, PNG, WebP, or AVIF. Maximum size 5 MB.
                  </p>
                  {selectedImageFile && (
                    <p className="mt-2 truncate text-sm text-black/60">
                      Selected: {selectedImageFile.name}
                    </p>
                  )}
                </div>
              ) : (
                <div className="relative mt-5">
                  <input
                    type="url"
                    value={form.image}
                    aria-label="Product image URL"
                    onChange={(event) => {
                      setSelectedImageFile(null);
                      setSelectedImagePreview("");
                      updateField("image", event.target.value);
                    }}
                    className="admin-input pl-12"
                    placeholder="https://example.com/product-photo.jpg"
                  />
                </div>
              )}

              {(selectedImagePreview || form.image.trim()) && (
                <div className="mt-4 overflow-hidden rounded-2xl border border-black/[0.07] bg-[#fafafa]">
                  <img
                    key={selectedImagePreview || form.image}
                    src={selectedImagePreview || form.image}
                    alt="Product preview"
                    className="h-64 w-full object-contain"
                    onError={(event) => {
                      event.currentTarget.style.display =
                        "none";
                    }}
                  />
                </div>
              )}

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <Field label="Additional image URLs" hint="Add one URL per line, or separate URLs with commas.">
                  <textarea value={form.additional_images} onChange={(event) => updateField("additional_images", event.target.value)} className="admin-input min-h-24 resize-y" placeholder="https://example.com/second-image.jpg" />
                </Field>
                <Field label="Country or origin label" hint="Optional label such as UK-sourced.">
                  <input value={form.uk_origin} onChange={(event) => updateField("uk_origin", event.target.value)} className="admin-input" maxLength={100} placeholder="UK-sourced" />
                </Field>
              </div>
            </div>
          </section>

          {/* Store options */}
          <section className="mt-5 rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm sm:p-7">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ff1f8f]">
                Step 4
              </p>

              <h2 className="mt-1 text-xl font-bold">
                Store visibility
              </h2>

              <p className="mt-1 text-sm text-black/40">
                Choose how this product appears in your shop.
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Toggle
                label="Visible in shop"
                checked={form.active}
                onChange={(value) =>
                  updateField("active", value)
                }
              />

              <Toggle
                label="Featured"
                checked={form.featured}
                onChange={(value) =>
                  updateField(
                    "featured",
                    value
                  )
                }
              />

              <Toggle
                label="Best seller"
                checked={form.best_seller}
                onChange={(value) =>
                  updateField(
                    "best_seller",
                    value
                  )
                }
              />

              <Toggle
                label="New arrival"
                checked={form.new_arrival}
                onChange={(value) =>
                  updateField(
                    "new_arrival",
                    value
                  )
                }
              />

              <Toggle
                label="Special offer"
                checked={form.special_offer}
                onChange={(value) =>
                  updateField(
                    "special_offer",
                    value
                  )
                }
              />
            </div>
          </section>

          {/* Submit */}
          <div className="mt-6">
            <button
              type="submit"
              disabled={saving || deleting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff1f8f] px-5 py-4 text-base font-bold text-white shadow-sm transition hover:bg-[#e60078] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {uploadingImage
                    ? "Uploading photo..."
                    : editing
                    ? "Saving changes..."
                    : "Creating product..."}
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  {editing
                    ? "Save Changes"
                    : "Create Product"}
                </>
              )}
            </button>

            <p className="mt-3 text-center text-xs text-black/35">
              Your product will appear in the shop when it is
              marked as visible.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({
  label,
  hint,
  className = "",
  children,
}) {
  return (
    <label className={`block ${className}`}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-black">
          {label}
        </span>

        {hint && (
          <span className="text-xs text-black/35">
            {hint}
          </span>
        )}
      </div>

      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between rounded-2xl border border-black/[0.07] bg-[#fafafa] p-4 text-left transition hover:border-[#ff1f8f]/40"
    >
      <span className="text-sm font-semibold">
        {label}
      </span>

      <span
        className={`relative h-7 w-12 rounded-full transition ${
          checked
            ? "bg-[#ff1f8f]"
            : "bg-black/15"
        }`}
      >
        <span
          className={`absolute top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition ${
            checked ? "left-6" : "left-1"
          }`}
        >
          {checked && (
            <Check className="h-3 w-3 text-[#ff1f8f]" />
          )}
        </span>
      </span>
    </button>
  );
}
