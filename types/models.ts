// Types métier partagés entre écrans, en miroir du schéma Supabase (types/database.ts,
// généré à l'étape suivante). Ce fichier reste la source de vérité "domaine" lisible côté app.

export type VerificationStatus = 'unverified' | 'pending' | 'verified';

export interface UserProfile {
  id: string;
  nationality: string;
  languages: string[];
  verificationStatus: VerificationStatus;
  createdAt: string;
}

export interface Trip {
  id: string;
  userId: string;
  destination: string;
  location: { lat: number; lng: number };
  startDate: string;
  endDate: string;
  createdAt: string;
}

export type ActivityType = 'food' | 'sightseeing' | 'nightlife' | 'outdoor' | 'other';

export interface ActivityVisibility {
  nationalities?: string[];
  languages?: string[];
}

export interface Activity {
  id: string;
  tripId: string;
  title: string;
  type: ActivityType;
  dateTime: string;
  location: { lat: number; lng: number; label: string };
  spots: number;
  visibility: ActivityVisibility | null;
  createdAt: string;
}

export type ParticipationStatus = 'requested' | 'confirmed' | 'declined';

export interface Participation {
  id: string;
  activityId: string;
  userId: string;
  status: ParticipationStatus;
  createdAt: string;
}

export interface Message {
  id: string;
  activityId: string;
  userId: string;
  body: string;
  createdAt: string;
}
