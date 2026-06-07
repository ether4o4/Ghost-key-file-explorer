import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { getRecentFiles, addFile, searchFiles, addTimelineEntry } from '../database/database';

function generateId(prefix: string): string {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

export default function HomeScreen() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadFiles = useCallback(async () => {
    try { setFiles(await getRecentFiles(100)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    setFiles(q.trim() ? await searchFiles(q) : await getRecentFiles(100));
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const fid = generateId('file');
        const info = await FileSystem.getInfoAsync(asset.uri);
        await addFile({
          id: fid, name: asset.name || 'unknown', path: asset.uri,
          size: asset.size || 0, mimeType: asset.mimeType || 'application/octet-stream',
          modifiedAt: info.modificationTime ? new Date(info.modificationTime * 1000).toISOString() : new Date().toISOString(),
          isDirectory: false
        });
        await addTimelineEntry({
          id: generateId('tl'), fileId: fid, fileName: asset.name || 'unknown',
          action: 'created', detail: 'Imported ' + (asset.name || 'file')
        });
        loadFiles();
        Alert.alert('Success', (asset.name || 'File') + ' imported');
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const formatSize = (b: number) => {
    if (b < 1024) return b + ' B';
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
    return (b/(1024*1024)).toFixed(1) + ' MB';
  };

  const getIcon = (mime: string) => {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'videocam';
    if (mime.startsWith('audio/')) return 'musical-notes';
    if (mime.includes('pdf')) return 'document';
    return 'document-outline';
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#00d4ff" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#666" />
          <TextInput style={styles.searchInput} placeholder="Search files..." placeholderTextColor="#666"
            value={searchQuery} onChangeText={handleSearch} />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={18} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={files} keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.fileItem}>
            <Ionicons name={getIcon(item.mime_type)} size={24} color="#00d4ff" />
            <View style={styles.fileInfo}>
              <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.fileMeta}>{formatSize(item.size)}</Text>
            </View>
          </TouchableOpacity>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadFiles(); }} tintColor="#00d4ff" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="folder-open" size={48} color="#333" />
            <Text style={styles.emptyText}>No files yet</Text>
            <Text style={styles.emptySubtext}>Tap + to import files</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={handlePickFile}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  searchRow: { padding: 12 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 10, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, color: '#fff', marginLeft: 8, fontSize: 14 },
  fileItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  fileInfo: { flex: 1, marginLeft: 12 },
  fileName: { color: '#fff', fontSize: 15, fontWeight: '500' },
  fileMeta: { color: '#666', fontSize: 12, marginTop: 2 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#666', fontSize: 18, marginTop: 12 },
  emptySubtext: { color: '#444', fontSize: 14, marginTop: 4 },
  fab: {
    position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#00d4ff', justifyContent: 'center', alignItems: 'center',
    elevation: 8, shadowColor: '#00d4ff', shadowOpacity: 0.3, shadowRadius: 8
  },
});
