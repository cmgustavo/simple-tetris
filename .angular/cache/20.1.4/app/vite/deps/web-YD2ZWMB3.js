import {
  WebPlugin
} from "./chunk-AUYZZIFF.js";
import {
  __async
} from "./chunk-QHQP2P2Z.js";

// node_modules/@capacitor/preferences/dist/esm/web.js
var PreferencesWeb = class extends WebPlugin {
  constructor() {
    super(...arguments);
    this.group = "CapacitorStorage";
  }
  configure(_0) {
    return __async(this, arguments, function* ({ group }) {
      if (typeof group === "string") {
        this.group = group;
      }
    });
  }
  get(options) {
    return __async(this, null, function* () {
      const value = this.impl.getItem(this.applyPrefix(options.key));
      return { value };
    });
  }
  set(options) {
    return __async(this, null, function* () {
      this.impl.setItem(this.applyPrefix(options.key), options.value);
    });
  }
  remove(options) {
    return __async(this, null, function* () {
      this.impl.removeItem(this.applyPrefix(options.key));
    });
  }
  keys() {
    return __async(this, null, function* () {
      const keys = this.rawKeys().map((k) => k.substring(this.prefix.length));
      return { keys };
    });
  }
  clear() {
    return __async(this, null, function* () {
      for (const key of this.rawKeys()) {
        this.impl.removeItem(key);
      }
    });
  }
  migrate() {
    return __async(this, null, function* () {
      var _a;
      const migrated = [];
      const existing = [];
      const oldprefix = "_cap_";
      const keys = Object.keys(this.impl).filter((k) => k.indexOf(oldprefix) === 0);
      for (const oldkey of keys) {
        const key = oldkey.substring(oldprefix.length);
        const value = (_a = this.impl.getItem(oldkey)) !== null && _a !== void 0 ? _a : "";
        const { value: currentValue } = yield this.get({ key });
        if (typeof currentValue === "string") {
          existing.push(key);
        } else {
          yield this.set({ key, value });
          migrated.push(key);
        }
      }
      return { migrated, existing };
    });
  }
  removeOld() {
    return __async(this, null, function* () {
      const oldprefix = "_cap_";
      const keys = Object.keys(this.impl).filter((k) => k.indexOf(oldprefix) === 0);
      for (const oldkey of keys) {
        this.impl.removeItem(oldkey);
      }
    });
  }
  get impl() {
    return window.localStorage;
  }
  get prefix() {
    return this.group === "NativeStorage" ? "" : `${this.group}.`;
  }
  rawKeys() {
    return Object.keys(this.impl).filter((k) => k.indexOf(this.prefix) === 0);
  }
  applyPrefix(key) {
    return this.prefix + key;
  }
};
export {
  PreferencesWeb
};
//# sourceMappingURL=web-YD2ZWMB3.js.map
