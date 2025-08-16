import {Component} from '@angular/core';
import {Platform} from '@ionic/angular';
import {IonApp, IonRouterOutlet} from '@ionic/angular/standalone';
import {Capacitor} from '@capacitor/core';
import {StatusBar, Style} from '@capacitor/status-bar';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor(private platform: Platform) {
    this.initializeApp();
  }

  initializeApp() {
    this.platform.ready().then(async () => {
      if (Capacitor.isNativePlatform()) {
        await StatusBar.setOverlaysWebView({overlay: false}); // <- key line
        await StatusBar.setStyle({style: Style.Dark});  // white icons
      }
    });
  }
}
