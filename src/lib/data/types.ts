export const orderStatuses = ["received", "review", "approved", "invoiced", "completed", "cancelled"] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const orderStatusLabel: Record<OrderStatus, string> = {
  received: "Recebido",
  review: "Conferência",
  approved: "Pronto para faturar",
  invoiced: "Faturado",
  completed: "Finalizado",
  cancelled: "Cancelado",
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  aliases: string[];
  unit: string;
  price: number;
  active: boolean;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  document: string | null;
  active: boolean;
  createdAt: string;
  orderCount: number;
  totalPurchased: number;
};

export type OrderItem = {
  id: string;
  productId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  confidence: number;
  needsReview: boolean;
};

export type OrderSummary = {
  id: string;
  number: number;
  customerName: string;
  customerPhone: string | null;
  createdAt: string;
  status: OrderStatus;
  total: number;
  itemCount: number;
};

export type OrderDetail = {
  id: string;
  number: number;
  customerName: string;
  customerPhone: string | null;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  sourceMessage: string;
  confidence: number;
  discount: number;
  freight: number;
  notes: string;
  items: OrderItem[];
};

export type DashboardData = {
  reviewCount: number;
  approvedCount: number;
  invoicedCount: number;
  invoicedRevenue: number;
  whatsappConnected: boolean;
  recentOrders: OrderSummary[];
};
