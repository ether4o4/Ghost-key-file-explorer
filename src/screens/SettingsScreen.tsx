import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getApiKey, setApiKey } from '../services/deepseek';

export default function SettingsScreen() {
  const [key, setKey] = useState(getApiKey());
  const [saved, setSaved] = useState(false);

  const saveKey = () => { setApiKey(key.trim()); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const clearData = () => {
    Alert.alert('Clear All Data', 'This deletes everything. Cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        const { getDb } = await import('../database/database');
        const db = await getDb();
        await db.execAsync('DELETE FROM files; DELETE FROM entities; DELETE FROM vault_items; DELETE FROM timeline; DELETE FROM tags; DELETE FROM analysis_cache; DELETE FROM chat_history;');
        Alert.alert('Done', 'All data cleared.');
      }}
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: '#888', fontSize: 13, textTransform: 'uppercase', marginTop: 20, marginBottom: 8, marginLeft: 4 }}>DeepSeek AI</Text>
      <View style={{ backgroundColor: '#111', borderRadius: 12, padding: 16 }}>
        <Text style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>API Key</Text>
        <TextInput style={styles.input} placeholder="sk-..." placeholderTextColor="#444" value={key} onChangeText={setKey} secureTextEntry autoCapitalize="none" />
        <TouchableOpacity style={{ backgroundColor: '#00d4ff', borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={saveKey}>
          <Text style={{ color: '#000', fontSize: 15, fontWeight: '600' }}>{saved ? 'Saved!' : 'Save Key'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ color: '#888', fontSize: 13, textTransform: 'uppercase', marginTop: 20, marginBottom: 8, marginLeft: 4 }}>About</Text>
      <View style={{ backgroundColor: '#111', borderRadius: 12, padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
          <Text style={{ color: '#888', fontSize: 14 }}>App</Text><Text style={{ color: '#fff', fontSize: 14 }}>NeverSoft Services Mobile</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
          <Text style={{ color: '#888', fontSize: 14 }}>Version</Text><Text style={{ color: '#fff', fontSize: 14 }}>1.0.0</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
          <Text style={{ color: '#888', fontSize: 14 }}>Engine</Text><Text style={{ color: '#fff', fontSize: 14 }}>DeepSeek AI</Text>
        </View>
      </View>

      <Text style={{ color: '#888', fontSize: 13, textTransform: 'uppercase', marginTop: 20, marginBottom: 8, marginLeft: 4 }}>Data</Text>
      <View style={{ backgroundColor: '#111', borderRadius: 12, padding: 16 }}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 }} onPress={clearData}>
          <Ionicons name="trash" size={18} color="#ff6b6b" /><Text style={{ color: '#ff6b6b', fontSize: 15 }}>Clear All Data</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: '#333', textAlign: 'center', marginTop: 40, fontSize: 12 }}>NeverSoft Services Mobile - Local-First File Intelligence</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  input: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, color: '#fff', fontSize: 15, marginBottom: 12 },
});
