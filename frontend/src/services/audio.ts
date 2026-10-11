class AudioService {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = true;

  constructor() {
    // Check local storage for preference
    const saved = localStorage.getItem('queue_sound_enabled');
    if (saved !== null) {
      this.soundEnabled = saved === 'true';
    }
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public setEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    localStorage.setItem('queue_sound_enabled', enabled ? 'true' : 'false');
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Unlock AudioContext on initial user gesture (satisfies browser autoplay policies)
   */
  public async unlock(): Promise<boolean> {
    try {
      const ctx = this.getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.resume();
      }
      await this.playChime();
      return true;
    } catch (err) {
      console.warn('Audio unlock error:', err);
      return false;
    }
  }

  /**
   * Procedural Ding-Dong / Chime using Web Audio API synthesis
   * Fully offline, zero audio file download required.
   */
  public playChime(): Promise<void> {
    if (!this.soundEnabled) return Promise.resolve();

    return new Promise((resolve) => {
      try {
        const ctx = this.getAudioContext();
        const now = ctx.currentTime;

        // Note 1 (D5 ~ 587.33 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now);
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.6);

        // Note 2 (A5 ~ 880 Hz - slightly delayed)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.0, now + 0.15);
        gain2.gain.setValueAtTime(0, now + 0.15);
        gain2.gain.linearRampToValueAtTime(0.4, now + 0.2);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.9);

        // Note 3 (D6 ~ 1174.66 Hz - sparkle)
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.type = 'triangle';
        osc3.frequency.setValueAtTime(1174.66, now + 0.3);
        gain3.gain.setValueAtTime(0, now + 0.3);
        gain3.gain.linearRampToValueAtTime(0.25, now + 0.35);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.start(now + 0.3);
        osc3.stop(now + 1.2);

        setTimeout(() => resolve(), 1000);
      } catch (err) {
        console.warn('AudioContext playback error:', err);
        resolve();
      }
    });
  }

  /**
   * Speak announcement using offline browser Web Speech API
   * Formats numbers phonetically (e.g. "R 0 2 3" rather than "R minus twenty-three")
   */
  public speak(text: string): Promise<void> {
    if (!this.soundEnabled || !('speechSynthesis' in window)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      try {
        window.speechSynthesis.cancel(); // Stop ongoing speech
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();

        // Prefer English voice
        const voices = window.speechSynthesis.getVoices();
        const enVoice = voices.find(v => v.lang.startsWith('en') && !v.name.includes('Google'));
        if (enVoice) {
          utterance.voice = enVoice;
        }

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('Speech synthesis error:', err);
        resolve();
      }
    });
  }

  /**
   * Complete announcement: chime + speech
   */
  public async announceCall(queueNumber: string, counterName: string) {
    if (!this.soundEnabled) return;

    // Convert e.g. "R-023" to "Ticket R, zero two three"
    const parts = queueNumber.split('-');
    let spokenTicket = queueNumber;
    if (parts.length === 2) {
      const prefix = parts[0];
      const digits = parts[1].split('').join(' ');
      spokenTicket = `ticket ${prefix}, ${digits}`;
    }

    const speechText = `Now serving ${spokenTicket}, please proceed to ${counterName}.`;

    await this.playChime();
    await this.speak(speechText);
  }
}

export const audioService = new AudioService();
