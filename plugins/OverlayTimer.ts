import { WebPlugin } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

export interface OverlayTimerConfig {
  type: 'pomodoro' | 'subject';
  title?: string;
}

export interface OverlayTimerPlugin {
  startTimer(config: OverlayTimerConfig): Promise<void>;
  stopTimer(): Promise<void>;
  updateTimer(options: { time: number }): Promise<void>;
}

export class OverlayTimerWeb extends WebPlugin implements OverlayTimerPlugin {
  async startTimer(config: OverlayTimerConfig): Promise<void> {
    console.log('OverlayTimerWeb: startTimer', config);
  }
  async stopTimer(): Promise<void> {
    console.log('OverlayTimerWeb: stopTimer');
  }
  async updateTimer(_options: { time: number }): Promise<void> {
    // console.log('OverlayTimerWeb: updateTimer', _options);
  }
}

const OverlayTimer = registerPlugin<OverlayTimerPlugin>('OverlayTimer', {
  web: () => new OverlayTimerWeb(),
});

export default OverlayTimer;
