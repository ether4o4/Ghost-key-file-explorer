import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getVaultItems, addVaultItem } from '../database/database';

function genId() { return 'vault_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9); }

export default function VaultScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState('credential');

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    try { setItems(await getVaultItems()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!label.trim() || !value.trim()) { Alert.alert('Error', 'All fields required'); return; }
    await addVaultItem({ id: genId(), type, label: label.trim(), encryptedData: value.trim(), tags: [] });
    setShowAdd(false); setLabel(''); setValue('');
    loadItems();
  };

  const getIcon = (t: string) => {
    const icons: Record<string, string> = { credential: 'key', note: 'document-text', key: 'lock-closed', secret: 'eye-off' };
    return icons[t] || 'shield';
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#00d4ff" /></View>;

  return (
    <View style={styles.container}>
      <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#111', borderRadius: 10, marginBottom: 8 }}>
            <View style={{ width: 40, alignItems: 'center' }}><Ionicons name={getIcon(item.type)} size={24} color="#00d4ff" /></View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>{item.label}</Text>
              <Text style={{ color: '#666', fontSize: 12, textTransform: 'capitalize' }}>{item.type}</Text>
            </View>
            <Ionicons name="lock-closed" size={16} color="#444" />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}><Ionicons name="shield" size={48} color="#333" /><Text style={styles.emptyText}>Vault is empty</Text></View>
        }
      />
      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}><Ionicons name="add" size={28} color="#fff" /></TouchableOpacity>
      <Modal visible={showAdd} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#1a1a1a', borderRadius: 16, padding: 20 }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Add to Vault</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {['credential','note','key','secret'].map(t => (
                <TouchableOpacity key={t} onPress={() => setType(t)}
                  style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: type === t ? '#1a3a4a' : '#222' }}>
                  <Text style={{ color: type === t ? '#00d4ff' : '#888', fontSize: 13, textTransform: 'capitalize' }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="Label" placeholderTextColor="#666" value={label} onChangeText={setLabel} />
            <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} placeholder="Value" placeholderTextColor="#666" value={value} onChangeText={setValue} multiline />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#222', alignItems: 'center' }}>
                <Text style={{ color: '#888', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAdd} style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#00d4ff', alignItems: 'center' }}>
                <Text style={{ color: '#000', fontSize: 15, fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  input: { backgroundColor: '#222', borderRadius: 10, padding: 12, color: '#fff', fontSize: 15, marginBottom: 12 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#666', fontSize: 18, marginTop: 12 },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#00d4ff', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#00d4ff', shadowOpacity: 0.3, shadowRadius: 8 },
});
