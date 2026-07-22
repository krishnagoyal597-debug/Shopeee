import { supabase } from './supabaseClient';
import type { Family, Profile, GroceryItem } from './types';

// Utility to generate unique family join code (e.g., FAM-AB12CD)
function generateFamilyCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'FAM-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const api = {
  // Profiles
  async getProfile(): Promise<Profile> {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated.');
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || 'Failed to fetch user profile.');
    }

    if (!data) {
      // Self-heal: insert profile if trigger hasn't completed yet
      const displayName =
        user.user_metadata?.full_name ||
        user.user_metadata?.display_name ||
        user.email?.split('@')[0] ||
        'Family Member';

      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          display_name: displayName,
          role: 'member',
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(insertError.message || 'Failed to create user profile.');
      }
      return newProfile;
    }

    return data;
  },

  async updateProfile(updates: { display_name?: string }): Promise<Profile> {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated.');
    }

    const payload: Partial<Profile> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.display_name !== undefined) {
      payload.display_name = updates.display_name.trim();
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to update profile.');
    }
    return data;
  },

  // Families
  async createFamily(name: string, whatsapp_phone?: string): Promise<Family> {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated.');
    }

    const code = generateFamilyCode();

    // 1. Create family entry
    const { data: family, error: famError } = await supabase
      .from('families')
      .insert({
        name: name.trim(),
        code: code,
        created_by: user.id,
        whatsapp_phone: whatsapp_phone ? whatsapp_phone.trim() : null,
      })
      .select()
      .single();

    if (famError) {
      throw new Error(famError.message || 'Failed to create family group.');
    }

    // 2. Link user profile to family as admin
    const { error: profError } = await supabase
      .from('profiles')
      .update({
        family_id: family.id,
        role: 'admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (profError) {
      throw new Error(profError.message || 'Failed to associate profile with family.');
    }

    return family;
  },

  async updateFamily(familyId: string, updates: { name?: string; whatsapp_phone?: string }): Promise<Family> {
    const payload: Record<string, any> = {};
    if (updates.name !== undefined) {
      payload.name = updates.name.trim();
    }
    if (updates.whatsapp_phone !== undefined) {
      payload.whatsapp_phone = updates.whatsapp_phone.trim() || null;
    }

    const { data, error } = await supabase
      .from('families')
      .update(payload)
      .eq('id', familyId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to update family details.');
    }
    return data;
  },

  async joinFamily(code: string): Promise<Profile> {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated.');
    }

    const formattedCode = code.toUpperCase().trim();

    // 1. Search family by code
    const { data: families, error: famError } = await supabase
      .from('families')
      .select('*')
      .eq('code', formattedCode);

    if (famError) {
      throw new Error(famError.message || 'Failed to search for family group.');
    }

    if (!families || families.length === 0) {
      throw new Error('Family group not found with this code. Please verify the code.');
    }

    const family = families[0];

    // 2. Link profile to family as member
    const { data: updatedProfile, error: profError } = await supabase
      .from('profiles')
      .update({
        family_id: family.id,
        role: 'member',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select()
      .single();

    if (profError) {
      throw new Error(profError.message || 'Failed to join family group.');
    }

    return updatedProfile;
  },

  async getFamily(familyId: string): Promise<Family> {
    const { data, error } = await supabase
      .from('families')
      .select('*')
      .eq('id', familyId)
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to fetch family details.');
    }
    return data;
  },

  // Grocery Items
  async getItems(): Promise<GroceryItem[]> {
    const { data, error } = await supabase
      .from('grocery_items')
      .select('*')
      .order('checked', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message || 'Failed to fetch grocery items.');
    }
    return data || [];
  },

  async createItem(item: {
    name: string;
    quantity: string;
    category: string;
    family_id?: string | null;
    is_personal?: boolean;
    added_by_name: string;
  }): Promise<GroceryItem> {
    const { data: { user } } = await supabase.auth.getUser();

    const isPersonal = item.is_personal ?? false;
    const { data, error } = await supabase
      .from('grocery_items')
      .insert({
        family_id: isPersonal ? null : (item.family_id || null),
        is_personal: isPersonal,
        name: item.name.trim(),
        quantity: item.quantity.trim(),
        category: item.category,
        added_by: user?.id || null,
        added_by_name: item.added_by_name,
        checked: false,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to add grocery item.');
    }
    return data;
  },

  async toggleItem(itemId: string, checked: boolean): Promise<GroceryItem> {
    const { data, error } = await supabase
      .from('grocery_items')
      .update({ checked })
      .eq('id', itemId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to update item checked status.');
    }
    return data;
  },

  async deleteItem(itemId: string): Promise<{ success: boolean }> {
    const { error } = await supabase
      .from('grocery_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      throw new Error(error.message || 'Failed to delete grocery item.');
    }
    return { success: true };
  },

  async clearCompleted(familyId?: string | null, isPersonal?: boolean): Promise<{ success: boolean }> {
    const { data: { user } } = await supabase.auth.getUser();

    let query = supabase.from('grocery_items').delete().eq('checked', true);

    if (isPersonal) {
      query = query.eq('is_personal', true).eq('added_by', user?.id || '');
    } else if (familyId) {
      query = query.eq('family_id', familyId).eq('is_personal', false);
    }

    const { error } = await query;

    if (error) {
      throw new Error(error.message || 'Failed to clear completed items.');
    }
    return { success: true };
  },
};
