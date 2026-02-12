import Library from './components/Library';
import MixerField from './components/MixerField';
import MasterMeter from './components/MasterMeter';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <Library />
      <MixerField />
      <MasterMeter />
    </div>
  );
}
