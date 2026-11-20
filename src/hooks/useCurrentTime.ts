import { useEffect, useState } from 'react';

const format = () => new Date().toLocaleTimeString('en-GB');

/** Current local time (HH:MM:SS), refreshed every second. */
export function useCurrentTime() {
  const [currentTime, setCurrentTime] = useState(format);
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(format()), 1000);
    return () => clearInterval(timer);
  }, []);
  return { currentTime };
}
