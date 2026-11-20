import type { FootageFolder, Scenario } from '../domain';
import { analyseOffline } from './aiService';

const BY_CATEGORY: Record<string, Scenario> = {
  'Track intrusion / trespass': 'trespass',
  'Passenger at platform edge': 'edge',
  'Unattended or suspicious item': 'bag',
  'Crowding and congestion': 'crowd',
  'Slip, trip or fall': 'slip',
  'Equipment or technical fault': 'door',
};

/** Which simulated scenario to replay for an incident, based on its remarks. */
export function scenarioFor(f: FootageFolder): Scenario | undefined {
  const category = analyseOffline(f).category;
  return category ? BY_CATEGORY[category] : undefined;
}
