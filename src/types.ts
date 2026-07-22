export interface Family {
  id: string;
  name: string;
  code: string;
  whatsapp_phone: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Profile {
  id: string;
  family_id: string | null;
  display_name: string;
  role: 'admin' | 'member';
  updated_at: string;
}

export interface CustomList {
  id: string;
  name: string;
  is_personal: boolean;
  family_id?: string | null;
  created_by: string;
  created_at: string;
}

export interface GroceryItem {
  id: string;
  family_id?: string | null;
  list_id?: string | null;
  is_personal?: boolean;
  name: string;
  quantity: string;
  added_by: string | null;
  added_by_name: string;
  checked: boolean;
  category: string;
  created_at: string;
}

export type Category = 
  | 'Vegetables'
  | 'Fruits'
  | 'Dairy & Eggs'
  | 'Pantry & Grains'
  | 'Bakery'
  | 'Snacks & Sweets'
  | 'Household & Cleaning'
  | 'Personal Care'
  | 'Beverages'
  | 'Other';
