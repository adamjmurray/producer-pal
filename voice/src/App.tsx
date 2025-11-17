import { useState } from 'react';
import { useApiKey } from './hooks/useApiKey';
import { VoiceChat } from './components/VoiceChat';
import { Settings } from './components/Settings';

type View = 'voice' | 'settings';

function App() {
  const { apiKey, saveApiKey } = useApiKey();
  const [currentView, setCurrentView] = useState<View>('voice');

  const renderView = () => {
    switch (currentView) {
      case 'voice':
        return (
          <VoiceChat
            apiKey={apiKey}
            onOpenSettings={() => setCurrentView('settings')}
          />
        );
      case 'settings':
        return (
          <Settings
            apiKey={apiKey}
            onSave={(key) => {
              saveApiKey(key);
              setCurrentView('voice');
            }}
            onBack={() => setCurrentView('voice')}
          />
        );
      default:
        return (
          <VoiceChat
            apiKey={apiKey}
            onOpenSettings={() => setCurrentView('settings')}
          />
        );
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Main Content */}
      <div className="flex-1 overflow-hidden">{renderView()}</div>
    </div>
  );
}

export default App;
