import { uid } from './utils/format.js';

const KEY = 'ko_session_id';

export function getSessionId() {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = uid();
    localStorage.setItem(KEY, id);
  }
  return id;
}
