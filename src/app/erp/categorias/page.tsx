import { AppShell } from "@/components/app-shell";
import { CategoryManager } from "@/components/erp/category-manager";
import { listCategories } from "@/lib/erp/catalog/queries";

export const dynamic = "force-dynamic";
export default async function CategoriesPage() { const categories = await listCategories(); return <AppShell active="erp-categories" eyebrow="Catálogo" title="Categorias"><CategoryManager categories={categories} /></AppShell>; }
