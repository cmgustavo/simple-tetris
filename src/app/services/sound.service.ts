import {Injectable} from '@angular/core';
import {NativeAudio} from '@capacitor-community/native-audio';
import {Capacitor} from "@capacitor/core";

type Key = 'lock' | 'line' | 'tetris';

@Injectable({providedIn: 'root'})
export class SoundService {
  private loaded = false;
  private usingNative = Capacitor.isNativePlatform();
  private htmlAudio = new Map<Key, HTMLAudioElement>();

  async preload() {
    if (this.loaded) return;
    if (this.usingNative) {
      try {
        await NativeAudio.preload({assetId: 'lock', assetPath: 'assets/sfx/lock.wav'});
        await NativeAudio.preload({assetId: 'line', assetPath: 'assets/sfx/line.wav'});
        await NativeAudio.preload({assetId: 'tetris', assetPath: 'assets/sfx/tetris.wav'});
        this.loaded = true;
        return;
      } catch {
        this.usingNative = false; // fall through to HTMLAudio
      }
    }
    // Web fallback
    this.htmlAudio.set('lock', new Audio('assets/sfx/lock.wav'));
    this.htmlAudio.set('line', new Audio('assets/sfx/line.wav'));
    this.htmlAudio.set('tetris', new Audio('assets/sfx/tetris.wav'));
    this.loaded = true;
  }

  async play(key: Key) {
    if (!this.loaded) await this.preload();
    if (this.usingNative) {
      try {
        await NativeAudio.play({assetId: key});
        return;
      } catch { /* fallback below */
      }
    }
    const a = this.htmlAudio.get(key);
    if (a) {
      try {
        a.currentTime = 0;
        await a.play();
      } catch { /* ignore */
      }
    }
  }
}
