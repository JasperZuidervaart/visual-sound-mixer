import Library from './components/Library';
import MixerField from './components/MixerField';
import MasterMeter from './components/MasterMeter';
import ShareManager from './components/ShareManager';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <div className="admin-sidebar">
        <Library mode="admin" />
        <ShareManager />
      </div>
      <MixerField mode="admin" />
      <MasterMeter />
    </div>
  );
}
