import { avatarGradients } from '@/constants/theme';

const WEEKDAYS_ABBR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Badge horaire façon maquette : "Ce soir · 18h30", "Demain · 15h00",
 * "Mer. 17 · 9h00". Pas de gestion de fuseau horaire dédiée (MVP mono-ville).
 */
export function formatActivityTimeBadge(dateTimeIso: string, now: Date = new Date()): string {
  const dateTime = new Date(dateTimeIso);
  const diffDays = Math.round(
    (startOfDay(dateTime).getTime() - startOfDay(now).getTime()) / 86_400_000
  );
  const hours = dateTime.getHours();
  const minutes = dateTime.getMinutes().toString().padStart(2, '0');
  const timePart = `${hours}h${minutes}`;

  let dayPart: string;
  if (diffDays === 0) {
    dayPart = hours >= 18 ? 'Ce soir' : "Aujourd'hui";
  } else if (diffDays === 1) {
    dayPart = 'Demain';
  } else {
    dayPart = `${WEEKDAYS_ABBR[dateTime.getDay()]}. ${dateTime.getDate()}`;
  }

  return `${dayPart} · ${timePart}`;
}

/**
 * Date/heure complète façon maquette "Détail sortie" : "Dimanche 14 sept.,
 * 18h30". Pas de gestion de fuseau horaire dédiée (MVP mono-ville).
 */
export function formatActivityDateTimeFull(dateTimeIso: string): string {
  const dateTime = new Date(dateTimeIso);
  const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(dateTime);
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const month = new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(dateTime).replace('.', '');
  const hours = dateTime.getHours();
  const minutes = dateTime.getMinutes().toString().padStart(2, '0');

  return `${capitalizedWeekday} ${dateTime.getDate()} ${month}., ${hours}h${minutes}`;
}

/** Fenêtre de dates façon maquette : "14–26 sept." */
export function formatDateRangeChip(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
  const endLabel = `${end.getDate()} ${monthFormatter.format(end).replace('.', '')}.`;

  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${endLabel}`;
  }

  const startLabel = `${start.getDate()} ${monthFormatter.format(start).replace('.', '')}.`;
  return `${startLabel} – ${endLabel}`;
}

/** 2 lettres d'initiales à partir du nom affiché, ex. "Noa" -> "NO". */
export function getInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return '??';
  return trimmed.slice(0, 2).toUpperCase();
}

/**
 * Dégradé d'avatar en rotation simple (pas de vrai système photo/Storage au
 * MVP) — déterministe à partir de l'id pour ne pas changer de couleur à
 * chaque re-render.
 */
export function getAvatarGradient(seed: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return avatarGradients[hash % avatarGradients.length];
}
