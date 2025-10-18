import React from 'react';
import { AlertTriangle, Info, XCircle, Clock, X } from 'lucide-react';
import type { Alert } from '../types/detection';

interface AlertListProps {
  alerts: Alert[];
  onDismiss: (id: string) => void;
}

export const AlertList: React.FC<AlertListProps> = ({ alerts, onDismiss }) => {
  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'danger':
        return <XCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      case 'info':
        return <Info className="w-5 h-5" />;
    }
  };

  const getAlertStyles = (type: Alert['type']) => {
    switch (type) {
      case 'danger':
        return 'bg-red-500/20 border-red-500 text-red-400';
      case 'warning':
        return 'bg-yellow-500/20 border-yellow-500 text-yellow-400';
      case 'info':
        return 'bg-blue-500/20 border-blue-500 text-blue-400';
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString();
  };

  return (
    <div className="bg-gray-900 rounded-lg p-6">
      <h2 className="text-xl font-semibold text-white mb-4">Security Alerts</h2>
      
      {alerts.length > 0 ? (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`border rounded-lg p-4 ${getAlertStyles(alert.type)} relative`}
            >
              <button
                onClick={() => onDismiss(alert.id)}
                className="absolute top-2 right-2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              
              <div className="flex items-start gap-3">
                <div className="mt-1">{getAlertIcon(alert.type)}</div>
                <div className="flex-1">
                  <p className="font-medium">{alert.message}</p>
                  <div className="flex items-center gap-2 mt-2 text-sm opacity-70">
                    <Clock className="w-4 h-4" />
                    <span>{formatTime(alert.timestamp)}</span>
                  </div>
                  {alert.detections.length > 0 && (
                    <div className="mt-2 text-sm">
                      <span className="opacity-70">Detected objects: </span>
                      {alert.detections.map(d => d.class).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <Info className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">No security alerts</p>
          <p className="text-gray-600 text-sm mt-1">
            System is monitoring for suspicious activities
          </p>
        </div>
      )}
    </div>
  );
};
