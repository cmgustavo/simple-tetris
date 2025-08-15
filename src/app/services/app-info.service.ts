import {Injectable} from '@angular/core';
import {environment} from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AppInfoService {

  constructor() {
  }

  getVersion() {
    return environment.appVersion ?? '0.0.0';
  }
}
