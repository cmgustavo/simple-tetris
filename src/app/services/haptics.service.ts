import {Injectable} from '@angular/core';
import {Haptics, ImpactStyle, NotificationType} from '@capacitor/haptics';

@Injectable({providedIn: 'root'})
export class HapticsService {
  private supported = !!(Haptics as any)?.impact;

  impact(style: ImpactStyle = ImpactStyle.Light) {
    if (!this.supported) return;
    Haptics.impact({style}).catch(() => void 0);
  }

  success() {
    if (!this.supported) return;
    Haptics.notification({type: NotificationType.Success}).catch(() => void 0);
  }

  warning() {
    if (!this.supported) return;
    Haptics.notification({type: NotificationType.Warning}).catch(() => void 0);
  }

  selection() {
    if (!this.supported) return;
    Haptics.selectionChanged().catch(() => void 0);
  }
}
