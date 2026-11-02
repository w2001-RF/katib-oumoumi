// Browser APIs the shared core (../../../js/core) relies on, provided on the
// device. Imported first by src/app/_layout.js.

// localStorage, backed by SQLite: history.js and session.js keep working
// unchanged (synchronous getItem/setItem, like in the browser).
import 'expo-sqlite/localStorage/install';
import * as Crypto from 'expo-crypto';

// format.js uid() uses crypto.randomUUID, or crypto.getRandomValues.
globalThis.crypto ??= {};
globalThis.crypto.randomUUID ??= () => Crypto.randomUUID();
globalThis.crypto.getRandomValues ??= (array) => Crypto.getRandomValues(array);
