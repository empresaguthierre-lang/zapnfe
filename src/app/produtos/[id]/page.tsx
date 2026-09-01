import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProductForm } from "@/components/erp/product-form";
import { StockAdjustmentForm } from "@/components/erp/stock-adjustment-form";
import { getCatalogOptions, getProduct } from "@/lib/erp/catalog/queries";
import { getInventoryOptions, getProductStock, getProductReservations } from "@/lib/erp/inventory/queries";
import { ProductStockStatus } from "@/components/erp/product-stock-status";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) { 
  const { id } = await params; 
  const [product, catalog, inventory, stock, reservations] = await Promise.all([
    getProduct(id), 
    getCatalogOptions(), 
    getInventoryOptions(),
    getProductStock(id),
    getProductReservations(id)
  ]); 
  
  if (!product) notFound(); 
  
  return (
    <AppShell active="products" eyebrow={"SKU " + product.sku} title={product.name}>
      {product.trackStock && stock && (
        <ProductStockStatus stock={stock} reservations={reservations} />
      )}
      <ProductForm product={product} categories={catalog.categories} units={catalog.units} />
      {product.trackStock && (
        <StockAdjustmentForm warehouses={inventory.warehouses} products={inventory.products} selectedProduct={product.id} />
      )}
    </AppShell>
  ); 
}
