import { useEffect, useState } from 'react';
import { readStored, writeStored } from '../lib/format.js';

/* useState that remembers its value in this browser. Invalid stored values fall back to the initial value. */
export default function usePersisted(key, initial, isValid = () => true) {
  const [value, setValue] = useState(() => {
    const stored = readStored(key, initial);
    return isValid(stored) ? stored : initial;
  });
  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);
  return [value, setValue];
}
