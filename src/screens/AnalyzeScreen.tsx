import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAllEntities } from '../database/database';
import { chatWithDeepSeek } from '../services/deepseek';

export default function AnalyzeScreen() {
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatMode, setChatMode] = useState(false);
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{role: string; content: string}>>([]);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => { loadEntities(); }, []);

  const loadEntities = async () => {
    try { setEntities(await getAllEntities()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    const msg = message.trim();
    setMessage('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setAiLoading(true);
    const reply = await chatWithDeepSeek(msg);
    setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    setAiLoading(false);
  };

  const getColor = (type: string) => {
    const colors: Record<string, string> = { person: '#ff6b6b', email: '#ffd93d', phone: '#6bcb77', url: '#4d96ff', sku: '#ff6b9d', place: '#845ef7', organization: '#20c997' };
    return colors[type] || '#888';
  };

  const getIcon = (type: string) => {
    const icons: Record<string, string> = { person: 'person', email: 'mail', phone: 'call', url: 'link', sku: 'pricetag', place: 'location', organization: 'business' };
    return icons[type] || 'ellipse';
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#00d4ff" /></View>;

  if (chatMode) {
    return (
      <View style={styles.container}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setChatMode(false)}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
          <Text style={styles.chatTitle}>NeverSoft Services AI</Text>
          <View style={{ width: 24 }} />
        </View>
        <FlatList data={chatMessages} keyExtractor={(_, i) => i.toString()}
          style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.aiBubble]}>
              <Text style={[styles.bubbleText, item.role === 'user' ? { color: '#fff' } : { color: '#ccc' }]}>{item.content}</Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}><Ionicons name="chatbubbles" size={48} color="#333" /><Text style={styles.emptyText}>Ask NeverSoft Services AI anything</Text></View>
          }
        />
        {aiLoading && <View style={{ flexDirection: 'row', padding: 8, gap: 8 }}><ActivityIndicator size="small" color="#00d4ff" /><Text style={{ color: '#00d4ff' }}>Thinking...</Text></View>}
        <View style={styles.inputRow}>
          <TextInput style={styles.chatInput} placeholder="Ask..." placeholderTextColor="#666" value={message} onChangeText={setMessage} multiline />
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={aiLoading}><Ionicons name="send" size={20} color="#fff" /></TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Entities ({entities.length})</Text>
        <TouchableOpacity style={styles.aiBtn} onPress={() => setChatMode(true)}>
          <Ionicons name="sparkles" size={18} color="#fff" /><Text style={{ color: '#00d4ff', fontSize: 13 }}>AI Chat</Text>
        </TouchableOpacity>
      </View>
      <FlatList data={entities} keyExtractor={item => item.id} contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', padding: 12, backgroundColor: '#111', borderRadius: 10, marginBottom: 8 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: getColor(item.type) + '22', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name={getIcon(item.type)} size={20} color={getColor(item.type)} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: '#fff', fontSize: 15 }}>{item.value}</Text>
              <Text style={{ color: '#666', fontSize: 12, textTransform: 'capitalize' }}>{item.type}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}><Ionicons name="analytics" size={48} color="#333" /><Text style={styles.emptyText}>No entities yet</Text></View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  aiBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a3a4a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, gap: 4 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  chatTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 8 },
  userBubble: { backgroundColor: '#1a3a4a', alignSelf: 'flex-end' },
  aiBubble: { backgroundColor: '#1a1a1a', alignSelf: 'flex-start' },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  inputRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#1a1a1a', alignItems: 'flex-end' },
  chatInput: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#fff', maxHeight: 100, marginRight: 8 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#00d4ff', justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#666', fontSize: 18, marginTop: 12 },
  emptySubtext: { color: '#444', fontSize: 14, marginTop: 4 },
});
