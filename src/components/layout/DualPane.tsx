import React from 'react';
import { FilePane } from '../files/FilePane';
import { VaultModal } from '../vault/VaultModal';
import { NotificationToast } from '../common/Toast';

export const DualPane: React.FC = () => (
  <div className="h-full bg-ghost-bg">
    <FilePane />
    <VaultModal />
    <NotificationToast />
  </div>
);
