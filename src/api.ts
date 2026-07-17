import { supabase } from './supabaseClient';
import type { Family, Profile, GroceryItem } from './types';

const API_BASE_URL = 'http://localhost:8000/api';

// Helper to get headers with the Bearer JWT token
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

export const api = {
  // Profiles
  async getProfile(): Promise<Profile> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/profiles/me`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to fetch user profile.');
    }
    return response.json();
  },

  async updateProfile(updates: { display_name?: string }): Promise<Profile> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/profiles/me`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to update profile.');
    }
    return response.json();
  },

  // Families
  async createFamily(name: string, whatsapp_phone?: string): Promise<Family> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/families`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, whatsapp_phone }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to create family group.');
    }
    return response.json();
  },

  async updateFamily(familyId: string, updates: { name?: string; whatsapp_phone?: string }): Promise<Family> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/families/${familyId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to update family details.');
    }
    return response.json();
  },

  async joinFamily(code: string): Promise<Profile> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/families/join`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to join family group.');
    }
    return response.json();
  },

  async getFamily(familyId: string): Promise<Family> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/families/${familyId}`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to fetch family details.');
    }
    return response.json();
  },

  // Grocery Items
  async getItems(): Promise<GroceryItem[]> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/items`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to fetch grocery items.');
    }
    return response.json();
  },

  async createItem(item: {
    name: string;
    quantity: string;
    category: string;
    family_id: string;
    added_by_name: string;
  }): Promise<GroceryItem> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify(item),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to add grocery item.');
    }
    return response.json();
  },

  async toggleItem(itemId: string, checked: boolean): Promise<GroceryItem> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/items/${itemId}/toggle`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ checked }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to update item checked status.');
    }
    return response.json();
  },

  async deleteItem(itemId: string): Promise<{ success: boolean }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/items/${itemId}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to delete grocery item.');
    }
    return response.json();
  },

  async clearCompleted(familyId: string): Promise<{ success: boolean }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/items/completed/${familyId}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to clear completed items.');
    }
    return response.json();
  },
};
