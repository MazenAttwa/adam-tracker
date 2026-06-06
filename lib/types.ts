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
