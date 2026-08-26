export type OrderStatus = "received" | "review" | "invoiced" | "completed";

export type Product = {
  id: string;
  sku: string;
  name: string;
  aliases: string[];
  unit: string;
  price: number;
  ncm: string | null;
  fiscalReady: boolean;
  active: boolean;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  document: string;
  city: string;
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

export type Order = {
  id: string;
  number: number;
  customerId: string;
  createdAt: string;
  status: OrderStatus;
  sourceMessage: string;
  confidence: number;
  discount: number;
  freight: number;
  notes: string;
  items: OrderItem[];
};

export const products: Product[] = [
  { id: "prod-coca-2l", sku: "COCA-2L-CX", name: "Coca-Cola 2L — caixa com 6", aliases: ["coca 2l", "caixa coca"], unit: "CX", price: 54.9, ncm: "22021000", fiscalReady: true, active: true },
  { id: "prod-coca-lata", sku: "COCA-LATA-FD", name: "Coca-Cola lata 350ml — fardo com 12", aliases: ["coca lata", "fardo lata"], unit: "FD", price: 47.5, ncm: "22021000", fiscalReady: true, active: true },
  { id: "prod-agua", sku: "AGUA-500-FD", name: "Água mineral 500ml — fardo com 12", aliases: ["água", "agua fardo"], unit: "FD", price: 19.9, ncm: "22011000", fiscalReady: true, active: true },
  { id: "prod-guarana", sku: "GUA-2L-CX", name: "Guaraná 2L — caixa com 6", aliases: ["guaraná 2l", "guarana"], unit: "CX", price: 46.8, ncm: "22021000", fiscalReady: false, active: true },
  { id: "prod-energetico", sku: "ENER-269-FD", name: "Energético 269ml — fardo com 6", aliases: ["energético", "energy"], unit: "FD", price: 38, ncm: null, fiscalReady: false, active: true },
  { id: "prod-inativo", sku: "SODA-2L-CX", name: "Soda limonada 2L — caixa com 6", aliases: ["soda"], unit: "CX", price: 39.9, ncm: "22021000", fiscalReady: true, active: false },
];

export const customers: Customer[] = [
  { id: "cli-sao-joao", name: "Mercado São João", phone: "+55 43 99991-1101", document: "12.345.678/0001-10", city: "Londrina/PR", orderCount: 38, totalPurchased: 28412.5 },
  { id: "cli-leste", name: "Distribuidora Leste", phone: "+55 43 99991-2202", document: "23.456.789/0001-21", city: "Cambé/PR", orderCount: 24, totalPurchased: 19807.3 },
  { id: "cli-acores", name: "Comercial Açores", phone: "+55 43 99991-3303", document: "34.567.890/0001-32", city: "Ibiporã/PR", orderCount: 51, totalPurchased: 47220.9 },
  { id: "cli-vale", name: "Atacadão do Vale", phone: "+55 43 99991-4404", document: "45.678.901/0001-43", city: "Rolândia/PR", orderCount: 17, totalPurchased: 12340 },
  { id: "cli-norte", name: "Empório Norte", phone: "+55 43 99991-5505", document: "56.789.012/0001-54", city: "Arapongas/PR", orderCount: 9, totalPurchased: 6844.2 },
];

const baseItems: Record<string, OrderItem[]> = {
  primary: [
    { id: "item-1", productId: "prod-coca-2l", description: "Coca-Cola 2L — caixa com 6", quantity: 5, unit: "CX", unitPrice: 54.9, confidence: 0.98, needsReview: false },
    { id: "item-2", productId: "prod-coca-lata", description: "Coca-Cola lata 350ml — fardo com 12", quantity: 3, unit: "FD", unitPrice: 47.5, confidence: 0.93, needsReview: false },
    { id: "item-3", productId: "prod-agua", description: "Água mineral 500ml — fardo com 12", quantity: 2, unit: "FD", unitPrice: 19.9, confidence: 0.81, needsReview: true },
  ],
  simple: [
    { id: "item-4", productId: "prod-guarana", description: "Guaraná 2L — caixa com 6", quantity: 8, unit: "CX", unitPrice: 46.8, confidence: 0.96, needsReview: false },
    { id: "item-5", productId: "prod-agua", description: "Água mineral 500ml — fardo com 12", quantity: 12, unit: "FD", unitPrice: 19.9, confidence: 0.91, needsReview: false },
  ],
  ambiguous: [
    { id: "item-6", productId: "prod-energetico", description: "Energético 269ml — fardo com 6", quantity: 4, unit: "FD", unitPrice: 38, confidence: 0.72, needsReview: true },
    { id: "item-7", productId: null, description: "Refrigerante zero — produto não identificado", quantity: 2, unit: "CX", unitPrice: 0, confidence: 0.42, needsReview: true },
  ],
};

export const orders: Order[] = [
  { id: "pedido-1048", number: 1048, customerId: "cli-sao-joao", createdAt: "2026-08-26T11:42:00-03:00", status: "review", sourceMessage: "Me manda 5 caixas da Coca 2L, 3 fardos da lata e 2 águas. Pode entregar amanhã cedo.", confidence: 0.91, discount: 10, freight: 25, notes: "Entregar antes das 10h.", items: baseItems.primary },
  { id: "pedido-1047", number: 1047, customerId: "cli-leste", createdAt: "2026-08-26T11:18:00-03:00", status: "received", sourceMessage: "Preciso de 8 caixas de guaraná e 12 fardos de água.", confidence: 0.94, discount: 0, freight: 18, notes: "", items: baseItems.simple },
  { id: "pedido-1046", number: 1046, customerId: "cli-acores", createdAt: "2026-08-26T10:31:00-03:00", status: "invoiced", sourceMessage: "Repete o pedido de energético e manda duas caixas de refri zero.", confidence: 0.58, discount: 0, freight: 0, notes: "Conferido por Maria.", items: baseItems.ambiguous },
  { id: "pedido-1045", number: 1045, customerId: "cli-vale", createdAt: "2026-08-26T09:57:00-03:00", status: "completed", sourceMessage: "Cinco coca 2 litros e cinco água.", confidence: 0.88, discount: 15, freight: 20, notes: "Entregue.", items: baseItems.primary.slice(0, 2) },
  { id: "pedido-1044", number: 1044, customerId: "cli-norte", createdAt: "2026-08-26T09:20:00-03:00", status: "review", sourceMessage: "4 energético, por favor.", confidence: 0.74, discount: 0, freight: 15, notes: "", items: baseItems.ambiguous.slice(0, 1) },
  { id: "pedido-1043", number: 1043, customerId: "cli-sao-joao", createdAt: "2026-08-26T08:45:00-03:00", status: "received", sourceMessage: "Manda 10 caixas de coca 2L.", confidence: 0.99, discount: 20, freight: 0, notes: "Retirada no balcão.", items: baseItems.primary.slice(0, 1).map((item) => ({ ...item, id: "item-8", quantity: 10 })) },
];

export const orderStatusLabel: Record<OrderStatus, string> = {
  received: "Recebido",
  review: "Conferência",
  invoiced: "Faturado",
  completed: "Finalizado",
};

export function orderSubtotal(order: Pick<Order, "items">) {
  return order.items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
}

export function orderTotal(order: Pick<Order, "items" | "discount" | "freight">) {
  return Math.max(0, orderSubtotal(order) - order.discount + order.freight);
}

export function customerForOrder(order: Pick<Order, "customerId">) {
  return customers.find((customer) => customer.id === order.customerId) ?? null;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
