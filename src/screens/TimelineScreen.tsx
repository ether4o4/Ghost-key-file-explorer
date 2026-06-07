import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTimeline } from '../database/database';

export default function TimelineScreen() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTimeline(); }, []);

  const loadTimeline = async () => {
    try { setEntries(await getTimeline(200)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const actionMeta: Record<string, { icon: string; color: string }> = {
    created: { icon: 'add-circle', color: '#6bcb77' },
    modified: { icon: 'create', color: '#ffd93d' },
    analyzed: { icon: 'analytics', color: '#4d96ff' },
    tagged: { icon: 'pricetag', color: '#845ef7' },
    vaulted: { icon: 'shield', color: '#20c997' },
    deleted: { icon: 'trash', color: '#ff6b6b' },
  };

  const fmtDate = (ts: string) => {
    try { const d = new Date(ts); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ts; }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#00d4ff" /></View>;

  return (
    <View style={styles.container}>
      <FlatList data={entries} keyExtractor={item => item.id} contentContainerStyle={{ padding: 12 }}
        renderItem={({ item, index }) => {
          const meta = actionMeta[item.action] || { icon: 'ellipse', color: '#888' };
          return (
            <View style={{ flexDirection: 'row', minHeight: 70 }}>
              <View style={{ width: 30, alignItems: 'center' }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: meta.color, marginTop: 4 }} />
                {index < entries.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: '#1a1a1a' }} />}
              </View>
              <View style={{ flex: 1, paddingBottom: 16, paddingLeft: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                  <Text style={{ color: '#888', fontSize: 12, textTransform: 'capitalize' }}>{item.action}</Text>
                </View>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500', marginTop: 2 }}>{item.file_name}</Text>
                {item.detail ? <Text style={{ color: '#666', fontSize: 13, marginTop: 2 }}>{item.detail}</Text> : null}
                <Text style={{ color: '#444', fontSize: 11, marginTop: 4 }}>{fmtDate(item.timestamp)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}><Ionicons name="time" size={48} color="#333" /><Text style={styles.emptyText}>No activity yet</Text><Text style={styles.emptySubtext}>File operations appear here</Text></View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#666', fontSize: 18, marginTop: 12 },
  emptySubtext: { color: '#444', fontSize: 14, marginTop: 4 },
});
