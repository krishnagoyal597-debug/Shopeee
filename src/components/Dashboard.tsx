import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import type { 
  Family, Profile, GroceryItem, Category, CustomList 
} from '../types';
import { api } from '../api';
import { 
  Plus, Check, Trash2, Send, Copy, 
  RefreshCw, LogOut, ShoppingBasket, ShoppingBag, 
  ListTodo, User, Users, ShieldAlert, Pencil, X
} from 'lucide-react';

interface DashboardProps {
  profile: Profile;
  onLogout: () => void;
}

const CATEGORIES: Category[] = [
  'Vegetables',
  'Fruits',
  'Dairy & Eggs',
  'Pantry & Grains',
  'Bakery',
  'Snacks & Sweets',
  'Household & Cleaning',
  'Personal Care',
  'Beverages',
  'Other'
];

const QUICK_ITEMS = [
  { name: 'Milk', category: 'Dairy & Eggs', quantity: '2 Packs' },
  { name: 'Eggs', category: 'Dairy & Eggs', quantity: '1 Dozen' },
  { name: 'Bread', category: 'Bakery', quantity: '1 Pack' },
  { name: 'Potatoes', category: 'Vegetables', quantity: '1 kg' },
  { name: 'Tomatoes', category: 'Vegetables', quantity: '1 kg' },
  { name: 'Onions', category: 'Vegetables', quantity: '1 kg' },
  { name: 'Sugar', category: 'Pantry & Grains', quantity: '1 kg' },
  { name: 'Tea', category: 'Beverages', quantity: '1 Pack' },
  { name: 'Detergent', category: 'Household & Cleaning', quantity: '1 Pack' },
  { name: 'Soap', category: 'Personal Care', quantity: '3 pcs' },
];

export const Dashboard: React.FC<DashboardProps> = ({ profile, onLogout }) => {
  const [family, setFamily] = useState<Family | null>(null);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [itemName, setItemName] = useState('');
  const [qtyValue, setQtyValue] = useState('1');
  const [qtyUnit, setQtyUnit] = useState('kg');
  const [itemCategory, setItemCategory] = useState<Category>('Vegetables');

  // Partition state (family vs personal)
  const [listTab, setListTab] = useState<'family' | 'personal'>('family');

  // Custom Lists state
  const [customLists, setCustomLists] = useState<CustomList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null); // null = Main List
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Filter states
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Copy code feedback state
  const [copiedCode, setCopiedCode] = useState(false);

  // WhatsApp states
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [newPhoneValue, setNewPhoneValue] = useState('');
  const [updatingPhone, setUpdatingPhone] = useState(false);

  // Fetch Family Details
  const fetchFamilyDetails = useCallback(async () => {
    if (!profile.family_id) return;
    try {
      const data = await api.getFamily(profile.family_id);
      setFamily(data);
      setNewPhoneValue(data.whatsapp_phone || '');
    } catch (err: any) {
      console.error('Error fetching family details:', err);
      setError('Could not load family group details.');
    }
  }, [profile.family_id]);

  const handleUpdatePhone = async () => {
    if (!family) return;
    setUpdatingPhone(true);
    setError(null);
    try {
      const updatedFamily = await api.updateFamily(family.id, {
        whatsapp_phone: newPhoneValue.trim()
      });
      setFamily(updatedFamily);
      setIsEditingPhone(false);
    } catch (err: any) {
      console.error('Error updating phone:', err);
      setError(err.message || 'Failed to update WhatsApp phone number.');
    } finally {
      setUpdatingPhone(false);
    }
  };

  // Fetch Grocery Items
  const fetchItems = useCallback(async () => {
    try {
      const data = await api.getItems();
      setItems(data || []);
    } catch (err: any) {
      console.error('Error fetching items:', err);
      setError('Failed to fetch grocery list items.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Custom Lists
  const fetchCustomLists = useCallback(async () => {
    try {
      const data = await api.getCustomLists();
      setCustomLists(data || []);
    } catch (err: any) {
      console.error('Error fetching custom lists:', err);
    }
  }, []);

  // On mount, load data & set up real-time listener
  useEffect(() => {
    if (profile.family_id) {
      fetchFamilyDetails();
    }
    fetchItems();
    fetchCustomLists();

    // Realtime subscription for items
    const channelItems = supabase
      .channel('grocery-changes-all')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'grocery_items',
        },
        () => {
          fetchItems();
        }
      )
      .subscribe();

    // Realtime subscription for custom lists
    const channelLists = supabase
      .channel('custom-lists-changes-all')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'custom_lists',
        },
        () => {
          fetchCustomLists();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelItems);
      supabase.removeChannel(channelLists);
    };
  }, [profile.family_id, fetchFamilyDetails, fetchItems, fetchCustomLists]);

  // Copy family invite code
  const copyInviteCode = () => {
    if (!family) return;
    navigator.clipboard.writeText(family.code);
    setCopiedCode(true);
    setTimeout(() => {
      setCopiedCode(false);
    }, 2000);
  };

  // Create custom named list
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    const isPersonal = listTab === 'personal';
    if (!isPersonal && !profile.family_id) return;

    setActionLoading('create-list');
    try {
      const newList = await api.createCustomList(
        newListName.trim(),
        isPersonal,
        isPersonal ? null : profile.family_id
      );
      setCustomLists(prev => [...prev, newList]);
      setActiveListId(newList.id);
      setNewListName('');
      setIsCreatingList(false);
    } catch (err: any) {
      console.error('Error creating custom list:', err);
      setError(err.message || 'Failed to create new list.');
    } finally {
      setActionLoading(null);
    }
  };

  // Delete custom list
  const handleDeleteList = async (listId: string, listName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${listName}" and all its items?`)) return;

    setActionLoading(`delete-list-${listId}`);
    try {
      await api.deleteCustomList(listId);
      setCustomLists(prev => prev.filter(l => l.id !== listId));
      if (activeListId === listId) {
        setActiveListId(null);
      }
    } catch (err: any) {
      console.error('Error deleting list:', err);
      setError(err.message || 'Failed to delete list.');
    } finally {
      setActionLoading(null);
    }
  };

  // Add a new grocery item
  const handleAddItem = async (e?: React.FormEvent, nameOverride?: string, qtyOverride?: string, catOverride?: Category) => {
    if (e) e.preventDefault();

    const name = nameOverride || itemName;
    const qty = qtyOverride || `${qtyValue} ${qtyUnit}`;
    const cat = catOverride || itemCategory;

    if (!name.trim()) return;
    const isPersonal = listTab === 'personal';
    if (!isPersonal && !profile.family_id) return;

    setActionLoading('add');
    try {
      await api.createItem({
        family_id: isPersonal ? null : profile.family_id,
        list_id: activeListId,
        is_personal: isPersonal,
        name: name.trim(),
        quantity: qty.trim(),
        category: cat,
        added_by_name: profile.display_name,
      });

      // Reset form if it was a manual input submit
      if (!nameOverride) {
        setItemName('');
        setQtyValue('1');
        setQtyUnit('kg');
        setItemCategory('Vegetables');
      }
    } catch (err: any) {
      console.error('Error adding item:', err);
      setError('Failed to add item. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle item checked state
  const handleToggleCheck = async (item: GroceryItem) => {
    setActionLoading(`check-${item.id}`);
    try {
      await api.toggleItem(item.id, !item.checked);
    } catch (err: any) {
      console.error('Error updating item checked:', err);
      setError('Failed to update item.');
    } finally {
      setActionLoading(null);
    }
  };

  // Delete item
  const handleDeleteItem = async (itemId: string) => {
    setActionLoading(`delete-${itemId}`);
    try {
      await api.deleteItem(itemId);
    } catch (err: any) {
      console.error('Error deleting item:', err);
      setError('Failed to delete item.');
    } finally {
      setActionLoading(null);
    }
  };

  // Clear completed items
  const handleClearCompleted = async () => {
    const isPersonal = listTab === 'personal';
    const activeCustomList = customLists.find(l => l.id === activeListId);
    const listLabel = activeCustomList ? activeCustomList.name : (isPersonal ? 'personal main' : 'family main');
    if (!window.confirm(`Are you sure you want to delete all completed items in "${listLabel}"?`)) return;
    if (!isPersonal && !profile.family_id) return;
    setActionLoading('clear-completed');
    try {
      await api.clearCompleted(profile.family_id, isPersonal, activeListId);
    } catch (err: any) {
      console.error('Error clearing completed items:', err);
      setError('Failed to clear completed items.');
    } finally {
      setActionLoading(null);
    }
  };

  // Generate and send list via WhatsApp
  const handleSendWhatsApp = () => {
    if (!family) return;

    const pendingItems = items.filter(i => !i.checked);
    const completedItems = items.filter(i => i.checked);

    if (items.length === 0) {
      alert('The grocery list is empty! Add some items before sending.');
      return;
    }

    const today = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    let messageText = `🧺 *SHARED FAMILY GROCERY LIST*\n`;
    messageText += `🏡 *Family:* ${family.name}\n`;
    messageText += `📅 *Date:* ${today}\n`;
    messageText += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (pendingItems.length > 0) {
      messageText += `🚨 *PENDING ITEMS (${pendingItems.length}):*\n`;
      pendingItems.forEach(item => {
        messageText += `• ${item.name} (${item.quantity}) - _${item.category}_ [Added by ${item.added_by_name}]\n`;
      });
      messageText += `\n`;
    } else {
      messageText += `🎉 *No pending items! All clear.*\n\n`;
    }

    if (completedItems.length > 0) {
      messageText += `✅ *COMPLETED ITEMS (${completedItems.length}):*\n`;
      completedItems.forEach(item => {
        messageText += `✓ ~${item.name} (${item.quantity})~ [Added by ${item.added_by_name}]\n`;
      });
      messageText += `\n`;
    }

    messageText += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    messageText += `📲 _Managed via Family Groceries Website_`;

    // Clean the phone number (keep only digits)
    const rawNumber = family.whatsapp_phone || '7240717609';
    let cleanNumber = rawNumber.replace(/\D/g, '');
    
    // If it's a 10-digit number, assume India country code (91) by default
    if (cleanNumber.length === 10) {
      cleanNumber = '91' + cleanNumber;
    }

    if (!cleanNumber) {
      alert('Invalid WhatsApp phone number. Please update it first.');
      return;
    }

    const encodedText = encodeURIComponent(messageText);
    const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodedText}`;
    
    // Open in new tab
    window.open(whatsappUrl, '_blank');
  };

  // 1. Partition Items (Family vs Personal)
  const partitionItems = items.filter(item => {
    if (listTab === 'personal') {
      return item.is_personal === true;
    } else {
      return !item.is_personal;
    }
  });

  // 2. Active List Items (filter by active custom list or main list)
  const activeTabItems = partitionItems.filter(item => {
    if (activeListId) {
      return item.list_id === activeListId;
    } else {
      return !item.list_id;
    }
  });

  // Filter & Group calculations
  const filteredItems = activeTabItems.filter(item => {
    const matchesStatus = 
      statusFilter === 'all' ? true :
      statusFilter === 'pending' ? !item.checked :
      item.checked;

    const matchesCategory =
      categoryFilter === 'all' ? true :
      item.category === categoryFilter;

    return matchesStatus && matchesCategory;
  });

  const pendingCount = activeTabItems.filter(i => !i.checked).length;
  const completedCount = activeTabItems.filter(i => i.checked).length;
  const totalCount = activeTabItems.length;

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'Vegetables': return 'badge-vegetables';
      case 'Fruits': return 'badge-fruits';
      case 'Dairy & Eggs': return 'badge-dairy';
      case 'Pantry & Grains': return 'badge-pantry';
      case 'Bakery': return 'badge-bakery';
      case 'Snacks & Sweets': return 'badge-snacks';
      case 'Household & Cleaning': return 'badge-household';
      case 'Personal Care': return 'badge-personal';
      case 'Beverages': return 'badge-beverages';
      default: return 'badge-other';
    }
  };

  return (
    <div style={styles.container} className="animate-fade-in">
      
      {/* 1. Header Section */}
      <header className="glass-card" style={styles.header}>
        <div style={styles.headerInfo}>
          <ShoppingBasket size={32} style={styles.logoIcon} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h1 style={styles.familyName}>{family ? family.name : 'Family'} Groceries 🏡</h1>
              {family && (
                <div style={styles.inviteBox}>
                  <span style={styles.inviteLabel}>Code:</span>
                  <code style={styles.inviteCode}>{family.code}</code>
                  <button 
                    onClick={copyInviteCode} 
                    style={styles.copyBtn} 
                    title="Copy family code to invite members"
                  >
                    {copiedCode ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                    {copiedCode ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
            <p style={styles.memberMeta}>
              <User size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
              Signed in as <strong>{profile.display_name}</strong> ({profile.role})
            </p>
          </div>
        </div>

        <div style={styles.headerActions}>
          <button onClick={onLogout} className="btn-secondary" style={styles.logoutBtn}>
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </header>

      {error && (
        <div style={styles.errorAlert}>
          <ShieldAlert size={18} />
          <span>{error}</span>
          <button style={styles.dismissAlert} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* 1.5. Partition / Tab Switcher Bar */}
      <div style={styles.partitionContainer} className="glass-card">
        <button
          style={{
            ...styles.partitionTab,
            ...(listTab === 'family' ? styles.partitionTabActive : {})
          }}
          onClick={() => {
            setListTab('family');
            setActiveListId(null);
            setIsCreatingList(false);
          }}
        >
          <Users size={18} />
          <span>Family List</span>
          <span style={styles.partitionBadge}>
            {items.filter(i => !i.is_personal).length}
          </span>
        </button>

        <button
          style={{
            ...styles.partitionTab,
            ...(listTab === 'personal' ? styles.partitionTabActive : {})
          }}
          onClick={() => {
            setListTab('personal');
            setActiveListId(null);
            setIsCreatingList(false);
          }}
        >
          <User size={18} />
          <span>Personal List</span>
          <span style={styles.partitionBadge}>
            {items.filter(i => i.is_personal).length}
          </span>
        </button>
      </div>

      {/* 1.6. Sub-List Selector Bar (Named Lists) */}
      <div style={styles.subListBar}>
        <div style={styles.subListPills}>
          {/* Main List Pill */}
          <button
            style={{
              ...styles.subListPill,
              ...(activeListId === null ? styles.subListPillActive : {})
            }}
            onClick={() => setActiveListId(null)}
          >
            📋 Main List ({partitionItems.filter(i => !i.list_id).length})
          </button>

          {/* Custom Named Lists */}
          {customLists
            .filter(l => (listTab === 'personal' ? l.is_personal : !l.is_personal))
            .map(list => {
              const count = partitionItems.filter(i => i.list_id === list.id).length;
              const isActive = activeListId === list.id;
              return (
                <div key={list.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <button
                    style={{
                      ...styles.subListPill,
                      ...(isActive ? styles.subListPillActive : {}),
                      paddingRight: '6px'
                    }}
                    onClick={() => setActiveListId(list.id)}
                  >
                    📑 {list.name} ({count})
                  </button>
                  <button
                    style={styles.deleteListBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteList(list.id, list.name);
                    }}
                    title="Delete custom list"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}

          {/* + New List Form / Button */}
          {isCreatingList ? (
            <form onSubmit={handleCreateList} style={styles.inlineCreateListForm}>
              <input
                type="text"
                placeholder="List Name (e.g. Party Snacks)"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                style={styles.inlineCreateInput}
                autoFocus
                required
              />
              <button type="submit" style={styles.inlineSaveBtn} disabled={actionLoading === 'create-list'}>
                Save
              </button>
              <button
                type="button"
                style={styles.inlineCancelBtn}
                onClick={() => {
                  setIsCreatingList(false);
                  setNewListName('');
                }}
              >
                <X size={14} />
              </button>
            </form>
          ) : (
            <button
              style={styles.newListPillBtn}
              onClick={() => setIsCreatingList(true)}
            >
              <Plus size={14} /> New List
            </button>
          )}
        </div>
      </div>

      {/* 2. Grid Content */}
      <div style={styles.grid}>
        
        {/* LEFT COLUMN: Controls & Add items */}
        <div style={styles.leftColumn}>
          
          {/* A. Statistics Card */}
          <div className="glass-card" style={styles.statsCard}>
            <h3 style={styles.sectionTitle}>Dashboard Stats</h3>
            <div style={styles.statsRow}>
              <div style={styles.statBox}>
                <span style={styles.statVal}>{pendingCount}</span>
                <span style={styles.statLabel}>Pending</span>
              </div>
              <div style={styles.statBox}>
                <span style={{ ...styles.statVal, color: '#34d399' }}>{completedCount}</span>
                <span style={styles.statLabel}>Completed</span>
              </div>
              <div style={styles.statBox}>
                <span style={{ ...styles.statVal, color: '#60a5fa' }}>{totalCount}</span>
                <span style={styles.statLabel}>Total Items</span>
              </div>
            </div>
          </div>

          {/* B. Add Item Form */}
          <div className="glass-card">
            <h3 style={styles.sectionTitle}>Add {listTab === 'family' ? 'Family' : 'Personal'} Grocery Item</h3>
            <form onSubmit={(e) => handleAddItem(e)} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Item Name</label>
                <input
                  type="text"
                  placeholder="e.g. Tomatoes, Fresh Bread, Milk"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  required
                />
              </div>

              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 0.8 }}>
                  <label style={styles.label}>Qty</label>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={qtyValue}
                    onChange={(e) => setQtyValue(e.target.value)}
                    required
                  />
                </div>
                <div style={{ ...styles.formGroup, flex: 1.2 }}>
                  <label style={styles.label}>Unit</label>
                  <select
                    value={qtyUnit}
                    onChange={(e) => setQtyUnit(e.target.value)}
                  >
                    <option value="kg">kg</option>
                    <option value="no.">no.</option>
                    <option value="ltr">ltr</option>
                    <option value="packet">packet</option>
                    <option value="g">g</option>
                    <option value="dozen">dozen</option>
                  </select>
                </div>
                <div style={{ ...styles.formGroup, flex: 2 }}>
                  <label style={styles.label}>Category</label>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value as Category)}
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button 
                type="submit" 
                className="btn-primary" 
                style={styles.addBtn}
                disabled={actionLoading === 'add'}
              >
                {actionLoading === 'add' ? (
                  <RefreshCw size={18} className="animate-spin" />
                ) : (
                  <Plus size={18} />
                )}
                Add to {listTab === 'family' ? 'Family' : 'Personal'} List
              </button>
            </form>
          </div>

          {/* C. Quick Add Pills */}
          <div className="glass-card">
            <h3 style={styles.sectionTitle}>Quick-Add Items</h3>
            <p style={styles.subText}>Frequently bought items. Tap to add instantly.</p>
            <div style={styles.quickGrid}>
              {QUICK_ITEMS.map((item, idx) => (
                <button
                  key={idx}
                  className="quick-pill"
                  onClick={() => handleAddItem(undefined, item.name, item.quantity, item.category as Category)}
                  disabled={actionLoading !== null}
                >
                  + {item.name} <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>({item.quantity})</span>
                </button>
              ))}
            </div>
          </div>

          {/* D. WhatsApp Dispatch Panel */}
          <div className="glass-card" style={styles.whatsappCard}>
            <div style={styles.whatsappHeader}>
              <Send size={22} color="#10b981" />
              <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Send to WhatsApp</h3>
            </div>
            
            {isEditingPhone ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                <label style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>WhatsApp Phone Number</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={newPhoneValue}
                    placeholder="e.g. 917240717609"
                    onChange={(e) => setNewPhoneValue(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.85rem'
                    }}
                    disabled={updatingPhone}
                  />
                  <button 
                    onClick={handleUpdatePhone}
                    disabled={updatingPhone}
                    style={{
                      padding: '6px 12px',
                      background: '#10b981',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '0.85rem'
                    }}
                  >
                    {updatingPhone ? 'Saving...' : 'Save'}
                  </button>
                  <button 
                    onClick={() => {
                      setIsEditingPhone(false);
                      setNewPhoneValue(family?.whatsapp_phone || '');
                    }}
                    disabled={updatingPhone}
                    style={{
                      padding: '6px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Include country code (e.g. 91 for India).
                </span>
              </div>
            ) : (
              <div style={{ marginBottom: '12px' }}>
                <p style={{ ...styles.subText, margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span>Family WhatsApp number:</span> 
                  <strong>{family?.whatsapp_phone || '8302048382'}</strong>
                  {(
                    <button
                      onClick={() => setIsEditingPhone(true)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#2dd4bf',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        fontSize: '0.75rem',
                        transition: 'opacity 0.2s',
                      }}
                      title="Edit WhatsApp number"
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  )}
                </p>
                {!family?.whatsapp_phone && (
                  <span style={{ fontSize: '0.75rem', color: '#f59e0b', display: 'block', marginBottom: '8px' }}>
                    ⚠️ Using default number. Add a custom number for your group.
                  </span>
                )}
              </div>
            )}

            <button 
              onClick={handleSendWhatsApp} 
              className="btn-primary" 
              style={styles.whatsappBtn}
            >
              <Send size={16} />
              Dispatch Grocery List
            </button>
          </div>

        </div>

        {/* RIGHT COLUMN: Checklist display */}
        <div style={styles.rightColumn}>
          
          <div className="glass-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            
            {/* List Controls & Filters */}
            <div style={styles.filterSection}>
              <div style={styles.listTitleContainer}>
                <ListTodo size={22} color="#2dd4bf" />
                <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Shared Grocery Checklist</h3>
              </div>

              <div style={styles.filtersWrapper}>
                {/* Status Filter */}
                <div style={styles.filterGroup}>
                  <span style={styles.filterLabel}>Status:</span>
                  <div style={styles.filterTabs}>
                    <button 
                      style={{ ...styles.filterTabBtn, ...(statusFilter === 'all' ? styles.activeFilterTab : {}) }}
                      onClick={() => setStatusFilter('all')}
                    >
                      All
                    </button>
                    <button 
                      style={{ ...styles.filterTabBtn, ...(statusFilter === 'pending' ? styles.activeFilterTab : {}) }}
                      onClick={() => setStatusFilter('pending')}
                    >
                      Pending ({pendingCount})
                    </button>
                    <button 
                      style={{ ...styles.filterTabBtn, ...(statusFilter === 'completed' ? styles.activeFilterTab : {}) }}
                      onClick={() => setStatusFilter('completed')}
                    >
                      Completed
                    </button>
                  </div>
                </div>

                {/* Category Filter */}
                <div style={styles.filterGroup}>
                  <span style={styles.filterLabel}>Category:</span>
                  <select 
                    style={styles.categoryDropdown}
                    value={categoryFilter} 
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="all">All Categories</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Checklist Items Container */}
            <div style={styles.itemsListContainer}>
              {loading ? (
                <div style={styles.loadingContainer}>
                  <RefreshCw className="animate-spin" size={24} style={styles.spinIcon} />
                  <p>Syncing family list...</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div style={styles.emptyContainer}>
                  <ShoppingBag size={48} style={styles.emptyIcon} />
                  <p style={styles.emptyText}>No items found in this filter.</p>
                  <p style={styles.emptySubText}>Add some items above to share them with your family!</p>
                </div>
              ) : (
                <div style={styles.itemsStack}>
                  {filteredItems.map(item => (
                    <div 
                      key={item.id} 
                      style={{
                        ...styles.itemRow,
                        ...(item.checked ? styles.itemRowChecked : {})
                      }}
                    >
                      {/* Checkbox */}
                      <label className="checkbox-container" style={{ margin: 0 }}>
                        <input 
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => handleToggleCheck(item)}
                          disabled={actionLoading !== null}
                        />
                        <span className="checkmark"></span>
                        <div style={styles.itemTextContainer}>
                          <span style={{
                            ...styles.itemName,
                            ...(item.checked ? styles.itemNameChecked : {})
                          }}>
                            {item.name}
                          </span>
                          <span style={styles.itemQty}>{item.quantity}</span>
                        </div>
                      </label>

                      {/* Right Details */}
                      <div style={styles.itemMeta}>
                        <span className={`badge ${getCategoryBadgeClass(item.category)}`}>
                          {item.category}
                        </span>
                        
                        <span style={styles.addedByLabel}>
                          Added by: <strong>{item.added_by_name}</strong>
                        </span>

                        <button 
                          onClick={() => handleDeleteItem(item.id)}
                          style={styles.deleteBtn}
                          disabled={actionLoading !== null}
                          title="Delete item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer buttons for checklist */}
            {completedCount > 0 && (
              <div style={styles.checklistFooter}>
                <button 
                  className="btn-danger" 
                  style={styles.clearBtn}
                  onClick={handleClearCompleted}
                  disabled={actionLoading !== null}
                >
                  <Trash2 size={14} />
                  Clear Completed Items
                </button>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
    minHeight: '90vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
    marginBottom: '24px',
  },
  headerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logoIcon: {
    color: '#2dd4bf',
  },
  familyName: {
    fontSize: '1.75rem',
    fontWeight: '700',
    letterSpacing: '-0.02em',
  },
  memberMeta: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    marginTop: '2px',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  inviteBox: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(15, 23, 42, 0.6)',
    padding: '6px 12px',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    gap: '8px',
  },
  inviteLabel: {
    fontSize: '0.8rem',
    color: '#94a3b8',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  inviteCode: {
    fontSize: '0.95rem',
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: '0.05em',
  },
  copyBtn: {
    background: 'rgba(255, 255, 255, 0.05)',
    padding: '4px 8px',
    fontSize: '0.75rem',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
    color: '#cbd5e1',
  },
  logoutBtn: {
    padding: '8px 16px',
    fontSize: '0.9rem',
  },
  errorAlert: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#f87171',
    borderRadius: '12px',
    padding: '12px 16px',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '0.95rem',
    position: 'relative',
  },
  dismissAlert: {
    position: 'absolute',
    right: '12px',
    background: 'transparent',
    border: 'none',
    color: '#cbd5e1',
    fontSize: '1rem',
    padding: '4px',
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: '24px',
    alignItems: 'start',
  },
  leftColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  rightColumn: {
    minHeight: '500px',
  },
  sectionTitle: {
    fontSize: '1.15rem',
    fontWeight: '600',
    marginBottom: '16px',
    color: '#f8fafc',
  },
  subText: {
    color: '#94a3b8',
    fontSize: '0.85rem',
    marginBottom: '12px',
  },
  statsCard: {
    background: 'rgba(15, 23, 42, 0.3)',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  statBox: {
    background: 'rgba(15, 23, 42, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '10px',
    padding: '12px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  statVal: {
    fontSize: '1.75rem',
    fontWeight: '700',
    color: '#f8fafc',
  },
  statLabel: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginTop: '2px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  formRow: {
    display: 'flex',
    gap: '12px',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: '500',
    color: '#cbd5e1',
  },
  addButton: {
    width: '100%',
    marginTop: '8px',
  },
  quickGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  whatsappCard: {
    borderLeft: '4px solid #10b981',
  },
  whatsappHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  whatsappBtn: {
    width: '100%',
    background: '#10b981',
    boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.25)',
  },
  filterSection: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    paddingBottom: '20px',
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  listTitleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  filtersWrapper: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  filterLabel: {
    fontSize: '0.8rem',
    color: '#94a3b8',
  },
  filterTabs: {
    display: 'flex',
    background: 'rgba(15, 23, 42, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    padding: '2px',
  },
  filterTabBtn: {
    padding: '6px 12px',
    fontSize: '0.8rem',
    borderRadius: '6px',
    background: 'transparent',
    color: '#94a3b8',
    fontWeight: '500',
    transition: 'all 0.2s ease',
  },
  activeFilterTab: {
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#f8fafc',
  },
  categoryDropdown: {
    padding: '8px 12px',
    fontSize: '0.85rem',
    width: '180px',
  },
  itemsListContainer: {
    flex: 1,
    overflowY: 'auto',
    maxHeight: '520px',
    paddingRight: '4px',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
    color: '#94a3b8',
    gap: '10px',
  },
  spinIcon: {
    color: '#2dd4bf',
  },
  emptyContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    textAlign: 'center',
  },
  emptyIcon: {
    color: '#334155',
    marginBottom: '16px',
  },
  emptyText: {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: '#cbd5e1',
  },
  emptySubText: {
    fontSize: '0.85rem',
    color: '#64748b',
    marginTop: '4px',
    maxWidth: '280px',
  },
  itemsStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    borderRadius: '12px',
    padding: '12px 16px',
    transition: 'all 0.2s ease',
  },
  itemRowChecked: {
    background: 'rgba(15, 23, 42, 0.3)',
    borderColor: 'transparent',
    opacity: 0.7,
  },
  itemTextContainer: {
    display: 'inline-flex',
    flexDirection: 'column',
    marginLeft: '8px',
    verticalAlign: 'middle',
  },
  itemName: {
    fontWeight: '600',
    fontSize: '1rem',
    color: '#f8fafc',
  },
  itemNameChecked: {
    textDecoration: 'line-through',
    color: '#64748b',
  },
  itemQty: {
    fontSize: '0.8rem',
    color: '#94a3b8',
    marginTop: '2px',
  },
  itemMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  addedByLabel: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    padding: '6px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  checklistFooter: {
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    paddingTop: '16px',
    marginTop: '16px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  clearBtn: {
    padding: '8px 16px',
    fontSize: '0.85rem',
  },
  partitionContainer: {
    display: 'flex',
    gap: '12px',
    margin: '20px 0',
    padding: '6px',
    borderRadius: '16px',
  },
  partitionTab: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '14px 20px',
    borderRadius: '12px',
    border: '1px solid transparent',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  partitionTabActive: {
    background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)',
    color: '#2dd4bf',
    border: '1px solid rgba(45, 212, 191, 0.3)',
    boxShadow: '0 4px 15px rgba(45, 212, 191, 0.1)',
  },
  partitionBadge: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#cbd5e1',
    borderRadius: '12px',
    padding: '2px 8px',
    fontSize: '0.8rem',
    fontWeight: '600',
  },
  subListBar: {
    marginBottom: '24px',
    marginTop: '-8px',
  },
  subListPills: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  subListPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '10px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#cbd5e1',
    fontSize: '0.85rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  subListPillActive: {
    background: 'rgba(45, 212, 191, 0.12)',
    borderColor: 'rgba(45, 212, 191, 0.4)',
    color: '#2dd4bf',
    fontWeight: '600',
  },
  deleteListBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: '-4px',
    marginRight: '4px',
    transition: 'color 0.2s ease',
  },
  newListPillBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 14px',
    borderRadius: '10px',
    background: 'transparent',
    border: '1px dashed rgba(255, 255, 255, 0.2)',
    color: '#94a3b8',
    fontSize: '0.85rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  inlineCreateListForm: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  inlineCreateInput: {
    padding: '6px 12px',
    fontSize: '0.85rem',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(45, 212, 191, 0.5)',
    borderRadius: '8px',
    color: '#f8fafc',
    outline: 'none',
    width: '180px',
  },
  inlineSaveBtn: {
    padding: '6px 12px',
    fontSize: '0.8rem',
    fontWeight: '600',
    background: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  inlineCancelBtn: {
    padding: '4px',
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
};
// Add custom keyframes spin animation using global stylesheet since in React inline styles it's tricky
// We already imported standard index.css, we can add keyframe animation there if needed
