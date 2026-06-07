export type Role = 'manager' | 'worker' | 'customer'
export type Stage = 'draft' | 'preparation' | 'cutting_printing' | 'finishing' | 'submitted'
export type OrderStatus = 'active' | 'completed' | 'cancelled'

export interface Profile {
  id: string
  email: string
  name: string
  role: Role
  assigned_stage: Stage | null
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  order_number: string
  customer_id: string | null
  customer_name: string
  customer_phone: string | null
  current_stage: Stage
  status: OrderStatus
  created_by: string | null
  created_at: string
  updated_at: string
  profiles?: Profile
}

export interface StageData {
  id: string
  order_id: string
  stage: Stage
  data: Record<string, unknown>
  notes: string | null
  is_completed: boolean
  completed_by: string | null
  completed_at: string | null
  updated_by: string | null
  updated_at: string
}

// Stage-specific data shapes
export interface DraftData {
  fabric_description?: string
  quantity?: number
  size_details?: string
  design_notes?: string
  deadline?: string
}

export interface PreparationData {
  materials_list?: string
  fabric_color?: string
  fabric_quantity?: number
  supplier_name?: string
  estimated_cost?: number
}

export interface CuttingPrintingData {
  cutting_date?: string
  cutting_worker?: string
  printing_type?: string
  printing_details?: string
  pieces_cut?: number
}

export interface FinishingData {
  finishing_type?: string
  ironing?: boolean
  packaging_type?: string
  quality_check?: boolean
  quality_notes?: string
  finishing_worker?: string
}

export interface SubmittedData {
  delivery_date?: string
  delivery_method?: string
  tracking_number?: string
  delivery_address?: string
  received_confirmation?: boolean
}

export interface OrderPhoto {
  id: string
  order_id: string
  file_path: string
  file_name: string
  uploaded_by: string | null
  uploaded_at: string
}

export type MaterialUnit = 'meter' | 'kg' | 'piece'
export type StockMovementType = 'in' | 'out'

export interface Material {
  id: string
  name: string
  code: string
  unit: MaterialUnit
  current_quantity: number
  minimum_quantity: number
  cost_per_unit: number
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type VendorCategory = 'fabric' | 'printing' | 'accessories' | 'other'
export type VendorTransactionType = 'purchase' | 'payment'

export interface Vendor {
  id: string
  name: string
  phone: string | null
  category: VendorCategory
  balance: number
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface VendorTransaction {
  id: string
  vendor_id: string
  type: VendorTransactionType
  amount: number
  notes: string | null
  stock_movement_id: string | null
  created_by: string | null
  created_at: string
  vendors?: Pick<Vendor, 'id' | 'name'>
}

export interface StockMovement {
  id: string
  material_id: string
  type: StockMovementType
  quantity: number
  notes: string | null
  order_id: string | null
  vendor_id: string | null
  created_by: string | null
  created_at: string
  materials?: Pick<Material, 'id' | 'name' | 'code' | 'unit'>
  orders?: { order_number: string }
  vendors?: Pick<Vendor, 'id' | 'name'>
}

export interface OrderMaterial {
  id: string
  order_id: string
  material_id: string
  quantity_needed: number
  is_deducted: boolean
  created_at: string
  materials?: Material
}

export type ExpenseCategory = 'salary' | 'rent' | 'utilities' | 'materials' | 'transport' | 'other'
export type RevenueType = 'sales' | 'delivery_fees' | 'other'

export interface Expense {
  id: string
  date: string
  category: ExpenseCategory
  amount: number
  description: string
  vendor_id: string | null
  month_close_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  vendors?: Pick<Vendor, 'id' | 'name'>
}

export interface Revenue {
  id: string
  date: string
  type: RevenueType
  amount: number
  description: string
  order_id: string | null
  month_close_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  orders?: { order_number: string }
}

export interface MonthClose {
  id: string
  year_month: string
  total_revenue: number
  total_expenses: number
  net_profit: number
  notes: string | null
  closed_by: string | null
  closed_at: string
}

export type RetailerType = 'retail' | 'wholesale'
export type DeliveryStatus = 'pending' | 'out_for_delivery' | 'delivered' | 'returned'

export interface Retailer {
  id: string
  name: string
  phone: string | null
  type: RetailerType
  address: string | null
  balance: number
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SaleItem {
  name: string
  quantity: number
  unit_price: number
  total: number
}

export interface Sale {
  id: string
  invoice_number: string
  date: string
  retailer_id: string
  order_id: string | null
  items: SaleItem[]
  total_amount: number
  delivery_status: DeliveryStatus
  delivery_date: string | null
  delivery_notes: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  retailers?: Pick<Retailer, 'id' | 'name' | 'phone' | 'address'>
  orders?: { order_number: string }
}
