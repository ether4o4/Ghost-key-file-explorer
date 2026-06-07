import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from './src/screens/HomeScreen';
import AnalyzeScreen from './src/screens/AnalyzeScreen';
import VaultScreen from './src/screens/VaultScreen';
import TimelineScreen from './src/screens/TimelineScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let icon: keyof typeof Ionicons.glyphMap = 'folder';
            if (route.name === 'Home') icon = focused ? 'folder' : 'folder-outline';
            else if (route.name === 'Analyze') icon = focused ? 'analytics' : 'analytics-outline';
            else if (route.name === 'Vault') icon = focused ? 'shield' : 'shield-outline';
            else if (route.name === 'Timeline') icon = focused ? 'time' : 'time-outline';
            else if (route.name === 'Settings') icon = focused ? 'settings' : 'settings-outline';
            return <Ionicons name={icon} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#00d4ff',
          tabBarInactiveTintColor: '#666',
          tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#222' },
          headerStyle: { backgroundColor: '#0a0a0a' },
          headerTintColor: '#fff',
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Files' }} />
        <Tab.Screen name="Analyze" component={AnalyzeScreen} options={{ title: 'Analyze' }} />
        <Tab.Screen name="Vault" component={VaultScreen} options={{ title: 'Vault' }} />
        <Tab.Screen name="Timeline" component={TimelineScreen} options={{ title: 'Timeline' }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
