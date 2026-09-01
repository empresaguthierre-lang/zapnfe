import { AppShell } from "@/components/app-shell";
import { ProductForm } from "@/components/erp/product-form";
import { getCatalogOptions } from "@/lib/erp/catalog/queries";

export const dynamic = "force-dynamic";
export default async function NewProductPage() { const options = await getCatalogOptions(); return <AppShell active="products" eyebrow="Catálogo" title="Novo produto"><ProductForm categories={options.categories} units={options.units} /></AppShell>; }

